import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import init_db

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import db.models  # noqa: F401 — ensure all models registered before create_all
    init_db()
    print('[prism] Database initialized')
    from services.goose_manager import verify_goose_available
    try:
        goose_info = verify_goose_available()
        print(f'[prism] Goose CLI available: {goose_info}')
    except RuntimeError as e:
        print(f'[prism] WARNING: {e}')
        print('[prism] Agent calls will fail until Goose is installed')
    from db.database import SessionLocal
    from services.demo_setup import setup_demo
    db = SessionLocal()
    try:
        setup_demo(db)
        print('[prism] Demo agents + templates seeded')
    finally:
        db.close()
    from services.scheduler import agent_scheduler
    agent_scheduler.start()
    agent_scheduler.load_all_schedules()
    print('[prism] Scheduler started')
    from services.telegram_bot import telegram_bot
    tg_token = os.getenv('TELEGRAM_BOT_TOKEN')
    if tg_token:
        await telegram_bot.start(tg_token)
        print('[prism] Telegram bot started')
    yield
    await telegram_bot.stop()
    agent_scheduler.stop()
    from services.goose_manager import goose_manager
    goose_manager.kill_all()
    from services.checkpointer import close_checkpointer
    await close_checkpointer()
    print('[prism] Shutting down')


app = FastAPI(title="Prism", lifespan=lifespan)

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
from routes.events import router as events_router

app.include_router(agents_router)
app.include_router(projects_router)
app.include_router(messages_router)
app.include_router(approvals_router)
app.include_router(streaming_router)
app.include_router(utils_router)
app.include_router(workflows_router)
app.include_router(events_router)
