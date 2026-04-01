"""Shared LangGraph node functions for Factory SDLC pipeline."""
import asyncio
import json
import re
import subprocess
from typing import Any, Optional
from services.goose_manager import goose_manager, StreamChunk
from services.event_bus import event_bus
from contracts.state import update_phase, read_state, write_state
from contracts.schemas import PlanOutput, TicketResult, ReviewResult
from datetime import datetime, timezone
from db.database import SessionLocal
from services.skill_loader import build_prompt_with_skills

# Limit concurrent Goose subprocesses to prevent resource exhaustion
_GOOSE_SEMAPHORE = asyncio.Semaphore(3)

# Skill assignments per role (matches demo_setup.py AGENT_TEMPLATES)
ROLE_SKILLS = {
    "researcher": ["research"],
    "planner": ["planning", "conventions"],
    "coder": ["tdd", "conventions"],
    "reviewer": ["code-review", "security-review"],
    "deployer": ["conventions"],
}


def get_project_agent_id(project_id: str, role: str) -> str:
    """Look up the real DB agent ID for a role in a project."""
    from db.models import ProjectAgent
    db = SessionLocal()
    try:
        pa = db.query(ProjectAgent).filter(
            ProjectAgent.project_id == project_id,
            ProjectAgent.role == role,
        ).first()
        if pa:
            return pa.agent_id
    finally:
        db.close()
    return f"{role}-{project_id[:8]}"


def get_project_agent_config(project_id: str, role: str) -> dict:
    """Look up agent ID, model, and provider for a role in a project."""
    from db.models import ProjectAgent, Agent
    db = SessionLocal()
    try:
        pa = db.query(ProjectAgent).filter(
            ProjectAgent.project_id == project_id,
            ProjectAgent.role == role,
        ).first()
        if pa:
            agent = db.query(Agent).filter(Agent.id == pa.agent_id).first()
            if agent:
                return {
                    "agent_id": agent.id,
                    "provider": agent.provider,
                    "model": agent.model,
                }
    finally:
        db.close()
    return {
        "agent_id": f"{role}-{project_id[:8]}",
        "provider": "claude-code",
        "model": "claude-opus-4-20250514",
    }


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def extract_json_block(text: str, start_marker: str = "```json", end_marker: str = "```") -> Optional[str]:
    """Extract JSON from a code block in text."""
    pattern = r"```json\s*\n(.*?)\n\s*```"
    match = re.search(pattern, text, re.DOTALL)
    if match:
        return match.group(1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start:end+1]
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass
    return None


def assemble_prompt_with_skills(base_prompt: str, role: str) -> str:
    """Inject skill .md content into the system prompt."""
    skill_names = ROLE_SKILLS.get(role, [])
    if not skill_names:
        return base_prompt
    db = SessionLocal()
    try:
        return build_prompt_with_skills(base_prompt, skill_names, db)
    finally:
        db.close()


def _set_agent_db_status(agent_id: str, status: str):
    """Update agent status in DB so the UI reflects it."""
    from db.models import Agent
    db = SessionLocal()
    try:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if agent:
            agent.status = status
            db.commit()
    except Exception:
        pass
    finally:
        db.close()


def _clean_text_for_log(text: str) -> str:
    """Strip JSON code blocks and raw JSON objects from text meant for the activity log."""
    # Remove ```json ... ``` blocks
    cleaned = re.sub(r'```json\s*\n.*?\n\s*```', '', text, flags=re.DOTALL)
    # Remove ``` ... ``` blocks (any language)
    cleaned = re.sub(r'```\w*\s*\n.*?\n\s*```', '', cleaned, flags=re.DOTALL)
    # Remove standalone JSON objects (lines starting with { and ending with })
    lines = cleaned.split('\n')
    filtered = []
    in_json = False
    brace_depth = 0
    for line in lines:
        stripped = line.strip()
        if not in_json and stripped.startswith('{') and not stripped.startswith('{%'):
            in_json = True
            brace_depth = stripped.count('{') - stripped.count('}')
            if brace_depth <= 0:
                in_json = False
            continue
        if in_json:
            brace_depth += stripped.count('{') - stripped.count('}')
            if brace_depth <= 0:
                in_json = False
            continue
        filtered.append(line)
    result = '\n'.join(filtered).strip()
    # Collapse multiple blank lines
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result


