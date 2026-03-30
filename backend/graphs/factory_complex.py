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
