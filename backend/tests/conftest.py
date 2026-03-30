import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi import FastAPI
from fastapi.testclient import TestClient

from db.database import Base, get_db
import db.models  # noqa: F401 — ensure all models are registered on Base

# In-memory SQLite for tests.
# Use StaticPool so all connections share the same in-memory DB.
from sqlalchemy.pool import StaticPool

TEST_ENGINE = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=TEST_ENGINE)


def override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_tables():
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=TEST_ENGINE)
    yield
    Base.metadata.drop_all(bind=TEST_ENGINE)


@pytest.fixture()
def db_session(setup_tables):
    """Provide a raw DB session for tests that need direct DB access."""
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(setup_tables):
    """FastAPI TestClient with test DB, no lifespan side effects."""
    # Mock goose_manager to avoid subprocess calls
    with patch("routes.agents.goose_manager") as mock_goose, \
         patch("routes.workflows.goose_manager") as mock_goose_wf:
        mock_goose.register_agent = MagicMock()
        mock_goose.kill_agent = MagicMock()
        mock_goose.kill_all = MagicMock()
        mock_goose_wf.kill_all = MagicMock()

        # Build a minimal app with only the routers under test (no lifespan)
        from routes.agents import router as agents_router
        from routes.workflows import router as workflows_router
        from routes.messages import router as messages_router

        test_app = FastAPI()
        test_app.include_router(agents_router)
        test_app.include_router(workflows_router)
        test_app.include_router(messages_router)
        test_app.dependency_overrides[get_db] = override_get_db

        with TestClient(test_app) as c:
            yield c

        test_app.dependency_overrides.clear()
