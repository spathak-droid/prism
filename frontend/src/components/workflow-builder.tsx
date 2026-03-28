"use client";

import React, { useCallback, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type NodeTypes,
  type EdgeTypes,
} from "reactflow";
import "reactflow/dist/style.css";

import { AgentNode, ApprovalGateNode, type AgentNodeData } from "@/components/workflow-node";
import { ConditionEdge, type ConditionEdgeData } from "@/components/workflow-edge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Bot, Play, Save, FileDown, Trash2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
  approvalGate: ApprovalGateNode,
};

const edgeTypes: EdgeTypes = {
  conditionEdge: ConditionEdge,
};

interface AgentItem {
  id: string;
  name: string;
  role: string;
  status: string;
}

interface WorkflowData {
  id: string;
  name: string;
  description: string;
  nodes: Node<AgentNodeData>[];
  edges: Edge<ConditionEdgeData>[];
  isTemplate: boolean;
  status: string;
}

interface TemplateItem {
  id: string;
  name: string;
  description: string;
  nodes: Node<AgentNodeData>[];
  edges: Edge<ConditionEdgeData>[];
}

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
  onExecute: (input: string) => Promise<void>;
  saving: boolean;
  executing: boolean;
}

export function WorkflowBuilder({
  workflow,
  agents,
  templates,
  onSave,
  onExecute,
  saving,
  executing,
}: WorkflowBuilderProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(workflow?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow?.edges || []);
  const [workflowName, setWorkflowName] = useState(workflow?.name || "New Workflow");
  const [workflowDescription] = useState(workflow?.description || "");
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [taskInput, setTaskInput] = useState("");

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge<ConditionEdgeData> = {
        ...params,
        id: `edge-${uuidv4()}`,
        type: "conditionEdge",
        animated: true,
        data: { condition: "always" },
      } as Edge<ConditionEdgeData>;
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const agentData = event.dataTransfer.getData("application/agentforge-agent");
      if (!agentData) return;

      const agent: AgentItem = JSON.parse(agentData);

      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node<AgentNodeData> = {
        id: `node-${uuidv4()}`,
        type: "agentNode",
        position,
        data: {
          agentId: agent.id,
          label: agent.name,
          status: "idle",
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [reactFlowInstance, setNodes]
  );

  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setSelectedEdge(edge.id);
      setSelectedNode(null);
    },
    []
  );

  const updateEdgeCondition = useCallback(
    (condition: "always" | "approve" | "reject") => {
      if (!selectedEdge) return;
      setEdges((eds) =>
        eds.map((e) =>
          e.id === selectedEdge
            ? { ...e, data: { ...e.data, condition } }
            : e
        )
      );
    },
    [selectedEdge, setEdges]
  );

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) return;
    setEdges((eds) => eds.filter((e) => e.id !== selectedEdge));
    setSelectedEdge(null);
  }, [selectedEdge, setEdges]);

  const loadTemplate = useCallback(
    (templateId: string) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) return;

      // Auto-map template nodes to real agents by matching label to agent name
      const mappedNodes = template.nodes.map((node) => {
        const matchingAgent = agents.find(
          (a) => a.name.toLowerCase() === node.data.label.toLowerCase()
        );
        return {
          ...node,
          data: {
            ...node.data,
            agentId: matchingAgent?.id ?? node.data.agentId,
            status: (matchingAgent?.status as AgentNodeData["status"]) ?? "idle",
          },
        };
      });

      setNodes(mappedNodes);
      setEdges(template.edges);
      setWorkflowName(template.name);
    },
    [templates, agents, setNodes, setEdges]
  );

  const handleSave = useCallback(async () => {
    await onSave({
      name: workflowName,
      description: workflowDescription,
      nodes,
      edges,
    });
  }, [workflowName, workflowDescription, nodes, edges, onSave]);

  const selectedEdgeData = edges.find((e) => e.id === selectedEdge);

  return (
    <div className="flex h-full">
      {/* Sidebar - Agent Panel */}
      <div className="w-56 shrink-0 border-r bg-card p-3 flex flex-col gap-3 overflow-y-auto">
        <div>
          <h3 className="text-sm font-medium mb-2">Agents</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Drag agents onto the canvas
          </p>
          <div className="space-y-1.5">
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
                  <div className="text-xs font-medium truncate">
                    {agent.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {agent.role}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Edge Editor */}
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

      {/* Canvas Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
          <Input
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="max-w-[250px] h-8 text-sm"
            placeholder="Workflow name"
          />

          {templates.length > 0 && (
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
                alert("Enter a task description before executing.");
                return;
              }
              await handleSave();
              await onExecute(taskInput.trim());
            }}
            disabled={executing || saving || nodes.length === 0}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {executing ? "Starting..." : "Execute"}
          </Button>
        </div>

        {/* React Flow Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onEdgeClick={onEdgeClick}
            onNodeClick={(_event, node) => {
              setSelectedNode(node.id);
              setSelectedEdge(null);
            }}
            onPaneClick={() => { setSelectedEdge(null); setSelectedNode(null); }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            deleteKeyCode={["Backspace", "Delete"]}
            className="bg-background"
          >
            <Background gap={16} size={1} />
            <Controls className="!bg-card !border !shadow-sm" />
            <MiniMap
              className="!bg-card !border !shadow-sm"
              nodeColor={() => "hsl(var(--primary))"}
            />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <Card className="px-6 py-4 text-center mt-16">
                  <p className="text-sm text-muted-foreground">
                    Drag agents from the sidebar to build your workflow,
                    <br />
                    or load a template to get started.
                  </p>
                </Card>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>

      {/* Right Sidebar Panel */}
      <div className="w-64 shrink-0 border-l bg-card p-3 flex flex-col gap-4 overflow-y-auto">
        {/* Task Input */}
        <div>
          <Label className="text-sm font-medium">Task Input</Label>
          <p className="text-xs text-muted-foreground mb-2">
            What should this workflow do?
          </p>
          <Textarea
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            placeholder="e.g. Write a Python function that checks if a number is prime"
            rows={3}
            className="text-xs"
          />
          <Button
            size="sm"
            className="w-full mt-2"
            onClick={async () => {
              if (!taskInput.trim()) {
                alert("Enter a task description first.");
                return;
              }
              await handleSave();
              await onExecute(taskInput.trim());
            }}
            disabled={executing || saving || nodes.length === 0}
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {executing ? "Running..." : "Execute Workflow"}
          </Button>
        </div>

        {/* Selected Node Details */}
        {selectedNode && (() => {
          const node = nodes.find((n) => n.id === selectedNode);
          if (!node) return null;
          const nodeData = node.data as AgentNodeData;
          const outEdges = edges.filter((e) => e.source === selectedNode);
          const inEdges = edges.filter((e) => e.target === selectedNode);
          return (
            <div className="border-t pt-3">
              <h3 className="text-sm font-medium mb-2">{nodeData.label}</h3>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Agent ID:</span>
                  <span className="ml-1 font-mono">{nodeData.agentId ? "Mapped" : "Unmapped"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-1">{nodeData.status || "idle"}</span>
                </div>
                {inEdges.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Incoming:</span>
                    {inEdges.map((e) => {
                      const srcNode = nodes.find((n) => n.id === e.source);
                      const cond = (e.data as ConditionEdgeData | undefined)?.condition || "always";
                      return (
                        <div key={e.id} className="ml-2 text-muted-foreground">
                          ← {(srcNode?.data as AgentNodeData)?.label || "?"} ({cond})
                        </div>
                      );
                    })}
                  </div>
                )}
                {outEdges.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Outgoing:</span>
                    {outEdges.map((e) => {
                      const tgtNode = nodes.find((n) => n.id === e.target);
                      const cond = (e.data as ConditionEdgeData | undefined)?.condition || "always";
                      return (
                        <div key={e.id} className="flex items-center gap-1 ml-2">
                          <span>→ {(tgtNode?.data as AgentNodeData)?.label || "?"}</span>
                          <Select
                            value={cond}
                            onValueChange={(val) => {
                              setEdges((eds) =>
                                eds.map((ed) =>
                                  ed.id === e.id
                                    ? { ...ed, data: { ...ed.data, condition: val as "always" | "approve" | "reject" } }
                                    : ed
                                )
                              );
                            }}
                          >
                            <SelectTrigger className="h-6 w-24 text-[10px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="always">Always</SelectItem>
                              <SelectItem value="approve">Approve</SelectItem>
                              <SelectItem value="reject">Reject</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs text-destructive"
                  onClick={() => {
                    setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
                    setEdges((eds) => eds.filter((e) => e.source !== selectedNode && e.target !== selectedNode));
                    setSelectedNode(null);
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Remove Node
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Selected Edge Details */}
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
    </div>
  );
}
