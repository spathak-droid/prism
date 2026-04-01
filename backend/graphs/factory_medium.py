"""Medium Factory SDLC graph: Researcher → Planner → Approval → Coder(s) → Validator → Reviewer → Deployer"""
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from graphs.nodes import (
    researcher_node, planner_node, approval_gate_node,
    coder_node, validator_node, reviewer_node, deployer_node,
    check_review_outcome, check_validation_outcome,
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
    validation: Optional[dict]
    deploy_result: Optional[dict]
    status: str
    error: Optional[str]


def build_medium_graph():
    graph = StateGraph(MediumProjectState)

    graph.add_node("researcher", researcher_node)
    graph.add_node("planner", planner_node)
    graph.add_node("approval_gate", approval_gate_node)
    graph.add_node("coder", coder_node)
    graph.add_node("validator", validator_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("deployer", deployer_node)

    graph.set_entry_point("researcher")
    graph.add_edge("researcher", "planner")
    graph.add_edge("planner", "approval_gate")
    graph.add_edge("approval_gate", "coder")
    graph.add_edge("coder", "validator")

    graph.add_conditional_edges("validator", check_validation_outcome, {
        "pass": "reviewer",
        "fail": "coder",
    })

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
    graph.add_node("validator", validator_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("deployer", deployer_node)

    graph.set_entry_point("coder")
    graph.add_edge("coder", "validator")

    graph.add_conditional_edges("validator", check_validation_outcome, {
        "pass": "reviewer",
        "fail": "coder",
    })

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