def _save_log_entry(agent_id: str, log_type: str, content: str, tool_name: str = "", tool_args: str = ""):
    """Save a tool call / response to the messages table for the activity feed."""
    from db.models import Message, new_id
    meta = {}
    if tool_name:
        meta["tool_name"] = tool_name
    if tool_args:
        meta["tool_args"] = tool_args
    db = SessionLocal()
    try:
        db.add(Message(
            id=new_id(),
            from_agent_id=agent_id,
            content=content[:2000],
            type=log_type,
            channel="internal",
            meta=json.dumps(meta),
            timestamp=utcnow(),
        ))
        db.commit()
    except Exception:
        pass
    finally:
        db.close()


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
                    if chunk.content.startswith("Error: Agent timed out") or chunk.content.startswith("Error:"):
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


async def planner_node(state: dict) -> dict:
    """LangGraph node: Planner agent."""
    from prompts.planner import get_system_prompt

    target_dir = state["target_dir"]
    complexity = state["complexity"]
    brief = state["brief"]

    update_phase(target_dir, "planner", {"status": "in_progress", "started_at": utcnow()})
    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "planner", "status": "in_progress",
    })

    system_prompt = assemble_prompt_with_skills(get_system_prompt(complexity, target_dir), "planner")

    research_context = ""
    if state.get("research"):
        research_context = f"\n\nResearch findings:\n{json.dumps(state['research'], indent=2)}"

    message = (
        f"Project brief: {brief}\n"
        f"Target directory: {target_dir}\n"
        f"Complexity: {complexity}\n"
        f"{research_context}\n\n"
        f"Write docs/plan.md and CLAUDE.md in the target directory. "
        f"Return a PlanOutput JSON block at the end of your response."
    )

    agent_cfg = get_project_agent_config(state["project_id"], "planner")
    response = await run_goose_agent(
        agent_id=agent_cfg["agent_id"],
        agent_name="Planner",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
        provider=agent_cfg["provider"],
        model=agent_cfg["model"],
    )

    if response.startswith("AGENT_ERROR:"):
        update_phase(target_dir, "planner", {"status": "failed", "completed_at": utcnow()})
        await event_bus.emit("project:update", {
            "project_id": state["project_id"], "phase": "planner", "status": "failed",
        })
        return {
            "plan": None,
            "tickets": [],
            "status": "failed",
            "error": response,
        }

    json_str = extract_json_block(response)
    plan = None
    tickets = []
    if json_str:
        try:
            plan_data = json.loads(json_str)
            plan = PlanOutput(**plan_data)
            tickets = [t.model_dump() for t in plan.tickets]
        except Exception as e:
            print(f"[planner_node] Failed to parse PlanOutput: {e}")

    state_data = read_state(target_dir)
    if state_data and plan:
        state_data["plan"] = plan.model_dump()
    write_state(target_dir, state_data or {})
    update_phase(target_dir, "planner", {"status": "completed", "completed_at": utcnow()})

    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "planner", "status": "completed",
    })

    return {
        "plan": plan.model_dump() if plan else None,
        "tickets": tickets,
        "status": "awaiting_approval" if complexity != "simple" else "building",
    }


async def coder_node(state: dict) -> dict:
    """LangGraph node: Coder agent. Processes tickets sequentially or in parallel."""
    from prompts.coder import get_system_prompt

    target_dir = state["target_dir"]
    complexity = state["complexity"]
    tickets = state.get("tickets", [])
    existing_results = state.get("ticket_results", {})
    review_cycles = state.get("review_cycles", {})

    update_phase(target_dir, "coder", {"status": "in_progress", "started_at": utcnow()})
    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "coder", "status": "in_progress",
    })

    system_prompt = assemble_prompt_with_skills(get_system_prompt(complexity, target_dir), "coder")
    new_results = dict(existing_results)

    pending_tickets = []
    for ticket in tickets:
        tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
        result = existing_results.get(tid, {})
        coder_status = result.get("coder", {}).get("status") if isinstance(result, dict) else None
        reviewer_verdict = result.get("reviewer", {}).get("verdict") if isinstance(result, dict) else None
        if coder_status != "completed" or reviewer_verdict == "fail":
            pending_tickets.append(ticket)

    completed_ids = {tid for tid, r in existing_results.items()
                     if isinstance(r, dict) and r.get("coder", {}).get("status") == "completed"
                     and r.get("reviewer", {}).get("verdict") != "fail"}

    independent = []
    for t in pending_tickets:
        deps = t.get("dependencies", []) if isinstance(t, dict) else t.dependencies
        if all(d in completed_ids for d in deps):
            independent.append(t)

    # Circuit breaker: track consecutive failures
    consecutive_failures = 0
    pipeline_paused = False

    if complexity == "simple" or len(independent) <= 1:
        for ticket in independent:
            result = await _run_coder_for_ticket(ticket, state, system_prompt, target_dir, review_cycles)
            tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
            new_results[tid] = result

            # Circuit breaker check
            if isinstance(result, dict) and result.get("coder", {}).get("status") == "failed":
                consecutive_failures += 1
            else:
                consecutive_failures = 0

            if consecutive_failures >= 3:
                print(f"[coder_node] Circuit breaker: {consecutive_failures} consecutive failures, pausing pipeline")
                db = SessionLocal()
                try:
                    from db.models import Project
                    project = db.query(Project).filter(Project.id == state["project_id"]).first()
                    if project:
                        project.status = "paused"
                        db.commit()
                finally:
                    db.close()
                await event_bus.emit("project:paused", {
                    "project_id": state["project_id"],
                    "reason": f"Circuit breaker: {consecutive_failures} consecutive ticket failures",
                })
                pipeline_paused = True
                break
    else:
        async def _bounded_run(t):
            async with _GOOSE_SEMAPHORE:
                return await _run_coder_for_ticket(t, state, system_prompt, target_dir, review_cycles)

        tasks = [_bounded_run(t) for t in independent]
        results = await asyncio.gather(*tasks)
        for ticket, result in zip(independent, results):
            tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
            new_results[tid] = result

    state_data = read_state(target_dir)
    if state_data:
        state_data["results"] = new_results
    write_state(target_dir, state_data or {})
    update_phase(target_dir, "coder", {"status": "completed", "completed_at": utcnow()})

    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "coder", "status": "completed",
    })

    if pipeline_paused:
        return {"ticket_results": new_results, "status": "paused"}

    return {"ticket_results": new_results, "status": "reviewing"}


