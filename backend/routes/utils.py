import subprocess
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from db.database import get_db
from services.skill_loader import seed_skills
from services.demo_setup import setup_demo
from db.models import Skill

router = APIRouter(tags=["utils"])


@router.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@router.post("/api/browse-folder")
def browse_folder():
    try:
        result = subprocess.run(
            ["osascript", "-e", 'POSIX path of (choose folder with prompt "Select target directory")'],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            return {"path": result.stdout.strip()}
        return {"path": None, "error": "User cancelled"}
    except Exception as e:
        return {"path": None, "error": str(e)}


@router.get("/api/skills")
def list_skills(db: Session = Depends(get_db)):
    seed_skills(db)
    skills = db.query(Skill).all()
    return [{"id": s.id, "name": s.name, "description": s.description, "category": s.category} for s in skills]


@router.post("/api/demo/setup")
def demo_setup(db: Session = Depends(get_db)):
    return setup_demo(db)
