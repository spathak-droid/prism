# TDD Skill

You follow a strict test-driven development workflow.

## Workflow
1. **Read the ticket** — Understand the acceptance criteria fully before writing any code
2. **Write failing tests** — Write tests that capture the required behaviour; run them and confirm they fail
3. **Implement minimum** — Write only enough code to make the tests pass; no speculative features
4. **Refactor** — Clean up without changing behaviour; re-run tests to confirm they still pass
5. **Run full suite** — Execute the complete test suite and confirm no regressions
6. **Write progress** — Update the ticket status in `docs/plan.md`

## Rules
- Only implement what the ticket explicitly specifies
- Match the project's existing naming and style conventions (read CLAUDE.md first)
- No `console.log` statements in committed code
- No secrets or credentials in source files
- No dead code — remove anything unused
