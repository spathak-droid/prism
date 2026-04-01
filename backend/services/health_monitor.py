"""Background health monitor for pipeline projects."""
import asyncio
from datetime import datetime, timezone, timedelta
from db.database import SessionLocal
from db.models import Project, ApprovalGate, Event, utcnow
from services.event_bus import event_bus

MONITOR_INTERVAL_SECONDS = 60
STALE_THRESHOLD_MINUTES = 30
APPROVAL_TIMEOUT_HOURS = 48


async def _check_stale_projects():
    """Check for stale projects and expired approval gates."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        stale_cutoff = (now - timedelta(minutes=STALE_THRESHOLD_MINUTES)).isoformat()
        approval_cutoff = (now - timedelta(hours=APPROVAL_TIMEOUT_HOURS)).isoformat()

        # Check active projects with no recent events
        active_projects = db.query(Project).filter(
            Project.status.in_(("planning", "building", "reviewing"))
        ).all()

        for project in active_projects:
            latest_event = db.query(Event).filter(
                Event.project_id == project.id
            ).order_by(Event.timestamp.desc()).first()

            if latest_event and latest_event.timestamp < stale_cutoff:
                project.status = "stale"
                project.updated_at = utcnow()
                db.commit()
                print(f"[health_monitor] Project {project.id} ({project.name}) marked stale — no events since {latest_event.timestamp}")
                await event_bus.emit("project:stale", {
                    "project_id": project.id,
                    "reason": "no_recent_events",
                    "last_event_at": latest_event.timestamp,
                })
            elif not latest_event:
                # No events at all — check if project is old enough
                if project.created_at < stale_cutoff:
                    project.status = "stale"
                    project.updated_at = utcnow()
                    db.commit()
                    print(f"[health_monitor] Project {project.id} ({project.name}) marked stale — no events ever")
                    await event_bus.emit("project:stale", {
                        "project_id": project.id,
                        "reason": "no_events",
                    })

        # Check expired approval gates
        pending_gates = db.query(ApprovalGate).filter(
            ApprovalGate.status == "pending",
            ApprovalGate.created_at < approval_cutoff,
        ).all()

        for gate in pending_gates:
            gate.status = "expired"
            gate.resolved_at = utcnow()
            db.commit()

            project = db.query(Project).filter(Project.id == gate.project_id).first()
            if project:
                project.status = "failed"
                project.updated_at = utcnow()
                db.commit()
                print(f"[health_monitor] Approval gate {gate.id} expired for project {project.id} ({project.name})")
                await event_bus.emit("project:stale", {
                    "project_id": project.id,
                    "reason": "approval_timeout",
                    "gate_id": gate.id,
                })

        # Also check awaiting_approval projects directly (> 48 hours)
        awaiting_projects = db.query(Project).filter(
            Project.status == "awaiting_approval",
            Project.updated_at < approval_cutoff,
        ).all()

        for project in awaiting_projects:
            project.status = "stale"
            project.updated_at = utcnow()
            db.commit()
            print(f"[health_monitor] Project {project.id} ({project.name}) marked stale — awaiting approval > 48h")
            await event_bus.emit("project:stale", {
                "project_id": project.id,
                "reason": "approval_timeout",
            })

    except Exception as e:
        print(f"[health_monitor] Error during health check: {e}")
    finally:
        db.close()


async def run_health_monitor():
    """Background loop that runs health checks every MONITOR_INTERVAL_SECONDS."""
    print("[health_monitor] Started")
    while True:
        await asyncio.sleep(MONITOR_INTERVAL_SECONDS)
        await _check_stale_projects()


def get_health_summary() -> dict:
    """Return current health counts and stale project details."""
    db = SessionLocal()
    try:
        all_projects = db.query(Project).all()

        counts = {
            "active": 0,
            "stale": 0,
            "failed": 0,
            "completed": 0,
            "awaiting_approval": 0,
        }

        stale_details = []

        for p in all_projects:
            if p.status in ("planning", "building", "reviewing"):
                counts["active"] += 1
            elif p.status == "stale":
                counts["stale"] += 1
                latest_event = db.query(Event).filter(
                    Event.project_id == p.id
                ).order_by(Event.timestamp.desc()).first()
                stale_details.append({
                    "id": p.id,
                    "name": p.name,
                    "status": p.status,
                    "last_event_at": latest_event.timestamp if latest_event else None,
                    "updated_at": p.updated_at,
                })
            elif p.status == "failed":
                counts["failed"] += 1
            elif p.status == "completed":
                counts["completed"] += 1
            elif p.status == "awaiting_approval":
                counts["awaiting_approval"] += 1

        return {
            "counts": counts,
            "stale_projects": stale_details,
        }
    finally:
        db.close()
