"""Tests for resilience improvements: checkpointing, timeouts, retries, concurrency."""
import asyncio
import os
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from services.goose_manager import GooseManager
from services.stream_parser import StreamChunk


# ── Checkpointer ──────────────────────────────────────────────────────

@pytest.fixture
async def reset_checkpointer(tmp_path):
    """Reset checkpointer singleton before each test, close after."""
    import services.checkpointer as cp_mod
    cp_mod._saver_instance = None
    cp_mod._CHECKPOINT_DB = str(tmp_path / "cp.db")
    yield cp_mod
    await cp_mod.close_checkpointer()


@pytest.mark.asyncio
async def test_checkpointer_returns_sqlite_saver(reset_checkpointer):
    """get_checkpointer should return a real AsyncSqliteSaver instance."""
    cp_mod = reset_checkpointer
    saver = await cp_mod.get_checkpointer()
    assert saver is not None
    assert isinstance(saver, AsyncSqliteSaver)
    assert hasattr(saver, 'get_tuple')

    # Second call returns same instance (singleton)
    saver2 = await cp_mod.get_checkpointer()
    assert saver2 is saver


# ── Graph compilation ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_simple_graph_compiles_with_checkpointer(reset_checkpointer):
    """Simple graph should compile with persistent checkpointer."""
    from graphs.factory_simple import get_simple_graph_runner
    runner = await get_simple_graph_runner()
    assert runner is not None


@pytest.mark.asyncio
async def test_medium_graph_compiles_with_checkpointer(reset_checkpointer):
    """Medium graph should compile with persistent checkpointer."""
    from graphs.factory_medium import get_medium_graph_runner
    runner = await get_medium_graph_runner()
    assert runner is not None


@pytest.mark.asyncio
async def test_complex_graph_compiles_with_checkpointer(reset_checkpointer):
    """Complex graph should compile with persistent checkpointer."""
    from graphs.factory_complex import get_complex_graph_runner
    runner = await get_complex_graph_runner()
    assert runner is not None


# ── Timeout ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_goose_manager_timeout():
    """GooseManager should kill the process and yield an error on timeout."""
    os.environ["GOOSE_PATH"] = "/fake/goose"
    try:
        # Reset cached path so it picks up the env var
        import services.goose_manager as gm_mod
        gm_mod._GOOSE_PATH = None

        manager = GooseManager()
        manager.register_agent("test-agent", "Test", "claude-code", "model", ["developer"])

        mock_process = MagicMock()
        mock_process.stderr = AsyncMock()
        mock_process.returncode = None
        mock_process.kill = MagicMock()

        async def mock_readline():
            return b""
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = mock_readline

        async def mock_wait():
            await asyncio.sleep(9999)
        mock_process.wait = mock_wait

        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_process), \
             patch("services.goose_manager.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()

            chunks = []
            async for chunk in manager.send_message(
                agent_id="test-agent",
                message="test",
                system_prompt="test",
                timeout=2,
            ):
                chunks.append(chunk)

            assert len(chunks) == 1
            assert "timed out" in chunks[0].content
            assert manager._agents["test-agent"]["status"] == "error"
    finally:
        os.environ.pop("GOOSE_PATH", None)
        gm_mod._GOOSE_PATH = None


@pytest.mark.asyncio
async def test_goose_manager_normal_completion():
    """GooseManager should return chunks normally when no timeout occurs."""
    os.environ["GOOSE_PATH"] = "/fake/goose"
    try:
        import services.goose_manager as gm_mod
        gm_mod._GOOSE_PATH = None

        manager = GooseManager()
        manager.register_agent("test-agent", "Test", "claude-code", "model", ["developer"])

        mock_process = MagicMock()
        mock_process.stderr = AsyncMock()
        mock_process.returncode = 0

        async def mock_wait():
            return 0
        mock_process.wait = mock_wait

        test_line = b'{"type":"text","content":"hello"}\n'
        call_count = 0
        async def mock_readline():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return test_line
            return b""
        mock_process.stdout = MagicMock()
        mock_process.stdout.readline = mock_readline

        with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock, return_value=mock_process), \
             patch("services.goose_manager.event_bus") as mock_bus:
            mock_bus.emit = AsyncMock()

            chunks = []
            async for chunk in manager.send_message(
                agent_id="test-agent",
                message="test",
                system_prompt="test",
                timeout=30,
            ):
                chunks.append(chunk)

            assert len(chunks) >= 1
            assert manager._agents["test-agent"]["status"] == "idle"
    finally:
        os.environ.pop("GOOSE_PATH", None)
        gm_mod._GOOSE_PATH = None


