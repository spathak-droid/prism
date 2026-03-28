"""Evaluate conditions on workflow edges (approve/reject/always)."""
import re


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
        approve_keywords = ["APPROVED", "LGTM", "PASS", "ACCEPTED", "YES", "CONFIRM"]
        reject_keywords = ["REJECTED", "FAIL", "DENIED", "NO", "BLOCKED"]

        approve_score = sum(1 for k in approve_keywords if k in output_upper)
        reject_score = sum(1 for k in reject_keywords if k in output_upper)

        # Check first line specifically (agents often start with verdict)
        first_line = output_upper.split("\n")[0] if output_upper else ""
        if any(k in first_line for k in approve_keywords):
            approve_score += 2
        if any(k in first_line for k in reject_keywords):
            reject_score += 2

        return approve_score > reject_score

    if condition_type == "reject":
        return not evaluate_condition("approve", agent_output)

    # Custom keyword match
    return condition_type.upper() in output_upper
