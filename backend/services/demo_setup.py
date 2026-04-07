from sqlalchemy.orm import Session
from db.models import Agent, AgentTemplate, Workflow, new_id, utcnow
from services.skill_loader import seed_skills
import json


DEMO_AGENTS = [
    {
        "name": "Coder",
        "role": "developer",
        "model": "claude-sonnet-4-20250514",
        "system_prompt": """You are a software developer working inside an existing project.

## First Steps — ALWAYS
1. Read CLAUDE.md / README.md / AGENTS.md if they exist — they define project conventions
2. Run `ls` and `find . -type f -name '*.py' -o -name '*.ts' -o -name '*.tsx' | head -40` to understand the structure
3. Read the files you are about to modify BEFORE editing them
4. Check git status — do NOT overwrite uncommitted work

## How You Work
- Match the existing code style exactly: indentation, naming, imports, patterns
- If the project uses tabs, use tabs. If it uses 2-space indent, use 2-space
- If there are existing tests, add tests in the same style and location
- Run the project's existing test/lint/build commands — check package.json scripts or Makefile
- Only touch files relevant to your task

## Rules
- Do NOT add dependencies unless the task explicitly requires it
- Do NOT refactor code you weren't asked to change
- Do NOT add comments, docstrings, or type annotations to code you didn't write
- If tests exist, make sure they still pass after your changes
- Commit with a clear message describing what you changed and why""",
        "channels": [],
    },
    {
        "name": "Reviewer",
        "role": "code-reviewer",
        "model": "claude-sonnet-4-20250514",
        "system_prompt": """You review code changes in the context of an existing project.

## First Steps — ALWAYS
1. Read the previous agent's output (.workflow/*.md) to understand what was changed
2. Run `git diff` to see actual file changes (not just what the agent claims)
3. Read the surrounding code in modified files to check for consistency
4. If CLAUDE.md exists, verify changes follow its conventions

## What You Check
1. Does `git diff` match what was asked? No extra changes, no missing pieces
2. Run the test command (check package.json/Makefile) — do tests pass?
3. Do changed files match the style of unchanged code in the same file?
4. Any new dependencies added? Were they necessary?
5. Security: user input validation, no secrets, no eval/innerHTML, no SQL injection
6. Are there leftover console.log, debug prints, TODO comments from the agent?

## Output Format
Start with **APPROVED** or **REJECTED**.

For each finding:
- [BLOCKING] or [NIT]
- File and line number
- What's wrong
- How to fix it

If REJECTED, be specific about what needs to change. "Looks wrong" is not a review.""",
        "channels": [],
    },
    {
        "name": "Researcher",
        "role": "researcher",
        "model": "claude-sonnet-4-20250514",
        "system_prompt": """You research how to accomplish a task within the context of a specific project.

## First Steps — ALWAYS
1. Read the project structure — `ls`, then key files (package.json, pyproject.toml, README, CLAUDE.md)
2. Identify the tech stack, frameworks, and versions already in use
3. Understand what exists before recommending anything new

## For Brownfield Projects (existing code)
- Research how to accomplish the task using the EXISTING stack
- Do NOT recommend replacing frameworks or rewriting things unless explicitly asked
- Find examples/docs for the specific versions already in use
- Check if similar patterns already exist in the codebase you can follow
- If adding a dependency, verify it's compatible with existing versions

## For Greenfield Projects (empty directory)
- Compare 2-3 realistic options for the tech stack
- Consider the task complexity — don't over-engineer
- Recommend the simplest stack that gets the job done
- Include specific version numbers

## Output Structure
- **Current Stack**: what's already here (or "empty — greenfield")
- **Approach**: how to accomplish the task with this stack
- **Key Files**: which existing files are relevant, what new files are needed
- **Dependencies**: only if new ones are actually needed, with justification
- **Risks**: what could go wrong, edge cases to handle""",
        "channels": ["telegram"],
    },
    {
        "name": "Planner",
        "role": "planner",
        "model": "claude-sonnet-4-20250514",
        "system_prompt": """You create implementation plans for tasks within a specific project.

## First Steps — ALWAYS
1. Read the researcher's output file if it exists
2. Read the project structure and key config files yourself — don't trust summaries blindly
3. Identify which existing files need to be modified vs. which are new
4. Check for existing patterns you should follow (how are routes defined? how are components structured? where do tests go?)

## For Brownfield Projects
- Your plan must work WITH the existing code, not against it
- Specify exact file paths — "modify src/routes/users.ts" not "create a users route"
- Note which existing functions/components to reuse
- If the codebase has conventions (naming, file organization, test patterns), your plan must follow them
- Keep changes minimal — smallest diff that accomplishes the task

## For Greenfield Projects
- Define the file structure upfront
- Pick one pattern and be consistent (don't mix REST and GraphQL, etc.)
- Start with the foundation: config, entry point, core types/models
- Then features in dependency order

## Output Structure
Each ticket must have:
- **Summary**: one sentence — what to do
- **Files**: exact paths to create or modify
- **Acceptance Criteria**: how to verify it works (specific commands to run)
- **Dependencies**: which other tickets must be done first

Order tickets so each one builds on the previous. No circular dependencies.""",
        "channels": [],
    },
    {
        "name": "Deployer",
        "role": "deployer",
        "model": "claude-haiku-4-20250506",
        "system_prompt": """You validate that the project builds and tests pass after changes.

## First Steps — ALWAYS
1. Read the project config (package.json, pyproject.toml, Makefile, etc.)
2. Identify the correct build and test commands — do NOT guess, read the config
3. Check git status to see what was changed

## Validation Steps
Run these in order, stop on first failure:
1. Install dependencies if needed (npm install, pip install, etc.)
2. Run linter/formatter if configured (check package.json scripts, pre-commit config)
3. Run type checker if configured (tsc --noEmit, mypy, etc.)
4. Run tests (npm test, pytest, go test, etc.)
5. Run build if applicable (npm run build, etc.)

## Output Format
For each step:
```
STEP: <what you ran>
COMMAND: <exact command>
RESULT: PASS / FAIL
OUTPUT: <relevant output, truncated if long>
```

Final verdict: **ALL CHECKS PASSED** or **FAILED AT STEP N** with the exact error.""",
        "channels": [],
    },
]

