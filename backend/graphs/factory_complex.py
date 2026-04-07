"""Complex Factory SDLC graph.

Complex uses the same pipeline as medium (Researcher → Planner → Approval →
Coder → Validator → Reviewer → QA → Deployer) but with higher limits:
- More retry cycles on reviewer rejection (MAX_NODE_VISITS=3 vs medium's default)
- Longer agent timeouts (research + coding steps get more time)
- Checkpointed execution (resumable after failure)

The graph topology is identical — complexity differences are handled by the
role prompts (researcher.md, planner.md, coder.md) which adapt their depth
based on the complexity parameter passed in the task message.
"""
from graphs.factory_medium import build_medium_graph, MediumProjectState

ComplexProjectState = MediumProjectState


def build_complex_graph():
    return build_medium_graph()


async def get_complex_graph_runner():
    from services.checkpointer import get_checkpointer
    graph = build_complex_graph()
    checkpointer = await get_checkpointer()
    return graph.compile(checkpointer=checkpointer, interrupt_before=["approval_gate"])
