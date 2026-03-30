"""Integration tests for Factory v4 API endpoints."""
import json
from unittest.mock import patch, AsyncMock
from db.models import Agent, Message, WorkflowExecution, new_id, utcnow
from services.goose_manager import StreamChunk


# ============ Agent CRUD ============

def test_create_agent(client):
    resp = client.post("/api/agents", json={
        "name": "Test Agent",
        "role": "developer",
        "system_prompt": "You write code.",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Agent"
    assert data["role"] == "developer"
    assert data["systemPrompt"] == "You write code."
    assert "id" in data


def test_list_agents(client):
    client.post("/api/agents", json={"name": "Lister"})
    resp = client.get("/api/agents")
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()]
    assert "Lister" in names


def test_get_agent(client):
    create_resp = client.post("/api/agents", json={
        "name": "Getter",
        "role": "tester",
        "system_prompt": "Test things.",
    })
    agent_id = create_resp.json()["id"]

    resp = client.get(f"/api/agents/{agent_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == agent_id
    assert data["name"] == "Getter"
    assert data["role"] == "tester"
    assert data["systemPrompt"] == "Test things."


def test_update_agent(client):
    create_resp = client.post("/api/agents", json={"name": "Before"})
    agent_id = create_resp.json()["id"]

    resp = client.put(f"/api/agents/{agent_id}", json={"name": "After"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "After"

    # Verify via GET
    get_resp = client.get(f"/api/agents/{agent_id}")
    assert get_resp.json()["name"] == "After"


def test_delete_agent(client):
    create_resp = client.post("/api/agents", json={"name": "Doomed"})
    agent_id = create_resp.json()["id"]

    resp = client.delete(f"/api/agents/{agent_id}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True

    # Verify 404 on GET
    get_resp = client.get(f"/api/agents/{agent_id}")
    assert get_resp.status_code == 404


# ============ Message / Activity ============

def test_agent_activity_empty(client):
    create_resp = client.post("/api/agents", json={"name": "Quiet Agent"})
    agent_id = create_resp.json()["id"]

    resp = client.get(f"/api/agents/{agent_id}/activity")
    assert resp.status_code == 200
    assert resp.json() == []


def test_messages_persisted(client, db_session):
    create_resp = client.post("/api/agents", json={"name": "Chatty"})
    agent_id = create_resp.json()["id"]

    # Directly insert a message into the DB
    msg = Message(
        id=new_id(),
        from_agent_id=agent_id,
        to_agent_id=None,
        content="Hello from the test",
        type="text",
        channel="internal",
        meta="{}",
        timestamp=utcnow(),
    )
    db_session.add(msg)
    db_session.commit()

    resp = client.get(f"/api/agents/{agent_id}/activity")
    assert resp.status_code == 200
    activity = resp.json()
    assert len(activity) >= 1
    contents = [item["content"] for item in activity]
    assert "Hello from the test" in contents


# ============ Workflow CRUD ============

def test_create_workflow(client):
    resp = client.post("/api/workflows", json={
        "name": "CI Pipeline",
        "description": "Build and test",
        "nodes": [{"id": "n1", "type": "agent", "data": {}}],
        "edges": [{"source": "n1", "target": "n1"}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "CI Pipeline"
    assert data["description"] == "Build and test"
    assert len(data["nodes"]) == 1
    assert len(data["edges"]) == 1
    assert "id" in data


def test_list_workflows(client):
    client.post("/api/workflows", json={"name": "Listed WF"})
    resp = client.get("/api/workflows")
    assert resp.status_code == 200
    names = [w["name"] for w in resp.json()]
    assert "Listed WF" in names


def test_get_workflow(client):
    create_resp = client.post("/api/workflows", json={
        "name": "Detail WF",
        "description": "For detail view",
        "nodes": [{"id": "a", "type": "start"}],
        "edges": [],
    })
    wf_id = create_resp.json()["id"]

    resp = client.get(f"/api/workflows/{wf_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == wf_id
    assert data["name"] == "Detail WF"
    assert data["description"] == "For detail view"
    assert data["nodes"] == [{"id": "a", "type": "start"}]
    assert data["edges"] == []
    assert data["status"] == "draft"


# ============ Message Delivery ============

def test_send_message_delivers_and_persists(client, db_session):
    """Test that sending a message to an agent stores both user and assistant messages."""
    # Create agent
    create_resp = client.post("/api/agents", json={
        "name": "Messenger",
        "role": "assistant",
        "system_prompt": "You respond briefly.",
    })
    agent_id = create_resp.json()["id"]

    # Mock the pipeline to return a canned response
    async def mock_pipeline(*args, **kwargs):
        yield StreamChunk(type="text", content="Hello from agent")

    with patch("routes.messages.send_through_pipeline", side_effect=mock_pipeline), \
         patch("routes.messages.goose_manager") as mock_gm, \
         patch("routes.messages.event_bus") as mock_bus:
        mock_gm.get_status.return_value = "idle"
        mock_gm.register_agent = lambda *a, **k: None
        mock_bus.emit = AsyncMock()

        resp = client.post("/api/messages/send", json={
            "agentId": agent_id,
            "content": "Hi there",
            "channel": "internal",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["userMessage"]["content"] == "Hi there"
        assert data["assistantMessage"]["content"] == "Hello from agent"

    # Verify both messages persisted in DB
    messages = db_session.query(Message).filter(
        (Message.from_agent_id == agent_id) | (Message.to_agent_id == agent_id)
    ).all()
    assert len(messages) == 2
    contents = {m.content for m in messages}
    assert "Hi there" in contents
    assert "Hello from agent" in contents


def test_send_message_telegram_channel(client, db_session):
    """Messages sent via telegram channel are stored with correct channel tag."""
    create_resp = client.post("/api/agents", json={"name": "TG Agent"})
    agent_id = create_resp.json()["id"]

    async def mock_pipeline(*args, **kwargs):
        yield StreamChunk(type="text", content="Telegram reply")

    with patch("routes.messages.send_through_pipeline", side_effect=mock_pipeline), \
         patch("routes.messages.goose_manager") as mock_gm, \
         patch("routes.messages.event_bus") as mock_bus:
        mock_gm.get_status.return_value = "idle"
        mock_gm.register_agent = lambda *a, **k: None
        mock_bus.emit = AsyncMock()

        resp = client.post("/api/messages/send", json={
            "agentId": agent_id,
            "content": "Hello from Telegram",
            "channel": "telegram",
        })
        assert resp.status_code == 200

    # Verify channel is stored
    msgs = db_session.query(Message).filter(Message.to_agent_id == agent_id).all()
    assert all(m.channel == "telegram" for m in msgs)


def test_list_messages_by_agent(client, db_session):
    """GET /api/messages?agentId= returns only that agent's messages."""
    r1 = client.post("/api/agents", json={"name": "Agent A"})
    r2 = client.post("/api/agents", json={"name": "Agent B"})
    id_a = r1.json()["id"]
    id_b = r2.json()["id"]

    for aid, content in [(id_a, "msg for A"), (id_b, "msg for B")]:
        db_session.add(Message(
            id=new_id(), from_agent_id=aid, to_agent_id=None,
            content=content, type="text", channel="internal",
            meta="{}", timestamp=utcnow(),
        ))
    db_session.commit()

    resp = client.get(f"/api/messages?agentId={id_a}")
    assert resp.status_code == 200
    contents = [m["content"] for m in resp.json()]
    assert "msg for A" in contents
    assert "msg for B" not in contents


# ============ Agent Configuration ============

def test_agent_guardrails_config(client):
    """Agents can be created with guardrails configuration."""
    resp = client.post("/api/agents", json={
        "name": "Guarded",
        "guardrails": {"cost_limit": 0.5, "rate_limit": 30, "blocked_actions": ["rm -rf"]},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["guardrails"]["cost_limit"] == 0.5
    assert data["guardrails"]["rate_limit"] == 30
    assert "rm -rf" in data["guardrails"]["blocked_actions"]


def test_agent_skills_config(client):
    """Agents can be created with skills."""
    resp = client.post("/api/agents", json={
        "name": "Skilled",
        "skills": ["planning", "tdd"],
    })
    assert resp.status_code == 200
    assert resp.json()["skills"] == ["planning", "tdd"]


def test_agent_schedule_config(client):
    """Agents can be configured with cron schedules."""
    resp = client.post("/api/agents", json={
        "name": "Scheduled",
        "schedule": "*/5 * * * *",
        "scheduled_task": "Check system health",
    })
    assert resp.status_code == 200
    assert resp.json()["schedule"] == "*/5 * * * *"
    assert resp.json()["scheduledTask"] == "Check system health"


def test_agent_memory_config(client):
    """Agents can store persistent memory."""
    resp = client.post("/api/agents", json={
        "name": "Rememberer",
        "memory": {"user_preference": "dark mode", "last_topic": "API design"},
    })
    assert resp.status_code == 200
    assert resp.json()["memory"]["user_preference"] == "dark mode"


def test_agent_channels_config(client):
    """Agents can be configured for external channels."""
    resp = client.post("/api/agents", json={
        "name": "Connected",
        "channels": ["telegram"],
    })
    assert resp.status_code == 200
    assert "telegram" in resp.json()["channels"]


# ============ Workflow Execution ============

def test_workflow_update(client):
    """Workflow nodes and edges can be updated."""
    create_resp = client.post("/api/workflows", json={"name": "Editable WF"})
    wf_id = create_resp.json()["id"]

    new_nodes = [
        {"id": "n1", "type": "agentNode", "data": {"label": "Step 1"}},
        {"id": "n2", "type": "agentNode", "data": {"label": "Step 2"}},
    ]
    new_edges = [{"id": "e1", "source": "n1", "target": "n2"}]

    resp = client.put(f"/api/workflows/{wf_id}", json={
        "name": "Updated WF",
        "nodes": new_nodes,
        "edges": new_edges,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated WF"
    assert len(data["nodes"]) == 2
    assert len(data["edges"]) == 1


def test_workflow_delete(client):
    """Workflows can be deleted."""
    create_resp = client.post("/api/workflows", json={"name": "Deletable WF"})
    wf_id = create_resp.json()["id"]

    resp = client.delete(f"/api/workflows/{wf_id}")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True

    get_resp = client.get(f"/api/workflows/{wf_id}")
    assert get_resp.status_code == 404


def test_workflow_execution_stop(client, db_session):
    """Running workflow executions can be stopped."""
    create_resp = client.post("/api/workflows", json={"name": "Stoppable WF"})
    wf_id = create_resp.json()["id"]

    # Create a running execution directly in DB
    exec_id = new_id()
    db_session.add(WorkflowExecution(
        id=exec_id, workflow_id=wf_id,
        status="running", context="{}",
        started_at=utcnow(),
    ))
    db_session.commit()

    resp = client.post(f"/api/workflows/executions/{exec_id}/stop")
    assert resp.status_code == 200
    assert resp.json()["status"] == "stopped"

    # Verify status in DB
    db_session.expire_all()
    exc = db_session.query(WorkflowExecution).filter(WorkflowExecution.id == exec_id).first()
    assert exc.status == "stopped"
    assert exc.completed_at is not None


def test_workflow_execute_rejects_unmapped_nodes(client):
    """Workflow execution fails if nodes have no agents assigned."""
    create_resp = client.post("/api/workflows", json={
        "name": "Unmapped WF",
        "nodes": [{"id": "n1", "type": "agentNode", "data": {"label": "Step 1"}}],
        "edges": [],
    })
    wf_id = create_resp.json()["id"]

    resp = client.post(f"/api/workflows/{wf_id}/execute", json={"input": "do something"})
    assert resp.status_code == 400
    assert "Unmapped" in resp.json()["detail"]


# ============ Agent Usage Tracking ============

def test_agent_usage_endpoint(client):
    """Usage endpoint returns token and message counts."""
    create_resp = client.post("/api/agents", json={"name": "Tracked"})
    agent_id = create_resp.json()["id"]

    resp = client.get(f"/api/agents/{agent_id}/usage")
    assert resp.status_code == 200
    data = resp.json()
    assert data["agentId"] == agent_id
    assert data["messageCount"] == 0
    assert data["approximateTokens"] == 0
