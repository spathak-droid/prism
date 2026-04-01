"""Tests for the pipeline health monitoring system."""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

from db.models import Project, Event, ApprovalGate, new_id, utcnow
from services.health_monitor import (
    _check_stale_projects,
    get_health_summary,
    STALE_THRESHOLD_MINUTES,
    APPROVAL_TIMEOUT_HOURS,
)


def _past_iso(minutes: int = 0, hours: int = 0) -> str:
    """Return an ISO timestamp in the past."""
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes, hours=hours)).isoformat()


def _make_project(db, status="planning", created_at=None, updated_at=None):
    """Insert a project and return it."""
    now = utcnow()
    p = Project(
        id=new_id(),
        name="Test Project",
        brief="A test",
        target_dir="/tmp/test",
        status=status,
        created_at=created_at or now,
        updated_at=updated_at or now,
    )
    db.add(p)
    db.commit()
    return p


def _make_event(db, project_id, timestamp=None):
    """Insert an event for a project."""
    e = Event(
        id=new_id(),
        type="project:update",
        project_id=project_id,
        timestamp=timestamp or utcnow(),
    )
    db.add(e)
    db.commit()
    return e


def _make_approval_gate(db, project_id, status="pending", created_at=None):
    """Insert an approval gate."""
    g = ApprovalGate(
        id=new_id(),
        project_id=project_id,
        node_id="approval_gate",
        type="plan_approval",
        status=status,
        created_at=created_at or utcnow(),
    )
    db.add(g)
    db.commit()
    return g


class TestGetHealthSummary:
    def test_empty_db(self, db_session):
        with patch("services.health_monitor.SessionLocal", return_value=db_session):
            result = get_health_summary()
        assert result["counts"]["active"] == 0
        assert result["counts"]["stale"] == 0
        assert result["counts"]["failed"] == 0
        assert result["counts"]["completed"] == 0
        assert result["counts"]["awaiting_approval"] == 0
        assert result["stale_projects"] == []

    def test_counts_active_projects(self, db_session):
        _make_project(db_session, status="planning")
        _make_project(db_session, status="building")
        _make_project(db_session, status="reviewing")
        with patch("services.health_monitor.SessionLocal", return_value=db_session):
            result = get_health_summary()
        assert result["counts"]["active"] == 3

    def test_counts_all_statuses(self, db_session):
        _make_project(db_session, status="planning")
        _make_project(db_session, status="stale")
        _make_project(db_session, status="failed")
        _make_project(db_session, status="completed")
        _make_project(db_session, status="awaiting_approval")
        with patch("services.health_monitor.SessionLocal", return_value=db_session):
            result = get_health_summary()
        assert result["counts"]["active"] == 1
        assert result["counts"]["stale"] == 1
        assert result["counts"]["failed"] == 1
        assert result["counts"]["completed"] == 1
        assert result["counts"]["awaiting_approval"] == 1

    def test_stale_projects_include_last_event(self, db_session):
        p = _make_project(db_session, status="stale")
        ts = _past_iso(minutes=60)
        _make_event(db_session, p.id, timestamp=ts)
        with patch("services.health_monitor.SessionLocal", return_value=db_session):
            result = get_health_summary()
        assert len(result["stale_projects"]) == 1
        assert result["stale_projects"][0]["id"] == p.id
        assert result["stale_projects"][0]["last_event_at"] == ts


def _mock_session_local(db_session):
    """Create a mock SessionLocal that returns the test session but doesn't close it."""
    class NoCloseSession:
        """Wraps the test session to prevent close() from detaching objects."""
        def __init__(self, session):
            self._session = session
        def __getattr__(self, name):
            if name == "close":
                return lambda: None
            return getattr(self._session, name)
    return lambda: NoCloseSession(db_session)


