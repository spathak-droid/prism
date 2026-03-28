"""Convert React Flow DAG definitions into LangGraph graphs for sandbox mode."""
import json
import asyncio
from typing import TypedDict, Optional, Any
from langgraph.graph import StateGraph, END
from services.goose_manager import goose_manager
from services.event_bus import event_bus
from services.condition_evaluator import evaluate_condition
from services.pipeline import send_through_pipeline
from db.database import SessionLocal
from db.models import Agent, Message, new_id, utcnow


class SandboxState(TypedDict):
    workflow_id: str
    execution_id: str
    node_results: dict  # node_id → output text
    current_node: Optional[str]
    status: str
    error: Optional[str]


def build_sandbox_graph(nodes_json: list[dict], edges_json: list[dict]):
    """Build a LangGraph from React Flow nodes and edges."""
    graph = StateGraph(SandboxState)

    # Parse nodes
    node_map = {}  # node_id → node_data
    for node in nodes_json:
        node_id = node["id"]
        node_data = node.get("data", {})
        node_map[node_id] = node_data

        # Create a node function for each
        agent_id = node_data.get("agentId")
        if agent_id:
            node_func = _make_agent_node(node_id, agent_id, node_data)
            graph.add_node(node_id, node_func)

    if not node_map:
        return None

    # Find entry nodes (no incoming edges)
    targets = {e["target"] for e in edges_json}
    sources = {e["source"] for e in edges_json}
    entry_nodes = [n for n in node_map if n not in targets]

    if not entry_nodes:
        entry_nodes = [nodes_json[0]["id"]]

    # Set entry point (first entry node)
    graph.set_entry_point(entry_nodes[0])

    # Parse edges and add to graph
    # Group edges by source
    edges_by_source = {}
    for edge in edges_json:
        src = edge["source"]
        edges_by_source.setdefault(src, []).append(edge)

    for source_id, source_edges in edges_by_source.items():
        if len(source_edges) == 1 and not source_edges[0].get("data", {}).get("condition"):
            # Simple edge
            target = source_edges[0]["target"]
            graph.add_edge(source_id, target)
        else:
            # Conditional edges
            condition_map = {}
            for edge in source_edges:
                target = edge["target"]
                condition = edge.get("data", {}).get("condition", "always")
                condition_map[condition] = target

            # Add "always" → END if no explicit end
            router = _make_condition_router(source_id, source_edges)
            targets_map = {c: t for c, t in condition_map.items()}
            if "always" not in targets_map:
                targets_map["always"] = END
            graph.add_conditional_edges(source_id, router, targets_map)

    # Nodes with no outgoing edges go to END
    for node_id in node_map:
        if node_id not in edges_by_source:
            graph.add_edge(node_id, END)

    return graph


def _make_agent_node(node_id: str, agent_id: str, node_data: dict):
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

            # Build input from previous node results
            input_text = node_data.get("instruction", "")
            prev_results = state.get("node_results", {})
            if prev_results:
                context = "\n\n".join(f"[{nid}]: {text[:500]}" for nid, text in prev_results.items())
                input_text = f"{input_text}\n\nContext from previous steps:\n{context}"

            # Run through pipeline
            response_text = ""
            agent_dict = {
                "system_prompt": agent.system_prompt,
                "skills": agent.skills,
                "memory": agent.memory,
                "guardrails": agent.guardrails,
            }

            goose_manager.register_agent(
                agent.id, agent.name, agent.provider, agent.model,
                json.loads(agent.tools),
            )

            async for chunk in send_through_pipeline(
                agent_id=agent.id,
                message=input_text,
                db=db,
                agent_data=agent_dict,
            ):
                if chunk.type == "text":
                    response_text += chunk.content

            # Store message
            msg = Message(
                id=new_id(), from_agent_id=agent_id, to_agent_id=None,
                content=response_text, type="text",
                workflow_execution_id=state.get("execution_id"),
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
