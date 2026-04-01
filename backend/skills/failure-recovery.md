# Failure Recovery Skill

When a ticket fails review and comes back for retry, follow this procedure exactly. Do not start coding until all diagnostic steps are complete.

## Step 1: Read the Reviewer Feedback

Parse the reviewer's `FAIL` response. Extract every numbered issue into a list:
```
ISSUES:
1. [exact issue text]
2. [exact issue text]
...
```
Do NOT paraphrase. Copy the reviewer's words exactly. This is your fix list.

## Step 2: Assess Current State

Run these commands before touching any code:
```bash
# What changed since last good state?
git diff HEAD~1 --stat
git diff HEAD~1 -- .

# Is working directory clean?
git status

# Are there uncommitted changes?
git stash list
```

If working directory is dirty and has unrelated changes:
```bash
git stash push -m "recovery-stash-$(date +%s)"
```

## Step 3: Check Environment

Dependencies or config may have changed:
```bash
# JS projects
[ -f package.json ] && npm ci

# Python projects
[ -f requirements.txt ] && pip install -r requirements.txt

# Re-read project conventions
cat CLAUDE.md
```

## Step 4: Fix ONLY Listed Issues

For each issue from Step 1:
1. Locate the exact file and line referenced.
2. Make the minimum change to resolve it.
3. Do NOT refactor surrounding code.
4. Do NOT add features not in the original ticket.
5. Do NOT "improve" code the reviewer didn't mention.

Track fixes:
```
FIX LOG:
1. Issue: [text] -> Fixed in [file]:[line] -> Change: [one-line description]
2. Issue: [text] -> Fixed in [file]:[line] -> Change: [one-line description]
```

## Step 5: Re-validate Before Committing

Run every check the reviewer would run:
```bash
# Lint
npm run lint 2>/dev/null || npx eslint . 2>/dev/null || ruff check . 2>/dev/null

# Type check
npx tsc --noEmit 2>/dev/null || mypy . 2>/dev/null

# Tests
npm test 2>/dev/null || pytest 2>/dev/null

# Build
npm run build 2>/dev/null
```

If any check fails, fix it before proceeding. Do not commit with known failures.

## Step 6: Verify Against Original Ticket

Re-read the original ticket's acceptance criteria. Confirm every AC is still met after your fixes. Reviewer fixes must not break previously passing criteria.

## Step 7: Commit with Context

```bash
git add -A
git commit -m "fix: address review feedback for TICKET-ID

Fixes:
- [issue 1 summary]
- [issue 2 summary]

All checks passing."
```

## Rules
- Maximum 3 retry attempts per ticket. If it fails 3 times, escalate (mark ticket as BLOCKED).
- Never rewrite from scratch on retry. Fix incrementally.
- If the reviewer's feedback contradicts CLAUDE.md, follow CLAUDE.md and note the conflict.
- If a fix requires changing a file you didn't originally modify, proceed but flag it in the commit message.
- Restore any stashed changes after successful commit: `git stash pop`.
