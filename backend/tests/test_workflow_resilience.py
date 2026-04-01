"""Tests for workflow (sandbox) resilience: target_dir, timeout, retries, error handling, checkpointing."""
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from services.stream_parser import StreamChunk


# ── Pipeline passes target_dir ────────────────────────────────────────

@pytest.mark.asyncio
async def test_pipeline_passes_target_dir():
    """send_through_pipeline should forward target_dir to goose_manager.send_message."""
    from services.pipeline import send_through_pipeline

    captured_kwargs = {}

    async def mock_send_message(**kwargs):
        captured_kwargs.update(kwargs)
        yield StreamChunk(type="text", content="ok")

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    with patch("services.pipeline.goose_manager") as mock_gm, \
         patch("services.pipeline.parse_guardrails", return_value={}), \
         patch("services.pipeline.check_rate_limit", return_value=True), \
         patch("services.pipeline.check_cost_limit", return_value=True), \
         patch("services.pipeline.build_prompt_with_skills", return_value="prompt"), \
         patch("services.pipeline.format_guardrails_for_prompt", return_value=""), \
         patch("services.memory_manager.extract_memory_from_response", return_value=[]), \
         patch("services.pipeline.track_usage"):
        mock_gm.send_message = mock_send_message

        chunks = []
        async for chunk in send_through_pipeline(
            agent_id="a1",
            message="hello",
            db=mock_db,
            agent_data={"system_prompt": "test", "skills": "[]", "memory": "{}", "guardrails": "{}"},
            target_dir="/sandbox/dir",
        ):
            chunks.append(chunk)

        assert captured_kwargs.get("target_dir") == "/sandbox/dir"


# ── Pipeline passes timeout ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_pipeline_passes_timeout():
    """send_through_pipeline should forward timeout to goose_manager.send_message."""
    from services.pipeline import send_through_pipeline

    captured_kwargs = {}

    async def mock_send_message(**kwargs):
        captured_kwargs.update(kwargs)
        yield StreamChunk(type="text", content="ok")

    mock_db = MagicMock()

    with patch("services.pipeline.goose_manager") as mock_gm, \
         patch("services.pipeline.parse_guardrails", return_value={}), \
         patch("services.pipeline.check_rate_limit", return_value=True), \
         patch("services.pipeline.check_cost_limit", return_value=True), \
         patch("services.pipeline.build_prompt_with_skills", return_value="prompt"), \
         patch("services.pipeline.format_guardrails_for_prompt", return_value=""), \
         patch("services.memory_manager.extract_memory_from_response", return_value=[]), \
         patch("services.pipeline.track_usage"):
        mock_gm.send_message = mock_send_message

        async for _ in send_through_pipeline(
            agent_id="a1",
            message="hello",
            db=mock_db,
            agent_data={"system_prompt": "test", "skills": "[]", "memory": "{}", "guardrails": "{}"},
            timeout=600,
        ):
            pass

        assert captured_kwargs.get("timeout") == 600


# ── Sandbox node retries on error ─────────────────────────────────────

