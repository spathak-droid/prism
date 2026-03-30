"""Spawn and manage Goose CLI subprocesses."""
import asyncio
import os
import json
from typing import AsyncGenerator, Optional
from services.stream_parser import parse_goose_line, StreamChunk
from services.event_bus import event_bus

GOOSE_PATH = "/opt/homebrew/bin/goose"
DEFAULT_BUILTINS = ["developer", "analyze"]


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
            GOOSE_PATH, "run",
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

        try:
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

            buffer = ""
            while True:
                line_bytes = await process.stdout.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode("utf-8", errors="replace")
                buffer += line

                # Process complete lines
                while "\n" in buffer:
                    complete_line, buffer = buffer.split("\n", 1)
                    for chunk in parse_goose_line(complete_line):
                        # Emit tool events for monitoring
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

            # Process remaining buffer
            if buffer.strip():
                for chunk in parse_goose_line(buffer):
                    yield chunk

            await process.wait()

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
