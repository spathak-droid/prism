"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Bot, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AgentNodeData {
  agentId: string | null;
  label: string;
  instruction?: string;
  type?: string;
  status?: "idle" | "running" | "completed" | "error";
}

function AgentNodeComponent({ data, selected }: NodeProps<AgentNodeData>) {
  const statusColor = {
    idle: "bg-muted",
    running: "bg-blue-500/20 border-blue-500",
    completed: "bg-green-500/20 border-green-500",
    error: "bg-red-500/20 border-red-500",
  };

  const statusDot = {
    idle: "bg-muted-foreground",
    running: "bg-blue-500",
    completed: "bg-green-500",
    error: "bg-red-500",
  };

  const status = data.status || "idle";

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-4 py-3 shadow-sm min-w-[150px]",
        statusColor[status],
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />

      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{data.label}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={cn("h-2 w-2 rounded-full", statusDot[status])} />
            <span className="text-xs text-muted-foreground capitalize">
              {data.agentId ? status : "unmapped"}
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </div>
  );
}

function ApprovalGateNodeComponent({ data, selected }: NodeProps<AgentNodeData>) {
  const status = data.status || "idle";

  const statusColor = {
    idle: "bg-amber-500/10 border-amber-500",
    running: "bg-blue-500/20 border-blue-500",
    completed: "bg-green-500/20 border-green-500",
    error: "bg-red-500/20 border-red-500",
  };

  const statusDot = {
    idle: "bg-amber-500",
    running: "bg-blue-500",
    completed: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card px-4 py-3 shadow-sm min-w-[150px]",
        statusColor[status],
        selected && "ring-2 ring-amber-500 ring-offset-2 ring-offset-background"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
      />

      <div className="flex items-center gap-2">
        <Pause className="h-4 w-4 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{data.label}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <div className={cn("h-2 w-2 rounded-full", statusDot[status])} />
            <span className="text-xs text-amber-500/80 capitalize">
              approval gate
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
      />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
export const ApprovalGateNode = memo(ApprovalGateNodeComponent);
