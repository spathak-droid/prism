# Resilience Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Prism pipeline survive crashes, handle hung processes, limit concurrency, and retry transient failures.

**Architecture:** Four changes to the backend: swap MemorySaver for AsyncSqliteSaver in all LangGraph graphs, add timeout + retry logic to GooseManager, and add a semaphore to cap concurrent Goose processes in the coder node.

**Tech Stack:** Python, LangGraph, asyncio, aiosqlite, langgraph-checkpoint-sqlite

---

### Task 1: Persistent Checkpointing — Create Shared Checkpointer Factory

**Files:**
- Create: `backend/services/checkpointer.py`

- [ ] **Step 1: Create the checkpointer module**

```python
"""Shared LangGraph checkpointer backed by SQLite."""
import os
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# Store checkpoints alongside the main DB
_CHECKPOINT_DB = os.getenv("CHECKPOINT_DB_PATH", "data/checkpoints.db")


async def get_checkpointer() -> AsyncSqliteSaver:
    """Return an AsyncSqliteSaver instance. Caller must use it as async context manager."""
    os.makedirs(os.path.dirname(_CHECKPOINT_DB) or ".", exist_ok=True)
    return AsyncSqliteSaver.from_conn_string(_CHECKPOINT_DB)
```

- [ ] **Step 2: Verify import works**

Run: `cd /Users/san/Desktop/Gauntlet/factory-v4/backend && python3 -c "from services.checkpointer import get_checkpointer; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/checkpointer.py
git commit -m "feat: add persistent SQLite checkpointer factory for LangGraph"
```

---

### Task 2: Persistent Checkpointing — Update Graph Files

**Files:**
- Modify: `backend/graphs/factory_simple.py`
- Modify: `backend/graphs/factory_medium.py`
- Modify: `backend/graphs/factory_complex.py`

- [ ] **Step 1: Update factory_simple.py**

Replace the `get_simple_graph_runner` function. Change `MemorySaver()` to `AsyncSqliteSaver`. The function becomes async because the checkpointer needs async setup.

```python
"""Simple Factory SDLC graph: Planner → Coder → Reviewer → END"""
from typing import TypedDict, Optional, Annotated
from langgraph.graph import StateGraph, END
from graphs.nodes import planner_node, coder_node, reviewer_node, check_review_outcome


class SimpleProjectState(TypedDict):
    project_id: str
    brief: str
    target_dir: str
    complexity: str
    research: Optional[dict]
    plan: Optional[dict]
    approved: bool
    tickets: list
    ticket_results: dict
    review_cycles: dict
    status: str
    error: Optional[str]


def build_simple_graph():
    """Build the simple SDLC graph (no researcher, no approval, no deployer)."""
    graph = StateGraph(SimpleProjectState)

    graph.add_node("planner", planner_node)
    graph.add_node("coder", coder_node)
    graph.add_node("reviewer", reviewer_node)

    graph.set_entry_point("planner")
    graph.add_edge("planner", "coder")
    graph.add_edge("coder", "reviewer")

    graph.add_conditional_edges("reviewer", check_review_outcome, {
        "pass": END,
        "fail_retry": "coder",
        "fail_escalate": END,
        "more_tickets": "coder",
    })

    return graph


async def get_simple_graph_runner():
    """Compile with persistent SQLite checkpointer."""
    from services.checkpointer import get_checkpointer
    graph = build_simple_graph()
    checkpointer = await get_checkpointer()
    return graph.compile(checkpointer=checkpointer)
```

- [ ] **Step 2: Update factory_medium.py**

Replace both `MemorySaver()` references. Remove the `MemorySaver` import.

```python
"""Medium Factory SDLC graph: Researcher → Planner → Approval → Coder(s) → Reviewer → Deployer"""
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from graphs.nodes import (
    researcher_node, planner_node, approval_gate_node,
    coder_node, reviewer_node, deployer_node, check_review_outcome,
)


class MediumProjectState(TypedDict):
    project_id: str
    brief: str
    target_dir: str
    complexity: str
    research: Optional[dict]
    plan: Optional[dict]
    approved: bool
    tickets: list
    ticket_results: dict
    review_cycles: dict
    deploy_result: Optional[dict]
    status: str
    error: Optional[str]


def build_medium_graph():
    graph = StateGraph(MediumProjectState)

    graph.add_node("researcher", researcher_node)
    graph.add_node("planner", planner_node)
    graph.add_node("approval_gate", approval_gate_node)
    graph.add_node("coder", coder_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("deployer", deployer_node)

    graph.set_entry_point("researcher")
    graph.add_edge("researcher", "planner")
    graph.add_edge("planner", "approval_gate")
    graph.add_edge("approval_gate", "coder")
    graph.add_edge("coder", "reviewer")

    graph.add_conditional_edges("reviewer", check_review_outcome, {
        "pass": "deployer",
        "fail_retry": "coder",
        "fail_escalate": END,
        "more_tickets": "coder",
    })

    graph.add_edge("deployer", END)

    return graph


async def get_medium_graph_runner():
    from services.checkpointer import get_checkpointer
    graph = build_medium_graph()
    checkpointer = await get_checkpointer()
    return graph.compile(checkpointer=checkpointer, interrupt_before=["approval_gate"])


def build_post_approval_graph():
    """Graph that starts from coder — used after plan approval."""
    graph = StateGraph(MediumProjectState)

    graph.add_node("coder", coder_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("deployer", deployer_node)

    graph.set_entry_point("coder")
    graph.add_edge("coder", "reviewer")

    graph.add_conditional_edges("reviewer", check_review_outcome, {
        "pass": "deployer",
        "fail_retry": "coder",
        "fail_escalate": END,
        "more_tickets": "coder",
    })

    graph.add_edge("deployer", END)

    return graph


async def get_post_approval_runner():
    graph = build_post_approval_graph()
    return graph.compile()
```

