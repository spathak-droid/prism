"""Create Factory projects: DB records + directory + git init + state.json + start graph."""
import os
import subprocess
import json
import asyncio
from sqlalchemy.orm import Session
from db.models import Agent, AgentTemplate, Project, ProjectAgent, new_id, utcnow
from contracts.schemas import assess_complexity
from contracts.state import init_state, write_state
from services.event_bus import event_bus


async def create_project(
    db: Session,
    name: str,
    brief: str,
    target_dir: str,
    config: dict = {},
) -> dict:
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

    agents_to_create = _get_agents_for_complexity(complexity)
    created_agents = []

    for tmpl_name, role in agents_to_create:
        template = db.query(AgentTemplate).filter(AgentTemplate.name == tmpl_name).first()
        agent = Agent(
            id=new_id(),
            name=f"{tmpl_name} ({name})",
            role=role,
            system_prompt=template.system_prompt if template else f"You are a {role} agent.",
            model=template.model if template and hasattr(template, 'model') else "claude-opus-4-20250514",
            provider="claude-code",
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

    asyncio.create_task(_run_factory_pipeline(project_id, brief, target_dir, complexity, db))

    return {
        "id": project_id,
        "name": name,
        "brief": brief,
        "targetDir": target_dir,
        "complexity": complexity,
        "status": "planning",
        "agents": created_agents,
    }


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


async def _run_factory_pipeline(project_id: str, brief: str, target_dir: str, complexity: str, db: Session):
    try:
        if complexity == "simple":
            from graphs.factory_simple import get_simple_graph_runner
            graph = await get_simple_graph_runner()
        else:
            from graphs.factory_simple import get_simple_graph_runner
            graph = await get_simple_graph_runner()

        initial_state = {
            "project_id": project_id,
            "brief": brief,
            "target_dir": target_dir,
            "complexity": complexity,
            "research": None,
            "plan": None,
            "approved": True if complexity == "simple" else False,
            "tickets": [],
            "ticket_results": {},
            "review_cycles": {},
            "status": "planning",
            "error": None,
        }

        thread_id = f"project-{project_id}"

        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.langgraph_thread_id = thread_id
            db.commit()

        config = {"configurable": {"thread_id": thread_id}}
        result = await graph.ainvoke(initial_state, config)

        final_status = "completed" if result.get("status") != "failed" else "failed"
        if project:
            project.status = final_status
            project.updated_at = utcnow()
            db.commit()

        await event_bus.emit("project:update", {
            "project_id": project_id,
            "phase": "complete",
            "status": final_status,
        })

    except Exception as e:
        print(f"[project_factory] Pipeline error: {e}")
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            project.status = "failed"
            project.updated_at = utcnow()
            db.commit()

        await event_bus.emit("project:update", {
            "project_id": project_id,
            "phase": "error",
            "status": "failed",
            "error": str(e),
        })
