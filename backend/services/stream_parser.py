"""Parse Goose --output-format stream-json lines into StreamChunks."""
import json
from dataclasses import dataclass
from typing import Optional


@dataclass
class StreamChunk:
    type: str  # "text", "tool_request", "tool_response", "usage"
    content: str
    tool_name: Optional[str] = None
    tool_args: Optional[str] = None
    total_tokens: Optional[int] = None


def parse_goose_line(line: str) -> list[StreamChunk]:
    """Parse a single line of Goose stream-json output. Returns 0+ chunks."""
    line = line.strip()
    if not line:
        return []

    try:
        parsed = json.loads(line)
    except json.JSONDecodeError:
        return [StreamChunk(type="text", content=line)] if line else []

    chunks = []

    # Handle: {"role":"assistant","content":[...]}
    if parsed.get("role") == "assistant" and isinstance(parsed.get("content"), list):
        for part in parsed["content"]:
            if part.get("type") == "text" and part.get("text"):
                chunks.append(StreamChunk(type="text", content=part["text"]))
            elif part.get("type") == "toolRequest" and part.get("toolCall"):
                call = part["toolCall"].get("value") or part["toolCall"]
                name = call.get("name", "tool")
                args = json.dumps(call.get("arguments", {}))[:500] if call.get("arguments") else ""
                chunks.append(StreamChunk(
                    type="tool_request", content=f"Calling {name}",
                    tool_name=name, tool_args=args,
                ))
        return chunks

    # Handle: {"role":"user","content":[{"type":"toolResponse",...}]}
    if parsed.get("role") == "user" and isinstance(parsed.get("content"), list):
        for part in parsed["content"]:
            if part.get("type") == "toolResponse" and part.get("toolResult"):
                result = part["toolResult"].get("value", {})
                content = ""
                if isinstance(result.get("content"), list):
                    for c in result["content"]:
                        if c.get("type") == "text":
                            content += c.get("text", "")
                chunks.append(StreamChunk(
                    type="tool_response",
                    content=content[:1000] or "Done",
                    tool_name=part.get("toolCallId", "tool"),
                ))
        return chunks

    # Handle wrapped: {"type":"message","message":{"content":[...]}}
    if parsed.get("type") == "message" and isinstance(parsed.get("message", {}).get("content"), list):
        for part in parsed["message"]["content"]:
            if part.get("type") == "text" and part.get("text"):
                chunks.append(StreamChunk(type="text", content=part["text"]))
            elif part.get("type") == "toolRequest" and part.get("toolCall"):
                call = part["toolCall"].get("value") or part["toolCall"]
                name = call.get("name", "tool")
                args = json.dumps(call.get("arguments", {}))[:500] if call.get("arguments") else ""
                chunks.append(StreamChunk(
                    type="tool_request", content=f"Calling {name}",
                    tool_name=name, tool_args=args,
                ))
            elif part.get("type") == "toolResponse" and part.get("toolResult"):
                result = part["toolResult"].get("value", {})
                content = ""
                if isinstance(result.get("content"), list):
                    for c in result["content"]:
                        if c.get("type") == "text":
                            content += c.get("text", "")
                chunks.append(StreamChunk(
                    type="tool_response",
                    content=content[:1000] or "Done",
                    tool_name=part.get("toolCallId", "tool"),
                ))
        return chunks

    # Extract token usage from completion message
    if parsed.get("type") == "complete" and parsed.get("total_tokens"):
        chunks.append(StreamChunk(
            type="usage", content="",
            total_tokens=parsed["total_tokens"],
        ))
        return chunks

    # Skip other metadata messages
    if parsed.get("type") in ("usage", "metadata", "done"):
        return chunks

    # Fallback
    if isinstance(parsed.get("content"), str) and parsed["content"]:
        chunks.append(StreamChunk(type="text", content=parsed["content"]))

    return chunks
