"""Shared LangGraph checkpointer backed by SQLite."""
import os
import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# Store checkpoints alongside the main DB
_CHECKPOINT_DB = os.getenv("CHECKPOINT_DB_PATH", "data/checkpoints.db")

# Singleton — one connection shared across all graph compilations
_saver_instance: AsyncSqliteSaver | None = None


async def get_checkpointer() -> AsyncSqliteSaver:
    """Return a shared AsyncSqliteSaver instance (creates on first call)."""
    global _saver_instance
    if _saver_instance is not None:
        return _saver_instance
    os.makedirs(os.path.dirname(_CHECKPOINT_DB) or ".", exist_ok=True)
    conn = await aiosqlite.connect(_CHECKPOINT_DB)
    _saver_instance = AsyncSqliteSaver(conn)
    await _saver_instance.setup()
    return _saver_instance


async def close_checkpointer():
    """Close the shared connection. Called at shutdown."""
    global _saver_instance
    if _saver_instance is not None:
        if hasattr(_saver_instance, 'conn') and _saver_instance.conn:
            await _saver_instance.conn.close()
        _saver_instance = None
