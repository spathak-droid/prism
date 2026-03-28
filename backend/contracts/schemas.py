"""Pydantic models for all agent-to-agent handoff contracts."""
from typing import Optional, Literal
from pydantic import BaseModel


# --- Researcher → Planner ---

class TechOption(BaseModel):
    name: str
    version: str
    maturity: Literal["proven", "emerging", "experimental"]
    strengths: list[str]
    weaknesses: list[str]
    community_health: Literal["strong", "moderate", "at_risk"]
    license: str = ""

class Risk(BaseModel):
    category: str
    severity: Literal["high", "medium", "low"]
    description: str
    mitigation: str

class ResearchOutput(BaseModel):
    type: Literal["research_output"] = "research_output"
    tech_landscape: dict[str, list[TechOption]]
    prior_art: list[dict[str, str]]
    risks: list[Risk]
    recommended_stack: dict[str, str]
    constraints: dict[str, list[str]] = {"must_use": [], "avoid": []}


# --- Planner → Coder ---

class Ticket(BaseModel):
    id: str
    title: str
    description: str
    acceptance_criteria: list[str]
    effort: Literal["S", "M", "L"]
    dependencies: list[str] = []
    files_to_create: list[str] = []
    files_to_modify: list[str] = []
    status: str = "pending"

class Phase(BaseModel):
    id: int
    name: str
    tickets: list[str]

class PlanOutput(BaseModel):
    type: Literal["plan_output"] = "plan_output"
    stack: dict[str, str]
    architecture: str = ""
    tickets: list[Ticket]
    phases: list[Phase]
    complexity_confirmed: Literal["simple", "medium", "complex"]


# --- Coder → Reviewer ---

class FileChange(BaseModel):
    path: str
    action: Literal["created", "modified", "deleted"]
    lines: Optional[int] = None

class TicketResult(BaseModel):
    type: Literal["ticket_result"] = "ticket_result"
    ticket_id: str
    status: Literal["completed", "failed"]
    files_changed: list[FileChange] = []
    tests_added: list[str] = []
    test_results: Optional[dict[str, int]] = None
    lint_clean: Optional[bool] = None
    type_check_clean: Optional[bool] = None
    git_commit: Optional[str] = None
    notes: str = ""


# --- Reviewer → Coder (on fail) / Reviewer → Deployer (on pass) ---

class ReviewIssue(BaseModel):
    type: str
    file: str
    line: Optional[int] = None
    detail: str
    fix: str = ""

class ReviewResult(BaseModel):
    type: Literal["review_result"] = "review_result"
    ticket_id: str
    verdict: Literal["pass", "fail"]
    cycle: int = 1
    issues: list[ReviewIssue] = []
    summary: str = ""

class ReviewFeedback(BaseModel):
    type: Literal["review_feedback"] = "review_feedback"
    ticket_id: str
    verdict: Literal["fail"] = "fail"
    cycle: int
    max_cycles: int = 3
    issues: list[ReviewIssue]
    instruction: str = "Fix ONLY these issues. Re-run all validation."


# --- Deployer ---

class DeployResult(BaseModel):
    type: Literal["deploy_result"] = "deploy_result"
    status: Literal["deployed", "failed", "skipped"]
    build_successful: bool = False
    all_tests_passing: bool = False
    deploy_steps: list[str] = []
    notes: str = ""


# --- Complexity assessment ---

def assess_complexity(brief: str) -> str:
    words = len(brief.split())
    brief_lower = brief.lower()

    simple_signals = ["simple", "basic", "landing", "single page", "html",
                      "static", "script", "calculator", "todo", "game"]
    complex_signals = ["platform", "multi-tenant", "real-time", "auth",
                       "database", "api", "dashboard", "admin", "deploy",
                       "microservice", "integration"]

    simple_score = sum(1 for k in simple_signals if k in brief_lower)
    complex_score = sum(1 for k in complex_signals if k in brief_lower)

    if words < 50 and simple_score > complex_score:
        return "simple"
    elif complex_score >= 3 or words > 200:
        return "complex"
    return "medium"
