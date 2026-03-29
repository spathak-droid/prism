"use client";

import React, { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import { AgentNode, type AgentNodeData } from "@/components/workflow-node";
import { ConditionEdge, type ConditionEdgeData } from "@/components/workflow-edge";

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { conditionEdge: ConditionEdge };

interface TicketData {
  id: string;
  title: string;
}

interface TicketResult {
  coder?: { status?: string; files_changed?: { path: string; action: string; lines?: number }[]; git_commit?: string };
  reviewer?: { verdict?: string; cycle?: number; summary?: string };
}

interface PipelinePhase {
  status: string;
}

interface ProjectState {
  pipeline?: { phases?: Record<string, PipelinePhase> };
  results?: Record<string, TicketResult>;
  plan?: { tickets?: TicketData[] };
}

interface ProjectAgent {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface ProjectFlowProps {
  complexity: string;
  agents: ProjectAgent[];
  state: ProjectState | null;
  projectStatus: string;
}

function toNodeStatus(phase?: PipelinePhase): AgentNodeData["status"] {
  if (!phase) return "idle";
  if (phase.status === "completed" || phase.status === "skipped") return "completed";
  if (phase.status === "in_progress") return "running";
  return "idle";
}

export default function ProjectFlow({ complexity, agents, state, projectStatus }: ProjectFlowProps) {
  const { nodes, edges, tickets, results } = useMemo(() => {
    const phases = state?.pipeline?.phases || {};
    const tix: TicketData[] = state?.plan?.tickets || [];
    const res: Record<string, TicketResult> = (state?.results || {}) as Record<string, TicketResult>;
    const isSimple = complexity === "simple";

    const flowNodes: Node<AgentNodeData>[] = [];
    const flowEdges: Edge<ConditionEdgeData>[] = [];

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

    const activeStages = stageDefs.filter((s) => {
      const p = phases[s.key];
      return !p || p.status !== "skipped";
    });

    // Layout: centered horizontal row
    const xGap = 280;
    const totalWidth = (activeStages.length - 1) * xGap;
    const xStart = 80;
    const stageY = 60;

    activeStages.forEach((stage, i) => {
      const phase = phases[stage.key];
      const agent = agents.find((a) => a.role === stage.key);

      let label = stage.label;
      if (stage.key === "coder" && tix.length > 0) {
        const coded = Object.values(res).filter((r) => r.coder?.status === "completed").length;
        label = `${stage.label} — ${coded}/${tix.length} done`;
      }
      if (stage.key === "reviewer" && tix.length > 0) {
        const passed = Object.values(res).filter((r) => r.reviewer?.verdict === "pass").length;
        label = `${stage.label} — ${passed}/${tix.length} passed`;
      }

      flowNodes.push({
        id: stage.key,
        type: "agentNode",
        position: { x: xStart + i * xGap, y: stageY },
        data: { agentId: agent?.id || null, label, status: toNodeStatus(phase) },
      });
    });

    // Edges between consecutive stages
    for (let i = 0; i < activeStages.length - 1; i++) {
      flowEdges.push({
        id: `e-${activeStages[i].key}-${activeStages[i + 1].key}`,
        source: activeStages[i].key,
        target: activeStages[i + 1].key,
        type: "conditionEdge",
        animated: true,
        data: { condition: "always" },
      });
    }

    // Retry edge if applicable
    if (activeStages.some((s) => s.key === "reviewer") && activeStages.some((s) => s.key === "coder")) {
      const hadRetries = Object.values(res).some((r) => (r.reviewer?.cycle || 0) > 1);
      if (hadRetries || tix.length > 1) {
        flowEdges.push({
          id: "e-retry",
          source: "reviewer",
          target: "coder",
          type: "conditionEdge",
          animated: false,
          data: { condition: "reject" },
        });
      }
    }

    return { nodes: flowNodes, edges: flowEdges, tickets: tix, results: res };
  }, [complexity, agents, state, projectStatus]);

  return (
    <div className="h-full w-full flex flex-col">
      {/* React Flow for pipeline stages */}
      <div className="h-1/2 w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={true}
          zoomOnScroll={false}
          className="bg-background"
        >
          <Background gap={16} size={1} />
        </ReactFlow>
      </div>

      {/* Tickets table */}
      {tickets.length > 0 && (
        <div className="h-1/2 overflow-auto border-t border-border">
          <div className="px-4 pt-5 pb-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
              Tickets ({tickets.length})
            </p>
            <div className="space-y-2">
              {tickets.map((ticket) => {
                const result = results[ticket.id];
                const coderDone = result?.coder?.status === "completed";
                const verdict = result?.reviewer?.verdict;
                const cycle = result?.reviewer?.cycle || 0;
                const filesChanged = result?.coder?.files_changed || [];
                const commit = result?.coder?.git_commit;

                let statusIcon = "○";
                let statusColor = "text-muted-foreground";
                let statusLabel = "Pending";
                if (verdict === "pass") {
                  statusIcon = "✓";
                  statusColor = "text-green-400";
                  statusLabel = "Passed";
                } else if (verdict === "fail") {
                  statusIcon = "✗";
                  statusColor = "text-red-400";
                  statusLabel = "Failed";
                } else if (coderDone) {
                  statusIcon = "⟳";
                  statusColor = "text-blue-400";
                  statusLabel = "In Review";
                }

                return (
                  <div
                    key={ticket.id}
                    className="rounded-lg border border-border bg-card/50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-lg font-mono ${statusColor}`}>{statusIcon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            <span className="text-muted-foreground font-mono">{ticket.id}</span>
                            {" "}
                            {ticket.title}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className={statusColor}>{statusLabel}</span>
                            {cycle > 0 && (
                              <span>Review cycle {cycle}</span>
                            )}
                            {filesChanged.length > 0 && (
                              <span>{filesChanged.length} file{filesChanged.length !== 1 ? "s" : ""} changed</span>
                            )}
                            {commit && (
                              <span className="font-mono">{commit.slice(0, 7)}</span>
                            )}
                          </div>
                          {filesChanged.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {filesChanged.map((f) => (
                                <span
                                  key={f.path}
                                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                    f.action === "created"
                                      ? "text-green-400 border-green-800/30 bg-green-950/20"
                                      : f.action === "modified"
                                      ? "text-amber-400 border-amber-800/30 bg-amber-950/20"
                                      : "text-red-400 border-red-800/30 bg-red-950/20"
                                  }`}
                                >
                                  {f.action === "created" ? "+" : f.action === "modified" ? "~" : "-"} {f.path}
                                  {f.lines ? ` (${f.lines}L)` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                          {result?.reviewer?.summary && verdict === "pass" && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground/70 line-clamp-2">
                              {result.reviewer.summary}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
