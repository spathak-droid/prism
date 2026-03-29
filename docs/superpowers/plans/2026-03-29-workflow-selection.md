# Workflow Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-step project creation dialog where users pick a workflow preset and toggle stages before creating a project.

**Architecture:** The frontend dialog becomes a 2-step wizard. Step 1 collects name/brief/targetDir. Step 2 shows preset cards and stage toggles. The selected stages are sent as a `stages` array in the API request. The backend uses the stages list to create only the relevant agents and select the appropriate pipeline graph.

**Tech Stack:** React (Next.js), Tailwind CSS, shadcn/ui components, FastAPI (Python), SQLAlchemy

---

### Task 1: Backend — Accept `stages` in API and project factory

**Files:**
- Modify: `backend/routes/projects.py:15-19` (request model)
- Modify: `backend/routes/projects.py:32-35` (route handler)
- Modify: `backend/services/project_factory.py:13-93` (create_project function)
- Modify: `backend/services/project_factory.py:96-108` (_get_agents_for_complexity)

- [ ] **Step 1: Add `stages` field to CreateProjectRequest**

In `backend/routes/projects.py`, update the request model:

```python
from typing import Optional

class CreateProjectRequest(BaseModel):
    name: str
    brief: str
    targetDir: str
    config: dict = {}
    stages: Optional[list[str]] = None
```

- [ ] **Step 2: Pass stages through the route handler**

In `backend/routes/projects.py`, update the route to pass stages:

```python
@router.post("")
async def create_project_route(req: CreateProjectRequest, db: Session = Depends(get_db)):
    result = await create_project(db, req.name, req.brief, req.targetDir, req.config, req.stages)
    return result
```

- [ ] **Step 3: Add stage validation and update create_project signature**

In `backend/services/project_factory.py`, update `create_project`:

```python
VALID_STAGES = ["researcher", "planner", "approval", "coder", "reviewer", "deployer"]
REQUIRED_STAGES = {"planner", "coder"}

# Map stage keys to (template_name, role) for agent creation
STAGE_AGENT_MAP = {
    "researcher": ("Researcher", "researcher"),
    "planner": ("Planner", "planner"),
    "approval": None,  # No agent needed — it's a gate
    "coder": ("Builder", "coder"),
    "reviewer": ("Reviewer", "reviewer"),
    "deployer": ("Deployer", "deployer"),
}


async def create_project(
    db: Session,
    name: str,
    brief: str,
    target_dir: str,
    config: dict = {},
    stages: list[str] | None = None,
) -> dict:
    if stages is not None:
        # Validate stages
        invalid = [s for s in stages if s not in VALID_STAGES]
        if invalid:
            raise ValueError(f"Invalid stages: {invalid}")
        missing = REQUIRED_STAGES - set(stages)
        if missing:
            raise ValueError(f"Required stages missing: {missing}")
        # Determine complexity from stages
        if set(stages) <= {"planner", "coder", "reviewer"}:
            complexity = "simple"
        elif "deployer" in stages or "researcher" in stages:
            complexity = "complex" if len(stages) >= 5 else "medium"
        else:
            complexity = "medium"
        # Store stages in config
        config["stages"] = stages
    else:
        complexity = assess_complexity(brief)
```

Keep the rest of the function the same, but replace the `agents_to_create` line:

```python
    if stages is not None:
        agents_to_create = [
            STAGE_AGENT_MAP[s] for s in stages
            if STAGE_AGENT_MAP.get(s) is not None
        ]
    else:
        agents_to_create = _get_agents_for_complexity(complexity)
```

- [ ] **Step 4: Update the route to return a 400 on validation error**

In `backend/routes/projects.py`:

```python
@router.post("")
async def create_project_route(req: CreateProjectRequest, db: Session = Depends(get_db)):
    try:
        result = await create_project(db, req.name, req.brief, req.targetDir, req.config, req.stages)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result
```

- [ ] **Step 5: Commit**

```bash
git add backend/routes/projects.py backend/services/project_factory.py
git commit -m "feat: accept stages list in project creation API"
```

---

### Task 2: Backend — Dynamic pipeline graph selection based on stages

**Files:**
- Modify: `backend/services/project_factory.py:111-179` (_run_factory_pipeline)

- [ ] **Step 1: Update _run_factory_pipeline to accept and use stages**

Update `_run_factory_pipeline` signature and graph selection:

