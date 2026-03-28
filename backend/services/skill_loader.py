import os
from sqlalchemy.orm import Session
from db.models import Skill, new_id, utcnow


SKILLS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")


def load_skill_files() -> list[dict]:
    if not os.path.exists(SKILLS_DIR):
        return []
    results = []
    for filename in sorted(os.listdir(SKILLS_DIR)):
        if not filename.endswith(".md"):
            continue
        path = os.path.join(SKILLS_DIR, filename)
        with open(path, "r") as f:
            content = f.read()
        name = filename.replace(".md", "")
        desc = ""
        for line in content.split("\n"):
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                desc = stripped[:120]
                break
        results.append({"name": name, "content": content, "description": desc})
    return results


def seed_skills(db: Session):
    for skill_data in load_skill_files():
        existing = db.query(Skill).filter(Skill.name == skill_data["name"]).first()
        now = utcnow()
        if not existing:
            db.add(Skill(
                id=new_id(), name=skill_data["name"],
                description=skill_data["description"],
                content=skill_data["content"],
                type="prompt", category="building",
                created_at=now, updated_at=now,
            ))
        else:
            existing.content = skill_data["content"]
            existing.description = skill_data["description"]
            existing.updated_at = now
    db.commit()


def get_skill_content(db: Session, skill_name: str) -> str:
    skill = db.query(Skill).filter(Skill.name == skill_name).first()
    return skill.content if skill else ""


def build_prompt_with_skills(base_prompt: str, skill_names: list[str], db: Session) -> str:
    parts = [base_prompt]
    for name in skill_names:
        content = get_skill_content(db, name)
        if content:
            parts.append(f"\n\n---\n\n{content}")
    return "\n".join(parts)
