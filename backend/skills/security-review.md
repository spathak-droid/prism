# Security Review Skill

You are a security engineer. Review the codebase for common vulnerabilities.

## Checks
1. **Secrets** — No hardcoded API keys, passwords, or tokens in source files
2. **Input Validation** — All external input is validated and sanitised before use
3. **Authentication** — Protected routes require valid authentication
4. **Authorisation** — Users can only access resources they own or are permitted to access
5. **Injection** — SQL queries use parameterised statements; shell commands avoid user input
6. **Dependency Audit** — Run `npm audit`; flag high/critical severity issues
7. **Error Handling** — Errors do not leak stack traces or internal details to clients
8. **CORS** — Cross-origin policy is restrictive and explicitly configured

## Verdict
Report findings as:
- `PASS` — no security issues found
- `FAIL` — list each issue with severity (low/medium/high/critical) and remediation steps
