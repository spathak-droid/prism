"""Tests for failure recovery: git checkpoints, circuit breaker, null plan guard, state consistency."""
import asyncio
import json
import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock, call
from services.stream_parser import StreamChunk


# ── Git checkpoint ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_git_tag_created_before_coder():
    """_run_coder_for_ticket should create a git tag before running the agent."""
    from graphs.nodes import _run_coder_for_ticket

    ticket = {"id": "T-001", "title": "Test ticket", "description": "desc", "acceptance_criteria": ["ac1"], "dependencies": []}
    state = {"project_id": "proj-1", "target_dir": "/tmp/test-project", "ticket_results": {}}
    review_cycles = {}

    async def mock_send_message(**kwargs):
        yield StreamChunk(type="text", content='{"status": "completed", "files_changed": []}')

    with patch("graphs.nodes.goose_manager") as mock_gm, \
         patch("graphs.nodes._set_agent_db_status"), \
         patch("graphs.nodes._save_log_entry"), \
         patch("graphs.nodes._clean_text_for_log", return_value=""), \
         patch("graphs.nodes.get_project_agent_config", return_value={"agent_id": "a1", "provider": "claude-code", "model": "m"}), \
         patch("graphs.nodes.subprocess") as mock_subprocess:
        mock_gm.register_agent = MagicMock()
        mock_gm.send_message = mock_send_message

        await _run_coder_for_ticket(ticket, state, "system prompt", "/tmp/test-project", review_cycles)

        # Verify git tag was created
        mock_subprocess.run.assert_any_call(
            ["git", "tag", "-f", "pre-T-001"],
            cwd="/tmp/test-project",
            capture_output=True,
        )


@pytest.mark.asyncio
async def test_git_rollback_on_failure():
    """_run_coder_for_ticket should rollback via git reset when agent returns AGENT_ERROR."""
    from graphs.nodes import _run_coder_for_ticket

    ticket = {"id": "T-002", "title": "Failing ticket", "description": "desc", "acceptance_criteria": ["ac1"], "dependencies": []}
    state = {"project_id": "proj-1", "target_dir": "/tmp/test-project", "ticket_results": {}}
    review_cycles = {}

    async def mock_send_message(**kwargs):
        yield StreamChunk(type="text", content="Error: Agent timed out after 300s")

    with patch("graphs.nodes.goose_manager") as mock_gm, \
         patch("graphs.nodes._set_agent_db_status"), \
         patch("graphs.nodes._save_log_entry"), \
         patch("graphs.nodes._clean_text_for_log", return_value=""), \
         patch("graphs.nodes.get_project_agent_config", return_value={"agent_id": "a1", "provider": "claude-code", "model": "m"}), \
         patch("graphs.nodes.subprocess") as mock_subprocess:
        mock_gm.register_agent = MagicMock()
        mock_gm.send_message = mock_send_message

        result = await _run_coder_for_ticket(ticket, state, "system prompt", "/tmp/test-project", review_cycles)

        # Verify result marks ticket as failed
        assert result["coder"]["status"] == "failed"

        # Verify git reset was called for rollback
        mock_subprocess.run.assert_any_call(
            ["git", "reset", "--hard", "pre-T-002"],
            cwd="/tmp/test-project",
            capture_output=True,
        )


# ── Circuit breaker ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_circuit_breaker_pauses_after_3_failures():
    """coder_node should pause the pipeline after 3 consecutive ticket failures."""
    from graphs.nodes import coder_node

    tickets = [
        {"id": f"T-{i:03d}", "title": f"Ticket {i}", "description": "d", "acceptance_criteria": ["ac"], "dependencies": []}
        for i in range(5)
    ]

    state = {
        "project_id": "proj-cb",
        "target_dir": "/tmp/test-cb",
        "complexity": "simple",
        "tickets": tickets,
        "ticket_results": {},
        "review_cycles": {},
    }

    call_count = 0

    async def mock_run_coder(ticket, state, system_prompt, target_dir, review_cycles):
        nonlocal call_count
        call_count += 1
        return {"coder": {"status": "failed", "error": "AGENT_ERROR: timeout"}, "reviewer": {"status": "pending"}}

    with patch("graphs.nodes._run_coder_for_ticket", side_effect=mock_run_coder), \
         patch("graphs.nodes.assemble_prompt_with_skills", return_value="prompt"), \
         patch("graphs.nodes.update_phase"), \
         patch("graphs.nodes.read_state", return_value={"results": {}}), \
         patch("graphs.nodes.write_state"), \
         patch("graphs.nodes.event_bus") as mock_bus, \
         patch("graphs.nodes.SessionLocal") as mock_session_cls, \
         patch("graphs.nodes.get_project_agent_config", return_value={"agent_id": "a1", "provider": "p", "model": "m"}):
        mock_bus.emit = AsyncMock()
        mock_db = MagicMock()
        mock_project = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_project
        mock_session_cls.return_value = mock_db

        # Mock the coder prompt import
        with patch.dict("sys.modules", {"prompts.coder": MagicMock(get_system_prompt=MagicMock(return_value="prompt"))}):
            result = await coder_node(state)

        # Should have stopped after 3 failures (circuit breaker)
        assert call_count == 3
        assert result["status"] == "paused"

        # Verify project was set to paused
        assert mock_project.status == "paused"

        # Verify paused event was emitted
        mock_bus.emit.assert_any_call("project:paused", {
            "project_id": "proj-cb",
            "reason": "Circuit breaker: 3 consecutive ticket failures",
        })