```python
async def _run_factory_pipeline(project_id: str, brief: str, target_dir: str, complexity: str, _db: Session, stages: list[str] | None = None):
    """Run the LangGraph pipeline. Uses fresh DB sessions to avoid stale connections."""
    from db.database import SessionLocal

    try:
        # Determine which graph to use based on stages or complexity
        has_approval = stages is not None and "approval" in stages
        has_deployer = stages is not None and "deployer" in stages
        has_researcher = stages is not None and "researcher" in stages

        if stages is not None:
            # Custom stages: pick the simplest graph that supports the required features
            if has_approval or has_deployer or has_researcher:
                from graphs.factory_medium import get_medium_graph_runner
                graph = await get_medium_graph_runner()
            else:
                from graphs.factory_simple import get_simple_graph_runner
                graph = await get_simple_graph_runner()
        elif complexity == "simple":
            from graphs.factory_simple import get_simple_graph_runner
            graph = await get_simple_graph_runner()
        elif complexity == "medium":
            from graphs.factory_medium import get_medium_graph_runner
            graph = await get_medium_graph_runner()
        else:
            from graphs.factory_complex import get_complex_graph_runner
            graph = await get_complex_graph_runner()

        initial_state = {
            "project_id": project_id,
            "brief": brief,
            "target_dir": target_dir,
            "complexity": complexity,
            "research": None,
            "plan": None,
            "approved": True if (stages and "approval" not in stages) or complexity == "simple" else False,
            "tickets": [],
            "ticket_results": {},
            "review_cycles": {},
            "status": "planning",
            "error": None,
        }
```

The rest of the function stays the same.

- [ ] **Step 2: Update the create_project call to pass stages to _run_factory_pipeline**

In `create_project`, update the asyncio.create_task line:

```python
    asyncio.create_task(_run_factory_pipeline(project_id, brief, target_dir, complexity, db, stages=config.get("stages")))
```

- [ ] **Step 3: Commit**

```bash
git add backend/services/project_factory.py
git commit -m "feat: dynamic pipeline graph selection based on user-chosen stages"
```

---

### Task 3: Frontend — Add step state and stage constants

**Files:**
- Modify: `frontend/src/components/new-project-dialog.tsx:1-33` (imports and state)
- Modify: `frontend/src/lib/store.ts:132-167` (store types)

- [ ] **Step 1: Update the store type to accept stages**

In `frontend/src/lib/store.ts`, update the `createProject` signature on line 139:

```typescript
createProject: (data: { name: string; brief: string; targetDir: string; stages?: string[] }) => Promise<Project>
```

- [ ] **Step 2: Add step state and stage definitions to the dialog**

In `frontend/src/components/new-project-dialog.tsx`, add new state after line 33:

```tsx
const [step, setStep] = useState<1 | 2>(1);
const [selectedPreset, setSelectedPreset] = useState<string | null>("simple");
const [activeStages, setActiveStages] = useState<string[]>(["planner", "coder", "reviewer"]);

const STAGE_ORDER = ["researcher", "planner", "approval", "coder", "reviewer", "deployer"] as const;
const LOCKED_STAGES = new Set(["planner", "coder"]);

const PRESETS: Record<string, { label: string; description: string; stages: string[] }> = {
  simple: {
    label: "Simple",
    description: "Plan, build, review",
    stages: ["planner", "coder", "reviewer"],
  },
  medium: {
    label: "Medium",
    description: "Research, plan, approve, build, review, deploy",
    stages: ["researcher", "planner", "approval", "coder", "reviewer", "deployer"],
  },
  complex: {
    label: "Complex",
    description: "Full pipeline with all stages",
    stages: ["researcher", "planner", "approval", "coder", "reviewer", "deployer"],
  },
};
```

- [ ] **Step 3: Add toggle and preset handlers**

Below the state definitions, add:

```tsx
const handlePresetSelect = (key: string) => {
  setSelectedPreset(key);
  setActiveStages([...PRESETS[key].stages]);
};

const handleToggleStage = (stage: string) => {
  if (LOCKED_STAGES.has(stage)) return;
  setActiveStages((prev) => {
    const next = prev.includes(stage)
      ? prev.filter((s) => s !== stage)
      : [...prev, stage].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
    // Check if this matches a preset
    const matchingPreset = Object.entries(PRESETS).find(
      ([, p]) => JSON.stringify(p.stages) === JSON.stringify(next)
    );
    setSelectedPreset(matchingPreset ? matchingPreset[0] : null);
    return next;
  });
};
```

- [ ] **Step 4: Update resetForm to also reset step/stage state**

```tsx
const resetForm = () => {
  setName("");
  setBrief("");
  setTargetDir("");
  setStep(1);
  setSelectedPreset("simple");
  setActiveStages(["planner", "coder", "reviewer"]);
};
```

- [ ] **Step 5: Update handleSubmit to send stages**

```tsx
const handleSubmit = async () => {
  if (!name.trim() || !brief.trim() || !targetDir.trim()) return;

  const created = await createProject({
    name: name.trim(),
    brief: brief.trim(),
    targetDir: targetDir.trim(),
    stages: activeStages,
  });

  onOpenChange(false);
  resetForm();

  if (created?.id) {
    router.push(`/projects/${created.id}`);
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/new-project-dialog.tsx frontend/src/lib/store.ts
git commit -m "feat: add step state, stage constants, and preset logic to dialog"
```

---

### Task 4: Frontend — Build the two-step dialog UI

**Files:**
- Modify: `frontend/src/components/new-project-dialog.tsx:78-148` (JSX return)

- [ ] **Step 1: Add lucide icons import**

Update the imports at top of file:

```tsx
import { FolderOpen, ChevronRight, ChevronLeft, Lock } from "lucide-react";
```

- [ ] **Step 2: Replace the dialog body JSX**

Replace everything inside `<DialogContent>` (lines 80-146) with:

