# backend/db/database.py
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/factory.db")

# For SQLite, ensure the parent directory exists before engine creation
if DATABASE_URL.startswith("sqlite:///"):
    _db_path = DATABASE_URL[len("sqlite:///"):]
    Path(_db_path).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite needs this
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and run lightweight migrations for new columns."""
    Base.metadata.create_all(bind=engine)
    _migrate(engine)


def _migrate(eng):
    """Add columns that create_all won't add to existing tables."""
    import sqlalchemy
    with eng.connect() as conn:
        # Check if workflows.last_execution_id exists
        try:
            conn.execute(sqlalchemy.text("SELECT last_execution_id FROM workflows LIMIT 1"))
        except Exception:
            conn.execute(sqlalchemy.text("ALTER TABLE workflows ADD COLUMN last_execution_id TEXT"))
            conn.commit()

        # Add model/provider columns to agent_templates
        try:
            conn.execute(sqlalchemy.text("SELECT model FROM agent_templates LIMIT 1"))
        except Exception:
            conn.execute(sqlalchemy.text("ALTER TABLE agent_templates ADD COLUMN model TEXT NOT NULL DEFAULT 'claude-opus-4-20250514'"))
            conn.execute(sqlalchemy.text("ALTER TABLE agent_templates ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude-code'"))
            conn.commit()
