import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import init_db

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("[factory-v4] Database initialized")
    yield
    from services.goose_manager import goose_manager
    goose_manager.kill_all()
    print("[factory-v4] Shutting down")


app = FastAPI(title="Factory v4", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routes.agents import router as agents_router
from routes.projects import router as projects_router
from routes.messages import router as messages_router
from routes.approvals import router as approvals_router
from routes.streaming import router as streaming_router
from routes.utils import router as utils_router
from routes.workflows import router as workflows_router

app.include_router(agents_router)
app.include_router(projects_router)
app.include_router(messages_router)
app.include_router(approvals_router)
app.include_router(streaming_router)
app.include_router(utils_router)
app.include_router(workflows_router)
