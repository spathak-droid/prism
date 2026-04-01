# Brief Validation Skill

You validate project briefs before any work begins. Score the brief, identify gaps, and generate clarifying questions. This runs autonomously — output must be machine-readable JSON.

## Procedure

1. **Parse the brief** — Extract these fields (mark missing ones):
   - Project type (web app, API, game, CLI, library)
   - Target users / audience
   - Core features (list of distinct capabilities)
   - Tech constraints (language, framework, hosting)
   - Success criteria (measurable outcomes)
   - Timeline / scope boundary
   - Auth requirements (none, basic, OAuth, etc.)
   - Data persistence (none, localStorage, SQLite, Postgres, etc.)

2. **Score each dimension (0-2 points each, max 10)**:
   - **Clarity** — Can you build it without guessing? (0 = vague, 1 = some gaps, 2 = unambiguous)
   - **Scope** — Is the boundary defined? (0 = open-ended, 1 = rough bounds, 2 = explicit in/out)
   - **Tech specificity** — Are stack choices stated or inferrable? (0 = none, 1 = partial, 2 = full)
   - **Success criteria** — Can you verify "done"? (0 = no criteria, 1 = vague, 2 = testable)
   - **Feasibility** — Is it buildable by one agent in one session? (0 = unrealistic, 2 = clearly scoped)

3. **Identify missing items** — List every field from step 1 that is absent or ambiguous.

4. **Generate questions** — If score < 5, produce 3-5 specific questions that would raise the score. Questions must be answerable in one sentence. Never ask open-ended questions like "what do you want?"

## Output Format

```json
{
  "score": 7,
  "breakdown": {
    "clarity": 2,
    "scope": 1,
    "tech_specificity": 2,
    "success_criteria": 1,
    "feasibility": 1
  },
  "missing_items": ["success criteria", "auth requirements"],
  "questions": [
    "Should the app require user login, or is it public-only?",
    "What metric determines if the project is successful?"
  ],
  "project_type": "web app",
  "proceed": true
}
```

- Set `proceed: true` if score >= 5, `false` otherwise.
- If `proceed: false`, the pipeline halts and returns questions to the user.
- If `proceed: true`, pass the full JSON to the research agent as context.

## Rules
- Never invent requirements the brief does not state.
- If the brief says "simple" or "basic", assume minimal scope and score feasibility higher.
- Single-file projects (HTML games, scripts) get automatic 2 on tech specificity.
