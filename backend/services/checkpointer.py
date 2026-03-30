"""Shared LangGraph checkpointer backed by SQLite."""
import os
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# Store checkpoints alongside the main DB
_CHECKPOINT_DB = os.getenv("CHECKPOINT_DB_PATH", "data/checkpoints.db")


async def get_checkpointer() -> AsyncSqliteSaver:
    """Return an AsyncSqliteSaver instance. Caller must use it as async context manager."""
    os.makedirs(os.path.dirname(_CHECKPOINT_DB) or ".", exist_ok=True)
    return AsyncSqliteSaver.from_conn_string(_CHECKPOINT_DB)
