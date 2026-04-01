"""Simple Factory SDLC graph: Planner → Coder → Validator → Reviewer → END"""
from typing import TypedDict, Optional, Annotated
from langgraph.graph import StateGraph, END
from graphs.nodes import planner_node, coder_node, validator_node, reviewer_node, check_review_outcome, check_validation_outcome


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
    validation: Optional[dict]
    status: str
    error: Optional[str]


def build_simple_graph():
    """Build the simple SDLC graph (no researcher, no approval, no deployer)."""
    graph = StateGraph(SimpleProjectState)

    graph.add_node("planner", planner_node)
    graph.add_node("coder", coder_node)
    graph.add_node("validator", validator_node)
    graph.add_node("reviewer", reviewer_node)

    graph.set_entry_point("planner")
    graph.add_edge("planner", "coder")
    graph.add_edge("coder", "validator")

    graph.add_conditional_edges("validator", check_validation_outcome, {
        "pass": "reviewer",
        "fail": "coder",
    })

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
