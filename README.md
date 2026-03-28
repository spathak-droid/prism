# Factory v4

AI Agent Orchestration Platform — build apps end-to-end from a brief.

## What It Does

**Factory Mode:** Provide a project brief → Factory auto-creates SDLC agents → they research, plan, code, review, and deploy your app. Live monitoring of every tool call.

**Sandbox Mode:** Create custom agents with comprehensive system prompts. Wire them into DAGs with conditional edges using a visual workflow builder. Chat directly. Telegram integration. Cron scheduling.

## Architecture

```
┌─────────────────────────────────────────┐
│  Browser (:3000)                         │
│  Next.js 14 + shadcn/ui + React Flow    │
└────────┬──────────────────────┬──────────┘
         │ REST (proxied)       │ SSE (direct)
┌────────▼──────────────────────▼──────────┐
│  Python Server (:8000) — FastAPI          │
│  LangGraph orchestration                  │
│  Goose CLI subprocess manager             │
│  SSE streaming per agent                  │
│  SQLite database                          │
└───────────────────────────────────────────┘
```

## Quick Start

```bash
# Backend
cd backend
python3 -m venv ../.venv
source ../.venv/bin/activate
pip install -e ".[dev]"
uvicorn server:app --reload --port 8000

# Frontend (new terminal)
cd frontend
pnpm install
pnpm dev

# CLI
./cli.sh demo           # Seed demo agents
./cli.sh health         # Check server
./cli.sh new "Snake" "Make me a snake game" /tmp/snake
```

Open http://localhost:3000

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14, shadcn/ui, React Flow, Zustand |
| Backend | Python, FastAPI, LangGraph |
| Agent Runtime | Goose CLI (claude-code provider) |
| Database | SQLite via SQLAlchemy |
| Real-time | Server-Sent Events (SSE) |

## How Factory Mode Works

1. User provides brief + target directory
2. Complexity assessed (simple/medium/complex)
3. LangGraph pipeline executes:
   - **Simple:** Planner → Coder → Reviewer → Done
   - **Medium:** Researcher → Planner → Approval → Coder(s) → Reviewer → Deployer
   - **Complex:** Multi-phase variant with parallel coders
4. Each agent is a Goose subprocess with a 200-500 line system prompt
5. Agents communicate via Pydantic JSON contracts
6. state.json checkpoints every phase for crash recovery
7. Every tool call streams to UI in real-time

## 8 Non-Negotiable Requirements

1. ✅ System prompts: 200-500 lines each
2. ✅ Agent-to-agent: Pydantic JSON contracts
3. ✅ Parallel execution: asyncio.gather for independent tickets
4. ✅ End-to-end: brief + folder → working app
5. ✅ state.json: per-project checkpoint
6. ✅ LangGraph: real Python LangGraph orchestration
7. ✅ Visibility: stream every tool call to UI
8. ✅ Folder awareness: agents work in target dir

## Project Structure

```
factory-v4/
├── backend/
│   ├── server.py           # FastAPI app
│   ├── db/                 # SQLAlchemy models
│   ├── routes/             # API endpoints
│   ├── services/           # Business logic
│   ├── graphs/             # LangGraph definitions
│   ├── prompts/            # System prompts (200-500 lines each)
│   ├── contracts/          # Pydantic schemas + state.json
│   ├── skills/             # Reusable skill .md files
│   └── tests/              # pytest tests
├── frontend/
│   ├── src/app/            # Next.js pages
│   ├── src/components/     # React components
│   └── src/lib/            # Zustand stores + utils
├── cli.sh                  # Terminal interface
└── README.md
```
