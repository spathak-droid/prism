"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProjectStore } from "@/lib/store";
import { ReactFlowProvider } from "reactflow";
import { ArrowLeft, GitBranch, Plus, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { WorkflowBuilder } from "@/components/workflow-builder";
import type { Node, Edge } from "reactflow";
import type { AgentNodeData } from "@/components/workflow-node";
import type { ConditionEdgeData } from "@/components/workflow-edge";

interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  nodes: Node<AgentNodeData>[];
  edges: Edge<ConditionEdgeData>[];
  isTemplate: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastExecutionId?: string;
  lastExecutionStatus?: string;
}

interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
}

function WorkflowsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isProjectMode = searchParams.get("projectMode") === "true";
  const { pendingProject, createProject, clearPendingProject } = useProjectStore();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [templates, setTemplates] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowItem | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: WorkflowItem[] = await res.json();
      setWorkflows(data.filter((w) => !w.isTemplate));
      setTemplates(data.filter((w) => w.isTemplate));
    } catch (err) {
      console.error("Failed to fetch workflows:", err);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch");
      const data: AgentItem[] = await res.json();
      setAgents(data);
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchWorkflows(), fetchAgents()]).finally(() =>
      setLoading(false)
    );
    // Poll for execution status updates when any workflow is running
    const interval = setInterval(fetchWorkflows, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkflows, fetchAgents]);

  useEffect(() => {
    if (isProjectMode && pendingProject) {
      setShowBuilder(true);
    }
  }, [isProjectMode, pendingProject]);

  const handleCreateNew = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Workflow" }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const wf: WorkflowItem = await res.json();
      setEditingWorkflow(wf);
      setShowBuilder(true);
      await fetchWorkflows();
    } catch (err) {
      console.error("Failed to create workflow:", err);
    }
  }, [fetchWorkflows]);

  const handleEdit = useCallback((wf: WorkflowItem) => {
    setEditingWorkflow(wf);
    setShowBuilder(true);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/workflows/${id}`, { method: "DELETE" });
        await fetchWorkflows();
      } catch (err) {
        console.error("Failed to delete workflow:", err);
      }
    },
    [fetchWorkflows]
  );

  const handleSave = useCallback(
    async (data: {
      name: string;
      description: string;
      nodes: Node<AgentNodeData>[];
      edges: Edge<ConditionEdgeData>[];
    }) => {
      if (!editingWorkflow) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/workflows/${editingWorkflow.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Failed to save");
        const updated: WorkflowItem = await res.json();
        setEditingWorkflow(updated);
        await fetchWorkflows();
      } catch (err) {
        console.error("Failed to save workflow:", err);
      } finally {
        setSaving(false);
      }
    },
    [editingWorkflow, fetchWorkflows]
  );

  const handleExecute = useCallback(async (input: string, cwd?: string) => {
    if (!editingWorkflow) return;

    setExecuting(true);
    try {
      const res = await fetch(`/api/workflows/${editingWorkflow.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, cwd }),
      });
      if (!res.ok) {
        const errData = await res.json();
        toast.error(`Execution failed: ${errData.error || "Unknown error"}`);
        return;
      }
      const { executionId } = await res.json();
      router.push(`/workflows/${editingWorkflow.id}?execution=${executionId}`);
    } catch (err) {
      console.error("Failed to execute workflow:", err);
    } finally {
      setExecuting(false);
    }
  }, [editingWorkflow, router]);

  const [creatingProject, setCreatingProject] = useState(false);

  const handleCreateProject = useCallback(async (stages: string[]) => {
    if (!pendingProject) return;
    setCreatingProject(true);
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
      toast.error("Failed to create project");
      console.error("Failed to create project:", err);
    } finally {
      setCreatingProject(false);
    }
  }, [pendingProject, createProject, clearPendingProject, router]);

  useEffect(() => {
    if (isProjectMode && !pendingProject) {
      router.push("/projects");
    }
  }, [isProjectMode, pendingProject, router]);

  if (isProjectMode && !pendingProject) {
    return null;
  }

  // Builder mode
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
              creatingProject={creatingProject}
            />
          </ReactFlowProvider>
        </div>
      </div>
    );
  }

  // List mode
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Orchestrate your agents into collaborative workflows.
          </p>
        </div>
        <Button onClick={handleCreateNew}>
          <Plus className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <Card className="flex items-center justify-center py-12">
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">Loading workflows...</p>
          </CardContent>
        </Card>
      )}

      {/* Templates Section */}
      {!loading && templates.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-medium truncate">
                        {template.name}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {template.description}
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        Template
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {template.nodes.length} nodes
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Workflows Section */}
      {!loading && workflows.length > 0 && (
        <div>
          <h2 className="text-lg font-medium mb-3">Your Workflows</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map((wf) => (
              <Card
                key={wf.id}
                className="p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/50 hover:shadow-md hover:scale-[1.02] transition-all duration-200"
                onClick={() => {
                  if (wf.lastExecutionStatus === "running") {
                    router.push(`/workflows/${wf.id}?execution=${wf.lastExecutionId}`);
                  } else {
                    handleEdit(wf);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-medium truncate">
                        {wf.name}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {wf.nodes.length} nodes, {wf.edges.length} edges
                    </p>
                    <div className="flex gap-1.5 mt-2">
                      <Badge
                        variant={wf.status === "active" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {wf.status}
                      </Badge>
                      {wf.lastExecutionStatus === "running" && (
                        <Badge variant="default" className="text-[10px] bg-yellow-500 text-black animate-pulse">
                          running
                        </Badge>
                      )}
                      {wf.lastExecutionStatus === "completed" && (
                        <Badge variant="default" className="text-[10px] bg-green-600">
                          completed
                        </Badge>
                      )}
                      {wf.lastExecutionStatus === "failed" && (
                        <Badge variant="destructive" className="text-[10px]">
                          failed
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}`); }}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && workflows.length === 0 && templates.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-12">
          <CardContent className="text-center">
            <GitBranch className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No workflows yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create one to orchestrate your agents.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground">Loading workflows...</div>}>
      <WorkflowsPageContent />
    </Suspense>
  );
}
