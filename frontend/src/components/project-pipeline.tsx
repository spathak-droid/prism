"use client";

import React from "react";
import {
  Search,
  FileText,
  CheckCircle,
  Hammer,
  Eye,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PipelineStepStatus =
  | "pending"
  | "running"
  | "complete"
  | "paused"
  | "failed";

export interface PipelineStep {
  label: string;
  icon: React.ElementType;
  status: PipelineStepStatus;
}

export const PIPELINE_ICONS: Record<string, React.ElementType> = {
  Researcher: Search,
  Planner: FileText,
  "Plan Approval": CheckCircle,
  Builder: Hammer,
  Reviewer: Eye,
};

interface ProjectPipelineProps {
  steps: PipelineStep[];
}

const statusStyles: Record<
  PipelineStepStatus,
  { circle: string; label: string; text: string }
> = {
  pending: {
    circle: "border-muted-foreground/30 text-muted-foreground/40",
    label: "text-muted-foreground",
    text: "pending",
  },
  running: {
    circle: "border-blue-500 text-blue-500 animate-pulse",
    label: "text-foreground font-medium",
    text: "running",
  },
  complete: {
    circle: "border-green-500 text-green-500",
    label: "text-foreground",
    text: "complete",
  },
  paused: {
    circle: "border-amber-500 text-amber-500",
    label: "text-foreground",
    text: "awaiting approval",
  },
  failed: {
    circle: "border-red-500 text-red-500",
    label: "text-foreground",
    text: "failed",
  },
};

export default function ProjectPipeline({ steps }: ProjectPipelineProps) {
  return (
    <div className="flex flex-col">
      {steps.map((step, index) => {
        const styles = statusStyles[step.status];
        const isLast = index === steps.length - 1;
        const Icon = step.status === "running" ? Loader2 : step.icon;

        return (
          <div key={step.label} className="flex flex-col items-start">
            <div className="flex items-center gap-3">
              {/* Circle with icon */}
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2",
                  styles.circle
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    step.status === "running" && "animate-spin"
                  )}
                />
              </div>

              {/* Label + status */}
              <div className="min-w-0">
                <p className={cn("text-sm", styles.label)}>{step.label}</p>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {styles.text}
                </p>
              </div>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className="ml-[17px] h-6 w-0.5 bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}
