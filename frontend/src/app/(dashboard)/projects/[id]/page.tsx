"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Square, Trash2 } from "lucide-react";
import { ReactFlowProvider } from "reactflow";
import { Button } from "@/components/ui/button";
import ProjectPipeline, {
  PIPELINE_ICONS,
  type PipelineStep,
  type PipelineStepStatus,
} from "@/components/project-pipeline";
import dynamic from "next/dynamic";
import AgentLogPanel from "@/components/agent-log-panel";
import ApprovalBanner from "@/components/approval-banner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";

const ProjectFlow = dynamic(() => import("@/components/project-flow"), { ssr: false });
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectAgent {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface ApprovalGate {
  id: string;
  type: string;
  status: string;
  payload: { summary?: string; filesToReview?: string[] };
}

interface PipelinePhase {
  status: string;
  reason?: string | null;
  started_at?: string;
  completed_at?: string;
}

interface ProjectState {
  pipeline?: {
    current_phase?: string;
    phases?: Record<string, PipelinePhase>;
  };
  plan?: unknown;
  research?: unknown;
}

interface ProjectDetail {
  id: string;
  name: string;
  status: string;
  brief: string;
  targetDir: string;
  complexity: string;
  config: Record<string, unknown>;
  agents: ProjectAgent[];
  approvalGates: ApprovalGate[];
  state: ProjectState | null;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const statusConfig: Record<string, { dot: string; label: string }> = {
  planning: { dot: "bg-blue-500", label: "Planning" },
  "resuming:research": { dot: "bg-blue-500", label: "Resuming..." },
  "resuming:planning": { dot: "bg-blue-500", label: "Resuming..." },
  "resuming:building": { dot: "bg-purple-500", label: "Resuming..." },
  "resuming:awaiting_approval": { dot: "bg-amber-500", label: "Awaiting Approval" },
  approved: { dot: "bg-amber-500", label: "Approved" },
  building: { dot: "bg-purple-500", label: "Building" },
  reviewing: { dot: "bg-orange-500", label: "Reviewing" },
  complete: { dot: "bg-green-500", label: "Complete" },
  completed: { dot: "bg-green-500", label: "Complete" },
  failed: { dot: "bg-red-500", label: "Failed" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { dot: "bg-muted-foreground", label: status };
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 rounded-full", cfg.dot)} />
      <span className="text-xs text-muted-foreground capitalize">{cfg.label}</span>
    </div>
  );
}

// ─── Pipeline derivation ──────────────────────────────────────────────────────

function derivePipelineSteps(project: ProjectDetail): PipelineStep[] {
  const phases = project.state?.pipeline?.phases;

  // Define which steps to show based on complexity
  const isSimple = project.complexity === "simple";
  const stepDefs: Array<{ label: string; iconKey: string; phaseKey: string }> = isSimple
    ? [
        { label: "Planner", iconKey: "Planner", phaseKey: "planner" },
        { label: "Builder", iconKey: "Builder", phaseKey: "coder" },
        { label: "Reviewer", iconKey: "Reviewer", phaseKey: "reviewer" },
      ]
    : [
        { label: "Researcher", iconKey: "Researcher", phaseKey: "researcher" },
        { label: "Planner", iconKey: "Planner", phaseKey: "planner" },
        { label: "Plan Approval", iconKey: "Plan Approval", phaseKey: "approval" },
        { label: "Builder", iconKey: "Builder", phaseKey: "coder" },
        { label: "Reviewer", iconKey: "Reviewer", phaseKey: "reviewer" },
      ];

  return stepDefs.map((step) => {
    const phase = phases?.[step.phaseKey];
    let stepStatus: PipelineStepStatus = "pending";

    if (phase) {
      if (phase.status === "completed") stepStatus = "complete";
      else if (phase.status === "in_progress") stepStatus = "running";
      else if (phase.status === "skipped") stepStatus = "complete";
      else if (phase.status === "pending") stepStatus = "pending";
    }

    // If project failed and this phase was pending, leave as pending
    if (project.status === "failed" && stepStatus === "running") {
      stepStatus = "failed";
    }

    return {
      label: step.label,
      icon: PIPELINE_ICONS[step.iconKey] ?? PIPELINE_ICONS["Researcher"],
      status: stepStatus,
    };
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const data: ProjectDetail = await res.json();
      setProject(data);

      // Auto-select the running agent, or first agent if none running
      setSelectedAgentId((prev) => {
        if (!prev && data.agents.length > 0) {
          const running = data.agents.find((a: ProjectAgent) => a.status === "running");
          return running ? running.id : data.agents[0].id;
        }
        // If currently selected agent is idle, switch to a running one
        if (prev && data.agents.length > 0) {
          const current = data.agents.find((a: ProjectAgent) => a.id === prev);
          if (current && current.status === "idle") {
            const running = data.agents.find((a: ProjectAgent) => a.status === "running");
            if (running) return running.id;
          }
        }
        return prev;
      });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    const interval = setInterval(fetchProject, 5000);
    return () => clearInterval(interval);
  }, [fetchProject]);

  const [retrying, setRetrying] = useState(false);
  const [stopping, setStopping] = useState(false);

  const handleRetry = useCallback(async () => {
    if (!project) return;
    setRetrying(true);
    try {
      await fetch(`/api/projects/${projectId}/resume`, { method: "POST" });
      await fetchProject();
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  }, [project, projectId, fetchProject]);

  const handleStop = useCallback(async () => {
    if (!project) return;
    setStopping(true);
    try {
      await fetch(`/api/projects/${projectId}/stop`, { method: "POST" });
      await fetchProject();
    } catch {
      // ignore
    } finally {
      setStopping(false);
    }
  }, [project, projectId, fetchProject]);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!project) return;
    try {
      await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      router.push("/projects");
    } catch {
      // ignore
    }
  }, [project, projectId, router]);

  const pendingApproval = project?.approvalGates.find(
    (g) => g.status === "pending"
  );

  // Check if approval is pending via state (even if no approval gate in DB)
  const approvalPendingViaState =
    project?.state?.pipeline?.phases?.approval?.status === "pending";
  const needsApproval = !!pendingApproval || approvalPendingViaState;
  const hasPlan = !!project?.state?.plan;

  const [showPlan, setShowPlan] = useState(false);

  const pipelineSteps = project ? derivePipelineSteps(project) : [];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-muted-foreground">
        <p>Project not found.</p>
        <Button variant="outline" onClick={() => router.push("/projects")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <>
    <ReactFlowProvider>
    <div className="flex h-full overflow-hidden">
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-4">
        {/* Back */}
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-1 text-muted-foreground"
          onClick={() => router.push("/projects")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Projects
        </Button>

        {/* Project info card */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <h2 className="font-semibold text-sm leading-snug">{project.name}</h2>
          <div className="flex items-center gap-2">
            <StatusBadge status={project.status} />
            {["planning", "building", "reviewing"].includes(project.status) && (
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={handleStop}
                disabled={stopping}
              >
                <Square className="mr-1 h-3 w-3" />
                {stopping ? "Stopping..." : "Stop"}
              </Button>
            )}
            {project.status === "failed" && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={handleRetry}
                disabled={retrying}
              >
                <RotateCcw className={cn("mr-1 h-3 w-3", retrying && "animate-spin")} />
                {retrying ? "Retrying..." : "Retry"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {project.brief && (
            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
              {project.brief}
            </p>
          )}
          {project.targetDir && (
            <p className="font-mono text-[11px] text-muted-foreground/70 truncate">
              {project.targetDir}
            </p>
          )}
        </div>

        {/* Pipeline */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Pipeline
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] w-[90vw] h-[80vh] p-0">
                <DialogTitle className="sr-only">Pipeline Flow</DialogTitle>
                <div className="h-full w-full">
                  <ProjectFlow
                    complexity={project.complexity}
                    agents={project.agents}
                    state={project.state}
                    projectStatus={project.status}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <ProjectPipeline steps={pipelineSteps} />
        </div>

        {/* Agent selector */}
        {project.agents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
              Agents
            </p>
            <div className="space-y-1">
              {[...project.agents].sort((a, b) => {
                const order: Record<string, number> = { researcher: 0, planner: 1, coder: 2, reviewer: 3, deployer: 4 };
                return (order[a.role] ?? 99) - (order[b.role] ?? 99);
              }).map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    selectedAgentId === agent.id
                      ? "border-border bg-accent text-accent-foreground"
                      : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <div className="font-medium text-xs">
                    {agent.name || agent.role}
                  </div>
                  <div className="text-[11px] text-muted-foreground capitalize">
                    {agent.role} &middot; {agent.status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Approval banner */}
        {pendingApproval && (
          <div className="shrink-0 p-4 border-b border-border">
            <ApprovalBanner
              approvalId={pendingApproval.id}
              type={pendingApproval.type}
              summary={
                pendingApproval.payload.summary ??
                "Review and approve to continue."
              }
              filesToReview={pendingApproval.payload.filesToReview}
              onResolve={fetchProject}
            />
          </div>
        )}

        {/* State-based approval (no gate in DB but state says pending) */}
        {!pendingApproval && approvalPendingViaState && (
          <div className="shrink-0 p-4 border-b border-border">
            <div className="rounded-lg border-2 border-amber-500/60 bg-amber-950/10 p-4 space-y-3">
              <div className="space-y-1">
                <h3 className="font-semibold text-amber-400 text-sm">Plan Approval Required</h3>
                <p className="text-sm text-foreground/90">
                  Review the plan below and approve to start building.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={async () => {
                    await fetch(`/api/projects/${projectId}/approve`, { method: "POST" });
                    await fetchProject();
                  }}
                >
                  Approve Plan
                </Button>
                {!showPlan && hasPlan && (
                  <Button size="sm" variant="outline" onClick={() => setShowPlan(true)}>
                    View Plan
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Plan viewer - show when toggled or when approval pending */}
        {hasPlan && (showPlan || needsApproval) && (
          <div className="shrink-0 border-b border-border overflow-y-auto max-h-[50%]">
            <div className="p-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Plan
                  </h4>
                  {!needsApproval && (
                    <button
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPlan(false)}
                    >
                      Hide
                    </button>
                  )}
                </div>
                <pre className="text-xs text-foreground/90 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[40vh] overflow-y-auto">
                  {typeof project.state?.plan === "string"
                    ? project.state.plan
                    : JSON.stringify(project.state?.plan, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* View plan button when not in approval mode */}
        {hasPlan && !needsApproval && !showPlan && (
          <div className="shrink-0 px-4 pt-3">
            <Button size="sm" variant="outline" onClick={() => setShowPlan(true)}>
              View Plan
            </Button>
          </div>
        )}

        {/* Agent logs */}
        <div className="flex-1 overflow-hidden">
          {selectedAgentId ? (
            <AgentLogPanel agentId={selectedAgentId} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select an agent to view logs.
            </div>
          )}
        </div>
      </main>
    </div>
    </ReactFlowProvider>

    <ConfirmDialog
      open={deleteOpen}
      onOpenChange={setDeleteOpen}
      title="Delete project"
      description={`Delete "${project?.name}"? This cannot be undone.`}
      onConfirm={handleDelete}
    />
    </>
  );
}