async def _run_coder_for_ticket(ticket: dict, state: dict, system_prompt: str, target_dir: str, review_cycles: dict) -> dict:
    """Run Goose for a single ticket."""
    tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
    title = ticket.get("title", tid) if isinstance(ticket, dict) else ticket.title

    # Git checkpoint: tag the current state before running coder
    subprocess.run(["git", "tag", "-f", f"pre-{tid}"], cwd=target_dir, capture_output=True)

    feedback_context = ""
    existing = state.get("ticket_results", {}).get(tid, {})
    if isinstance(existing, dict) and existing.get("reviewer", {}).get("verdict") == "fail":
        issues = existing.get("reviewer", {}).get("issues", [])
        feedback_context = f"\n\nPREVIOUS REVIEW FEEDBACK (cycle {review_cycles.get(tid, 1)}):\n"
        for issue in issues:
            feedback_context += f"- [{issue.get('type')}] {issue.get('file')}: {issue.get('detail')}\n"
        feedback_context += "\nFix ONLY these issues. Re-run all validation."

    acs = ticket.get("acceptance_criteria", []) if isinstance(ticket, dict) else ticket.acceptance_criteria
    desc = ticket.get("description", "") if isinstance(ticket, dict) else ticket.description

    message = (
        f"Ticket: {tid} - {title}\n"
        f"Description: {desc}\n"
        f"Acceptance Criteria:\n" + "\n".join(f"  - {ac}" for ac in acs) +
        f"\nTarget directory: {target_dir}"
        f"{feedback_context}"
    )

    agent_cfg = get_project_agent_config(state["project_id"], "coder")
    response = await run_goose_agent(
        agent_id=agent_cfg["agent_id"],
        agent_name=f"Coder ({tid})",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
        provider=agent_cfg["provider"],
        model=agent_cfg["model"],
    )

    # Rollback on agent error
    if response.startswith("AGENT_ERROR"):
        subprocess.run(["git", "reset", "--hard", f"pre-{tid}"], cwd=target_dir, capture_output=True)
        return {"coder": {"status": "failed", "error": response}, "reviewer": {"status": "pending"}}

    json_str = extract_json_block(response)
    result = {"coder": {"status": "completed", "raw_response": response[:500]}, "reviewer": {"status": "pending"}}
    if json_str:
        try:
            parsed = TicketResult(**json.loads(json_str))
            result["coder"] = parsed.model_dump()
        except Exception:
            pass

    return result


