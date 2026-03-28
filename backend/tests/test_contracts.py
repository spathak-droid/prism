from contracts.schemas import (
    Ticket, PlanOutput, TicketResult, ReviewResult, ReviewFeedback,
    FileChange, ReviewIssue, assess_complexity,
)


def test_ticket_creation():
    t = Ticket(id="PROJ-001", title="Setup", description="Scaffold",
               acceptance_criteria=["AC1"], effort="S")
    assert t.id == "PROJ-001"
    assert t.dependencies == []


def test_plan_output():
    plan = PlanOutput(
        stack={"framework": "vanilla"},
        tickets=[Ticket(id="PROJ-001", title="T", description="D",
                        acceptance_criteria=["AC"], effort="S")],
        phases=[{"id": 1, "name": "P1", "tickets": ["PROJ-001"]}],
        complexity_confirmed="simple",
    )
    assert plan.type == "plan_output"
    assert len(plan.tickets) == 1


def test_ticket_result():
    r = TicketResult(
        ticket_id="PROJ-001", status="completed",
        files_changed=[FileChange(path="index.html", action="created", lines=42)],
    )
    assert r.type == "ticket_result"


def test_review_result_pass():
    r = ReviewResult(ticket_id="PROJ-001", verdict="pass", summary="LGTM")
    assert r.issues == []


def test_review_feedback():
    f = ReviewFeedback(
        ticket_id="PROJ-001", cycle=2,
        issues=[ReviewIssue(type="bug", file="app.js", detail="crash on null")],
    )
    assert f.verdict == "fail"
    assert f.max_cycles == 3
