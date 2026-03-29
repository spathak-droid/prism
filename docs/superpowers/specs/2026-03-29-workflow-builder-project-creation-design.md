# Workflow Builder for Project Creation

## Problem
The toggle-based pipeline configuration in step 2 of project creation doesn't feel interactive enough. Users want a visual drag-and-drop experience to configure their pipeline before starting a project.

## Solution
Reuse the existing WorkflowBuilder component (React Flow canvas with drag-and-drop) as step 2 of project creation. After filling project details, the user is redirected to the workflow builder in "project mode" where they visually configure the pipeline, then click "Create Project."

## Flow

1. Step 1 dialog: name, brief, targetDir → "Next"
2. Dialog stores pending project data in zustand, closes, navigates to `/workflows/new?projectMode=true`
3. Workflow builder opens in project mode:
   - Canvas pre-populated with Simple preset (Planner → Builder → Reviewer) connected horizontally
   - Left sidebar shows 6 fixed pipeline stages (not user agents) as draggable items
   - Top bar shows project name, "Create Project" button (replaces Execute)
   - Right sidebar hides task input and working directory (not relevant)
4. User drags/drops/connects/removes stages
5. "Create Project" extracts stages from nodes via topological sort, calls `POST /api/projects` with stages array
6. Navigates to `/projects/{id}`
7. "Cancel" clears pending data, navigates to `/projects`

## Store Changes

Add to `useProjectStore` in `frontend/src/lib/store.ts`:

```typescript
pendingProject: { name: string; brief: string; targetDir: string } | null
setPendingProject: (data: { name: string; brief: string; targetDir: string }) => void
clearPendingProject: () => void
```

## WorkflowBuilder Component Changes

Add a `mode` prop: `"workflow" | "project"` (default `"workflow"`).

When `mode === "project"`:
- **Left sidebar**: Show 6 fixed pipeline stages instead of user agents. Each stage can only be added once (grey out after adding).
- **Top bar**: Show project name (read-only). Replace "Execute" with "Create Project". Hide template selector.
- **Right sidebar**: Hide task input and working directory sections.
- **Canvas**: On mount, if no nodes, auto-generate Simple preset nodes with edges.

When `mode === "workflow"`: Everything works exactly as it does today. No changes.

## Pipeline Stages (draggable items in project mode)

| Label | Stage Key | Description |
|-------|-----------|-------------|
| Researcher | researcher | Research and context gathering |
| Planner | planner | Plan generation and ticket creation |
| Approval | approval | Manual approval gate |
| Builder | coder | Code implementation |
| Reviewer | reviewer | Code review with retry loop |
| Deployer | deployer | Deployment steps |

## Extracting Stages from Nodes

On "Create Project" click:
1. Read all nodes from the canvas
2. Map node labels to stage keys (e.g., "Builder" → "coder")
3. Topological sort based on edges to determine execution order
4. Validate: planner and coder must be present
5. Send as `stages` array to `POST /api/projects`

## Workflow Page Changes

`frontend/src/app/(dashboard)/workflows/[id]/page.tsx`:
- Read `projectMode` from URL search params
- If `projectMode=true`, read `pendingProject` from store
- Pass `mode="project"` to WorkflowBuilder
- Handle `onCreateProject` callback instead of `onExecute`

## What Stays Untouched

- WorkflowBuilder core: drag, drop, connect, delete, edge editing — all reused as-is
- Non-project workflow builder usage — completely unchanged
- Backend `stages` API — reused directly
- No new database tables or models
- No new API endpoints

## Constraints

- Each pipeline stage can only appear once on the canvas
- Planner and Builder (coder) are required — validate before creating
- Stage order determined by edge connections (topological sort), not position
- If user navigates away without creating, pending project data is cleared
