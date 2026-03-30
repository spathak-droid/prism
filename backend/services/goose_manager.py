"""Spawn and manage Goose CLI subprocesses."""
import asyncio
import os
import json
import shutil
import subprocess
from typing import AsyncGenerator, Optional
from services.stream_parser import parse_goose_line, StreamChunk
from services.event_bus import event_bus


def _find_goose() -> str:
    path = shutil.which("goose") or shutil.which("goose3")
    if path:
        return path
    for fallback in ("/opt/homebrew/bin/goose", "/usr/local/bin/goose"):
        if os.path.isfile(fallback) and os.access(fallback, os.X_OK):
            return fallback
    raise RuntimeError(
        "Goose CLI not found on PATH or in common locations. "
        "Install it or set GOOSE_PATH environment variable."
    )


def _get_goose_path() -> str:
    return os.environ.get("GOOSE_PATH") or _find_goose()


def verify_goose_available() -> str:
    """Check that Goose is installed and runnable. Returns version string."""
    path = _get_goose_path()
    try:
        result = subprocess.run(
            [path, "--version"], capture_output=True, text=True, timeout=10,
        )
        version = result.stdout.strip() or result.stderr.strip() or "unknown"
        return f"{path} ({version})"
    except (subprocess.TimeoutExpired, OSError) as e:
        raise RuntimeError(f"Goose found at {path} but failed to run: {e}")


_GOOSE_PATH: Optional[str] = None
DEFAULT_BUILTINS = ["developer", "analyze"]


def get_goose_path() -> str:
    """Lazy-initialize and cache the Goose binary path."""
    global _GOOSE_PATH
    if _GOOSE_PATH is None:
        _GOOSE_PATH = _get_goose_path()
    return _GOOSE_PATH


class GooseManager:
    def __init__(self):
        self._agents: dict[str, dict] = {}  # agent_id → {status, process}
        self._processes: dict[str, asyncio.subprocess.Process] = {}

    def register_agent(self, agent_id: str, name: str, provider: str, model: str, tools: list[str]):
        self._agents[agent_id] = {
            "name": name,
            "provider": provider,
            "model": model,
            "tools": tools,
            "status": "idle",
        }

    def get_status(self, agent_id: str) -> str:
        return self._agents.get(agent_id, {}).get("status", "idle")

    async def send_message(
        self,
        agent_id: str,
        message: str,
        system_prompt: str,
        cwd: Optional[str] = None,
        max_turns: int = 15,
        extra_builtins: Optional[list[str]] = None,
        execution_id: Optional[str] = None,
        timeout: int = 300,
    ) -> AsyncGenerator[StreamChunk, None]:
        """Spawn a fresh Goose session and yield StreamChunks."""
        agent = self._agents.get(agent_id)
        if not agent:
            yield StreamChunk(type="text", content=f"Agent {agent_id} not registered")
            return

        builtins = list(DEFAULT_BUILTINS)
        for tool in agent["tools"]:
            if tool not in builtins:
                builtins.append(tool)
        if extra_builtins:
            for b in extra_builtins:
                if b not in builtins:
                    builtins.append(b)

        args = [
            get_goose_path(), "run",
            "-t", message,
            "--no-session",
            "--system", system_prompt,
            "--provider", agent["provider"],
            "--model", agent["model"],
            "--output-format", "stream-json",
            "--quiet",
            "--no-profile",
            "--max-turns", str(max_turns),
        ]
        for b in builtins:
            args.extend(["--with-builtin", b])

        work_dir = cwd or os.getcwd()
        os.makedirs(work_dir, exist_ok=True)

        agent["status"] = "running"
        _evt = {"agent_id": agent_id, "status": "running"}
        if execution_id:
            _evt["execution_id"] = execution_id
        await event_bus.emit("agent:status", _evt)

        process = None
        try:
            # Kill orphaned process if one is still running for this agent
            existing = self._processes.get(agent_id)
            if existing and existing.returncode is None:
                existing.kill()
                try:
                    await asyncio.wait_for(existing.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
                self._processes.pop(agent_id, None)

            process = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=work_dir,
                env={
                    **os.environ,
                    "GOOSE_PROVIDER": agent["provider"],
                    "GOOSE_MODEL": agent["model"],
                    # claude-code provider needs this to run headless without permission prompts
                    "CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS": "1",
                },
            )
            self._processes[agent_id] = process

            loop = asyncio.get_running_loop()
            deadline = loop.time() + timeout
            buffer = ""

            # Stream stdout line-by-line, yielding each chunk immediately
            while True:
                remaining = deadline - loop.time()
                if remaining <= 0:
                    raise asyncio.TimeoutError()

                line_bytes = await asyncio.wait_for(
                    process.stdout.readline(), timeout=remaining,
                )
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace")
                buffer += line

                while "\n" in buffer:
                    complete_line, buffer = buffer.split("\n", 1)
                    for chunk in parse_goose_line(complete_line):
                        if chunk.type in ("tool_request", "tool_response"):
                            tool_evt = {
                                "agent_id": agent_id,
                                "tool_name": chunk.tool_name or "unknown",
                                "tool_type": chunk.type,
                                "content": chunk.content,
                            }
                            if execution_id:
                                tool_evt["execution_id"] = execution_id
                            await event_bus.emit("agent:tool", tool_evt)
                        yield chunk

            # Flush remaining buffer after stdout closes
            if buffer.strip():
                for chunk in parse_goose_line(buffer):
                    yield chunk

            # Drain stderr to avoid pipe deadlock, then wait for exit
            remaining = max(deadline - loop.time(), 1)
            try:
                await asyncio.wait_for(process.stderr.read(), timeout=remaining)
            except asyncio.TimeoutError:
                pass
            remaining = max(deadline - loop.time(), 1)
            try:
                await asyncio.wait_for(process.wait(), timeout=remaining)
            except asyncio.TimeoutError:
                raise

        except asyncio.TimeoutError:
            if process and process.returncode is None:
                process.kill()
                try:
                    await asyncio.wait_for(process.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
            agent["status"] = "error"
            err_evt = {"agent_id": agent_id, "status": "error", "reason": "timeout"}
            if execution_id:
                err_evt["execution_id"] = execution_id
            await event_bus.emit("agent:status", err_evt)
            yield StreamChunk(type="text", content=f"Error: Agent timed out after {timeout}s")
            return

        except Exception as e:
            agent["status"] = "error"
            err_evt = {"agent_id": agent_id, "status": "error"}
            if execution_id:
                err_evt["execution_id"] = execution_id
            await event_bus.emit("agent:status", err_evt)
            yield StreamChunk(type="text", content=f"Error: {str(e)}")
            return
        finally:
            self._processes.pop(agent_id, None)
            if agent.get("status") == "running":
                agent["status"] = "idle"
                idle_evt = {"agent_id": agent_id, "status": "idle"}
                if execution_id:
                    idle_evt["execution_id"] = execution_id
                await event_bus.emit("agent:status", idle_evt)

    def kill_agent(self, agent_id: str) -> bool:
        process = self._processes.get(agent_id)
        if process and process.returncode is None:
            process.terminate()
            self._processes.pop(agent_id, None)
            return True
        return False

    def kill_all(self):
        for agent_id in list(self._processes.keys()):
            self.kill_agent(agent_id)


goose_manager = GooseManager()
