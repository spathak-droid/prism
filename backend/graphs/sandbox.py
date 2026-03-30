"""Convert React Flow DAG definitions into LangGraph graphs for sandbox mode."""
import json
import os
import subprocess
import asyncio
from typing import TypedDict, Optional, Any
from langgraph.graph import StateGraph, END
from services.goose_manager import goose_manager
from services.event_bus import event_bus
from services.condition_evaluator import evaluate_condition
from services.pipeline import send_through_pipeline
from db.database import SessionLocal
from db.models import Agent, Message, WorkflowExecution, new_id, utcnow


class SandboxState(TypedDict):
    workflow_id: str
    execution_id: str
    node_results: dict  # node_id → output text
    current_node: Optional[str]
    status: str
    error: Optional[str]
    task_input: str  # user's task description


def _detect_project_context(work_dir: str) -> str:
    """Scan the working directory and build a context snapshot for agents.

    Returns a markdown string describing the project — or a note that the
    directory is empty (greenfield).
    """
    # Quick check: is there anything here at all?
    entries = [e for e in os.listdir(work_dir) if not e.startswith(".")]
    if not entries:
        return (
            "## PROJECT CONTEXT\n"
            "This is a **greenfield project** — the directory is empty.\n"
            "You are starting from scratch. Create whatever files and structure are needed.\n"
        )

    lines = ["## PROJECT CONTEXT", "This is a **brownfield project** — an existing codebase.", ""]

    # Directory tree (depth 2, ignore noise)
    ignore = {
        "node_modules", ".git", "__pycache__", ".venv", "venv", ".next",
        "dist", "build", ".workflow", ".factory", ".cache", ".tox",
        "coverage", ".mypy_cache", ".pytest_cache", "env",
    }
    tree_lines = []
    for root, dirs, files in os.walk(work_dir):
        dirs[:] = [d for d in dirs if d not in ignore and not d.startswith(".")]
        depth = root.replace(work_dir, "").count(os.sep)
        if depth > 2:
            dirs.clear()
            continue
        indent = "  " * depth
        folder = os.path.basename(root) or os.path.basename(work_dir)
        tree_lines.append(f"{indent}{folder}/")
        for f in sorted(files)[:20]:  # cap per-dir
            tree_lines.append(f"{indent}  {f}")
    if tree_lines:
        lines.append("### Directory Structure")
        lines.append("```")
        lines.extend(tree_lines[:80])  # cap total
        if len(tree_lines) > 80:
            lines.append("  ... (truncated)")
        lines.append("```")
        lines.append("")

    # Key config files — read first ~40 lines of each
    key_files = [
        "CLAUDE.md", "AGENTS.md", "README.md",
        "package.json", "pyproject.toml", "Cargo.toml", "go.mod",
        "tsconfig.json", "Makefile", "docker-compose.yml", "Dockerfile",
        ".env.example",
    ]
    for fname in key_files:
        fpath = os.path.join(work_dir, fname)
        if os.path.isfile(fpath):
            try:
                with open(fpath, "r", errors="replace") as f:
                    content = "".join(f.readlines()[:40])
                lines.append(f"### {fname}")
                lines.append("```")
                lines.append(content.rstrip())
                lines.append("```")
                lines.append("")
            except Exception:
                pass

    # Git status (if repo)
    if os.path.isdir(os.path.join(work_dir, ".git")):
        try:
            branch = subprocess.check_output(
                ["git", "branch", "--show-current"],
                cwd=work_dir, timeout=5, text=True,
            ).strip()
            lines.append(f"### Git: on branch `{branch}`")
        except Exception:
            pass

    lines.append(
        "\n**IMPORTANT**: Read existing code before modifying anything. "
        "Match the conventions, patterns, and style already in this project. "
        "Do not introduce new frameworks, linters, or tooling unless the task requires it.\n"
    )
    return "\n".join(lines)


def build_sandbox_graph(nodes_json: list[dict], edges_json: list[dict], cwd: str | None = None):
    """Build a LangGraph from React Flow nodes and edges."""
    graph = StateGraph(SandboxState)

    # Pre-compute project context once for all nodes
    work_dir = cwd or os.getcwd()
    os.makedirs(work_dir, exist_ok=True)
    project_context = _detect_project_context(work_dir)

    # Parse nodes
    node_map = {}  # node_id → node_data
    for node in nodes_json:
        node_id = node["id"]
        node_data = node.get("data", {})
        node_map[node_id] = node_data

        agent_id = node_data.get("agentId")
        if not agent_id:
            raise ValueError(
                f"Node '{node_data.get('label', node_id)}' has no agent assigned. "
                "Map all nodes to agents before executing."
            )
        node_func = _make_agent_node(
            node_id, agent_id, node_data,
            cwd=work_dir, project_context=project_context,
        )
        graph.add_node(node_id, node_func)

    if not node_map:
        return None

    # Find entry nodes (no incoming edges)
    targets = {e["target"] for e in edges_json}
    entry_nodes = [n for n in node_map if n not in targets]
    if not entry_nodes:
        entry_nodes = [nodes_json[0]["id"]]

    graph.set_entry_point(entry_nodes[0])

    # Parse edges
    edges_by_source: dict[str, list] = {}
    for edge in edges_json:
        edges_by_source.setdefault(edge["source"], []).append(edge)

    for source_id, source_edges in edges_by_source.items():
        if len(source_edges) == 1 and not source_edges[0].get("data", {}).get("condition"):
            graph.add_edge(source_id, source_edges[0]["target"])
        else:
            condition_map = {}
            for edge in source_edges:
                condition = edge.get("data", {}).get("condition", "always")
                condition_map[condition] = edge["target"]
            router = _make_condition_router(source_id, source_edges)
            targets_map = dict(condition_map)
            if "always" not in targets_map:
                targets_map["always"] = END
            graph.add_conditional_edges(source_id, router, targets_map)

    # Terminal nodes → END
    for node_id in node_map:
        if node_id not in edges_by_source:
            graph.add_edge(node_id, END)

    return graph