- [ ] **Step 3: Update factory_complex.py**

```python
"""Complex Factory SDLC graph: multi-phase variant of medium."""
from graphs.factory_medium import build_medium_graph, MediumProjectState


# For v1, complex uses the same graph as medium.
# Multi-phase execution will be added when needed.
ComplexProjectState = MediumProjectState


def build_complex_graph():
    return build_medium_graph()


async def get_complex_graph_runner():
    from services.checkpointer import get_checkpointer
    graph = build_complex_graph()
    checkpointer = await get_checkpointer()
    return graph.compile(checkpointer=checkpointer, interrupt_before=["approval_gate"])
```

- [ ] **Step 4: Verify imports work**

Run: `cd /Users/san/Desktop/Gauntlet/factory-v4/backend && python3 -c "from graphs.factory_simple import build_simple_graph; from graphs.factory_medium import build_medium_graph; from graphs.factory_complex import build_complex_graph; print('All graphs OK')"`
Expected: `All graphs OK`

- [ ] **Step 5: Commit**

```bash
git add backend/services/checkpointer.py backend/graphs/factory_simple.py backend/graphs/factory_medium.py backend/graphs/factory_complex.py
git commit -m "feat: switch LangGraph checkpointing from MemorySaver to persistent SQLite"
```

---

### Task 3: Subprocess Timeouts in GooseManager

**Files:**
- Modify: `backend/services/goose_manager.py`

- [ ] **Step 1: Add timeout to send_message**

Add a `timeout` parameter (default 300s = 5 min). Wrap the stdout read loop + process.wait() in `asyncio.wait_for`. On timeout, kill the process and yield an error chunk.

Replace the full `send_message` method:

```python
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
                "CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS": "1",
            },
        )
        self._processes[agent_id] = process

        async def _read_stream():
            chunks = []
            buffer = ""
            while True:
                line_bytes = await process.stdout.readline()
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
                        chunks.append(chunk)

            if buffer.strip():
                for chunk in parse_goose_line(buffer):
                    chunks.append(chunk)

            await process.wait()
            return chunks

        try:
            chunks = await asyncio.wait_for(_read_stream(), timeout=timeout)
            for chunk in chunks:
                yield chunk
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
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

    agent["status"] = "idle"
    idle_evt = {"agent_id": agent_id, "status": "idle"}
    if execution_id:
        idle_evt["execution_id"] = execution_id
    await event_bus.emit("agent:status", idle_evt)
```

- [ ] **Step 2: Verify import**

Run: `cd /Users/san/Desktop/Gauntlet/factory-v4/backend && python3 -c "from services.goose_manager import GooseManager; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/goose_manager.py
git commit -m "feat: add 5-minute timeout to Goose subprocess execution"
```

---

### Task 4: Retry with Backoff in run_goose_agent

**Files:**
- Modify: `backend/graphs/nodes.py` (the `run_goose_agent` function)

- [ ] **Step 1: Add retry logic to run_goose_agent**

