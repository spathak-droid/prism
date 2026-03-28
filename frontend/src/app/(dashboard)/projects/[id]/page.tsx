"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectPipeline, {
  PIPELINE_ICONS,
  type PipelineStep,
  type PipelineStepStatus,
} from "@/components/project-pipeline";
import AgentLogPanel from "@/components/agent-log-panel";
import ApprovalBanner from "@/components/approval-banner";
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

function derivePipelineSteps(status: string, complexity: string): PipelineStep[] {
  const isSimple = complexity !== "large";

  const allSteps: Array<{ label: string; iconKey: string }> = isSimple
    ? [
        { label: "Planner", iconKey: "Planner" },
        { label: "Builder", iconKey: "Builder" },
        { label: "Reviewer", iconKey: "Reviewer" },
      ]
    : [
        { label: "Researcher", iconKey: "Researcher" },
        { label: "Planner", iconKey: "Planner" },
        { label: "Plan Approval", iconKey: "Plan Approval" },
        { label: "Builder", iconKey: "Builder" },
        { label: "Reviewer", iconKey: "Reviewer" },
      ];

  const statusMap: Record<string, PipelineStepStatus[]> = isSimple
    ? {
        planning: ["running", "pending", "pending"],
        "resuming:planning": ["running", "pending", "pending"],
        building: ["complete", "running", "pending"],
        "resuming:building": ["complete", "running", "pending"],
        reviewing: ["complete", "complete", "running"],
        complete: ["complete", "complete", "complete"],
        completed: ["complete", "complete", "complete"],
        failed: ["failed", "failed", "failed"],
      }
    : {
        planning: ["running", "pending", "pending", "pending", "pending"],
        "resuming:planning": ["running", "pending", "pending", "pending", "pending"],
        approved: ["complete", "running", "pending", "pending", "pending"],
        awaiting_approval: ["complete", "complete", "paused", "pending", "pending"],
        "resuming:awaiting_approval": ["complete", "complete", "paused", "pending", "pending"],
        building: ["complete", "complete", "complete", "running", "pending"],
        "resuming:building": ["complete", "complete", "complete", "running", "pending"],
        reviewing: ["complete", "complete", "complete", "complete", "running"],
        complete: ["complete", "complete", "complete", "complete", "complete"],
        completed: ["complete", "complete", "complete", "complete", "complete"],
        failed: ["failed", "failed", "failed", "failed", "failed"],
      };

  const defaultStatuses = allSteps.map(() => "pending" as PipelineStepStatus);
  const statuses: PipelineStepStatus[] = statusMap[status] ?? defaultStatuses;

  return allSteps.map((step, i) => ({
    label: step.label,
    icon: PIPELINE_ICONS[step.label] ?? PIPELINE_ICONS["Researcher"],
    status: statuses[i],
  }));
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

  const pendingApproval = project?.approvalGates.find(
    (g) => g.status === "pending"
  );

  const pipelineSteps = project
    ? derivePipelineSteps(project.status, project.complexity || "medium")
    : [];

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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
            Pipeline
          </p>
          <ProjectPipeline steps={pipelineSteps} />
        </div>

        {/* Agent selector */}
        {project.agents.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
              Agents
            </p>
            <div className="space-y-1">
              {project.agents.map((agent) => (
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
  );
}
