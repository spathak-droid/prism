"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ApprovalBannerProps {
  approvalId: string;
  type: string;
  summary: string;
  filesToReview?: string[];
  onResolve: () => void;
}

export default function ApprovalBanner({
  approvalId,
  type,
  summary,
  filesToReview,
  onResolve,
}: ApprovalBannerProps) {
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: "approve" | "reject") => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, feedback }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Failed to submit");
      }
      onResolve();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const title =
    type === "plan_approval"
      ? "Plan Approval Required"
      : type === "code_review"
      ? "Code Review Required"
      : "Approval Required";

  return (
    <div className="rounded-lg border-2 border-amber-500/60 bg-amber-950/10 p-4 space-y-3">
      <div className="space-y-1">
        <h3 className="font-semibold text-amber-400 text-sm">{title}</h3>
        <p className="text-sm text-foreground/90">{summary}</p>
      </div>

      {filesToReview && filesToReview.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Files to Review
          </p>
          <ul className="space-y-0.5">
            {filesToReview.map((file) => (
              <li
                key={file}
                className="font-mono text-xs text-muted-foreground bg-muted/30 rounded px-2 py-0.5"
              >
                {file}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Optional feedback..."
          rows={3}
          className="resize-none text-sm"
          disabled={submitting}
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={() => handleAction("approve")}
          disabled={submitting}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-500 text-red-400 hover:bg-red-950/30"
          onClick={() => handleAction("reject")}
          disabled={submitting}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
