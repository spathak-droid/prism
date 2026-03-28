import os
import json
import tempfile
from contracts.state import init_state, write_state, read_state, update_phase


def test_init_state_simple():
    state = init_state("proj-1", "Make a game", "/tmp/test", "simple")
    assert state["complexity"] == "simple"
    assert state["pipeline"]["phases"]["researcher"]["status"] == "skipped"
    assert state["pipeline"]["phases"]["planner"]["status"] == "pending"
    assert state["pipeline"]["current_phase"] == "planner"


def test_init_state_medium():
    state = init_state("proj-2", "Build an app", "/tmp/test", "medium")
    assert state["pipeline"]["phases"]["researcher"]["status"] == "pending"
    assert state["pipeline"]["current_phase"] == "researcher"


def test_write_read_state():
    with tempfile.TemporaryDirectory() as tmpdir:
        state = init_state("proj-1", "test", tmpdir, "simple")
        write_state(tmpdir, state)
        loaded = read_state(tmpdir)
        assert loaded["project_id"] == "proj-1"
        assert loaded["brief"] == "test"


def test_update_phase():
    with tempfile.TemporaryDirectory() as tmpdir:
        state = init_state("proj-1", "test", tmpdir, "simple")
        write_state(tmpdir, state)
        update_phase(tmpdir, "planner", {"status": "completed", "completed_at": "2026-01-01"})
        loaded = read_state(tmpdir)
        assert loaded["pipeline"]["phases"]["planner"]["status"] == "completed"
