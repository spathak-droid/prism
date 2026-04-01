"""Read/write state.json in project target directories."""
import json
import os
from datetime import datetime, timezone
from typing import Optional, Any


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def state_path(target_dir: str) -> str:
    return os.path.join(target_dir, ".factory", "state.json")


def read_state(target_dir: str) -> Optional[dict]:
    path = state_path(target_dir)
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


def write_state(target_dir: str, state: dict):
    path = state_path(target_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    state["updated_at"] = utcnow()
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def init_state(project_id: str, brief: str, target_dir: str, complexity: str) -> dict:
    """Create initial state.json for a new project."""
    state = {
        "version": "1.0",
        "project_id": project_id,
        "brief": brief,
        "target_dir": target_dir,
        "complexity": complexity,
        "status": "planning",
        "created_at": utcnow(),
        "updated_at": utcnow(),
        "pipeline": {
            "current_phase": "researcher" if complexity != "simple" else "planner",
            "phases": {
                "researcher": {"status": "pending" if complexity != "simple" else "skipped", "reason": "simple complexity" if complexity == "simple" else None},
                "planner": {"status": "pending"},
                "approval": {"status": "pending" if complexity != "simple" else "skipped", "reason": "simple complexity" if complexity == "simple" else None},
                "coder": {"status": "pending"},
                "reviewer": {"status": "pending"},
                "deployer": {"status": "pending" if complexity == "complex" else "skipped", "reason": None if complexity == "complex" else "not complex"},
            },
        },
        "research": None,
        "plan": None,
        "results": {},
        "errors": [],
    }
    return state


def update_phase(target_dir: str, phase: str, updates: dict[str, Any]):
    """Update a specific phase in state.json."""
    state = read_state(target_dir)
    if not state:
        return
    state["pipeline"]["phases"][phase].update(updates)
    if "status" in updates:
        # Advance current_phase to next pending
        phase_order = ["researcher", "planner", "approval", "coder", "reviewer", "deployer"]
        if updates["status"] == "completed":
            for p in phase_order:
                if state["pipeline"]["phases"][p]["status"] == "pending":
                    state["pipeline"]["current_phase"] = p
                    break
    write_state(target_dir, state)


def sync_state_to_db(target_dir: str, project_id: str, db) -> None:
    """Sync .factory/state.json to the Project record in DB.

    Reads the local state file and updates the Project's status and
    current phase to match, ensuring DB and filesystem stay consistent.
    Called after each node completion.
    """
    from db.models import Project

    state = read_state(target_dir)
    if not state:
        return

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return

    # Sync status from state file
    file_status = state.get("status")
    if file_status:
        project.status = file_status

    # Sync updated_at
    project.updated_at = state.get("updated_at", utcnow())

    db.commit()
