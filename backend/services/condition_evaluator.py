"""Evaluate conditions on workflow edges (approve/reject/always)."""
import re


def _word_boundary_match(keyword: str, text: str) -> bool:
    """Check if keyword appears as a whole word in text."""
    return bool(re.search(r'\b' + re.escape(keyword) + r'\b', text))


def evaluate_condition(condition_type: str, agent_output: str) -> bool:
    """
    Evaluate whether an agent's output satisfies a condition.

    condition_type: "approve", "reject", "always", or custom keyword
    agent_output: The text output from the agent
    """
    if not condition_type or condition_type == "always":
        return True

    output_upper = agent_output.upper().strip()

    if condition_type == "approve":
        approve_keywords = ["APPROVED", "LGTM", "PASS", "ACCEPTED", "CONFIRM"]
        reject_keywords = ["REJECTED", "FAIL", "DENIED", "BLOCKED"]

        approve_score = sum(1 for k in approve_keywords if _word_boundary_match(k, output_upper))
        reject_score = sum(1 for k in reject_keywords if _word_boundary_match(k, output_upper))

        # Check first line specifically (agents often start with verdict)
        first_line = output_upper.split("\n")[0] if output_upper else ""
        if any(_word_boundary_match(k, first_line) for k in approve_keywords):
            approve_score += 2
        if any(_word_boundary_match(k, first_line) for k in reject_keywords):
            reject_score += 2

        # No signal at all → default to approved (don't reject ambiguous output)
        if approve_score == 0 and reject_score == 0:
            return True
        return approve_score > reject_score

    if condition_type == "reject":
        approve_keywords = ["APPROVED", "LGTM", "PASS", "ACCEPTED", "CONFIRM"]
        reject_keywords = ["REJECTED", "FAIL", "DENIED", "BLOCKED"]
        output_upper_inner = agent_output.upper().strip()
        first_line = output_upper_inner.split("\n")[0] if output_upper_inner else ""

        reject_score = sum(1 for k in reject_keywords if _word_boundary_match(k, output_upper_inner))
        approve_score = sum(1 for k in approve_keywords if _word_boundary_match(k, output_upper_inner))
        if any(_word_boundary_match(k, first_line) for k in reject_keywords):
            reject_score += 2
        if any(_word_boundary_match(k, first_line) for k in approve_keywords):
            approve_score += 2

        # No signal → default to not rejected
        if approve_score == 0 and reject_score == 0:
            return False
        return reject_score > approve_score

    # Custom keyword match — whole-word boundary
    return _word_boundary_match(condition_type.upper(), output_upper)