```tsx
<DialogContent className="max-w-lg">
  <DialogHeader>
    <DialogTitle>
      {step === 1 ? "New Project" : "Pipeline Configuration"}
    </DialogTitle>
    {step === 2 && (
      <p className="text-sm text-muted-foreground">
        Choose a preset or toggle individual stages
      </p>
    )}
  </DialogHeader>

  {step === 1 ? (
    <>
      <div className="space-y-4 mt-2">
        <div className="space-y-1.5">
          <Label htmlFor="proj-name">Name</Label>
          <Input
            id="proj-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My App"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proj-brief">Brief</Label>
          <Textarea
            id="proj-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Describe what you want to build..."
            rows={6}
            className="resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="proj-target">Target Directory</Label>
          <div className="flex gap-2">
            <Input
              id="proj-target"
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder="/Users/san/Desktop/projects/my-app"
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleBrowse}
              disabled={browsing}
              title="Browse for folder"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick an existing folder or type a new path (it will be created)
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" onClick={() => handleOpenChange(false)}>
          Cancel
        </Button>
        <Button
          onClick={() => setStep(2)}
          disabled={!name.trim() || !brief.trim() || !targetDir.trim()}
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </>
  ) : (
    <>
      {/* Preset cards */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => handlePresetSelect(key)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              selectedPreset === key
                ? "border-primary bg-primary/10"
                : "border-border hover:border-muted-foreground/50"
            }`}
          >
            <p className="text-sm font-medium capitalize">{preset.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
          </button>
        ))}
      </div>

      {/* Stage toggles */}
      <div className="space-y-1.5 mt-4">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Stages {!selectedPreset && "(Custom)"}
        </Label>
        <div className="space-y-1">
          {STAGE_ORDER.map((stage) => {
            const isActive = activeStages.includes(stage);
            const isLocked = LOCKED_STAGES.has(stage);
            return (
              <button
                key={stage}
                onClick={() => handleToggleStage(stage)}
                disabled={isLocked}
                className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "border-primary/50 bg-primary/5"
                    : "border-border opacity-50"
                } ${isLocked ? "cursor-not-allowed" : "cursor-pointer hover:border-muted-foreground/50"}`}
              >
                <span className="capitalize">{stage === "coder" ? "Builder" : stage}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isLocked && <Lock className="h-3 w-3" />}
                  {isActive ? "On" : "Off"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview strip */}
      <div className="mt-4 flex items-center gap-1.5 overflow-x-auto py-1">
        {activeStages.map((stage, i) => (
          <div key={stage} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
            <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 border border-primary/20 whitespace-nowrap capitalize">
              {stage === "coder" ? "Builder" : stage}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          Create Project
        </Button>
      </div>
    </>
  )}
</DialogContent>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/new-project-dialog.tsx
git commit -m "feat: two-step project creation dialog with workflow presets and stage toggles"
```

---

### Task 5: Frontend — Update project-flow.tsx to use stored stages

**Files:**
- Modify: `frontend/src/components/project-flow.tsx:58-86` (stage definitions in useMemo)

- [ ] **Step 1: Read stages from project config if available**

Inside the `useMemo` in `ProjectFlow`, replace the `stageDefs` block (lines 68-81) with:

```tsx
    // Use stored stages from config, or fall back to complexity-based defaults
    const configStages = (state as any)?.config?.stages as string[] | undefined;

    const allStageDefs: Record<string, { key: string; label: string }> = {
      researcher: { key: "researcher", label: "Researcher" },
      planner: { key: "planner", label: "Planner" },
      approval: { key: "approval", label: "Approval" },
      coder: { key: "coder", label: "Builder" },
      reviewer: { key: "reviewer", label: "Reviewer" },
      deployer: { key: "deployer", label: "Deployer" },
    };

    let stageDefs: { key: string; label: string }[];
    if (configStages) {
      stageDefs = configStages
        .map((s) => allStageDefs[s])
        .filter(Boolean);
    } else if (isSimple) {
      stageDefs = [
        allStageDefs.planner,
        allStageDefs.coder,
        allStageDefs.reviewer,
      ];
    } else {
      stageDefs = [
        allStageDefs.researcher,
        allStageDefs.planner,
        allStageDefs.approval,
        allStageDefs.coder,
        allStageDefs.reviewer,
        allStageDefs.deployer,
      ];
    }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/project-flow.tsx
git commit -m "feat: project-flow reads stages from config for pipeline visualization"
```

---

### Task 6: Backend — Ensure config with stages is returned in API responses

**Files:**
- Modify: `backend/routes/projects.py:38-70` (get_project endpoint)

- [ ] **Step 1: Verify config is included in project detail response**

Check that the get_project endpoint returns `config` in its response. In `backend/routes/projects.py`, the get_project response should include:

```python
"config": json.loads(project.config) if project.config else {},
```

If `config` is already being returned (check the existing response dict), no change needed. If not, add it to the response dictionary. Also add the import:

```python
import json
```

- [ ] **Step 2: Commit (if changes were needed)**

```bash
git add backend/routes/projects.py
git commit -m "feat: include config in project detail API response"
```
