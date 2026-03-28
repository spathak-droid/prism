"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface TimelineNode {
  nodeId: string;
  label: string;
  agentName: string;
  status: "pending" | "running" | "completed" | "error";
  result?: string;
  toolCalls: Array<{ toolName: string; content: string; type: "request" | "response" }>;
  duration?: number;
  verdict?: "APPROVE" | "REJECT" | null;
  iteration?: number;
}

interface TimelineProps {
  executionId: string;
  nodes: Array<{ id: string; data: { label?: string; agentId?: string } }>;
  initialInput?: string;
  executionContext?: {
    nodeResults: Record<string, string>;
    currentNode: string | null;
    iterationCounts: Record<string, number>;
    status: string;
    error?: string;
  };
}

export function WorkflowTimeline({ executionId, nodes, initialInput, executionContext }: TimelineProps) {
  const [timelineNodes, setTimelineNodes] = useState<TimelineNode[]>([]);
  const [liveTools, setLiveTools] = useState<Map<string, TimelineNode["toolCalls"]>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!executionContext) return;

    const timeline: TimelineNode[] = [];
    const nodeResults = executionContext.nodeResults || {};
    const iterationCounts = executionContext.iterationCounts || {};

    for (const node of nodes) {
      const result = nodeResults[node.id];
      if (result !== undefined) {
        let verdict: "APPROVE" | "REJECT" | null = null;
        const resultLower = (result || "").toLowerCase();
        if (resultLower.includes("approved") || resultLower.includes("lgtm") || resultLower.includes("approve")) {
          verdict = "APPROVE";
        } else if (resultLower.includes("rejected") || resultLower.includes("reject") || resultLower.includes("needs changes")) {
          verdict = "REJECT";
        }

        timeline.push({
          nodeId: node.id,
          label: node.data.label || "Agent",
          agentName: node.data.label || "Agent",
          status: "completed",
          result: result || "",
          toolCalls: liveTools.get(node.id) || [],
          verdict,
          iteration: iterationCounts[node.id] || 1,
        });
      } else if (executionContext.currentNode === node.id) {
        timeline.push({
          nodeId: node.id,
          label: node.data.label || "Agent",
          agentName: node.data.label || "Agent",
          status: "running",
          toolCalls: liveTools.get(node.id) || [],
          iteration: iterationCounts[node.id] || 1,
        });
      }
    }

    setTimelineNodes(timeline);
  }, [executionContext, nodes, liveTools]);

  useEffect(() => {
    if (!executionId) return;

    const eventSource = new EventSource("/api/events");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "agent:tool" && data.agentId) {
          setLiveTools((prev) => {
            const next = new Map(prev);
            const node = nodes.find((n) => n.data.agentId === data.agentId);
            if (node) {
              const existing = next.get(node.id) || [];
              next.set(node.id, [
                ...existing,
                {
                  toolName: data.toolName,
                  content: data.content || "",
                  type: data.toolType === "tool_request" ? "request" : "response",
                },
              ]);
            }
            return next;
          });
        }
      } catch { /* ignore parse errors */ }
    };

    return () => eventSource.close();
  }, [executionId, nodes]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timelineNodes]);

  const overallStatus = executionContext?.status || "pending";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Execution Timeline</h3>
        <Badge
          variant={
            overallStatus === "completed" ? "default" :
            overallStatus === "running" ? "secondary" :
            overallStatus === "failed" ? "destructive" :
            "outline"
          }
        >
          {overallStatus}
        </Badge>
      </div>

      {initialInput && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Input</p>
            <p className="text-sm">{initialInput}</p>
          </CardContent>
        </Card>
      )}

      <ScrollArea className="h-[500px]" ref={scrollRef}>
        <div className="space-y-3 pr-4">
          {timelineNodes.map((node, idx) => (
            <div key={`${node.nodeId}-${node.iteration}`}>
              {idx > 0 && (
                <div className="flex items-center justify-center py-1">
                  <div className="w-px h-6 bg-border" />
                </div>
              )}
              <Card className={
                node.status === "running" ? "border-yellow-300 bg-yellow-50 dark:bg-yellow-950" :
                node.status === "error" ? "border-red-300 bg-red-50 dark:bg-red-950" :
                ""
              }>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{node.label}</span>
                      {node.iteration && node.iteration > 1 && (
                        <Badge variant="outline" className="text-xs">
                          iteration {node.iteration}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {node.verdict && (
                        <Badge variant={node.verdict === "APPROVE" ? "default" : "destructive"}>
                          {node.verdict}
                        </Badge>
                      )}
                      {node.status === "running" && (
                        <Badge variant="secondary" className="animate-pulse">running</Badge>
                      )}
                      {node.duration && (
                        <span className="text-xs text-muted-foreground">{node.duration}s</span>
                      )}
                    </div>
                  </div>

                  {node.toolCalls.length > 0 && (
                    <div className="space-y-1">
                      {node.toolCalls.slice(-5).map((tool, tidx) => (
                        <div key={tidx} className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>{tool.type === "request" ? ">" : "<"}</span>
                          <span className="font-mono">{tool.toolName}</span>
                          {tool.content && (
                            <span className="truncate max-w-[200px]">{tool.content}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {node.result && (
                    <>
                      <Separator />
                      <p className="text-sm whitespace-pre-wrap line-clamp-6">{node.result}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}

          {overallStatus === "running" && timelineNodes.length > 0 && (
            <div className="flex items-center justify-center py-2">
              <div className="w-px h-6 bg-border animate-pulse" />
            </div>
          )}
        </div>
      </ScrollArea>

      {overallStatus === "completed" && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-green-600 dark:text-green-400">Workflow Complete</p>
          </CardContent>
        </Card>
      )}

      {overallStatus === "failed" && executionContext?.error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800">
          <CardContent className="p-3">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Error</p>
            <p className="text-sm">{executionContext.error}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
