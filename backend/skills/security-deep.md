# Security Deep Review Skill

Run every check below against the codebase. Output a findings table with severity and remediation. This is automated — no human judgment needed, just pattern matching and tool output.

## 1. Secrets Detection

```bash
# Hardcoded API keys, tokens, passwords
grep -rniE '(api[_-]?key|secret|password|token|auth)\s*[:=]\s*["\x27][A-Za-z0-9+/=_-]{8,}' src/ lib/ app/ --include='*.ts' --include='*.js' --include='*.py' --include='*.env'

# AWS keys
grep -rn 'AKIA[0-9A-Z]{16}' .

# Private keys
grep -rn 'BEGIN.*PRIVATE KEY' .

# .env committed to git
git ls-files | grep -i '\.env'
```
**Severity**: CRITICAL if any match found. Remediation: move to environment variables, rotate compromised keys.

## 2. Injection Vectors

```bash
# SQL string concatenation (JS/TS)
grep -rnE "query\s*\(.*\`|query\s*\(.*\+" src/ --include='*.ts' --include='*.js'

# SQL string concatenation (Python)
grep -rnE "execute\(.*f\"|execute\(.*%s|execute\(.*\.format" app/ --include='*.py'

# Command injection
grep -rnE "exec\(|execSync\(|child_process|subprocess\.call|os\.system|os\.popen" src/ app/ --include='*.ts' --include='*.js' --include='*.py'

# eval usage
grep -rn 'eval(' src/ app/ --include='*.ts' --include='*.js' --include='*.py'
```
**Severity**: HIGH. Remediation: use parameterized queries, avoid eval, use execFile with fixed commands.

## 3. XSS Vectors

```bash
# innerHTML usage
grep -rn 'innerHTML\s*=' src/ app/ --include='*.ts' --include='*.js' --include='*.html' --include='*.tsx' --include='*.jsx'

# document.write
grep -rn 'document\.write' src/ --include='*.ts' --include='*.js'

# dangerouslySetInnerHTML
grep -rn 'dangerouslySetInnerHTML' src/ --include='*.tsx' --include='*.jsx'

# Unescaped template output (EJS, Handlebars)
grep -rn '<%- \|{{{' src/ views/ templates/ --include='*.ejs' --include='*.hbs'
```
**Severity**: HIGH. Remediation: use textContent, sanitize with DOMPurify, use framework auto-escaping.

## 4. Authentication & Authorization

```bash
# Routes without auth middleware
grep -rnE 'router\.(get|post|put|patch|delete)\(' src/routes/ --include='*.ts' --include='*.js' | grep -v 'auth\|public\|health\|docs\|swagger'

# JWT without expiry
grep -rn 'sign(' src/ --include='*.ts' --include='*.js' | grep -v 'expiresIn\|exp'

# Hardcoded CORS wildcard
grep -rnE "origin.*['\"]\\*['\"]" src/ --include='*.ts' --include='*.js'
```
**Severity**: HIGH for missing auth, MEDIUM for CORS wildcard. Remediation: add auth middleware, set JWT expiry, whitelist CORS origins.

## 5. Dependency Audit

```bash
# NPM audit
[ -f package-lock.json ] && npm audit --audit-level=high 2>&1 | head -30

# Pip audit
[ -f requirements.txt ] && pip-audit 2>&1 | head -30

# Check for outdated with known CVEs
[ -f package.json ] && npx audit-ci --high 2>&1 | head -20
```
**Severity**: varies by CVE. Remediation: update affected packages, check for breaking changes.

## 6. Sensitive Data Exposure

```bash
# Stack traces in error responses
grep -rnE 'res\.(json|send)\(.*err\.(stack|message)' src/ --include='*.ts' --include='*.js'

# Verbose error in production
grep -rn 'stack.*trace\|\.stack' src/ --include='*.ts' --include='*.js' | grep -v 'NODE_ENV\|production\|test'

# Logging sensitive fields
grep -rnE 'log.*(password|token|secret|credit.?card|ssn)' src/ app/ --include='*.ts' --include='*.js' --include='*.py'
```
**Severity**: MEDIUM. Remediation: use generic error messages in production, redact sensitive fields from logs.

## 7. Misconfiguration

```bash
# Debug mode in production config
grep -rn 'DEBUG.*=.*true\|debug.*true' src/ app/ --include='*.ts' --include='*.js' --include='*.py' | grep -v 'test\|spec\|\.test\.'

# HTTP (not HTTPS) in production URLs
grep -rnE "http://[^l]" src/ app/ --include='*.ts' --include='*.js' --include='*.py' | grep -v 'localhost\|127\.0\.0\.1\|test\|spec'
```
**Severity**: LOW-MEDIUM. Remediation: disable debug in production, enforce HTTPS.

## Output Format

```
| # | Category        | Severity | File:Line       | Finding                    | Remediation              |
|---|----------------|----------|-----------------|----------------------------|--------------------------|
| 1 | Secrets        | CRITICAL | src/config.ts:12| Hardcoded API key          | Move to env variable     |
| 2 | Injection      | HIGH     | src/db.ts:45    | SQL string concatenation   | Use parameterized query  |
```

**Verdict**: PASS (0 HIGH/CRITICAL findings) or FAIL (list all HIGH/CRITICAL with fix instructions).