# ── Null plan guard ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_null_plan_marks_project_failed():
    """_run_factory_pipeline should mark project as failed when plan is None."""
    from services.project_factory import _run_factory_pipeline

    mock_graph = AsyncMock()
    mock_graph.ainvoke = AsyncMock(return_value={
        "plan": None,
        "tickets": [],
        "status": "failed",
    })

    mock_project = MagicMock()
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_project

    with patch("db.database.SessionLocal", return_value=mock_db), \
         patch("services.project_factory.event_bus") as mock_bus, \
         patch("graphs.factory_simple.get_simple_graph_runner", new_callable=AsyncMock, return_value=mock_graph):
        mock_bus.emit = AsyncMock()

        await _run_factory_pipeline("proj-null", "brief", "/tmp/null", "simple", MagicMock())

        # Project should be marked as failed
        assert mock_project.status == "failed"

        # Event should indicate planner failure
        mock_bus.emit.assert_any_call("project:update", {
            "project_id": "proj-null",
            "phase": "planner",
            "status": "failed",
            "error": "Planner produced no actionable plan",
        })


# ── Agent error marks ticket failed ──────────────────────────────────

@pytest.mark.asyncio
async def test_agent_error_marks_ticket_failed():
    """_run_coder_for_ticket should mark ticket as failed when agent returns AGENT_ERROR."""
    from graphs.nodes import _run_coder_for_ticket

    ticket = {"id": "T-ERR", "title": "Error ticket", "description": "d", "acceptance_criteria": ["ac"], "dependencies": []}
    state = {"project_id": "proj-err", "target_dir": "/tmp/test-err", "ticket_results": {}}
    review_cycles = {}

    async def mock_send_message(**kwargs):
        yield StreamChunk(type="text", content="Error: Agent timed out after 300s")

    with patch("graphs.nodes.goose_manager") as mock_gm, \
         patch("graphs.nodes._set_agent_db_status"), \
         patch("graphs.nodes._save_log_entry"), \
         patch("graphs.nodes._clean_text_for_log", return_value=""), \
         patch("graphs.nodes.get_project_agent_config", return_value={"agent_id": "a1", "provider": "claude-code", "model": "m"}), \
         patch("graphs.nodes.subprocess") as mock_subprocess:
        mock_gm.register_agent = MagicMock()
        mock_gm.send_message = mock_send_message

        result = await _run_coder_for_ticket(ticket, state, "system prompt", "/tmp/test-err", review_cycles)

        assert result["coder"]["status"] == "failed"
        assert "AGENT_ERROR" in result["coder"]["error"]


# ── State consistency helper ─────────────────────────────────────────

def test_sync_state_to_db(tmp_path):
    """sync_state_to_db should update Project record from state.json."""
    from contracts.state import sync_state_to_db, write_state

    # Create state file
    os.makedirs(tmp_path / ".factory", exist_ok=True)
    state = {
        "project_id": "proj-sync",
        "status": "building",
        "pipeline": {
            "current_phase": "coder",
            "phases": {},
        },
    }
    write_state(str(tmp_path), state)

    # Mock DB
    mock_project = MagicMock()
    mock_project.status = "planning"
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_project

    with patch("contracts.state.Project", create=True):
        sync_state_to_db(str(tmp_path), "proj-sync", mock_db)

    assert mock_project.status == "building"
    mock_db.commit.assert_called_once()
