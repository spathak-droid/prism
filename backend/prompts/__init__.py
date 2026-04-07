"""Load role prompts from .md files with template variable substitution."""
import os

PROMPTS_DIR = os.path.dirname(__file__)

COMPLEXITY_BLOCKS = {
    "simple": (
        "Research is lightweight. Confirm that proposed tools exist, are maintained, "
        "and have no critical CVEs. 2-3 options per component is sufficient. Focus on "
        "confirming the obvious choice is correct. Skip deep cost modeling."
    ),
    "medium": (
        "Full research protocol. 3-4 options per component, practitioner sentiment, "
        "community health, version checks. Identify the top 2 contenders with clear "
        "tradeoffs. Include cost comparison at expected scale."
    ),
    "complex": (
        "Exhaustive research. Every technology option gets the full evaluation: security "
        "deep-dive, cost modeling at scale, prior art from similar production systems. "
        "Flag every assumption in the brief. Research compliance implications."
    ),
}


def load_role_prompt(role: str, target_dir: str = "", complexity: str = "") -> str:
    """Load a role prompt from its .md file and substitute template variables.

    Falls back to the legacy Python prompt if no .md file exists yet
    (allows incremental migration).
    """
    md_path = os.path.join(PROMPTS_DIR, f"{role}.md")
    if not os.path.exists(md_path):
        return None

    with open(md_path, "r") as f:
        template = f.read()

    complexity_block = COMPLEXITY_BLOCKS.get(complexity, "Full research protocol.")

    return (
        template
        .replace("{{target_dir}}", target_dir)
        .replace("{{complexity}}", complexity)
        .replace("{{complexity_upper}}", complexity.upper() if complexity else "")
        .replace("{{complexity_block}}", complexity_block)
    )
