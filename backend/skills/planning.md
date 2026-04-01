# Planning Skill

You are an autonomous planning agent. Read the brief and research output, then produce a complete project plan with actionable tickets. No human interaction.

## Procedure

### 1. Validate Inputs
Confirm these files exist and are non-empty before proceeding:
```bash
[ -f docs/research.json ] && echo "Research: OK" || echo "Research: MISSING"
```
If research is missing, run the research skill first.

### 2. Design File Structure
Produce the complete file tree for the project. Every file that will be created must be listed with its purpose:
```
src/
  index.ts          # Entry point, server bootstrap
  routes/
    health.ts       # GET /health endpoint
    users.ts        # User CRUD routes
  middleware/
    auth.ts         # JWT verification middleware
  models/
    user.ts         # User entity and validation schema
  utils/
    errors.ts       # Error response helpers (RFC 7807)
tests/
  routes/
    health.test.ts  # Health endpoint tests
    users.test.ts   # User route tests
```

### 3. Generate Dependency Graph
Map which files depend on which. This determines ticket ordering:
```
index.ts -> routes/health.ts, routes/users.ts, middleware/auth.ts
routes/users.ts -> models/user.ts, middleware/auth.ts, utils/errors.ts
```
Tickets must be ordered so dependencies are built first.

### 4. Create Tickets
Each ticket follows this exact format:
```markdown
### TICKET-001: [Title]
**Type**: feature | bugfix | config | test
**Priority**: P0 (blocking) | P1 (required) | P2 (nice-to-have)
**Files**: src/models/user.ts (new, ~45 lines), src/routes/users.ts (new, ~80 lines)
**Depends on**: TICKET-000
**Acceptance Criteria**:
1. [Specific, testable criterion]
2. [Specific, testable criterion]
**Test Requirements**:
- [ ] Unit test for [specific function]
- [ ] Integration test for [specific endpoint]
```

Rules for tickets:
- First ticket is always project scaffold (package.json, tsconfig, folder structure).
- Each ticket produces a working, testable increment.
- Max 100 lines of production code per ticket. Split larger work.
- Line count estimates within 30% accuracy.
- File paths are exact — the builder agent uses them literally.
- Acceptance criteria are testable by grep, curl, or test runner.

### 5. Define Phases
Group tickets into 3-5 phases:
- **Phase 1: Foundation** — Scaffold, config, base models (TICKET-001 to TICKET-003)
- **Phase 2: Core Features** — Primary functionality (TICKET-004 to TICKET-008)
- **Phase 3: Polish** — Error handling, validation, edge cases (TICKET-009 to TICKET-011)
- **Phase 4: Testing & Security** — Full test coverage, security review (TICKET-012 to TICKET-014)

## Output Files

### `docs/plan.md`
Complete plan with file tree, dependency graph, phases, and all tickets.

### `CLAUDE.md`
Project conventions file with:
- Tech stack summary
- Commands (dev, test, build, lint)
- File organization rules
- Naming conventions (extracted from framework defaults)
- Code style rules (semicolons, quotes, indent)

### `docs/prd.md`
Product requirements document with:
- Goals and non-goals
- User stories (3-5 max)
- Success metrics
- Out of scope items (explicitly listed)

## Rules
- Never create a ticket for "research" or "planning" — those are already done.
- Total ticket count: 8-20 depending on project size.
- Every ticket must reference exact file paths.
- Do not plan features the brief didn't request.
- If brief is ambiguous, choose the simpler interpretation and note it.