async def reviewer_node(state: dict) -> dict:
    """LangGraph node: Reviewer agent."""
    from prompts.reviewer import get_system_prompt

    target_dir = state["target_dir"]
    complexity = state["complexity"]
    ticket_results = state.get("ticket_results", {})
    review_cycles = dict(state.get("review_cycles", {}))

    update_phase(target_dir, "reviewer", {"status": "in_progress", "started_at": utcnow()})
    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "reviewer", "status": "in_progress",
    })

    system_prompt = assemble_prompt_with_skills(get_system_prompt(complexity, target_dir), "reviewer")
    new_results = dict(ticket_results)

    for tid, result in ticket_results.items():
        if not isinstance(result, dict):
            continue
        coder_status = result.get("coder", {}).get("status")
        reviewer_verdict = result.get("reviewer", {}).get("verdict")
        reviewer_status = result.get("reviewer", {}).get("status", "pending")

        # Skip already-passed tickets
        if reviewer_verdict == "pass":
            continue

        if coder_status == "completed" and reviewer_status == "pending":
            review_cycles[tid] = review_cycles.get(tid, 0) + 1

            message = (
                f"Review ticket {tid}.\n"
                f"Target directory: {target_dir}\n"
                f"Review cycle: {review_cycles[tid]}/3\n"
                f"Read docs/plan.md for acceptance criteria. Read the code. Run validation.\n"
                f"Return a ReviewResult JSON block."
            )

            agent_cfg = get_project_agent_config(state["project_id"], "reviewer")
            response = await run_goose_agent(
                agent_id=agent_cfg["agent_id"],
                agent_name=f"Reviewer ({tid})",
                system_prompt=system_prompt,
                message=message,
                target_dir=target_dir,
                provider=agent_cfg["provider"],
                model=agent_cfg["model"],
            )

            if response.startswith("AGENT_ERROR:"):
                review_data = {"status": "fail", "verdict": "fail", "cycle": review_cycles[tid], "error": response}
                new_results[tid] = {**result, "reviewer": review_data}
                continue

            json_str = extract_json_block(response)
            review_data = {"status": "pass", "verdict": "pass", "cycle": review_cycles[tid]}
            if json_str:
                try:
                    parsed = ReviewResult(**json.loads(json_str))
                    review_data = parsed.model_dump()
                except Exception:
                    upper = response.upper()
                    if "FAIL" in upper[:100]:
                        review_data["verdict"] = "fail"
                        review_data["status"] = "fail"

            new_results[tid] = {**result, "reviewer": review_data}

    state_data = read_state(target_dir)
    if state_data:
        state_data["results"] = new_results
    write_state(target_dir, state_data or {})
    update_phase(target_dir, "reviewer", {"status": "completed", "completed_at": utcnow()})

    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "reviewer", "status": "completed",
    })

    return {"ticket_results": new_results, "review_cycles": review_cycles}


async def researcher_node(state: dict) -> dict:
    """LangGraph node: Researcher agent."""
    from prompts.researcher import get_system_prompt

    target_dir = state["target_dir"]
    complexity = state["complexity"]
    brief = state["brief"]

    update_phase(target_dir, "researcher", {"status": "in_progress", "started_at": utcnow()})
    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "researcher", "status": "in_progress",
    })

    system_prompt = assemble_prompt_with_skills(get_system_prompt(complexity, target_dir), "researcher")

    message = (
        f"Project brief: {brief}\n"
        f"Target directory: {target_dir}\n"
        f"Complexity: {complexity}\n\n"
        f"Research the technology landscape for this project. "
        f"Return a ResearchOutput JSON block at the end of your response."
    )

    agent_cfg = get_project_agent_config(state["project_id"], "researcher")
    response = await run_goose_agent(
        agent_id=agent_cfg["agent_id"],
        agent_name="Researcher",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
        provider=agent_cfg["provider"],
        model=agent_cfg["model"],
    )

    json_str = extract_json_block(response)
    research = None
    if json_str:
        try:
            from contracts.schemas import ResearchOutput
            research_data = json.loads(json_str)
            research = ResearchOutput(**research_data)
        except Exception as e:
            print(f"[researcher_node] Failed to parse ResearchOutput: {e}")

    update_phase(target_dir, "researcher", {"status": "completed", "completed_at": utcnow()})
    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "researcher", "status": "completed",
    })

    return {
        "research": research.model_dump() if research else None,
        "status": "planning",
    }


