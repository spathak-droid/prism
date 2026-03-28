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
