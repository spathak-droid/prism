"""Shared LangGraph checkpointer backed by SQLite."""
import os
import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# Store checkpoints alongside the main DB
_CHECKPOINT_DB = os.getenv("CHECKPOINT_DB_PATH", "data/checkpoints.db")


async def get_checkpointer() -> AsyncSqliteSaver:
    """Return a ready-to-use AsyncSqliteSaver instance."""
    os.makedirs(os.path.dirname(_CHECKPOINT_DB) or ".", exist_ok=True)
    conn = await aiosqlite.connect(_CHECKPOINT_DB)
    saver = AsyncSqliteSaver(conn)
    await saver.setup()
    return saver
