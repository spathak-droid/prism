# Code Review Skill

You are an automated code reviewer. Run every check below, collect results, and output PASS or FAIL with specific line references.

## Step 1: Gather Context

```bash
# What changed in this ticket?
git diff HEAD~1 --stat
git diff HEAD~1 --name-only

# Read the ticket's acceptance criteria
cat docs/plan.md | grep -A 20 'TICKET-XXX'  # Replace XXX with ticket ID

# Read project conventions
cat CLAUDE.md
```

## Step 2: Automated Checks

Run every available check. Record output:
```bash
# Lint
npm run lint 2>&1 | tail -20 || npx eslint . --ext .ts,.js 2>&1 | tail -20 || ruff check . 2>&1 | tail -20

# Type check
npx tsc --noEmit 2>&1 | tail -20 || mypy . 2>&1 | tail -20

# Tests
npm test 2>&1 | tail -30 || pytest -v 2>&1 | tail -30

# Build
npm run build 2>&1 | tail -10

# Coverage on changed files
npx jest --coverage --changedSince=HEAD~1 2>&1 | tail -20 || pytest --cov=src -q 2>&1 | tail -20
```

If ANY check fails, verdict is FAIL. List exact error output.

## Step 3: Convention Matching

Check changed files against CLAUDE.md patterns:
```bash
# Get list of changed files
FILES=$(git diff HEAD~1 --name-only)

# Check naming convention (camelCase vs snake_case vs kebab-case)
echo "$FILES" | grep -E '[A-Z]' # Flag if project uses kebab-case but file has caps

# Check for console.log left in (if CLAUDE.md prohibits)
git diff HEAD~1 -U0 | grep '^\+.*console\.log'

# Check for commented-out code
git diff HEAD~1 -U0 | grep '^\+.*//.*=' | grep -v 'http'

# Check for TODO/FIXME without ticket reference
git diff HEAD~1 -U0 | grep '^\+.*(TODO|FIXME)' | grep -v 'TICKET\|PROJ\|#[0-9]'

# Check for hardcoded secrets
git diff HEAD~1 -U0 | grep -iE '^\+.*(password|secret|key|token)\s*[:=]\s*["\x27][^"\x27]{8,}'
```

## Step 4: Diff Analysis

For each changed file, verify:
- [ ] **Purpose** — Change relates to the ticket. No unrelated modifications.
- [ ] **Size** — No file exceeds the planned line count by more than 50%.
- [ ] **Imports** — No unused imports. No circular dependencies.
- [ ] **Error handling** — Async functions have try/catch or .catch(). No unhandled promise rejections.
- [ ] **Types** — No `any` in TypeScript (unless justified). No implicit any.
- [ ] **Naming** — Variables/functions describe what they do. No single-letter names outside loops.

## Step 5: Acceptance Criteria Verification

For each AC from the ticket:
```
AC1: [text] -> PASS/FAIL (evidence: [test name or grep result])
AC2: [text] -> PASS/FAIL (evidence: [test name or grep result])
```

Every AC must have evidence. "I looked at the code" is not evidence. Use test names, curl output, or grep results.

## Step 6: Security Quick Check

```bash
# Run the lightweight version of security checks
git diff HEAD~1 -U0 | grep -iE '^\+.*(eval|innerHTML|exec\(|execSync|document\.write)'
git diff HEAD~1 -U0 | grep -iE '^\+.*(http://[^l]|CORS.*\*)'
```

Flag any matches for security review.

## Output Format

```
## Code Review: TICKET-XXX

### Automated Checks
- Lint: PASS/FAIL
- Types: PASS/FAIL
- Tests: PASS/FAIL (X/Y passing)
- Build: PASS/FAIL
- Coverage: X% on changed files

### Acceptance Criteria
- AC1: PASS/FAIL — [evidence]
- AC2: PASS/FAIL — [evidence]

### Issues Found
1. [file:line] — [description] — [severity: blocker/warning/nit]
2. [file:line] — [description] — [severity: blocker/warning/nit]

### Verdict: PASS / FAIL
[If FAIL: list only the blocker issues that must be fixed]
```

**PASS** requires: all automated checks green + all ACs met + zero blockers.
**FAIL** on any blocker. Warnings and nits are noted but don't block.
