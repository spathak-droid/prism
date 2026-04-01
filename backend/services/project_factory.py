"""Create Factory projects: DB records + directory + git init + state.json + start graph."""
import os
import subprocess
import json
import asyncio
from sqlalchemy.orm import Session
from db.models import Agent, AgentTemplate, Project, ProjectAgent, new_id, utcnow
from contracts.schemas import assess_complexity
from contracts.state import init_state, read_state, write_state
from services.event_bus import event_bus

VALID_STAGES = ["researcher", "planner", "approval", "coder", "reviewer", "deployer"]
REQUIRED_STAGES = {"planner", "coder"}
STAGE_AGENT_MAP = {
    "researcher": ("Researcher", "researcher"),
    "planner": ("Planner", "planner"),
    "approval": None,
    "coder": ("Builder", "coder"),
    "reviewer": ("Reviewer", "reviewer"),
    "deployer": ("Deployer", "deployer"),
}


async def create_project(
    db: Session,
    name: str,
    brief: str,
    target_dir: str,
    config: dict | None = None,
    stages: list[str] | None = None,
) -> dict:
    if config is None:
        config = {}
    if stages is not None:
        _validate_stages(stages)
        complexity = _complexity_from_stages(stages)
        config["stages"] = stages
    else:
        complexity = assess_complexity(brief)
    project_id = new_id()
    now = utcnow()
    project = Project(
        id=project_id,
        name=name,
        brief=brief,
        target_dir=target_dir,
        status="planning",
        complexity=complexity,
        config=json.dumps(config),
        created_at=now,
        updated_at=now,
    )
    db.add(project)
    db.commit()

    os.makedirs(target_dir, exist_ok=True)
    os.makedirs(os.path.join(target_dir, ".factory"), exist_ok=True)

    if not os.path.exists(os.path.join(target_dir, ".git")):
        subprocess.run(["git", "init"], cwd=target_dir, capture_output=True)

    with open(os.path.join(target_dir, ".factory", "brief.md"), "w") as f:
        f.write(brief)

    state = init_state(project_id, brief, target_dir, complexity)
    write_state(target_dir, state)

    if stages is not None:
        agents_to_create = _get_agents_for_stages(stages)
    else:
        agents_to_create = _get_agents_for_complexity(complexity)
    created_agents = []

    for tmpl_name, role in agents_to_create:
        template = db.query(AgentTemplate).filter(AgentTemplate.name == tmpl_name).first()
        agent = Agent(
            id=new_id(),
            name=f"{tmpl_name} ({name})",
            role=role,
            system_prompt=template.system_prompt if template else f"You are a {role} agent.",
            model=template.model if template else "claude-opus-4-20250514",
            provider=template.provider if template else "claude-code",
            tools=template.tools if template else "[]",
            skills=template.skills if template else "[]",
            is_template=False,
            status="idle",
            created_at=now,
            updated_at=now,
        )
        db.add(agent)
        db.flush()

        db.add(ProjectAgent(project_id=project_id, agent_id=agent.id, role=role))
        created_agents.append({"id": agent.id, "name": agent.name, "role": role})

    db.commit()

    await event_bus.emit("project:update", {
        "project_id": project_id,
        "phase": "created",
        "status": "planning",
        "complexity": complexity,
    })

    asyncio.create_task(_run_factory_pipeline(project_id, brief, target_dir, complexity, db, stages=config.get("stages")))

    return {
        "id": project_id,
        "name": name,
        "brief": brief,
        "targetDir": target_dir,
        "complexity": complexity,
        "status": "planning",
        "agents": created_agents,
    }


def _validate_stages(stages: list[str]) -> None:
    if len(stages) != len(set(stages)):
        raise ValueError("Duplicate stages")
    invalid = [s for s in stages if s not in VALID_STAGES]
    if invalid:
        raise ValueError(f"Invalid stages: {', '.join(invalid)}")
    missing = REQUIRED_STAGES - set(stages)
    if missing:
        raise ValueError(f"Missing required stages: {', '.join(sorted(missing))}")


def _complexity_from_stages(stages: list[str]) -> str:
    stage_set = set(stages)
    if stage_set <= {"planner", "coder", "reviewer"}:
        return "simple"
    elif "researcher" in stage_set or "deployer" in stage_set:
        if len(stage_set) >= 5:
            return "complex"
        return "medium"
    return "medium"


def _get_agents_for_stages(stages: list[str]) -> list[tuple[str, str]]:
    agents = []
    for stage in stages:
        mapping = STAGE_AGENT_MAP.get(stage)
        if mapping is not None:
            agents.append(mapping)
    return agents


def _get_agents_for_complexity(complexity: str) -> list[tuple[str, str]]:
    if complexity == "simple":
        return [("Planner", "planner"), ("Builder", "coder"), ("Reviewer", "reviewer")]
    elif complexity == "medium":
        return [
            ("Researcher", "researcher"), ("Planner", "planner"),
            ("Builder", "coder"), ("Reviewer", "reviewer"), ("Deployer", "deployer"),
        ]
    else:
        return [
            ("Researcher", "researcher"), ("Planner", "planner"),
            ("Builder", "coder"), ("Reviewer", "reviewer"), ("Deployer", "deployer"),
        ]


