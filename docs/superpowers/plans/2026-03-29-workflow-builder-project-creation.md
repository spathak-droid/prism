# Workflow Builder for Project Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the toggle-based step 2 of project creation with the full React Flow workflow builder, letting users visually drag-and-drop pipeline stages.

**Architecture:** Add `pendingProject` to zustand store. Dialog step 1 stores pending data and navigates to `/workflows?projectMode=true`. WorkflowBuilder gains a `mode` prop to show pipeline stages instead of agents and "Create Project" instead of "Execute". The workflows page detects `projectMode` and wires up the builder accordingly.

**Tech Stack:** React, Next.js, React Flow, Zustand, Tailwind CSS, shadcn/ui

---

### Task 1: Add pendingProject to zustand store

**Files:**
- Modify: `frontend/src/lib/store.ts:132-141` (ProjectStore interface and implementation)

- [ ] **Step 1: Add pendingProject state and actions to the store interface**

In `frontend/src/lib/store.ts`, update the `ProjectStore` interface (around line 133):

```typescript
interface ProjectStore {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  pendingProject: { name: string; brief: string; targetDir: string } | null
  fetchProjects: () => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: { name: string; brief: string; targetDir: string; stages?: string[] }) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  setPendingProject: (data: { name: string; brief: string; targetDir: string }) => void
  clearPendingProject: () => void
}
```

- [ ] **Step 2: Add the implementation in the store creator**

In the `create<ProjectStore>` call (around line 143), add after `loading: false,`:

```typescript
  pendingProject: null,
```

And add the two new actions (after the existing `deleteProject` action):

```typescript
  setPendingProject: (data) => set({ pendingProject: data }),
  clearPendingProject: () => set({ pendingProject: null }),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/store.ts
git commit -m "feat: add pendingProject state to project store"
```

---

### Task 2: Simplify dialog to step 1 only, navigate to workflow builder

**Files:**
- Modify: `frontend/src/components/new-project-dialog.tsx` (full rewrite to single-step)

- [ ] **Step 1: Rewrite the dialog to remove step 2 entirely**

Replace the entire contents of `frontend/src/components/new-project-dialog.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FolderOpen, ChevronRight } from "lucide-react";
import { useProjectStore } from "@/lib/store";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewProjectDialog({
  open,
  onOpenChange,
}: NewProjectDialogProps) {
  const router = useRouter();
  const { setPendingProject } = useProjectStore();

  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [browsing, setBrowsing] = useState(false);

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      const data = await res.json();
      if (data.path) {
        setTargetDir(data.path);
      }
    } catch {
      // ignore
    } finally {
      setBrowsing(false);
    }
  };

  const handleNext = () => {
    if (!name.trim() || !brief.trim() || !targetDir.trim()) return;
    setPendingProject({
      name: name.trim(),
      brief: brief.trim(),
      targetDir: targetDir.trim(),
    });
    onOpenChange(false);
    resetForm();
    router.push("/workflows?projectMode=true");
  };

  const resetForm = () => {
    setName("");
    setBrief("");
    setTargetDir("");
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

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
            onClick={handleNext}
            disabled={!name.trim() || !brief.trim() || !targetDir.trim()}
          >
            Next — Configure Pipeline
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/new-project-dialog.tsx
git commit -m "feat: simplify dialog to step 1, navigate to workflow builder on Next"
```

---

### Task 3: Add mode prop to WorkflowBuilder component

**Files:**
- Modify: `frontend/src/components/workflow-builder.tsx:73-96` (props interface and component)

This is the largest task. The WorkflowBuilder needs to behave differently in project mode:
- Left sidebar shows 6 fixed pipeline stages (not user agents)
- Each stage can only be added once (disable after adding)
- Top bar shows project name, "Create Project" replaces "Execute", no template selector
- Right sidebar hides task input and working directory
- On mount with no nodes, auto-generate Simple preset (Planner → Builder → Reviewer)

- [ ] **Step 1: Update the props interface**

In `frontend/src/components/workflow-builder.tsx`, update the interface (around line 73):