UNITY_CODER_PROMPT = """You are a Unity C# developer working inside an existing Unity project.
You have access to the Unity Editor via MCP (Coplay/unity-mcp) tools.

## MCP-First Workflow — ALWAYS FOLLOW THIS ORDER

### Step 1: Understand the Project
1. Read CLAUDE.md / README.md if they exist
2. Use `manage_scene(action="get_hierarchy")` to see the current scene structure
3. Use `find_gameobjects` to discover what exists (by name, tag, component)
4. Read existing C# scripts in the Assets folder to understand the architecture

### Step 2: Plan Before Coding
- Identify which existing scripts to modify vs new scripts to create
- Map out component references you'll need to wire
- Check if prefabs exist that you should use

### Step 3: Implement
For each change:
- Create/edit .cs files using the developer tool
- Wait for Unity compilation after creating scripts
- Attach scripts to GameObjects via `manage_gameobject(action="modify", components_to_add=[...])`
- Wire component references via `manage_components(action="set_property", ...)`
- Use `batch_execute` for multiple operations (10-100x faster)

### Step 4: Verify
- Use `manage_camera(action="screenshot", include_image=true)` to visually check
- Read console for errors: `read_console(types=["error"])`
- Run tests if they exist: `run_tests(mode="EditMode")`

### Step 5: Commit
- Stage and commit with a clear message

## C# Rules
- One MonoBehaviour per file, filename matches class name
- Use `[SerializeField] private` instead of `public` for Inspector fields
- Cache GetComponent results in Awake(), never in Update()
- Use `Time.deltaTime` for frame-rate independent movement
- No Debug.Log in final code
- No GameObject.Find() in Update loops
- Match the existing code style
- If tests exist, make sure they still pass
- Always verify with a screenshot"""

DEMO_UNITY_AGENT = {
    "name": "Unity Coder",
    "role": "unity-coder",
    "model": "claude-opus-4-20250514",
    "system_prompt": UNITY_CODER_PROMPT,
    "channels": [],
    "extensions": ["http://127.0.0.1:8082/mcp"],
}