class TestCheckStaleProjects:
    @pytest.mark.asyncio
    async def test_marks_project_stale_no_recent_events(self, db_session):
        p = _make_project(db_session, status="planning", created_at=_past_iso(minutes=60))
        pid = p.id
        _make_event(db_session, pid, timestamp=_past_iso(minutes=45))
        with patch("services.health_monitor.SessionLocal", _mock_session_local(db_session)), \
             patch("services.health_monitor.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()
            await _check_stale_projects()
        updated = db_session.query(Project).filter(Project.id == pid).first()
        assert updated.status == "stale"
        mock_bus.emit.assert_called()

    @pytest.mark.asyncio
    async def test_does_not_mark_active_project_with_recent_events(self, db_session):
        p = _make_project(db_session, status="building")
        pid = p.id
        _make_event(db_session, pid, timestamp=utcnow())
        with patch("services.health_monitor.SessionLocal", _mock_session_local(db_session)), \
             patch("services.health_monitor.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()
            await _check_stale_projects()
        updated = db_session.query(Project).filter(Project.id == pid).first()
        assert updated.status == "building"

    @pytest.mark.asyncio
    async def test_marks_project_stale_no_events_ever(self, db_session):
        p = _make_project(db_session, status="planning", created_at=_past_iso(minutes=60))
        pid = p.id
        with patch("services.health_monitor.SessionLocal", _mock_session_local(db_session)), \
             patch("services.health_monitor.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()
            await _check_stale_projects()
        updated = db_session.query(Project).filter(Project.id == pid).first()
        assert updated.status == "stale"

    @pytest.mark.asyncio
    async def test_expires_old_approval_gate(self, db_session):
        p = _make_project(db_session, status="awaiting_approval",
                          updated_at=_past_iso(hours=50))
        pid = p.id
        g = _make_approval_gate(db_session, pid, created_at=_past_iso(hours=50))
        gid = g.id
        with patch("services.health_monitor.SessionLocal", _mock_session_local(db_session)), \
             patch("services.health_monitor.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()
            await _check_stale_projects()
        updated_g = db_session.query(ApprovalGate).filter(ApprovalGate.id == gid).first()
        assert updated_g.status == "expired"
        updated_p = db_session.query(Project).filter(Project.id == pid).first()
        assert updated_p.status in ("failed", "stale")

    @pytest.mark.asyncio
    async def test_does_not_expire_recent_approval_gate(self, db_session):
        p = _make_project(db_session, status="awaiting_approval")
        pid = p.id
        g = _make_approval_gate(db_session, pid, created_at=utcnow())
        gid = g.id
        with patch("services.health_monitor.SessionLocal", _mock_session_local(db_session)), \
             patch("services.health_monitor.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()
            await _check_stale_projects()
        updated_g = db_session.query(ApprovalGate).filter(ApprovalGate.id == gid).first()
        assert updated_g.status == "pending"

    @pytest.mark.asyncio
    async def test_marks_awaiting_approval_stale_after_48h(self, db_session):
        p = _make_project(db_session, status="awaiting_approval",
                          updated_at=_past_iso(hours=50))
        pid = p.id
        with patch("services.health_monitor.SessionLocal", _mock_session_local(db_session)), \
             patch("services.health_monitor.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()
            await _check_stale_projects()
        updated = db_session.query(Project).filter(Project.id == pid).first()
        assert updated.status == "stale"


class TestHealthEndpoint:
    def test_health_endpoint(self, db_session):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from routes.projects import router
        from db.database import get_db

        _make_project(db_session, status="planning")
        _make_project(db_session, status="completed")

        def override_get_db():
            try:
                yield db_session
            finally:
                pass

        test_app = FastAPI()
        test_app.include_router(router)
        test_app.dependency_overrides[get_db] = override_get_db

        with patch("services.health_monitor.SessionLocal", return_value=db_session), \
             patch("routes.projects.goose_manager"):
            with TestClient(test_app) as client:
                resp = client.get("/api/projects/health")
                assert resp.status_code == 200
                data = resp.json()
                assert data["counts"]["active"] == 1
                assert data["counts"]["completed"] == 1


class TestAgentErrorDetection:
    """Test that AGENT_ERROR responses are handled correctly in graph nodes."""

    @pytest.mark.asyncio
    async def test_planner_agent_error_returns_failed(self):
        from graphs.nodes import planner_node

        state = {
            "project_id": "test-proj-123",
            "target_dir": "/tmp/test",
            "complexity": "simple",
            "brief": "test brief",
            "research": None,
        }

        with patch("graphs.nodes.run_goose_agent", new_callable=AsyncMock) as mock_run, \
             patch("graphs.nodes.update_phase"), \
             patch("graphs.nodes.event_bus") as mock_bus, \
             patch("graphs.nodes.get_project_agent_config", return_value={
                 "agent_id": "test-agent", "provider": "claude-code", "model": "test",
             }), \
             patch("graphs.nodes.assemble_prompt_with_skills", return_value="prompt"):
            mock_run.return_value = "AGENT_ERROR: connection refused"
            mock_bus.emit = AsyncMock()

            result = await planner_node(state)

            assert result["status"] == "failed"
            assert result["plan"] is None
            assert result["tickets"] == []
            assert "AGENT_ERROR" in result["error"]

    @pytest.mark.asyncio
    async def test_coder_agent_error_returns_failed(self):
        from graphs.nodes import _run_coder_for_ticket

        ticket = {"id": "T-001", "title": "Test", "description": "desc",
                  "acceptance_criteria": ["ac1"], "dependencies": []}
        state = {"project_id": "test-proj", "ticket_results": {},
                 "target_dir": "/tmp/test"}

        with patch("graphs.nodes.run_goose_agent", new_callable=AsyncMock) as mock_run, \
             patch("graphs.nodes.get_project_agent_config", return_value={
                 "agent_id": "test-agent", "provider": "claude-code", "model": "test",
             }), \
             patch("subprocess.run"):
            mock_run.return_value = "AGENT_ERROR: timeout"

            result = await _run_coder_for_ticket(ticket, state, "prompt", "/tmp/test", {})

            assert result["coder"]["status"] == "failed"

    @pytest.mark.asyncio
    async def test_reviewer_agent_error_sets_fail_verdict(self):
        from graphs.nodes import reviewer_node

        state = {
            "project_id": "test-proj",
            "target_dir": "/tmp/test",
            "complexity": "simple",
            "ticket_results": {
                "T-001": {"coder": {"status": "completed"}, "reviewer": {"status": "pending"}},
            },
            "review_cycles": {},
        }

        with patch("graphs.nodes.run_goose_agent", new_callable=AsyncMock) as mock_run, \
             patch("graphs.nodes.update_phase"), \
             patch("graphs.nodes.event_bus") as mock_bus, \
             patch("graphs.nodes.read_state", return_value={"results": {}}), \
             patch("graphs.nodes.write_state"), \
             patch("graphs.nodes.get_project_agent_config", return_value={
                 "agent_id": "test-agent", "provider": "claude-code", "model": "test",
             }), \
             patch("graphs.nodes.assemble_prompt_with_skills", return_value="prompt"):
            mock_run.return_value = "AGENT_ERROR: process killed"
            mock_bus.emit = AsyncMock()

            result = await reviewer_node(state)

            assert result["ticket_results"]["T-001"]["reviewer"]["verdict"] == "fail"
            assert result["ticket_results"]["T-001"]["reviewer"]["status"] == "fail"
