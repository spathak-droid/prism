"""APScheduler integration for cron-based agent tasks."""
import json
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from db.database import SessionLocal
from db.models import Agent
from services.pipeline import send_through_pipeline
from services.goose_manager import goose_manager
from services.event_bus import event_bus


class AgentScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._jobs: dict[str, str] = {}  # agent_id → job_id

    def start(self):
        if not self.scheduler.running:
            self.scheduler.start()

    def stop(self):
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)

    def schedule_agent(self, agent_id: str, cron_expr: str, task_message: str):
        """Schedule an agent to run on a cron schedule."""
        # Remove existing job if any
        self.unschedule_agent(agent_id)

        trigger = CronTrigger.from_crontab(cron_expr)
        job = self.scheduler.add_job(
            _run_scheduled_task,
            trigger=trigger,
            args=[agent_id, task_message],
            id=f'agent-{agent_id}',
            name=f'Scheduled: {agent_id}',
            replace_existing=True,
        )
        self._jobs[agent_id] = job.id

    def unschedule_agent(self, agent_id: str):
        job_id = self._jobs.pop(agent_id, None)
        if job_id:
            try:
                self.scheduler.remove_job(job_id)
            except Exception:
                pass

    def load_all_schedules(self):
        """Load all agent schedules from DB."""
        db = SessionLocal()
        try:
            agents = db.query(Agent).filter(
                Agent.schedule.isnot(None),
                Agent.scheduled_task.isnot(None),
            ).all()
            for agent in agents:
                try:
                    self.schedule_agent(agent.id, agent.schedule, agent.scheduled_task)
                except Exception as e:
                    print(f'[scheduler] Failed to schedule {agent.name}: {e}')
        finally:
            db.close()

    def get_jobs(self) -> list[dict]:
        return [{
            'id': job.id,
            'name': job.name,
            'next_run': str(job.next_run_time) if job.next_run_time else None,
        } for job in self.scheduler.get_jobs()]


async def _run_scheduled_task(agent_id: str, task_message: str):
    """Execute a scheduled agent task."""
    db = SessionLocal()
    try:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if not agent:
            return

        goose_manager.register_agent(
            agent.id, agent.name, agent.provider, agent.model,
            json.loads(agent.tools),
        )

        await event_bus.emit('agent:scheduled', {'agent_id': agent_id, 'task': task_message})

        agent_dict = {
            'system_prompt': agent.system_prompt,
            'skills': agent.skills,
            'memory': agent.memory,
            'guardrails': agent.guardrails,
        }
        async for chunk in send_through_pipeline(
            agent_id=agent_id, message=task_message,
            db=db, agent_data=agent_dict,
        ):
            pass  # Just run, no UI to stream to

    except Exception as e:
        print(f'[scheduler] Task error for {agent_id}: {e}')
    finally:
        db.close()


agent_scheduler = AgentScheduler()
