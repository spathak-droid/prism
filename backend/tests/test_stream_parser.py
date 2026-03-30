import json
from services.stream_parser import parse_goose_line, StreamChunk


def test_text_message():
    line = json.dumps({"role": "assistant", "content": [{"type": "text", "text": "Hello world"}]})
    chunks = parse_goose_line(line)
    assert len(chunks) == 1
    assert chunks[0].type == "text"
    assert chunks[0].content == "Hello world"


def test_tool_request():
    line = json.dumps({
        "role": "assistant",
        "content": [{"type": "toolRequest", "toolCall": {"value": {"name": "shell", "arguments": {"command": "ls"}}}}]
    })
    chunks = parse_goose_line(line)
    assert len(chunks) == 1
    assert chunks[0].type == "tool_request"
    assert chunks[0].tool_name == "shell"


def test_tool_response():
    line = json.dumps({
        "role": "user",
        "content": [{"type": "toolResponse", "toolResult": {"value": {"content": [{"type": "text", "text": "file.txt"}]}}}]
    })
    chunks = parse_goose_line(line)
    assert len(chunks) == 1
    assert chunks[0].type == "tool_response"
    assert "file.txt" in chunks[0].content


def test_empty_line():
    assert parse_goose_line("") == []
    assert parse_goose_line("   ") == []


def test_non_json():
    chunks = parse_goose_line("some raw text output")
    assert len(chunks) == 1
    assert chunks[0].type == "text"


import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_streaming_yields_incrementally():
    """Verify chunks are yielded as each line arrives, not batched."""
    from services.goose_manager import GooseManager

    mgr = GooseManager()
    mgr.register_agent("test-1", "Test", "openai", "gpt-4", [])

    lines = [
        json.dumps({"role": "assistant", "content": [{"type": "text", "text": "chunk1"}]}) + "\n",
        json.dumps({"role": "assistant", "content": [{"type": "text", "text": "chunk2"}]}) + "\n",
        json.dumps({"role": "assistant", "content": [{"type": "text", "text": "chunk3"}]}) + "\n",
    ]
    line_iter = iter(lines)

    async def fake_readline():
        try:
            return next(line_iter).encode()
        except StopIteration:
            return b""

    mock_process = AsyncMock()
    mock_process.stdout.readline = fake_readline
    mock_process.returncode = None
    mock_process.wait = AsyncMock(side_effect=lambda: setattr(mock_process, 'returncode', 0))
    mock_process.kill = MagicMock()

    with patch("services.goose_manager.asyncio.create_subprocess_exec", return_value=mock_process), \
         patch("services.goose_manager.event_bus") as mock_bus:
        mock_bus.emit = AsyncMock()

        collected = []
        async for chunk in mgr.send_message("test-1", "hello", "system", timeout=30):
            collected.append(chunk.content)
            # Each chunk should arrive individually — we should never see all 3 at once
            # on the first iteration
            if len(collected) == 1:
                assert collected == ["chunk1"], "First chunk should be 'chunk1'"

    assert collected == ["chunk1", "chunk2", "chunk3"]
