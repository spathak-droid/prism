"""Simple Factory SDLC graph: Planner → Coder → Reviewer → END"""
from typing import TypedDict, Optional, Annotated
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
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
    })

    return graph


async def get_simple_graph_runner():
    """Compile with SQLite checkpointer."""
    graph = build_simple_graph()
    checkpointer = AsyncSqliteSaver.from_conn_string("data/factory.db")
    return graph.compile(checkpointer=checkpointer)