async def _run_factory_pipeline(project_id: str, brief: str, target_dir: str, complexity: str, _db: Session, stages: list[str] | None = None):
    """Run the LangGraph pipeline. Uses fresh DB sessions to avoid stale connections."""
    from db.database import SessionLocal

    try:
        if stages is not None:
            # Dynamic graph selection based on explicit stages
            stage_set = set(stages)
            if stage_set & {"approval", "deployer", "researcher"}:
                from graphs.factory_medium import get_medium_graph_runner
                graph = await get_medium_graph_runner()
            else:
                from graphs.factory_simple import get_simple_graph_runner
                graph = await get_simple_graph_runner()
        elif complexity == "simple":
            from graphs.factory_simple import get_simple_graph_runner
            graph = await get_simple_graph_runner()
        elif complexity == "medium":
            from graphs.factory_medium import get_medium_graph_runner
            graph = await get_medium_graph_runner()
        else:
            from graphs.factory_complex import get_complex_graph_runner
            graph = await get_complex_graph_runner()

        # Determine approval gate
        if stages is not None:
            approved = "approval" not in stages
        else:
            approved = True if complexity == "simple" else False

        initial_state = {
            "project_id": project_id,
            "brief": brief,
            "target_dir": target_dir,
            "complexity": complexity,
            "research": None,
            "plan": None,
            "approved": approved,
            "tickets": [],
            "ticket_results": {},
            "review_cycles": {},
            "validation": None,
            "status": "planning",
            "error": None,
        }

        thread_id = f"project-{project_id}"

        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.langgraph_thread_id = thread_id
                db.commit()
        finally:
            db.close()

        config = {"configurable": {"thread_id": thread_id}}
        result = await graph.ainvoke(initial_state, config)

        # Null plan guard: abort if planner produced nothing actionable
        if result.get("plan") is None or result.get("tickets") == []:
            print(f"[project_factory] Null plan guard: planner produced no actionable plan for {project_id}")
            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == project_id).first()
                if project:
                    project.status = "failed"
                    project.updated_at = utcnow()
                    db.commit()
            finally:
                db.close()
            await event_bus.emit("project:update", {
                "project_id": project_id,
                "phase": "planner",
                "status": "failed",
                "error": "Planner produced no actionable plan",
            })
            return

        final_status = "completed" if result.get("status") != "failed" else "failed"
        print(f"[project_factory] Pipeline finished for {project_id}: {final_status}")

        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = final_status
                project.updated_at = utcnow()
                db.commit()
                print(f"[project_factory] Updated project status to: {final_status}")
        finally:
            db.close()

    except Exception as e:
        print(f"[project_factory] Pipeline error: {e}")
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = "failed"
                project.updated_at = utcnow()
                db.commit()
        finally:
            db.close()


async def resume_after_approval(project_id: str, target_dir: str, complexity: str):
    """Resume the pipeline after plan approval — runs remaining phases."""
    from db.database import SessionLocal
    from contracts.state import update_phase

    state = read_state(target_dir)
    if not state:
        print(f"[project_factory] No state found for {project_id}")
        return

    try:
        # Determine which phases still need to run
        phases = state.get("pipeline", {}).get("phases", {})
        phase_order = ["coder", "reviewer", "deployer"]
        remaining = [p for p in phase_order if phases.get(p, {}).get("status") == "pending"]

        if not remaining:
            print(f"[project_factory] No remaining phases for {project_id}")
            return

        brief = state.get("brief", "")
        plan = state.get("plan")
        research = state.get("research")

        # Build a post-approval graph that starts from coder
        if complexity == "simple":
            from graphs.factory_simple import get_simple_graph_runner
            graph = await get_simple_graph_runner()
        elif complexity == "medium":
            from graphs.factory_medium import get_post_approval_runner
            graph = await get_post_approval_runner()
        else:
            from graphs.factory_medium import get_post_approval_runner
            graph = await get_post_approval_runner()

        resume_state = {
            "project_id": project_id,
            "brief": brief,
            "target_dir": target_dir,
            "complexity": complexity,
            "research": research,
            "plan": plan,
            "approved": True,
            "tickets": plan.get("tickets", []) if isinstance(plan, dict) else [],
            "ticket_results": {},
            "review_cycles": {},
            "validation": None,
            "status": "building",
            "error": None,
        }

        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = "building"
                project.updated_at = utcnow()
                db.commit()
        finally:
            db.close()

        thread_id = f"project-{project_id}-resume"
        config = {"configurable": {"thread_id": thread_id}}
        result = await graph.ainvoke(resume_state, config)

        final_status = "completed" if result.get("status") != "failed" else "failed"
        print(f"[project_factory] Resume finished for {project_id}: {final_status}")

        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = final_status
                project.updated_at = utcnow()
                db.commit()
        finally:
            db.close()

    except Exception as e:
        print(f"[project_factory] Resume error: {e}")
        import traceback
        traceback.print_exc()
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                project.status = "failed"
                project.updated_at = utcnow()
                db.commit()
        finally:
            db.close()
