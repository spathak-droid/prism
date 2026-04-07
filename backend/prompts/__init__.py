"""Load role prompts from .md files."""
import os

PROMPTS_DIR = os.path.dirname(__file__)


def load_role_prompt(role: str) -> str | None:
    """Load a role prompt from its .md file.

    Returns the prompt content, or None if no .md file exists for the role.
    """
    md_path = os.path.join(PROMPTS_DIR, f"{role}.md")
    if not os.path.exists(md_path):
        return None

    with open(md_path, "r") as f:
        return f.read()
