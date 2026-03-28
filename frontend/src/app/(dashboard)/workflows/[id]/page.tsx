"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Play, RefreshCw } from "lucide-react";
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

  const fetchWorkflow = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data: WorkflowData = await res.json();
      setWorkflow(data);
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

  // Poll execution status
  useEffect(() => {
    if (!executionIdParam) return;

    fetchExecution(executionIdParam);

    const interval = setInterval(async () => {
      const data = await fetchExecution(executionIdParam);
      if (data && (data.status === "completed" || data.status === "failed")) {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [executionIdParam, fetchExecution]);

  // Update node statuses based on execution context
  const displayNodes = React.useMemo(() => {
    if (!workflow) return [];
    if (!execution) return workflow.nodes;

    return workflow.nodes.map((node) => {
      const ctx = execution.context;
      let nodeStatus: "idle" | "running" | "completed" | "error" = "idle";

      if (ctx.nodeResults[node.id]) {
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

  const handleExecute = useCallback(async () => {
    if (!taskInput.trim()) {
      alert("Enter a task description before executing.");
      return;
    }
    setExecuting(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: taskInput.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json();
        alert(`Execution failed: ${errData.error}`);
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
        <Button
          size="sm"
          onClick={handleExecute}
          disabled={executing || workflow.nodes.length === 0}
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          {executing ? "Starting..." : "Execute"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
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
                    setExecution((prev) => prev ? { ...prev, status: "failed", context: { ...prev.context, status: "failed", error: "Stopped by user" } } : prev);
                  }}
                >
                  Stop
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

                {execution.context.error && (
                  <Card className="border-destructive">
                    <CardContent className="p-3">
                      <p className="text-xs text-destructive">
                        {execution.context.error}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Node Results */}
                <div className="space-y-2">
                  <h3 className="text-xs font-medium">Node Results</h3>
                  {Object.entries(execution.context.nodeResults).map(
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
                  {Object.keys(execution.context.nodeResults).length === 0 && (
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
    <ReactFlowProvider>
      <WorkflowDetailContent />
    </ReactFlowProvider>
  );
}
