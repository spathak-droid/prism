"""Shared LangGraph node functions for Factory SDLC pipeline."""
import asyncio
import json
import re
from typing import Any, Optional
from services.goose_manager import goose_manager, StreamChunk
from services.event_bus import event_bus
from contracts.state import update_phase, read_state, write_state
from contracts.schemas import PlanOutput, TicketResult, ReviewResult
from datetime import datetime, timezone


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


async def run_goose_agent(
    agent_id: str,
    agent_name: str,
    system_prompt: str,
    message: str,
    target_dir: str,
    provider: str = "claude-code",
    model: str = "claude-opus-4-20250514",
    max_turns: int = 15,
) -> str:
    """Spawn a Goose subprocess and collect full response."""
    goose_manager.register_agent(agent_id, agent_name, provider, model, ["developer", "analyze"])
    full_response = ""
    async for chunk in goose_manager.send_message(
        agent_id=agent_id,
        message=message,
        system_prompt=system_prompt,
        cwd=target_dir,
        max_turns=max_turns,
    ):
        if chunk.type == "text":
            full_response += chunk.content
    return full_response


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

    system_prompt = get_system_prompt(complexity, target_dir)

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

    response = await run_goose_agent(
        agent_id=f"planner-{state['project_id'][:8]}",
        agent_name="Planner",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
    )

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

    system_prompt = get_system_prompt(complexity, target_dir)
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

    if complexity == "simple" or len(independent) <= 1:
        for ticket in independent:
            result = await _run_coder_for_ticket(ticket, state, system_prompt, target_dir, review_cycles)
            tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
            new_results[tid] = result
    else:
        tasks = [
            _run_coder_for_ticket(t, state, system_prompt, target_dir, review_cycles)
            for t in independent
        ]
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

    return {"ticket_results": new_results, "status": "reviewing"}


async def _run_coder_for_ticket(ticket: dict, state: dict, system_prompt: str, target_dir: str, review_cycles: dict) -> dict:
    """Run Goose for a single ticket."""
    tid = ticket["id"] if isinstance(ticket, dict) else ticket.id
    title = ticket.get("title", tid) if isinstance(ticket, dict) else ticket.title

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

    response = await run_goose_agent(
        agent_id=f"coder-{tid.lower()}",
        agent_name=f"Coder ({tid})",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
    )

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

    system_prompt = get_system_prompt(complexity, target_dir)
    new_results = dict(ticket_results)

    for tid, result in ticket_results.items():
        if not isinstance(result, dict):
            continue
        coder_status = result.get("coder", {}).get("status")
        reviewer_status = result.get("reviewer", {}).get("status", "pending")

        if coder_status == "completed" and reviewer_status == "pending":
            review_cycles[tid] = review_cycles.get(tid, 0) + 1

            message = (
                f"Review ticket {tid}.\n"
                f"Target directory: {target_dir}\n"
                f"Review cycle: {review_cycles[tid]}/3\n"
                f"Read docs/plan.md for acceptance criteria. Read the code. Run validation.\n"
                f"Return a ReviewResult JSON block."
            )

            response = await run_goose_agent(
                agent_id=f"reviewer-{tid.lower()}",
                agent_name=f"Reviewer ({tid})",
                system_prompt=system_prompt,
                message=message,
                target_dir=target_dir,
            )

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

    system_prompt = get_system_prompt(complexity, target_dir)

    message = (
        f"Project brief: {brief}\n"
        f"Target directory: {target_dir}\n"
        f"Complexity: {complexity}\n\n"
        f"Research the technology landscape for this project. "
        f"Return a ResearchOutput JSON block at the end of your response."
    )

    response = await run_goose_agent(
        agent_id=f"researcher-{state['project_id'][:8]}",
        agent_name="Researcher",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
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

    system_prompt = get_system_prompt(complexity, target_dir)

    message = (
        f"Target directory: {target_dir}\n\n"
        f"Run deployment validation: build the project, run all tests, "
        f"check for lint/type errors, and validate the deployment. "
        f"Return a DeployResult JSON block at the end of your response."
    )

    response = await run_goose_agent(
        agent_id=f"deployer-{state['project_id'][:8]}",
        agent_name="Deployer",
        system_prompt=system_prompt,
        message=message,
        target_dir=target_dir,
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
    """Router: check if all tickets passed review."""
    ticket_results = state.get("ticket_results", {})
    review_cycles = state.get("review_cycles", {})

    any_fail = False
    any_escalate = False

    for tid, result in ticket_results.items():
        if not isinstance(result, dict):
            continue
        verdict = result.get("reviewer", {}).get("verdict", "pending")
        if verdict == "fail":
            cycle = review_cycles.get(tid, 1)
            if cycle >= 3:
                any_escalate = True
            else:
                any_fail = True

    if any_escalate:
        return "fail_escalate"
    if any_fail:
        for tid, result in ticket_results.items():
            if isinstance(result, dict) and result.get("reviewer", {}).get("verdict") == "fail":
                result["reviewer"]["status"] = "pending"
        return "fail_retry"
    return "pass"