@pytest.mark.asyncio
async def test_sandbox_node_retries_on_error():
    """Sandbox node should retry up to 2 times when send_through_pipeline yields an error."""
    from graphs.sandbox import _make_agent_node

    call_count = 0

    async def mock_pipeline(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            yield StreamChunk(type="text", content="Error: Agent timed out after 300s")
        else:
            yield StreamChunk(type="text", content="Success output")

    mock_agent = MagicMock()
    mock_agent.id = "agent-1"
    mock_agent.name = "TestAgent"
    mock_agent.provider = "claude-code"
    mock_agent.model = "claude-opus-4-20250514"
    mock_agent.tools = '["developer"]'
    mock_agent.system_prompt = "You are helpful."
    mock_agent.skills = "[]"
    mock_agent.memory = "{}"
    mock_agent.guardrails = "{}"

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_agent

    node_data = {"label": "test-node", "agentId": "agent-1"}
    node_func = _make_agent_node("node-1", "agent-1", node_data, cwd="/tmp/test", project_context="")

    state = {
        "workflow_id": "wf-1",
        "execution_id": "exec-1",
        "node_results": {},
        "current_node": None,
        "status": "running",
        "error": None,
        "task_input": "Do something",
    }

    with patch("graphs.sandbox.SessionLocal", return_value=mock_db), \
         patch("graphs.sandbox.send_through_pipeline", side_effect=mock_pipeline), \
         patch("graphs.sandbox.goose_manager") as mock_gm, \
         patch("graphs.sandbox.event_bus") as mock_bus, \
         patch("graphs.sandbox.asyncio.sleep", new_callable=AsyncMock):
        mock_gm.register_agent = MagicMock()
        mock_bus.emit = AsyncMock()

        result = await node_func(state)

        assert call_count == 3
        assert "Success output" in result["node_results"]["node-1"]


# ── Sandbox node detects AGENT_ERROR ──────────────────────────────────

@pytest.mark.asyncio
async def test_sandbox_node_detects_agent_error():
    """Sandbox node should detect AGENT_ERROR in response and update status."""
    from graphs.sandbox import _make_agent_node

    async def mock_pipeline(**kwargs):
        yield StreamChunk(type="text", content="AGENT_ERROR: something went wrong")

    mock_agent = MagicMock()
    mock_agent.id = "agent-1"
    mock_agent.name = "TestAgent"
    mock_agent.provider = "claude-code"
    mock_agent.model = "claude-opus-4-20250514"
    mock_agent.tools = '["developer"]'
    mock_agent.system_prompt = "You are helpful."
    mock_agent.skills = "[]"
    mock_agent.memory = "{}"
    mock_agent.guardrails = "{}"

    mock_execution = MagicMock()
    mock_db = MagicMock()
    # Return mock_agent for any query().filter().first() call
    mock_db.query.return_value.filter.return_value.first.return_value = mock_agent

    node_data = {"label": "test-node", "agentId": "agent-1"}
    node_func = _make_agent_node("node-1", "agent-1", node_data, cwd="/tmp/test", project_context="")

    state = {
        "workflow_id": "wf-1",
        "execution_id": "exec-1",
        "node_results": {},
        "current_node": None,
        "status": "running",
        "error": None,
        "task_input": "Do something",
    }

    with patch("graphs.sandbox.SessionLocal", return_value=mock_db), \
         patch("graphs.sandbox.send_through_pipeline", side_effect=mock_pipeline), \
         patch("graphs.sandbox.goose_manager") as mock_gm, \
         patch("graphs.sandbox.event_bus") as mock_bus:
        mock_gm.register_agent = MagicMock()
        mock_bus.emit = AsyncMock()

        result = await node_func(state)

        assert result["node_results"]["node-1"].startswith("AGENT_ERROR:")
        assert result.get("error") is not None
        mock_bus.emit.assert_called()
        # Verify emit was called with workflow:node_error
        emit_calls = [c for c in mock_bus.emit.call_args_list if c[0][0] == "workflow:node_error"]
        assert len(emit_calls) >= 1


# ── Sandbox node detects SANDBOX_VIOLATION ────────────────────────────

@pytest.mark.asyncio
async def test_sandbox_node_detects_sandbox_violation():
    """Sandbox node should detect SANDBOX_VIOLATION and fail immediately without retry."""
    from graphs.sandbox import _make_agent_node

    call_count = 0

    async def mock_pipeline(**kwargs):
        nonlocal call_count
        call_count += 1
        yield StreamChunk(type="text", content="SANDBOX_VIOLATION: write to /etc/passwd")

    mock_agent = MagicMock()
    mock_agent.id = "agent-1"
    mock_agent.name = "TestAgent"
    mock_agent.provider = "claude-code"
    mock_agent.model = "claude-opus-4-20250514"
    mock_agent.tools = '["developer"]'
    mock_agent.system_prompt = "You are helpful."
    mock_agent.skills = "[]"
    mock_agent.memory = "{}"
    mock_agent.guardrails = "{}"

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_agent

    node_data = {"label": "test-node", "agentId": "agent-1"}
    node_func = _make_agent_node("node-1", "agent-1", node_data, cwd="/tmp/test", project_context="")

    state = {
        "workflow_id": "wf-1",
        "execution_id": "exec-1",
        "node_results": {},
        "current_node": None,
        "status": "running",
        "error": None,
        "task_input": "Do something",
    }

    with patch("graphs.sandbox.SessionLocal", return_value=mock_db), \
         patch("graphs.sandbox.send_through_pipeline", side_effect=mock_pipeline), \
         patch("graphs.sandbox.goose_manager") as mock_gm, \
         patch("graphs.sandbox.event_bus") as mock_bus:
        mock_gm.register_agent = MagicMock()
        mock_bus.emit = AsyncMock()

        result = await node_func(state)

        # No retry on sandbox violation
        assert call_count == 1
        assert "SANDBOX_VIOLATION" in result["node_results"]["node-1"]
        assert result.get("error") is not None


# ── Workflow uses checkpointer ────────────────────────────────────────

@pytest.mark.asyncio
async def test_workflow_uses_checkpointer():
    """_run_workflow should compile graph with a checkpointer and thread_id."""
    from routes.workflows import _run_workflow

    mock_graph = MagicMock()
    mock_compiled = MagicMock()
    mock_compiled.ainvoke = AsyncMock(return_value={
        "node_results": {"n1": "done"},
        "current_node": None,
        "status": "completed",
    })
    mock_graph.compile = MagicMock(return_value=mock_compiled)

    mock_checkpointer = MagicMock()

    mock_execution = MagicMock()
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_execution

    with patch("routes.workflows.build_sandbox_graph", return_value=mock_graph), \
         patch("routes.workflows.SessionLocal", return_value=mock_db), \
         patch("routes.workflows.get_checkpointer", new_callable=AsyncMock, return_value=mock_checkpointer), \
         patch("routes.workflows.event_bus") as mock_bus:
        mock_bus.emit = AsyncMock()

        await _run_workflow(
            execution_id="exec-1",
            workflow_id="wf-1",
            nodes=[{"id": "n1", "data": {"agentId": "a1"}}],
            edges=[],
            cwd="/tmp/test",
            task_input="test",
        )

        # Verify compile was called with checkpointer
        mock_graph.compile.assert_called_once_with(checkpointer=mock_checkpointer)

        # Verify ainvoke was called with thread_id config
        call_args = mock_compiled.ainvoke.call_args
        assert call_args[1]["config"]["configurable"]["thread_id"] == "exec-1"