```typescript
interface WorkflowBuilderProps {
  workflow: WorkflowData | null;
  agents: AgentItem[];
  templates: TemplateItem[];
  onSave: (data: {
    name: string;
    description: string;
    nodes: Node<AgentNodeData>[];
    edges: Edge<ConditionEdgeData>[];
  }) => Promise<void>;
  onExecute: (input: string, cwd?: string) => Promise<void>;
  saving: boolean;
  executing: boolean;
  // Project mode props
  mode?: "workflow" | "project";
  projectName?: string;
  onCreateProject?: (stages: string[]) => Promise<void>;
  creatingProject?: boolean;
}
```

- [ ] **Step 2: Add pipeline stage constants and label-to-key mapping**

After the `edgeTypes` definition (around line 46), add:

```typescript
const PIPELINE_STAGES: AgentItem[] = [
  { id: "stage-researcher", name: "Researcher", role: "researcher", status: "idle" },
  { id: "stage-planner", name: "Planner", role: "planner", status: "idle" },
  { id: "stage-approval", name: "Approval", role: "approval", status: "idle" },
  { id: "stage-builder", name: "Builder", role: "coder", status: "idle" },
  { id: "stage-reviewer", name: "Reviewer", role: "reviewer", status: "idle" },
  { id: "stage-deployer", name: "Deployer", role: "deployer", status: "idle" },
];

const LABEL_TO_STAGE_KEY: Record<string, string> = {
  Researcher: "researcher",
  Planner: "planner",
  Approval: "approval",
  Builder: "coder",
  Reviewer: "reviewer",
  Deployer: "deployer",
};

const DEFAULT_PROJECT_NODES: Node<AgentNodeData>[] = [
  { id: "node-planner", type: "agentNode", position: { x: 80, y: 60 }, data: { agentId: null, label: "Planner", status: "idle" } },
  { id: "node-builder", type: "agentNode", position: { x: 360, y: 60 }, data: { agentId: null, label: "Builder", status: "idle" } },
  { id: "node-reviewer", type: "agentNode", position: { x: 640, y: 60 }, data: { agentId: null, label: "Reviewer", status: "idle" } },
];

const DEFAULT_PROJECT_EDGES: Edge<ConditionEdgeData>[] = [
  { id: "edge-p-b", source: "node-planner", target: "node-builder", type: "conditionEdge", animated: true, data: { condition: "always" } },
  { id: "edge-b-r", source: "node-builder", target: "node-reviewer", type: "conditionEdge", animated: true, data: { condition: "always" } },
];
```

- [ ] **Step 3: Destructure new props and add helper to extract stages**

Update the component destructuring (around line 88):

```typescript
export function WorkflowBuilder({
  workflow,
  agents,
  templates,
  onSave,
  onExecute,
  saving,
  executing,
  mode = "workflow",
  projectName,
  onCreateProject,
  creatingProject = false,
}: WorkflowBuilderProps) {
```

After the existing state declarations (around line 106), add:

```typescript
  const isProjectMode = mode === "project";

  // In project mode, initialize with default nodes if workflow has none
  const initialNodes = isProjectMode && (!workflow?.nodes || workflow.nodes.length === 0)
    ? DEFAULT_PROJECT_NODES
    : (workflow?.nodes || []);
  const initialEdges = isProjectMode && (!workflow?.edges || workflow.edges.length === 0)
    ? DEFAULT_PROJECT_EDGES
    : (workflow?.edges || []);
```

Then update the useNodesState/useEdgesState calls (lines 99-100) to use these:

```typescript
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
```

Add a helper function to extract stages from nodes via topological sort:

```typescript
  const extractStagesFromNodes = useCallback((): string[] => {
    // Build adjacency list from edges
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    for (const node of nodes) {
      adj[node.id] = [];
      inDegree[node.id] = 0;
    }
    for (const edge of edges) {
      if (adj[edge.source]) {
        adj[edge.source].push(edge.target);
        inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
      }
    }
    // Kahn's algorithm
    const queue = Object.keys(inDegree).filter((id) => inDegree[id] === 0);
    const sorted: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sorted.push(nodeId);
      for (const neighbor of (adj[nodeId] || [])) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      }
    }
    // Map node IDs to stage keys
    return sorted
      .map((nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return null;
        const label = (node.data as AgentNodeData).label;
        return LABEL_TO_STAGE_KEY[label] || null;
      })
      .filter((s): s is string => s !== null);
  }, [nodes, edges]);

  const handleCreateProject = useCallback(async () => {
    if (!onCreateProject) return;
    const stages = extractStagesFromNodes();
    if (!stages.includes("planner") || !stages.includes("coder")) {
      toast.error("Pipeline must include Planner and Builder stages.");
      return;
    }
    await onCreateProject(stages);
  }, [onCreateProject, extractStagesFromNodes]);
```

