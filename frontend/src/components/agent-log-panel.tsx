"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal, CheckCircle2, ArrowDown, ArrowUp, MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  timestamp: string;
  type: "tool_request" | "tool_response" | "message" | "other";
  direction?: "incoming" | "outgoing";
  content: string;
  toolName?: string;
}

interface AgentLogPanelProps {
  agentId: string;
}

const MAX_LOG_ENTRIES = 200;

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

/** Truncate long content for display, keeping first N chars */
function truncate(text: string, max = 1000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

export default function AgentLogPanel({ agentId }: AgentLogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  // Fetch historical activity from DB
  const fetchHistory = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agents/${id}/activity`);
      if (!res.ok) return;
      const data: Array<{
        id: string;
        timestamp: string;
        type: string;
        direction?: string;
        content: string;
        toolName?: string;
      }> = await res.json();

      const entries: LogEntry[] = data.map((msg) => {
        seenIds.current.add(msg.id);
        return {
          id: msg.id,
          timestamp: msg.timestamp,
          type: (msg.type || "message") as LogEntry["type"],
          direction: (msg.direction as "incoming" | "outgoing") || undefined,
          content: msg.content,
          toolName: msg.toolName,
        };
      });

      setLogs(entries);
      setHistoryLoaded(true);
    } catch {
      setHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!agentId) return;

    // Clear state when agentId changes
    setLogs([]);
    setHistoryLoaded(false);
    seenIds.current.clear();

    // Load historical logs
    fetchHistory(agentId);

    // SSE for live updates
    const es = new EventSource("/api/events");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        // Filter by agentId
        if (data.agentId !== agentId && data.agent_id !== agentId) return;

        let type: LogEntry["type"] = "other";
        let content = "";
        let toolName: string | undefined;
        let direction: "incoming" | "outgoing" | undefined;

        if (data.type === "agent:tool") {
          if (data.toolType === "tool_request") {
            type = "tool_request";
            toolName = data.toolName || data.tool_name;
            content = data.content || `Running ${toolName ?? "tool"}`;
          } else {
            type = "tool_response";
            toolName = data.toolName || data.tool_name;
            content = data.content || `Finished ${toolName ?? "tool"}`;
          }
        } else if (data.type === "agent:message") {
          type = "message";
          content = data.content || "";
          direction = data.direction;
        } else {
          content = JSON.stringify(data).slice(0, 200);
        }

        const entryId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const entry: LogEntry = {
          id: entryId,
          timestamp: data.timestamp || new Date().toISOString(),
          type,
          direction,
          content,
          toolName,
        };

        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > MAX_LOG_ENTRIES
            ? next.slice(next.length - MAX_LOG_ENTRIES)
            : next;
        });
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
    };
  }, [agentId, fetchHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (!agentId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an agent to view logs.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Agent Log</span>
        <span className="text-xs text-muted-foreground">({logs.length})</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-3">
          {logs.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {historyLoaded ? "No activity yet." : "Loading activity..."}
            </p>
          ) : (
            logs.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "flex items-start gap-2 rounded border px-2.5 py-1.5 text-xs",
                  entry.type === "tool_request" &&
                    "border-amber-800/30 bg-amber-950/20",
                  entry.type === "tool_response" &&
                    "border-green-800/30 bg-green-950/20",
                  entry.type === "message" &&
                    entry.direction === "incoming" &&
                    "border-blue-800/30 bg-blue-950/20",
                  entry.type === "message" &&
                    entry.direction === "outgoing" &&
                    "border-purple-800/30 bg-purple-950/20",
                  entry.type === "message" &&
                    !entry.direction &&
                    "border-border bg-card",
                  entry.type === "other" && "border-border bg-card"
                )}
              >
                <span className="w-[62px] shrink-0 font-mono text-[10px] text-muted-foreground">
                  {formatTime(entry.timestamp)}
                </span>

                {entry.type === "tool_request" && (
                  <Terminal className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                )}
                {entry.type === "tool_response" && (
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                )}
                {entry.type === "message" && entry.direction === "incoming" && (
                  <ArrowDown className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
                )}
                {entry.type === "message" && entry.direction === "outgoing" && (
                  <ArrowUp className="mt-0.5 h-3 w-3 shrink-0 text-purple-400" />
                )}
                {entry.type === "message" && !entry.direction && (
                  <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                )}

                <span
                  className={cn(
                    "min-w-0 flex-1 break-words whitespace-pre-wrap",
                    entry.type === "tool_request" && "text-amber-300",
                    entry.type === "tool_response" && "text-green-300",
                    entry.type === "message" &&
                      entry.direction === "incoming" &&
                      "text-blue-300",
                    entry.type === "message" &&
                      entry.direction === "outgoing" &&
                      "text-purple-300"
                  )}
                >
                  {entry.toolName && (
                    <span className="font-medium">{entry.toolName}: </span>
                  )}
                  {entry.direction === "incoming" && (
                    <span className="font-medium">Instruction: </span>
                  )}
                  {entry.direction === "outgoing" && (
                    <span className="font-medium">Response: </span>
                  )}
                  {truncate(entry.content)}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