def _make_agent_node(
    node_id: str, agent_id: str, node_data: dict,
    cwd: str | None = None, project_context: str = "",
):
    """Create an async node function that runs an agent."""
    async def node_func(state: SandboxState) -> dict:
        db = SessionLocal()
        try:
            agent = db.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                return {
                    "node_results": {**state.get("node_results", {}), node_id: "Agent not found"},
                    "current_node": node_id,
                }

            label = node_data.get("label", node_id)
            instruction = node_data.get("instruction", "")
            task_input = state.get("task_input", "")
            prev_results = state.get("node_results", {})
            work_dir = cwd or os.getcwd()

            # Output directory
            output_dir = os.path.join(work_dir, ".workflow")
            os.makedirs(output_dir, exist_ok=True)
            output_md_path = os.path.join(output_dir, f"{node_id}.md")

            # ---- Build the message sent to the agent ----
            parts = []

            # Task
            if task_input:
                parts.append(f"# Task\n{task_input}")

            # Instruction override on the node (if any)
            if instruction:
                parts.append(f"# Node Instruction\n{instruction}")

            # Previous node outputs — pass file paths so agent reads full content
            if prev_results:
                ctx = []
                for nid, _text in prev_results.items():
                    md_path = os.path.join(output_dir, f"{nid}.md")
                    prev_label = nid  # e.g. node-researcher
                    if os.path.exists(md_path):
                        ctx.append(
                            f"- **{prev_label}** wrote: `{md_path}`  \n"
                            f"  Read this file for the full output."
                        )
                    else:
                        ctx.append(f"- **{prev_label}** output (inline):\n{_text[:2000]}")
                parts.append("# Previous Steps\n" + "\n".join(ctx))

            input_text = "\n\n".join(parts) if parts else "Hello"

            # ---- Build system prompt ----
            base_prompt = agent.system_prompt or "You are a helpful agent."

            autonomous_directive = (
                "\n\n## AUTONOMOUS MODE\n"
                "You are running inside an automated workflow pipeline. "
                "There is NO human available. You MUST:\n"
                "- Make decisions autonomously — never ask clarifying questions\n"
                "- Pick the best option and proceed\n"
                "- Complete the task fully in one pass\n"
                "- Do NOT wait for user input or confirmation\n"
                "\n## OUTPUT REQUIREMENT\n"
                f"You MUST write your complete output to: `{output_md_path}`\n"
                "This file is how the next agent in the pipeline receives your work.\n"
                "Write it as a well-structured Markdown document.\n"
                "Do NOT skip this step — if you don't write the file, the pipeline breaks.\n"
            )

            full_prompt = base_prompt + "\n\n" + project_context + autonomous_directive

            agent_dict = {
                "system_prompt": full_prompt,
                "skills": agent.skills,
                "memory": agent.memory,
                "guardrails": agent.guardrails,
            }

            goose_manager.register_agent(
                agent.id, agent.name, agent.provider, agent.model,
                json.loads(agent.tools),
            )

            # Mark node as running
            execution_id = state.get("execution_id")
            if execution_id:
                exc = db.query(WorkflowExecution).filter(
                    WorkflowExecution.id == execution_id
                ).first()
                if exc:
                    exc.context = json.dumps({
                        "nodeResults": state.get("node_results", {}),
                        "currentNode": node_id,
                        "status": "running",
                    })
                    db.commit()

            # Run agent
            response_text = ""
            async for chunk in send_through_pipeline(
                agent_id=agent.id,
                message=input_text,
                db=db,
                agent_data=agent_dict,
                cwd=work_dir,
                execution_id=execution_id,
            ):
                if chunk.type == "text":
                    response_text += chunk.content

            # Fallback: write .md from response if agent didn't
            if not os.path.exists(output_md_path) and response_text.strip():
                with open(output_md_path, "w") as f:
                    f.write(f"# {label} Output\n\n")
                    f.write(response_text)

            # Read canonical result from .md file
            if os.path.exists(output_md_path):
                with open(output_md_path, "r") as f:
                    response_text = f.read()

            # Store message in DB
            msg = Message(
                id=new_id(), from_agent_id=agent_id, to_agent_id=None,
                content=response_text, type="text",
                workflow_execution_id=execution_id,
                timestamp=utcnow(),
            )
            db.add(msg)
            db.commit()

            new_results = {**state.get("node_results", {}), node_id: response_text}
            return {"node_results": new_results, "current_node": node_id, "status": "running"}
        finally:
            db.close()

    return node_func


def _make_condition_router(source_id: str, edges: list[dict]):
    """Create a router function for conditional edges."""
    def router(state: SandboxState) -> str:
        output = state.get("node_results", {}).get(source_id, "")
        for edge in edges:
            condition = edge.get("data", {}).get("condition", "always")
            if condition == "always":
                continue
            if evaluate_condition(condition, output):
                return condition
        return "always"
    return router