- [ ] **Step 4: Add duplicate detection for project mode sidebar**

After the `handleCreateProject` function, add:

```typescript
  // Track which stages are already on canvas (for project mode)
  const stagesOnCanvas = React.useMemo(() => {
    if (!isProjectMode) return new Set<string>();
    return new Set(
      nodes.map((n) => (n.data as AgentNodeData).label)
    );
  }, [isProjectMode, nodes]);
```

- [ ] **Step 5: Update the left sidebar to show pipeline stages in project mode**

Replace the sidebar `<div>` (lines 228-265) with:

```tsx
<div className="w-56 shrink-0 border-r bg-card p-3 flex flex-col gap-3 overflow-y-auto">
  <div>
    <h3 className="text-sm font-medium mb-2">
      {isProjectMode ? "Pipeline Stages" : "Agents"}
    </h3>
    <p className="text-xs text-muted-foreground mb-2">
      Drag {isProjectMode ? "stages" : "agents"} onto the canvas
    </p>
    <div className="space-y-1.5">
      {isProjectMode ? (
        <>
          {PIPELINE_STAGES.map((stage) => {
            const alreadyAdded = stagesOnCanvas.has(stage.name);
            return (
              <div
                key={stage.id}
                draggable={!alreadyAdded}
                onDragStart={(e) => {
                  if (alreadyAdded) return;
                  e.dataTransfer.setData(
                    "application/agentforge-agent",
                    JSON.stringify(stage)
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
                className={`flex items-center gap-2 rounded-md border bg-background p-2 transition-colors ${
                  alreadyAdded
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-grab active:cursor-grabbing hover:bg-accent/50"
                }`}
              >
                <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{stage.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{stage.role}</div>
                </div>
                {alreadyAdded && (
                  <span className="ml-auto text-[10px] text-muted-foreground">Added</span>
                )}
              </div>
            );
          })}
        </>
      ) : (
        <>
          {agents.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No agents available. Create agents first.
            </p>
          )}
          {agents.map((agent) => (
            <div
              key={agent.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  "application/agentforge-agent",
                  JSON.stringify(agent)
                );
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex items-center gap-2 rounded-md border bg-background p-2 cursor-grab active:cursor-grabbing hover:bg-accent/50 transition-colors"
            >
              <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{agent.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{agent.role}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  </div>

  {/* Edge Editor — same for both modes */}
  {selectedEdge && selectedEdgeData && (
    <div className="border-t pt-3">
      <h3 className="text-sm font-medium mb-2">Edge Condition</h3>
      <Select
        value={(selectedEdgeData.data as ConditionEdgeData | undefined)?.condition || "always"}
        onValueChange={(val) =>
          updateEdgeCondition(val as "always" | "approve" | "reject")
        }
      >
        <SelectTrigger className="text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="always">Always</SelectItem>
          <SelectItem value="approve">Approve</SelectItem>
          <SelectItem value="reject">Reject</SelectItem>
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-2 text-xs text-destructive"
        onClick={deleteSelectedEdge}
      >
        <Trash2 className="h-3 w-3 mr-1" />
        Delete Edge
      </Button>
    </div>
  )}
</div>
```

- [ ] **Step 6: Update the top bar for project mode**

Replace the top bar `<div>` (lines 300-352) with:

```tsx
<div className="flex items-center gap-3 border-b bg-card px-4 py-2">
  {isProjectMode ? (
    <div className="text-sm font-medium">{projectName || "New Project"} — Pipeline</div>
  ) : (
    <Input
      value={workflowName}
      onChange={(e) => setWorkflowName(e.target.value)}
      className="max-w-[250px] h-8 text-sm"
      placeholder="Workflow name"
    />
  )}

  {!isProjectMode && templates.length > 0 && (
    <Select onValueChange={loadTemplate}>
      <SelectTrigger className="w-[180px] h-8 text-xs">
        <FileDown className="h-3.5 w-3.5 mr-1.5" />
        <SelectValue placeholder="Load template..." />
      </SelectTrigger>
      <SelectContent>
        {templates.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )}

  <div className="flex-1" />

  {isProjectMode ? (
    <Button
      size="sm"
      onClick={handleCreateProject}
      disabled={creatingProject || nodes.length === 0}
    >
      {creatingProject ? "Creating..." : "Create Project"}
    </Button>
  ) : (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSave}
        disabled={saving}
      >
        <Save className="h-3.5 w-3.5 mr-1.5" />
        {saving ? "Saving..." : "Save"}
      </Button>
      <Button
        size="sm"
        onClick={async () => {
          if (!taskInput.trim()) {
            toast.error("Enter a task description before executing.");
            return;
          }
          await handleSave();
          await onExecute(taskInput.trim(), workingDir.trim() || undefined);
        }}
        disabled={executing || saving || nodes.length === 0}
      >
        <Play className="h-3.5 w-3.5 mr-1.5" />
        {executing ? "Starting..." : "Execute"}
      </Button>
    </>
  )}
</div>
```