async def deployer_node(state: dict) -> dict:
    """LangGraph node: Deployer agent."""
    from prompts.deployer import get_system_prompt

    target_dir = state["target_dir"]
    complexity = state["complexity"]

    update_phase(target_dir, "deployer", {"status": "in_progress", "started_at": utcnow()})
    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "deployer", "status": "in_progress",
    })

    system_prompt = assemble_prompt_with_skills(get_system_prompt(complexity, target_dir), "deployer")

    message = (
        f"Target directory: {target_dir}\n\n"
        f"Run deployment validation: build the project, run all tests, "
        f"check for lint/type errors, and validate the deployment. "
        f"Return a DeployResult JSON block at the end of your response."
    )

    agent_cfg = get_project_agent_config(state["project_id"], "deployer")
    response = await run_goose_agent(
        agent_id=agent_cfg["agent_id"],
        agent_name="Deployer",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
        provider=agent_cfg["provider"],
        model=agent_cfg["model"],
    )

    json_str = extract_json_block(response)
    deploy_result = None
    if json_str:
        try:
            from contracts.schemas import DeployResult
            deploy_result = DeployResult(**json.loads(json_str))
        except Exception as e:
            print(f"[deployer_node] Failed to parse DeployResult: {e}")

    update_phase(target_dir, "deployer", {"status": "completed", "completed_at": utcnow()})
    await event_bus.emit("project:update", {
        "project_id": state["project_id"], "phase": "deployer", "status": "completed",
    })

    return {
        "deploy_result": deploy_result.model_dump() if deploy_result else None,
        "status": "completed",
    }


async def approval_gate_node(state: dict) -> dict:
    """Create approval gate and pause for human review."""
    from db.database import SessionLocal
    from db.models import ApprovalGate, new_id
    import json as _json

    db = SessionLocal()
    try:
        gate = ApprovalGate(
            id=new_id(),
            project_id=state["project_id"],
            node_id="approval_gate",
            type="plan_approval",
            status="pending",
            payload=_json.dumps({
                "brief": state.get("brief", ""),
                "complexity": state.get("complexity", ""),
                "ticket_count": len(state.get("tickets", [])),
                "plan_summary": str(state.get("plan", {}))[:500],
            }),
            created_at=utcnow(),
        )
        db.add(gate)
        db.commit()
    finally:
        db.close()

    await event_bus.emit("approval:required", {
        "project_id": state["project_id"],
        "gate_id": gate.id,
        "type": "plan_approval",
    })

    return {"status": "awaiting_approval", "approved": True}


def check_review_outcome(state: dict) -> str:
    """Router: check if all tickets passed review, or if more tickets need processing."""
    from db.models import ApprovalGate, new_id

    tickets = state.get("tickets", [])
    ticket_results = state.get("ticket_results", {})
    review_cycles = state.get("review_cycles", {})
    target_dir = state.get("target_dir", "")

    any_fail = False
    any_escalate = False
    escalated_tickets = []

    for tid, result in ticket_results.items():
        if not isinstance(result, dict):
            continue
        verdict = result.get("reviewer", {}).get("verdict", "pending")
        if verdict == "fail":
            cycle = review_cycles.get(tid, 1)
            if cycle >= 3:
                any_escalate = True
                escalated_tickets.append(tid)
                # Rollback failed ticket to pre-coder state
                subprocess.run(["git", "reset", "--hard", f"pre-{tid}"], cwd=target_dir, capture_output=True)
            else:
                any_fail = True

    # Check if there are tickets that haven't been coded yet
    all_ticket_ids = set()
    for t in tickets:
        tid = t["id"] if isinstance(t, dict) else t.id
        all_ticket_ids.add(tid)

    completed_ids = set()
    for tid, result in ticket_results.items():
        if isinstance(result, dict):
            verdict = result.get("reviewer", {}).get("verdict")
            if verdict == "pass":
                completed_ids.add(tid)

    remaining = all_ticket_ids - completed_ids
    if remaining and not any_escalate:
        print(f"[check_review_outcome] {len(remaining)} tickets remaining: {remaining}")
        return "more_tickets"

    if any_escalate:
        # Create escalation approval gates for failed tickets
        db = SessionLocal()
        try:
            for tid in escalated_tickets:
                result = ticket_results.get(tid, {})
                reviewer_data = result.get("reviewer", {})
                gate = ApprovalGate(
                    id=new_id(),
                    project_id=state["project_id"],
                    node_id=f"escalation_{tid}",
                    type="ticket_escalation",
                    status="pending",
                    payload=json.dumps({
                        "ticket_id": tid,
                        "failure_details": reviewer_data.get("issues", []),
                        "review_cycles": review_cycles.get(tid, 3),
                        "last_verdict": reviewer_data.get("verdict"),
                        "review_history": reviewer_data,
                    }),
                    created_at=utcnow(),
                )
                db.add(gate)
            db.commit()
        finally:
            db.close()
        return "fail_escalate"
    if any_fail:
        for tid, result in ticket_results.items():
            if isinstance(result, dict) and result.get("reviewer", {}).get("verdict") == "fail":
                result["reviewer"]["status"] = "pending"
        return "fail_retry"
    return "pass"