# ── Retry ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_goose_agent_retries_on_timeout():
    """run_goose_agent should retry on transient failures."""
    from graphs.nodes import run_goose_agent, _set_agent_db_status

    call_count = 0

    async def mock_send_message(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            yield StreamChunk(type="text", content="Error: Agent timed out after 300s")
        else:
            yield StreamChunk(type="text", content="Success response")

    with patch("graphs.nodes.goose_manager") as mock_gm, \
         patch("graphs.nodes._set_agent_db_status"), \
         patch("graphs.nodes._save_log_entry"), \
         patch("graphs.nodes._clean_text_for_log", return_value=""):
        mock_gm.register_agent = MagicMock()
        mock_gm.send_message = mock_send_message

        result = await run_goose_agent(
            agent_id="test-id",
            agent_name="Test",
            system_prompt="test",
            message="test",
            target_dir="/tmp/test",
            max_retries=2,
            timeout=1,
        )

        assert call_count == 3
        assert "Success" in result


@pytest.mark.asyncio
async def test_run_goose_agent_exhausts_retries():
    """run_goose_agent should return AGENT_ERROR after all retries fail."""
    from graphs.nodes import run_goose_agent

    async def mock_send_message(**kwargs):
        yield StreamChunk(type="text", content="Error: Agent timed out after 300s")

    with patch("graphs.nodes.goose_manager") as mock_gm, \
         patch("graphs.nodes._set_agent_db_status"), \
         patch("graphs.nodes._save_log_entry"), \
         patch("graphs.nodes._clean_text_for_log", return_value=""):
        mock_gm.register_agent = MagicMock()
        mock_gm.send_message = mock_send_message

        result = await run_goose_agent(
            agent_id="test-id",
            agent_name="Test",
            system_prompt="test",
            message="test",
            target_dir="/tmp/test",
            max_retries=1,
            timeout=1,
        )

        assert result.startswith("AGENT_ERROR")


@pytest.mark.asyncio
async def test_run_goose_agent_no_retry_on_success():
    """run_goose_agent should not retry when the agent completes successfully."""
    from graphs.nodes import run_goose_agent

    call_count = 0

    async def mock_send_message(**kwargs):
        nonlocal call_count
        call_count += 1
        yield StreamChunk(type="text", content="All good")

    with patch("graphs.nodes.goose_manager") as mock_gm, \
         patch("graphs.nodes._set_agent_db_status"), \
         patch("graphs.nodes._save_log_entry"), \
         patch("graphs.nodes._clean_text_for_log", return_value=""):
        mock_gm.register_agent = MagicMock()
        mock_gm.send_message = mock_send_message

        result = await run_goose_agent(
            agent_id="test-id",
            agent_name="Test",
            system_prompt="test",
            message="test",
            target_dir="/tmp/test",
            max_retries=2,
            timeout=30,
        )

        assert call_count == 1
        assert "All good" in result


# ── Concurrency limiter ──────────────────────────────────────────────

@pytest.mark.asyncio
async def test_semaphore_limits_concurrency():
    """_GOOSE_SEMAPHORE should limit concurrent executions to 3."""
    from graphs.nodes import _GOOSE_SEMAPHORE

    assert _GOOSE_SEMAPHORE._value == 3

    # Simulate 5 tasks trying to acquire the semaphore
    active = 0
    max_active = 0

    async def work():
        nonlocal active, max_active
        async with _GOOSE_SEMAPHORE:
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.05)
            active -= 1

    await asyncio.gather(*[work() for _ in range(5)])

    assert max_active <= 3
