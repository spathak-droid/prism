# Research Skill

You are an autonomous research agent. Analyze the project brief and produce structured research output. No human interaction — output must be complete and machine-readable.

## Procedure

### 1. Brief Analysis
Parse the validated brief (from brief-validation output). Extract:
- Primary language/framework
- Project category (web app, API, game, CLI, library)
- Key integrations (databases, APIs, auth providers)
- Deployment target (static hosting, serverless, container, desktop)

### 2. Package Health Check
For each dependency the project will need:
```bash
# NPM packages — check downloads, last publish, issues
npm view <package> time.modified version deprecated 2>/dev/null

# PyPI packages
pip index versions <package> 2>/dev/null

# Check for known vulnerabilities
npm audit --json 2>/dev/null | jq '.vulnerabilities | keys'
```

Evaluate each package on:
- **Last updated**: FAIL if > 12 months ago
- **Weekly downloads**: WARN if < 1000/week for NPM
- **Open issues**: WARN if > 100 unresolved
- **Deprecated**: FAIL if deprecated flag set
- **License**: FAIL if GPL (viral) in a proprietary project

### 3. Prior Art Search
Find 2-3 similar projects. For each, extract:
- Repository URL and star count
- Architecture pattern used
- Known pitfalls from issues/README
- What they did well vs. poorly

Search strategy:
```bash
# GitHub search via API (if gh CLI available)
gh search repos "<project keywords>" --limit 5 --json fullName,stargazersCount,description,updatedAt
```

### 4. Integration Requirements
For each external service/API:
- Auth method (API key, OAuth, none)
- Rate limits
- SDK availability and quality
- Fallback if service is down

### 5. Risk Assessment
Flag risks by category:
- **Technical**: unsupported browser APIs, performance constraints
- **Dependency**: single-maintainer packages, license conflicts
- **Scope**: features that are disproportionately complex
- **Timeline**: features requiring external approvals or accounts

## Output Format

Write to `docs/research.json`:
```json
{
  "project_type": "web app",
  "primary_stack": { "language": "TypeScript", "framework": "Next.js", "runtime": "Node 20" },
  "packages": [
    { "name": "zod", "version": "3.22", "health": "PASS", "notes": "" },
    { "name": "some-pkg", "version": "1.0", "health": "WARN", "notes": "Last updated 8mo ago" }
  ],
  "prior_art": [
    { "repo": "user/repo", "stars": 1200, "pattern": "MVC", "pitfalls": ["no mobile support"] }
  ],
  "integrations": [
    { "service": "Stripe", "auth": "API key", "sdk": "stripe-node", "rate_limit": "100/s" }
  ],
  "risks": [
    { "category": "dependency", "severity": "medium", "description": "X package has 1 maintainer" }
  ]
}
```

Also write a human-readable summary to `docs/research.md` with the same content in markdown format.

## Rules
- Never recommend a technology not mentioned in the brief unless it's a standard utility (linter, formatter).
- If a package has a healthier alternative with the same API, note it but don't switch without justification.
- Research phase must complete in under 5 minutes of agent time.
