"use client";

import React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "reactflow";
import { cn } from "@/lib/utils";

export interface ConditionEdgeData {
  condition: "always" | "approve" | "reject";
}

export function ConditionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ConditionEdgeData>) {
  const condition = data?.condition || "always";
  const isBackward = targetX < sourceX;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (isBackward) {
    // Feedback loop: draw a nice arc below the nodes
    const midX = (sourceX + targetX) / 2;
    const distance = Math.abs(sourceX - targetX);
    const curveDepth = Math.max(80, distance * 0.3);
    const belowY = Math.max(sourceY, targetY) + curveDepth;

    edgePath = `M ${sourceX} ${sourceY} C ${sourceX} ${belowY}, ${targetX} ${belowY}, ${targetX} ${targetY}`;
    labelX = midX;
    labelY = belowY - 10;
  } else {
    // Forward edge: normal bezier
    const result = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    edgePath = result[0];
    labelX = result[1];
    labelY = result[2];
  }

  const conditionStyles = {
    always: {
      bg: "bg-muted",
      text: "text-muted-foreground",
      stroke: "hsl(var(--muted-foreground))",
      dash: "5 3",
    },
    approve: {
      bg: "bg-green-900/60 border-green-700",
      text: "text-green-400",
      stroke: "#22c55e",
      dash: "5 3",
    },
    reject: {
      bg: "bg-red-900/60 border-red-700",
      text: "text-red-400",
      stroke: "#ef4444",
      dash: "8 4",
    },
  };

  const style = conditionStyles[condition] || conditionStyles["always"];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "hsl(var(--primary))" : style.stroke,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: style.dash,
          fill: "none",
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
            style.bg,
            style.text,
            selected && "ring-2 ring-primary"
          )}
        >
          {condition}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
