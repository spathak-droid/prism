"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { ReactFlowProvider } from "reactflow";

import { AgentNode, ApprovalGateNode, type AgentNodeData } from "@/components/workflow-node";
import { ConditionEdge, type ConditionEdgeData } from "@/components/workflow-edge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Play, RefreshCw, Square, Terminal, ChevronDown, ChevronUp, Wrench, MessageSquare, AlertCircle, CheckCircle2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
  approvalGate: ApprovalGateNode,
};

const edgeTypes: EdgeTypes = {
  conditionEdge: ConditionEdge,
};

interface WorkflowData {
  id: string;
  name: string;
  description: string;
  nodes: Node<AgentNodeData>[];
  edges: Edge<ConditionEdgeData>[];
  status: string;
  lastExecutionId?: string;
}

interface ExecutionData {
  id: string;
  workflowId: string;
  status: string;
  context: {
    nodeResults: Record<string, string>;
    currentNode: string | null;
    iterationCounts: Record<string, number>;
    status: string;
    error?: string;
  };
  startedAt: string;
  completedAt: string | null;
}

function WorkflowDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const workflowId = params.id as string;
  const executionIdParam = searchParams.get("execution");

  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);
  const [execution, setExecution] = useState<ExecutionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [selectedResult, setSelectedResult] = useState<{ label: string; content: string } | null>(null);
  const [dismissedExecutionId, setDismissedExecutionId] = useState<string | null>(null);
  const [activityLog, setActivityLog] = useState<Array<{ id: number; time: string; type: string; icon: string; content: string }>>([]);
  const [showLog, setShowLog] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logCounterRef = useRef(0);
  const executionRef = useRef<ExecutionData | null>(null);
  const { fitView } = useReactFlow();

  // Keep ref in sync so cleanup can access latest value
  useEffect(() => {
    executionRef.current = execution;
  }, [execution]);

  // Workflows keep running on the backend even if you navigate away.
  // Only stop on explicit tab close / browser exit (not page navigation).
  useEffect(() => {
    const handleBeforeUnload = () => {
      const exec = executionRef.current;
      if (exec && exec.status === "running") {
        navigator.sendBeacon(`/api/workflows/executions/${exec.id}/stop`);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const fetchWorkflow = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: WorkflowData = await res.json();
      setWorkflow(data);
      // Auto-reconnect to last execution if we don't have one yet
      if (data.lastExecutionId && !execution && !executionIdParam) {
        fetchExecution(data.lastExecutionId);
      }
    } catch (err) {
      console.error("Failed to fetch workflow:", err);
    }
  }, [workflowId]);

  const fetchExecution = useCallback(
    async (execId: string) => {
      try {
        const res = await fetch(`/api/workflows/executions/${execId}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data: ExecutionData = await res.json();
        setExecution(data);
        return data;
      } catch (err) {
        console.error("Failed to fetch execution:", err);
        return null;
      }
    },
    []
  );

  useEffect(() => {
    fetchWorkflow().finally(() => setLoading(false));
  }, [fetchWorkflow]);

  // Poll workflow to pick up new executions (e.g. triggered from Telegram)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflows/${workflowId}`);
        if (!res.ok) return;
        const data: WorkflowData = await res.json();
        setWorkflow(data);
        // If there's a new execution we don't know about (and not dismissed), start tracking it
        if (data.lastExecutionId && data.lastExecutionId !== dismissedExecutionId && (!execution || execution.id !== data.lastExecutionId)) {
          fetchExecution(data.lastExecutionId);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [workflowId, execution, fetchExecution, dismissedExecutionId]);

  // Poll execution status — works for both URL param and auto-reconnected executions
  const activeExecutionId = executionIdParam || execution?.id;
  useEffect(() => {
    if (!activeExecutionId) return;

    // Only fetch if we don't already have it loaded
    if (!execution || execution.id !== activeExecutionId) {
      fetchExecution(activeExecutionId);
    }

    const interval = setInterval(async () => {
      const data = await fetchExecution(activeExecutionId);
      if (data && data.status !== "running") {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeExecutionId, fetchExecution]);


  // Update node statuses based on execution context
  const displayNodes = React.useMemo(() => {
    if (!workflow) return [];
    if (!execution) return workflow.nodes;

    return workflow.nodes.map((node) => {
      const ctx = execution.context || {};
      const nodeResults = ctx.nodeResults || {};
      let nodeStatus: "idle" | "running" | "completed" | "error" = "idle";

      if (nodeResults[node.id]) {
        nodeStatus = "completed";
      }
      if (ctx.currentNode === node.id && execution.status === "running") {
        nodeStatus = "running";
      }
      if (execution.status === "failed" && ctx.currentNode === node.id) {
        nodeStatus = "error";
      }

      return {
        ...node,
        data: { ...node.data, status: nodeStatus },
      };
    });
  }, [workflow, execution]);

  // Load past events when viewing a completed/running execution
  useEffect(() => {
    if (!execution) return;
    fetch(`/api/workflows/executions/${execution.id}/events`)
      .then((r) => r.ok ? r.json() : [])
      .then((events: Array<Record<string, string>>) => {
        const entries = events
          .filter((ev) => ev.type !== "heartbeat")
          .map((ev) => {
            const id = ++logCounterRef.current;
            const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : "";
            let icon = "info";
            let content = "";
            if (ev.type === "agent:text") {
              icon = "message";
              const meta = (ev.meta || {}) as Record<string, string>;
              const label = meta.node_label || "";
              content = `[${label}] ${(ev.content || "").slice(0, 250)}`;
            } else if (ev.type === "agent:tool") {
              icon = "tool";
              const arrow = ev.tool_type === "tool_request" ? "→" : "←";
              content = `${arrow} ${ev.tool_name || "tool"}: ${(ev.content || "").slice(0, 200)}`;
            } else if (ev.type === "agent:status") {
              icon = ev.status === "error" ? "error" : ev.status === "running" ? "status" : "done";
              content = `Agent ${ev.status || ""}`;
            } else if (ev.type?.startsWith("workflow:")) {
              icon = "status";
              content = ev.type;
            } else {
              return null;
            }
            return { id, time, type: ev.type, icon, content };
          })
          .filter(Boolean) as Array<{ id: number; time: string; type: string; icon: string; content: string }>;
        if (entries.length > 0) {
          setActivityLog(entries);
        }
      })
      .catch(() => {});
  }, [execution?.id]);

  // Subscribe to live SSE events during execution
  useEffect(() => {
    if (!execution || execution.status !== "running") return;

    const evtSource = new EventSource("/api/events");
    evtSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "heartbeat") return;
        // Only show events for this execution
        if (event.execution_id && event.execution_id !== execution.id) return;

        const time = new Date().toLocaleTimeString();
        let icon = "info";
        let content = "";

        if (event.type === "agent:text") {
          icon = "message";
          const label = event.node_label || event.node_id || "";
          content = `[${label}] ${(event.content || "").slice(0, 250)}`;
        } else if (event.type === "agent:tool") {
          icon = "tool";
          const toolType = event.tool_type === "tool_request" ? "calling" : "result";
          content = `${toolType === "calling" ? "→" : "←"} ${event.tool_name || "tool"}${event.content ? `: ${event.content.slice(0, 200)}` : ""}`;
        } else if (event.type === "agent:status") {
          icon = event.status === "error" ? "error" : event.status === "running" ? "status" : "done";
          content = `Agent ${event.status}${event.reason ? ` (${event.reason})` : ""}`;
        } else if (event.type === "agent:message") {
          icon = "message";
          content = `${event.direction === "incoming" ? "→" : "←"} ${event.content || ""}`.slice(0, 200);
        } else if (event.type === "mcp:down") {
          icon = "error";
          content = `MCP disconnected: ${event.message || event.url}`;
        } else if (event.type === "mcp:up") {
          icon = "done";
          content = `MCP reconnected: ${event.url}`;
        } else if (event.type?.startsWith("workflow:")) {
          icon = "status";
          content = `${event.type}: ${event.error || event.node_id || ""}`.slice(0, 200);
        } else {
          return; // Skip unrecognized events
        }

        setActivityLog((prev) => {
          const id = ++logCounterRef.current;
          const next = [...prev, { id, time, type: event.type, icon, content }];
          return next.length > 500 ? next.slice(-500) : next;
        });
      } catch {
        // ignore parse errors
      }
    };

    return () => evtSource.close();
  }, [execution?.id, execution?.status]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLog]);

  // Fit view when nodes are loaded/updated
  useEffect(() => {
    if (displayNodes.length > 0) {
      // Small delay to let ReactFlow measure node dimensions
      const timer = setTimeout(() => {
        fitView({ padding: 0.2 });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [displayNodes, fitView]);

  const handleExecute = useCallback(async () => {
    if (!taskInput.trim()) {
      toast.error("Enter a task description before executing.");
      return;
    }
    setExecuting(true);
    setDismissedExecutionId(null);
    setActivityLog([]);
    logCounterRef.current = 0;
    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: taskInput.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json();
        toast.error(`Execution failed: ${errData.error || "Unknown error"}`);
        return;
      }
      const { executionId } = await res.json();
      // Start polling the new execution
      setExecution(null);
      fetchExecution(executionId);

      // Start interval for polling
      const interval = setInterval(async () => {
        const data = await fetchExecution(executionId);
        if (data && (data.status === "completed" || data.status === "failed")) {
          clearInterval(interval);
        }
      }, 2000);
    } catch (err) {
      console.error("Failed to execute:", err);
    } finally {
      setExecuting(false);
    }
  }, [workflowId, taskInput, fetchExecution]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading workflow...</p>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="space-y-4">
        <Link href="/workflows">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <p className="text-sm text-muted-foreground">Workflow not found.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
        <Link href="/workflows">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{workflow.name}</h1>
          {workflow.description && (
            <p className="text-xs text-muted-foreground truncate">
              {workflow.description}
            </p>
          )}
        </div>
        {execution?.status === "running" ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              await fetch(`/api/workflows/executions/${execution.id}/stop`, { method: "POST" });
              setDismissedExecutionId(execution.id);
              setExecution(null);
              setTaskInput("");
            }}
          >
            <Square className="h-3.5 w-3.5 mr-1.5" />
            Stop
          </Button>
        ) : execution ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDismissedExecutionId(execution.id);
              setExecution(null);
              setTaskInput("");
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Reset
          </Button>
        ) : null}
        <Button
          size="sm"
          onClick={handleExecute}
          disabled={executing || workflow.nodes.length === 0 || execution?.status === "running"}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          {executing ? "Starting..." : "Execute"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas + Agent Logs */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1">
          <ReactFlow
            nodes={displayNodes}
            edges={workflow.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            className="bg-background"
          >
            <Background gap={16} size={1} />
            <Controls className="!bg-card !border !shadow-sm" />
            <MiniMap
              className="!bg-card !border !shadow-sm"
              nodeColor={() => "hsl(var(--primary))"}
            />
          </ReactFlow>
          </div>

          {/* Live Activity Log */}
          {execution && (
            <div className={`border-t bg-card shrink-0 ${showLog ? "h-52" : "h-9"} transition-all`}>
              <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-muted/50 border-b"
                onClick={() => setShowLog((v) => !v)}
              >
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Activity Log</span>
                <Badge variant="secondary" className="text-[10px] ml-1">{activityLog.length}</Badge>
                <div className="flex-1" />
                {showLog ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
              {showLog && (
                <ScrollArea className="h-[calc(100%-2.25rem)]">
                  <div className="px-3 py-1 space-y-0.5 font-mono">
                    {activityLog.length === 0 && (
                      <p className="text-[11px] text-muted-foreground py-2">Waiting for events...</p>
                    )}
                    {activityLog.map((entry) => (
                      <div key={entry.id} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                        <span className="text-muted-foreground/60 shrink-0 w-16">{entry.time}</span>
                        <span className="shrink-0">
                          {entry.icon === "tool" && <Wrench className="h-3 w-3 text-blue-400 inline" />}
                          {entry.icon === "message" && <MessageSquare className="h-3 w-3 text-green-400 inline" />}
                          {entry.icon === "error" && <AlertCircle className="h-3 w-3 text-red-400 inline" />}
                          {entry.icon === "done" && <CheckCircle2 className="h-3 w-3 text-green-400 inline" />}
                          {entry.icon === "status" && <RefreshCw className="h-3 w-3 text-yellow-400 inline" />}
                          {entry.icon === "info" && <Terminal className="h-3 w-3 text-muted-foreground inline" />}
                        </span>
                        <span className="text-foreground/80 break-all">{entry.content}</span>
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        {/* Execution Panel */}
        <div className="w-80 shrink-0 border-l bg-card overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-medium mb-3">Execution</h2>

            {/* Task Input */}
            <div className="space-y-2 mb-4 pb-4 border-b">
              <Label className="text-xs">Task</Label>
              <Textarea
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="e.g. Write a Python function that checks if a number is prime"
                rows={3}
                className="text-xs"
              />
              {execution?.status === "running" ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full"
                  onClick={async () => {
                    await fetch(`/api/workflows/executions/${execution.id}/stop`, { method: "POST" });
                    setExecution((prev) => prev ? { ...prev, status: "stopped", context: { ...prev.context, status: "stopped", error: "Stopped by user" } } : prev);
                  }}
                >
                  <Square className="h-3.5 w-3.5 mr-1.5" />
                  Stop Execution
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleExecute}
                  disabled={executing || !workflow || workflow.nodes.length === 0}
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  {executing ? "Starting..." : "Execute Workflow"}
                </Button>
              )}
            </div>

            {!execution && !executionIdParam && (
              <p className="text-xs text-muted-foreground">
                Enter a task above and click Execute to start.
              </p>
            )}

            {execution && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      execution.status === "completed"
                        ? "default"
                        : execution.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {execution.status === "running" && (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    )}
                    {execution.status}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground">
                  Started: {new Date(execution.startedAt).toLocaleString()}
                </div>
                {execution.completedAt && (
                  <div className="text-xs text-muted-foreground">
                    Completed:{" "}
                    {new Date(execution.completedAt).toLocaleString()}
                  </div>
                )}

                {execution.context?.error && (
                  <Card className="border-destructive">
                    <CardContent className="p-3">
                      <p className="text-xs text-destructive">
                        {execution.context?.error}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Node Results */}
                <div className="space-y-2">
                  <h3 className="text-xs font-medium">Node Results</h3>
                  {Object.entries(execution.context?.nodeResults || {}).map(
                    ([nodeId, result]) => {
                      const node = workflow.nodes.find((n) => n.id === nodeId);
                      const label = node?.data.label || nodeId;
                      return (
                        <Card
                          key={nodeId}
                          className="cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => setSelectedResult({ label, content: result })}
                        >
                          <CardContent className="p-3">
                            <div className="text-xs font-medium mb-1">
                              {label}
                            </div>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">
                              {result}
                            </p>
                            <p className="text-[10px] text-muted-foreground/60 mt-1">Click to expand</p>
                          </CardContent>
                        </Card>
                      );
                    }
                  )}
                  {Object.keys((execution.context?.nodeResults || {})).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Waiting for results...
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result Detail Dialog */}
      <Dialog open={!!selectedResult} onOpenChange={(open) => !open && setSelectedResult(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedResult?.label} — Output</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            <div className="prose prose-sm prose-invert max-w-none p-1">
              <ReactMarkdown>{selectedResult?.content || ""}</ReactMarkdown>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function WorkflowDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading workflow...</div>}>
      <ReactFlowProvider>
        <WorkflowDetailContent />
      </ReactFlowProvider>
    </Suspense>
  );
}