- [ ] **Step 7: Hide right sidebar in project mode**

Wrap the right sidebar `<div>` (lines 399-582) with a condition:

```tsx
{!isProjectMode && (
  <div className="w-64 shrink-0 border-l bg-card p-3 flex flex-col gap-4 overflow-y-auto">
    {/* ... entire existing right sidebar content unchanged ... */}
  </div>
)}
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/workflow-builder.tsx
git commit -m "feat: add project mode to WorkflowBuilder with pipeline stages"
```

---

### Task 4: Wire up workflows page for project mode

**Files:**
- Modify: `frontend/src/app/(dashboard)/workflows/page.tsx:35-196` (WorkflowsPage component)

- [ ] **Step 1: Import project store and detect project mode**

At the top of `frontend/src/app/(dashboard)/workflows/page.tsx`, add imports:

```typescript
import { useSearchParams } from "next/navigation";
import { useProjectStore } from "@/lib/store";
```

Inside `WorkflowsPage` (after line 36), add:

```typescript
  const searchParams = useSearchParams();
  const isProjectMode = searchParams.get("projectMode") === "true";
  const { pendingProject, createProject, clearPendingProject } = useProjectStore();
```

- [ ] **Step 2: Auto-enter builder mode when in project mode**

Add a `useEffect` after the existing `useEffect` (after line 73):

```typescript
  useEffect(() => {
    if (isProjectMode && pendingProject) {
      // Auto-show builder in project mode without creating a workflow
      setShowBuilder(true);
    }
  }, [isProjectMode, pendingProject]);
```

- [ ] **Step 3: Add the onCreateProject handler**

After the existing `handleExecute` callback (after line 159), add:

```typescript
  const handleCreateProject = useCallback(async (stages: string[]) => {
    if (!pendingProject) return;
    try {
      const project = await createProject({
        name: pendingProject.name,
        brief: pendingProject.brief,
        targetDir: pendingProject.targetDir,
        stages,
      });
      clearPendingProject();
      if (project?.id) {
        router.push(`/projects/${project.id}`);
      }
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  }, [pendingProject, createProject, clearPendingProject, router]);
```

- [ ] **Step 4: Update the builder rendering to pass project mode props**

In the builder mode section (around line 162-196), update the `WorkflowBuilder` usage:

```tsx
  if (showBuilder) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-card">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowBuilder(false);
              if (isProjectMode) {
                clearPendingProject();
                router.push("/projects");
              }
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {isProjectMode ? "Cancel" : "Back to Workflows"}
          </Button>
        </div>
        <div className="flex-1">
          <ReactFlowProvider>
            <WorkflowBuilder
              workflow={isProjectMode ? null : editingWorkflow}
              agents={agents}
              templates={isProjectMode ? [] : templates.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                nodes: t.nodes,
                edges: t.edges,
              }))}
              onSave={handleSave}
              onExecute={handleExecute}
              saving={saving}
              executing={executing}
              mode={isProjectMode ? "project" : "workflow"}
              projectName={pendingProject?.name}
              onCreateProject={handleCreateProject}
            />
          </ReactFlowProvider>
        </div>
      </div>
    );
  }
```

- [ ] **Step 5: Guard the list view against project mode without pending data**

Before the list mode return (around line 198), add:

```typescript
  // If projectMode but no pending data, redirect to projects
  if (isProjectMode && !pendingProject) {
    router.push("/projects");
    return null;
  }
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/(dashboard)/workflows/page.tsx
git commit -m "feat: wire up workflows page for project mode pipeline configuration"
```
