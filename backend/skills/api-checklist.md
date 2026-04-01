# API Checklist Skill

Run this checklist after building any API/backend project. Each item has a concrete command or grep pattern to verify. Mark each PASS or FAIL.

## Input Validation
- [ ] **Schema validation on every endpoint** — All request bodies validated with zod (JS/TS) or pydantic (Python). Verify:
  ```bash
  # JS/TS: every route file imports zod
  grep -rL 'zod\|z\.\|validate\|schema' src/routes/ --include='*.ts' --include='*.js'
  # Python: every route uses pydantic
  grep -rL 'BaseModel\|pydantic\|validator' app/routes/ --include='*.py'
  ```
  Any file listed has missing validation.
- [ ] **No raw req.body access without validation** — Verify: `grep -rn 'req\.body\.' src/ --include='*.ts' | grep -v 'parse\|validate\|schema'` returns nothing.
- [ ] **Path/query params validated** — Numeric IDs parsed with `parseInt`/`int()` and checked. UUIDs validated with regex.

## Error Handling
- [ ] **RFC 7807 error format** — All error responses follow: `{ "type": "...", "title": "...", "status": 400, "detail": "..." }`. Verify: search for error response helpers.
- [ ] **No stack traces in production** — Verify: `grep -rn 'stack\|stackTrace' src/ --include='*.ts'` only appears in error middleware with `NODE_ENV` check.
- [ ] **Global error handler** — Uncaught exceptions caught. Verify: `grep -rn 'app\.use.*err' src/` finds error middleware.

## Authentication & Authorization
- [ ] **Auth middleware on protected routes** — Verify: `grep -rn 'router\.\(get\|post\|put\|delete\)' src/routes/ | grep -v 'auth\|public\|health\|login\|register'` — any match needs justification.
- [ ] **Passwords hashed** — Never stored plain. Verify: `grep -rn 'bcrypt\|argon2\|scrypt\|pbkdf2' src/` finds usage.
- [ ] **JWT secrets from env** — Verify: `grep -rn 'jwt\|JWT' src/ | grep -v 'process\.env\|os\.environ'` returns nothing suspicious.

## Rate Limiting
- [ ] **Rate limiter installed** — Verify: `grep -rn 'rateLimit\|rate-limit\|throttle\|slowDown' src/` OR `grep 'express-rate-limit\|bottleneck' package.json`.
- [ ] **Applied to auth endpoints** — Login/register have stricter limits (max 5-10/min).

## Pagination
- [ ] **List endpoints paginated** — No endpoint returns unbounded arrays. Verify: `grep -rn 'findMany\|find(\|\.all(' src/ | grep -v 'limit\|take\|paginate'` returns nothing.
- [ ] **Cursor-based for large datasets** — If > 1000 rows possible, use cursor not offset. Check for `skip` usage on large tables.

## CORS
- [ ] **Explicit origin list** — No wildcard `*` in production. Verify: `grep -rn "origin.*\*\|'\\*'" src/ | grep -v test` returns nothing.
- [ ] **CORS middleware present** — Verify: `grep -rn 'cors' src/app\|src/index\|src/server' --include='*.ts'` finds import.

## Logging & Monitoring
- [ ] **Request logging** — Verify: `grep -rn 'morgan\|pino\|winston\|logging' src/` finds logger setup.
- [ ] **No console.log in production** — Verify: `grep -rn 'console\.log' src/ --include='*.ts' | grep -v test` returns nothing or uses proper logger.

## Health & Ops
- [ ] **Health endpoint** — `GET /health` returns 200. Verify: `grep -rn "health\|healthz\|readyz" src/routes/` finds it.
- [ ] **Graceful shutdown** — Process handles SIGTERM. Verify: `grep -rn 'SIGTERM\|SIGINT\|graceful' src/` finds handler.

## Database
- [ ] **Migrations exist** — Schema changes via migration files, not manual SQL. Verify: `ls migrations/ || ls prisma/migrations/ || ls alembic/versions/`.
- [ ] **Connection pooling** — Verify: `grep -rn 'pool\|connectionLimit\|max.*connections' src/` finds config.
- [ ] **No SQL string concatenation** — Verify: `grep -rn "query.*\`\|query.*+" src/ --include='*.ts' | grep -v 'parameterized\|placeholder'` returns nothing.

## Final Verification
```bash
npm audit --audit-level=high 2>/dev/null || pip-audit 2>/dev/null
npm test 2>/dev/null || pytest 2>/dev/null
```

Output: Item | Status | Command Output (first line).
