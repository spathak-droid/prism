# backend/server.py
import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db.database import init_db

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    print("[factory-v4] Database initialized")
    yield
    # Shutdown
    print("[factory-v4] Shutting down")


app = FastAPI(title="Factory v4", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.1.0"}
