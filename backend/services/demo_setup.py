from sqlalchemy.orm import Session
from db.models import Agent, AgentTemplate, new_id, utcnow
from services.skill_loader import seed_skills
import json


DEMO_AGENTS = [
    {"name": "Coder", "role": "developer", "system_prompt": "You are an expert software developer. Write clean, well-tested code.", "channels": []},
    {"name": "Reviewer", "role": "code-reviewer", "system_prompt": "You are a senior code reviewer. Review code for bugs, security, best practices. Start response with APPROVED or REJECTED.", "channels": []},
    {"name": "Researcher", "role": "researcher", "system_prompt": "You are a research analyst. Investigate topics and provide structured reports.", "channels": ["telegram"]},
    {"name": "Deployer", "role": "deployer", "system_prompt": "You are a deployment engineer. Validate and deploy approved code.", "channels": []},
]

AGENT_TEMPLATES = [
    {"name": "Researcher", "role": "researcher", "description": "Tech landscape analysis, risks, dependencies", "skills": ["research"], "tools": ["developer", "analyze"], "category": "sdlc"},
    {"name": "Planner", "role": "planner", "description": "Architecture, tickets, CLAUDE.md", "skills": ["planning", "conventions"], "tools": ["developer", "analyze"], "category": "sdlc"},
    {"name": "Builder", "role": "coder", "description": "TDD implementation of tickets", "skills": ["tdd", "conventions"], "tools": ["developer", "analyze"], "category": "sdlc"},
    {"name": "Reviewer", "role": "reviewer", "description": "Code review + security review", "skills": ["code-review", "security-review"], "tools": ["developer", "analyze"], "category": "sdlc"},
    {"name": "Deployer", "role": "deployer", "description": "Build validation + deployment", "skills": ["conventions"], "tools": ["developer", "analyze"], "category": "sdlc"},
]


def setup_demo(db: Session) -> dict:
    now = utcnow()
    seed_skills(db)

    for tmpl in AGENT_TEMPLATES:
        existing = db.query(AgentTemplate).filter(AgentTemplate.name == tmpl["name"]).first()
        if not existing:
            db.add(AgentTemplate(
                id=new_id(), name=tmpl["name"], role=tmpl["role"],
                description=tmpl["description"],
                system_prompt=f"You are the {tmpl['name']} agent.",
                skills=json.dumps(tmpl["skills"]),
                tools=json.dumps(tmpl["tools"]),
                category=tmpl["category"],
                created_at=now,
            ))

    created = 0
    for demo in DEMO_AGENTS:
        existing = db.query(Agent).filter(Agent.name == demo["name"]).first()
        if not existing:
            db.add(Agent(
                id=new_id(), name=demo["name"], role=demo["role"],
                system_prompt=demo["system_prompt"],
                channels=json.dumps(demo["channels"]),
                created_at=now, updated_at=now,
            ))
            created += 1

    db.commit()
    return {"message": f"Demo setup complete. Created {created} agents.", "templates": len(AGENT_TEMPLATES)}
