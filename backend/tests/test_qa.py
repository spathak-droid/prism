"""Tests for the QA agent node, schemas, and graph integration."""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from contracts.schemas import QAResult, QATestResult


# --- Schema tests ---

def test_qa_test_result_schema():
    """QATestResult accepts valid data."""
    result = QATestResult(
        acceptance_criterion="Page loads without errors",
        status="pass",
        evidence="HTTP 200, HTML returned",
    )
    assert result.acceptance_criterion == "Page loads without errors"
    assert result.status == "pass"
    assert result.evidence == "HTTP 200, HTML returned"


def test_qa_result_schema():
    """QAResult accepts valid data with nested test results."""
    qa = QAResult(
        status="pass",
        server_started=True,
        tests=[
            QATestResult(
                acceptance_criterion="Page loads",
                status="pass",
                evidence="200 OK",
            ),
            QATestResult(
                acceptance_criterion="Has input fields",
                status="fail",
                evidence="No input elements found",
            ),
        ],
        summary="1/2 acceptance criteria verified",
    )
    assert qa.type == "qa_result"
    assert qa.status == "pass"
    assert qa.server_started is True
    assert len(qa.tests) == 2
    assert qa.tests[0].status == "pass"
    assert qa.tests[1].status == "fail"


def test_qa_result_schema_defaults():
    """QAResult type field defaults to qa_result."""
    qa = QAResult(status="fail", server_started=False, tests=[], summary="no tests")
    assert qa.type == "qa_result"


# --- Node tests ---

@pytest.mark.asyncio
async def test_qa_node_calls_goose():
    """qa_node calls run_goose_agent with the QA system prompt."""
    from graphs.nodes import qa_node

    mock_response = json.dumps({
        "type": "qa_result",
        "status": "pass",
        "server_started": True,
        "tests": [{"acceptance_criterion": "Page loads", "status": "pass", "evidence": "200 OK"}],
        "summary": "1/1 verified",
    })

    state = {
        "project_id": "test-proj-123",
        "target_dir": "/tmp/fake-project",
        "complexity": "simple",
        "tickets": [
            {"id": "T-001", "title": "Build page", "acceptance_criteria": ["Page loads"], "description": "test"},
        ],
    }

    with patch("graphs.nodes.run_goose_agent", new_callable=AsyncMock, return_value=mock_response) as mock_run, \
         patch("graphs.nodes.update_phase"), \
         patch("graphs.nodes.event_bus") as mock_bus, \
         patch("graphs.nodes.get_project_agent_config", return_value={"agent_id": "a1", "provider": "claude-code", "model": "claude-opus-4-20250514"}):
        mock_bus.emit = AsyncMock()

        result = await qa_node(state)

        mock_run.assert_called_once()
        call_kwargs = mock_run.call_args
        assert "QA" in call_kwargs.kwargs.get("agent_name", "") or "QA" in (call_kwargs.args[1] if len(call_kwargs.args) > 1 else "")


@pytest.mark.asyncio
async def test_qa_node_parses_result():
    """qa_node parses a valid QA JSON result from the agent response."""
    from graphs.nodes import qa_node

    qa_json = {
        "type": "qa_result",
        "status": "pass",
        "server_started": True,
        "tests": [
            {"acceptance_criterion": "Has inputs", "status": "pass", "evidence": "2 inputs found"},
        ],
        "summary": "1/1 verified",
    }
    mock_response = f"Some preamble text\n```json\n{json.dumps(qa_json)}\n```\nDone."

    state = {
        "project_id": "test-proj-456",
        "target_dir": "/tmp/fake-project-2",
        "complexity": "simple",
        "tickets": [
            {"id": "T-001", "title": "Build page", "acceptance_criteria": ["Has inputs"], "description": "test"},
        ],
    }

    with patch("graphs.nodes.run_goose_agent", new_callable=AsyncMock, return_value=mock_response), \
         patch("graphs.nodes.update_phase"), \
         patch("graphs.nodes.event_bus") as mock_bus, \
         patch("graphs.nodes.get_project_agent_config", return_value={"agent_id": "a1", "provider": "claude-code", "model": "claude-opus-4-20250514"}):
        mock_bus.emit = AsyncMock()

        result = await qa_node(state)

        assert result["qa_result"]["status"] == "pass"
        assert result["qa_result"]["server_started"] is True
        assert len(result["qa_result"]["tests"]) == 1
        assert result["status"] == "completed"


@pytest.mark.asyncio
async def test_qa_node_handles_agent_error():
    """qa_node handles AGENT_ERROR responses gracefully."""
    from graphs.nodes import qa_node

    state = {
        "project_id": "test-proj-789",
        "target_dir": "/tmp/fake-project-3",
        "complexity": "simple",
        "tickets": [],
    }

    with patch("graphs.nodes.run_goose_agent", new_callable=AsyncMock, return_value="AGENT_ERROR: timed out"), \
         patch("graphs.nodes.update_phase"), \
         patch("graphs.nodes.event_bus") as mock_bus, \
         patch("graphs.nodes.get_project_agent_config", return_value={"agent_id": "a1", "provider": "claude-code", "model": "claude-opus-4-20250514"}):
        mock_bus.emit = AsyncMock()

        result = await qa_node(state)

        assert result["status"] == "qa_failed"
        assert result["qa_result"]["status"] == "fail"


# --- Router tests ---

def test_check_qa_outcome_pass():
    """check_qa_outcome returns 'pass' when QA status is pass."""
    from graphs.nodes import check_qa_outcome
    state = {"qa_result": {"status": "pass", "tests": [], "summary": "all good"}}
    assert check_qa_outcome(state) == "pass"


def test_check_qa_outcome_fail():
    """check_qa_outcome returns 'fail' when QA status is fail."""
    from graphs.nodes import check_qa_outcome
    state = {"qa_result": {"status": "fail", "tests": [], "summary": "broken"}}
    assert check_qa_outcome(state) == "fail"


def test_check_qa_outcome_missing():
    """check_qa_outcome returns 'fail' when qa_result is missing."""
    from graphs.nodes import check_qa_outcome
    state = {}
    assert check_qa_outcome(state) == "fail"


# --- Prompt test ---

def test_qa_system_prompt_generated():
    """prompts/qa.py produces a non-empty string prompt."""
    from prompts.qa import get_system_prompt
    prompt = get_system_prompt("/tmp/test-dir")
    assert isinstance(prompt, str)
    assert len(prompt) > 100
    assert "QA" in prompt
    assert "/tmp/test-dir" in prompt


# --- Graph integration test ---

def test_simple_graph_includes_qa():
    """The simple graph includes a 'qa' node."""
    from graphs.factory_simple import build_simple_graph
    graph = build_simple_graph()
    node_names = set(graph.nodes.keys())
    assert "qa" in node_names


def test_medium_graph_includes_qa():
    """The medium graph includes a 'qa' node."""
    from graphs.factory_medium import build_medium_graph
    graph = build_medium_graph()
    node_names = set(graph.nodes.keys())
    assert "qa" in node_names