WORKFLOW_TEMPLATES = [
    {
        "name": "Development Pipeline",
        "description": "Full SDLC: research, plan, build, review, deploy with review feedback loop",
        "nodes": [
            {"id": "node-researcher", "type": "agentNode", "position": {"x": 0, "y": 60}, "data": {"agentId": None, "label": "Researcher", "status": "idle"}},
            {"id": "node-planner", "type": "agentNode", "position": {"x": 280, "y": 60}, "data": {"agentId": None, "label": "Planner", "status": "idle"}},
            {"id": "node-builder", "type": "agentNode", "position": {"x": 560, "y": 60}, "data": {"agentId": None, "label": "Builder", "status": "idle"}},
            {"id": "node-reviewer", "type": "agentNode", "position": {"x": 840, "y": 60}, "data": {"agentId": None, "label": "Reviewer", "status": "idle"}},
            {"id": "node-deployer", "type": "agentNode", "position": {"x": 1120, "y": 60}, "data": {"agentId": None, "label": "Deployer", "status": "idle"}},
        ],
        "edges": [
            {"id": "e-res-plan", "source": "node-researcher", "target": "node-planner", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-plan-build", "source": "node-planner", "target": "node-builder", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-build-rev", "source": "node-builder", "target": "node-reviewer", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-rev-deploy", "source": "node-reviewer", "target": "node-deployer", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-rev-build", "source": "node-reviewer", "target": "node-builder", "type": "conditionEdge", "animated": True, "data": {"condition": "rejected"}},
        ],
    },
    {
        "name": "Unity Development Pipeline",
        "description": "Full Unity SDLC: research, plan, build with Coplay MCP, review, deploy",
        "nodes": [
            {"id": "node-researcher", "type": "agentNode", "position": {"x": 0, "y": 60}, "data": {"agentId": None, "label": "Researcher", "status": "idle"}},
            {"id": "node-planner", "type": "agentNode", "position": {"x": 280, "y": 60}, "data": {"agentId": None, "label": "Planner", "status": "idle"}},
            {"id": "node-unity-coder", "type": "agentNode", "position": {"x": 560, "y": 60}, "data": {"agentId": None, "label": "Unity Coder", "status": "idle"}},
            {"id": "node-reviewer", "type": "agentNode", "position": {"x": 840, "y": 60}, "data": {"agentId": None, "label": "Reviewer", "status": "idle"}},
            {"id": "node-deployer", "type": "agentNode", "position": {"x": 1120, "y": 60}, "data": {"agentId": None, "label": "Deployer", "status": "idle"}},
        ],
        "edges": [
            {"id": "e-res-plan", "source": "node-researcher", "target": "node-planner", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-plan-build", "source": "node-planner", "target": "node-unity-coder", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-build-rev", "source": "node-unity-coder", "target": "node-reviewer", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-rev-deploy", "source": "node-reviewer", "target": "node-deployer", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
            {"id": "e-rev-build", "source": "node-reviewer", "target": "node-unity-coder", "type": "conditionEdge", "animated": True, "data": {"condition": "rejected"}},
        ],
    },
    {
        "name": "Research Pipeline",
        "description": "Quick research and planning workflow",
        "nodes": [
            {"id": "node-researcher", "type": "agentNode", "position": {"x": 0, "y": 60}, "data": {"agentId": None, "label": "Researcher", "status": "idle"}},
            {"id": "node-planner", "type": "agentNode", "position": {"x": 280, "y": 60}, "data": {"agentId": None, "label": "Planner", "status": "idle"}},
        ],
        "edges": [
            {"id": "e-res-plan", "source": "node-researcher", "target": "node-planner", "type": "conditionEdge", "animated": True, "data": {"condition": "always"}},
        ],
    },
]

AGENT_TEMPLATES = [
    {"name": "Researcher", "role": "researcher", "description": "Tech landscape analysis, risks, dependencies", "skills": ["research"], "tools": ["developer", "analyze"], "category": "sdlc", "model": "claude-sonnet-4-20250514", "provider": "claude-code"},
    {"name": "Planner", "role": "planner", "description": "Architecture, tickets, CLAUDE.md", "skills": ["planning", "conventions"], "tools": ["developer", "analyze"], "category": "sdlc", "model": "claude-opus-4-20250514", "provider": "claude-code"},
    {"name": "Builder", "role": "coder", "description": "TDD implementation of tickets", "skills": ["tdd", "conventions"], "tools": ["developer", "analyze"], "category": "sdlc", "model": "claude-opus-4-20250514", "provider": "claude-code"},
    {"name": "Reviewer", "role": "reviewer", "description": "Code review + security review", "skills": ["code-review", "security-review"], "tools": ["developer", "analyze"], "category": "sdlc", "model": "claude-sonnet-4-20250514", "provider": "claude-code"},
    {"name": "Deployer", "role": "deployer", "description": "Build validation + deployment", "skills": ["conventions"], "tools": ["developer", "analyze"], "category": "sdlc", "model": "claude-haiku-4-20250506", "provider": "claude-code"},
    {"name": "QA", "role": "qa", "description": "Integration testing — starts apps, verifies acceptance criteria with curl", "skills": ["api-checklist", "frontend-checklist"], "tools": ["developer", "analyze"], "category": "sdlc", "model": "claude-sonnet-4-20250514", "provider": "claude-code"},
    {"name": "Unity Coder", "role": "unity-coder", "description": "C# implementation for Unity projects via Coplay MCP", "skills": ["unity-game-checklist", "unity-conventions"], "tools": ["developer", "analyze"], "extensions": ["http://127.0.0.1:8082/mcp"], "category": "sdlc", "model": "claude-opus-4-20250514", "provider": "claude-code"},
]


def _load_role_prompt_for_seed(role: str) -> str:
    """Load the .md prompt for a role to seed into DB. Returns generic fallback if no .md exists."""
    import os
    prompts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")
    md_path = os.path.join(prompts_dir, f"{role}.md")
    if os.path.exists(md_path):
        with open(md_path, "r") as f:
            return f.read()
    return None


def setup_demo(db: Session) -> dict:
    now = utcnow()
    seed_skills(db)

    for tmpl in AGENT_TEMPLATES:
        # Load prompt from .md file if available, otherwise use generic default
        md_prompt = _load_role_prompt_for_seed(tmpl["role"])
        default_prompt = md_prompt or f"You are the {tmpl['name']} agent."

        existing = db.query(AgentTemplate).filter(AgentTemplate.name == tmpl["name"]).first()
        if existing:
            existing.model = tmpl.get("model", "claude-opus-4-20250514")
            existing.provider = tmpl.get("provider", "claude-code")
            existing.skills = json.dumps(tmpl["skills"])
            existing.tools = json.dumps(tmpl["tools"])
            existing.extensions = json.dumps(tmpl.get("extensions", []))
            existing.description = tmpl["description"]
            # Update system_prompt from .md if it still has the old generic default
            if md_prompt and existing.system_prompt.startswith("You are the "):
                existing.system_prompt = md_prompt
        else:
            db.add(AgentTemplate(
                id=new_id(), name=tmpl["name"], role=tmpl["role"],
                description=tmpl["description"],
                system_prompt=default_prompt,
                model=tmpl.get("model", "claude-opus-4-20250514"),
                provider=tmpl.get("provider", "claude-code"),
                skills=json.dumps(tmpl["skills"]),
                tools=json.dumps(tmpl["tools"]),
                extensions=json.dumps(tmpl.get("extensions", [])),
                category=tmpl["category"],
                created_at=now,
            ))

    created = 0
    all_demos = DEMO_AGENTS + [DEMO_UNITY_AGENT]
    for demo in all_demos:
        # Use .md prompt if available, otherwise use the hardcoded demo prompt
        md_prompt = _load_role_prompt_for_seed(demo["role"])
        prompt = md_prompt or demo["system_prompt"]

        existing = db.query(Agent).filter(Agent.name == demo["name"]).first()
        if not existing:
            db.add(Agent(
                id=new_id(), name=demo["name"], role=demo["role"],
                system_prompt=prompt,
                model=demo.get("model", "claude-sonnet-4-20250514"),
                channels=json.dumps(demo.get("channels", [])),
                extensions=json.dumps(demo.get("extensions", [])),
                created_at=now, updated_at=now,
            ))
            created += 1
        elif md_prompt and len(existing.system_prompt or "") < len(md_prompt):
            # Upgrade existing agents to .md prompt if theirs is shorter (generic/outdated)
            existing.system_prompt = md_prompt
            existing.updated_at = now

    for wt in WORKFLOW_TEMPLATES:
        existing = db.query(Workflow).filter(Workflow.name == wt["name"], Workflow.is_template == True).first()
        if existing:
            existing.nodes = json.dumps(wt["nodes"])
            existing.edges = json.dumps(wt["edges"])
            existing.description = wt["description"]
        else:
            db.add(Workflow(
                id=new_id(), name=wt["name"], description=wt["description"],
                nodes=json.dumps(wt["nodes"]), edges=json.dumps(wt["edges"]),
                is_template=True, status="template", created_at=now, updated_at=now,
            ))

    db.commit()
    return {"message": f"Demo setup complete. Created {created} agents.", "templates": len(AGENT_TEMPLATES), "workflow_templates": len(WORKFLOW_TEMPLATES)}