Wrap the Goose call in a retry loop. Retry on timeout/crash (max 2 retries, backoff 5s then 15s). Do NOT retry on clean completion (even if JSON is missing — that's a logic error, not transient).

Replace the `run_goose_agent` function:

```python
async def run_goose_agent(
    agent_id: str,
    agent_name: str,
    system_prompt: str,
    message: str,
    target_dir: str,
    provider: str = "claude-code",
    model: str = "claude-opus-4-20250514",
    max_turns: int = 15,
    timeout: int = 300,
    max_retries: int = 2,
) -> str:
    """Spawn a Goose subprocess and collect full response. Retries on transient failures."""
    goose_manager.register_agent(agent_id, agent_name, provider, model, ["developer", "analyze"])
    _set_agent_db_status(agent_id, "running")

    backoff_delays = [5, 15]
    last_error = None

    for attempt in range(1 + max_retries):
        if attempt > 0:
            delay = backoff_delays[min(attempt - 1, len(backoff_delays) - 1)]
            print(f"[run_goose_agent] Retry {attempt}/{max_retries} for {agent_name} after {delay}s")
            await asyncio.sleep(delay)

        print(f"[run_goose_agent] Starting {agent_name} (id={agent_id[:8]}...) attempt={attempt + 1} in {target_dir}")
        full_response = ""
        text_buffer = ""
        chunk_count = 0
        is_transient_failure = False

        try:
            async for chunk in goose_manager.send_message(
                agent_id=agent_id,
                message=message,
                system_prompt=system_prompt,
                cwd=target_dir,
                max_turns=max_turns,
                timeout=timeout,
            ):
                if chunk.type == "text":
                    # Check if this is a timeout error from GooseManager
                    if chunk.content.startswith("Error: Agent timed out"):
                        is_transient_failure = True
                        last_error = chunk.content
                        break
                    if chunk.content.startswith("Error:"):
                        is_transient_failure = True
                        last_error = chunk.content
                        break
                    full_response += chunk.content
                    text_buffer += chunk.content
                    if "\n\n" in text_buffer or len(text_buffer) > 800:
                        cleaned = _clean_text_for_log(text_buffer)
                        if len(cleaned) > 10:
                            _save_log_entry(agent_id, "text", cleaned[:800])
                        text_buffer = ""
                elif chunk.type == "tool_request":
                    _save_log_entry(agent_id, "tool_call", chunk.content, chunk.tool_name or "", chunk.tool_args or "")
                elif chunk.type == "tool_response":
                    _save_log_entry(agent_id, "tool_result", chunk.content[:500], chunk.tool_name or "")
                chunk_count += 1

            # Flush remaining text buffer
            if text_buffer.strip():
                cleaned = _clean_text_for_log(text_buffer)
                if len(cleaned) > 10:
                    _save_log_entry(agent_id, "text", cleaned[:500])

            if not is_transient_failure:
                print(f"[run_goose_agent] {agent_name} finished. {chunk_count} chunks, {len(full_response)} chars")
                _set_agent_db_status(agent_id, "idle")
                return full_response

        except Exception as e:
            is_transient_failure = True
            last_error = str(e)
            print(f"[run_goose_agent] {agent_name} failed with exception: {e}")

    # All retries exhausted
    print(f"[run_goose_agent] {agent_name} failed after {max_retries + 1} attempts: {last_error}")
    _set_agent_db_status(agent_id, "error")
    return f"AGENT_ERROR: {last_error}"
```

- [ ] **Step 2: Verify import**

Run: `cd /Users/san/Desktop/Gauntlet/factory-v4/backend && python3 -c "from graphs.nodes import run_goose_agent; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/graphs/nodes.py
git commit -m "feat: add retry with exponential backoff for transient Goose failures"
```

---

### Task 5: Concurrency Limiter for Parallel Ticket Execution

**Files:**
- Modify: `backend/graphs/nodes.py` (the `coder_node` function)

- [ ] **Step 1: Add semaphore to coder_node**

Add a module-level semaphore and use it in the parallel execution path. This caps concurrent Goose processes at 3.

Add near top of file (after imports):

```python
# Limit concurrent Goose subprocesses to prevent resource exhaustion
_GOOSE_SEMAPHORE = asyncio.Semaphore(3)
```

Replace the parallel execution block in `coder_node` (lines 326-339). Change the `_run_coder_for_ticket` calls to go through the semaphore:

```python
    if complexity == "simple" or len(independent) <= 1:
        for ticket in independent:
            result = await _run_coder_for_ticket(ticket, state, system_prompt, target_dir, review_cycles)
            tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
            new_results[tid] = result
    else:
        async def _bounded_run(t):
            async with _GOOSE_SEMAPHORE:
                return await _run_coder_for_ticket(t, state, system_prompt, target_dir, review_cycles)

        tasks = [_bounded_run(t) for t in independent]
        results = await asyncio.gather(*tasks)
        for ticket, result in zip(independent, results):
            tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
            new_results[tid] = result
```

- [ ] **Step 2: Verify import**

Run: `cd /Users/san/Desktop/Gauntlet/factory-v4/backend && python3 -c "from graphs.nodes import coder_node, _GOOSE_SEMAPHORE; print(f'Semaphore value: {_GOOSE_SEMAPHORE._value}')"`
Expected: `Semaphore value: 3`

- [ ] **Step 3: Commit**

```bash
git add backend/graphs/nodes.py
git commit -m "feat: cap concurrent Goose processes at 3 via asyncio.Semaphore"
```
