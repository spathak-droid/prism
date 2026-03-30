"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Terminal,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  FileText,
  Search,
  Pencil,
  Play,
  MessageSquare,
  Loader2,
  FolderOpen,
  Eye,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  timestamp: string;
  type: "tool_request" | "tool_response" | "message" | "other";
  direction?: "incoming" | "outgoing";
  content: string;
  toolName?: string;
  metadata?: Record<string, string>;
}

interface AgentLogPanelProps {
  agentId: string;
  executionId?: string;
}

const MAX_LOG_ENTRIES = 200;

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

/** Map Goose tool names to friendly labels and icons */
function getToolInfo(toolName: string): { label: string; icon: typeof Terminal; verb: string } {
  const name = (toolName || "").toLowerCase();
  if (name.includes("read") || name.includes("cat"))
    return { label: "Read", icon: Eye, verb: "Reading" };
  if (name.includes("write") || name.includes("create_file"))
    return { label: "Write", icon: Pencil, verb: "Writing" };
  if (name.includes("edit") || name.includes("patch") || name.includes("replace"))
    return { label: "Edit", icon: Pencil, verb: "Editing" };
  if (name.includes("search") || name.includes("grep") || name.includes("ripgrep"))
    return { label: "Search", icon: Search, verb: "Searching" };
  if (name.includes("glob") || name.includes("find") || name.includes("list"))
    return { label: "List Files", icon: FolderOpen, verb: "Finding" };
  if (name.includes("bash") || name.includes("shell") || name.includes("exec") || name.includes("run"))
    return { label: "Bash", icon: Terminal, verb: "Running" };
  if (name.includes("text_editor"))
    return { label: "Edit", icon: Pencil, verb: "Editing" };
  return { label: toolName || "Tool", icon: Terminal, verb: "Using" };
}

/** Extract a human-readable summary from tool args */
function getToolSummary(toolName: string, argsStr: string): string {
  if (!argsStr) return "";
  try {
    const args = JSON.parse(argsStr);
    const name = (toolName || "").toLowerCase();

    // Read file
    if (name.includes("read") || name.includes("cat")) {
      const path = args.file_path || args.path || args.file || "";
      return path ? shortenPath(path) : "";
    }
    // Write / Edit
    if (name.includes("write") || name.includes("edit") || name.includes("patch") || name.includes("replace") || name.includes("create_file") || name.includes("text_editor")) {
      const path = args.file_path || args.path || args.file || "";
      return path ? shortenPath(path) : "";
    }
    // Search
    if (name.includes("search") || name.includes("grep") || name.includes("ripgrep")) {
      const query = args.pattern || args.query || args.regex || "";
      const path = args.path || args.directory || "";
      if (query && path) return `"${query}" in ${shortenPath(path)}`;
      if (query) return `"${query}"`;
      return "";
    }
    // Bash / Shell
    if (name.includes("bash") || name.includes("shell") || name.includes("exec") || name.includes("run")) {
      const cmd = args.command || args.cmd || "";
      if (cmd) return cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd;
      return "";
    }
    // Glob / Find / List
    if (name.includes("glob") || name.includes("find") || name.includes("list")) {
      const pattern = args.pattern || args.glob || "";
      return pattern || "";
    }
    return "";
  } catch {
    return "";
  }
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-2).join("/");
}

/** Group consecutive tool_request + tool_response into pairs */
interface ToolGroup {
  kind: "tool";
  request: LogEntry;
  response?: LogEntry;
}
interface TextGroup {
  kind: "text";
  entry: LogEntry;
}
type LogGroup = ToolGroup | TextGroup;

function groupLogs(logs: LogEntry[]): LogGroup[] {
  const groups: LogGroup[] = [];
  let i = 0;
  while (i < logs.length) {
    const entry = logs[i];
    if (entry.type === "tool_request" || entry.type === "tool_call") {
      const group: ToolGroup = { kind: "tool", request: entry };
      // Look ahead for matching response
      if (i + 1 < logs.length) {
        const next = logs[i + 1];
        if (next.type === "tool_response" || next.type === "tool_result") {
          group.response = next;
          i += 2;
          groups.push(group);
          continue;
        }
      }
      groups.push(group);
      i++;
    } else if (entry.type === "tool_response" || entry.type === "tool_result") {
      // Orphan response — show as text
      groups.push({ kind: "text", entry });
      i++;
    } else {
      groups.push({ kind: "text", entry });
      i++;
    }
  }
  return groups;
}

function ToolCallRow({ group }: { group: ToolGroup }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = group.request.toolName || group.request.metadata?.tool_name || "tool";
  const toolArgs = group.request.metadata?.tool_args || "";
  const info = getToolInfo(toolName);
  const summary = getToolSummary(toolName, toolArgs);
  const Icon = info.icon;
  const hasResponse = !!group.response;
  const isSuccess = hasResponse;

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors",
          "hover:bg-white/5",
        )}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
        )}

        {isSuccess ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 shrink-0 text-amber-400 animate-spin" />
        )}

        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />

        <span className="font-medium text-zinc-300">{info.label}</span>

        {summary && (
          <span className="min-w-0 truncate text-zinc-500 font-mono">
            {summary}
          </span>
        )}

        <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-600">
          {formatTime(group.request.timestamp)}
        </span>
      </button>

      {expanded && (
        <div className="ml-[52px] mr-3 mb-1 space-y-1">
          {toolArgs && (
            <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Input
              </div>
              <pre className="overflow-x-auto text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap break-words font-mono">
                {formatArgs(toolArgs)}
              </pre>
            </div>
          )}
          {group.response && (
            <div className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Output
              </div>
              <pre className="overflow-x-auto text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap break-words font-mono max-h-[200px] overflow-y-auto">
                {group.response.content.length > 500
                  ? group.response.content.slice(0, 500) + "\n..."
                  : group.response.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatArgs(argsStr: string): string {
  try {
    const args = JSON.parse(argsStr);
    // Show key=value pairs cleanly
    return Object.entries(args)
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        const truncated = val.length > 200 ? val.slice(0, 200) + "..." : val;
        return `${k}: ${truncated}`;
      })
      .join("\n");
  } catch {
    return argsStr;
  }
}

/** Render simple markdown: headers, bold, bullets, inline code */
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Headers
    if (trimmed.startsWith("### ")) {
      elements.push(
        <div key={i} className="mt-2 mb-0.5 text-[11px] font-semibold text-zinc-200">
          {renderInline(trimmed.slice(4))}
        </div>
      );
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <div key={i} className="mt-2.5 mb-0.5 text-xs font-semibold text-zinc-100">
          {renderInline(trimmed.slice(3))}
        </div>
      );
    } else if (trimmed.startsWith("# ")) {
      elements.push(
        <div key={i} className="mt-3 mb-1 text-sm font-bold text-zinc-100">
          {renderInline(trimmed.slice(2))}
        </div>
      );
    }
    // Bullet points
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-1.5 pl-2">
          <span className="text-zinc-500 select-none">•</span>
          <span>{renderInline(trimmed.slice(2))}</span>
        </div>
      );
    }
    // Numbered list
    else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <div key={i} className="flex gap-1.5 pl-2">
            <span className="text-zinc-500 select-none min-w-[1em] text-right">{match[1]}.</span>
            <span>{renderInline(match[2])}</span>
          </div>
        );
      }
    }
    // Empty line
    else if (trimmed === "") {
      elements.push(<div key={i} className="h-1" />);
    }
    // Regular text
    else {
      elements.push(
        <div key={i}>{renderInline(trimmed)}</div>
      );
    }
  }

  return elements;
}

/** Render inline markdown: **bold**, `code`, *italic* */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Match **bold**, `code`, *italic*
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // **bold**
      parts.push(<span key={match.index} className="font-semibold text-zinc-200">{match[2]}</span>);
    } else if (match[3]) {
      // `code`
      parts.push(
        <code key={match.index} className="rounded bg-zinc-800 px-1 py-0.5 text-[10px] font-mono text-amber-300/80">
          {match[3]}
        </code>
      );
    } else if (match[4]) {
      // *italic*
      parts.push(<span key={match.index} className="italic text-zinc-400">{match[4]}</span>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

function TextRow({ entry }: { entry: LogEntry }) {
  const isStatus = entry.type === "other";
  const content = entry.content.trim();

  // Skip empty, very short, or raw JSON / junk entries
  if (content.length < 3) return null;
  if (content.startsWith('{') || content.startsWith('[')) return null;
  if (content === "Done" || content === "Done.") return null;
  // Skip entries that are mostly JSON (e.g. prose ending with JSON blob)
  const jsonRatio = (content.match(/[{}\[\]",:]/g) || []).length / content.length;
  if (jsonRatio > 0.25) return null;

  // Status changes (idle, running, etc.)
  if (isStatus) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-zinc-600">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="uppercase tracking-wider">{content}</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
    );
  }

  const displayContent = content.length > 800 ? content.slice(0, 800) + "..." : content;

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 text-xs">
      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400/60" />
      <div className="min-w-0 flex-1 text-zinc-300 leading-relaxed break-words">
        {renderMarkdown(displayContent)}
      </div>
      <span className="shrink-0 font-mono text-[10px] text-zinc-600">
        {formatTime(entry.timestamp)}
      </span>
    </div>
  );
}

export default function AgentLogPanel({ agentId, executionId }: AgentLogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());

  const fetchHistory = useCallback(async (id: string, execId?: string) => {
    try {
      const params = new URLSearchParams();
      if (execId) params.set("execution_id", execId);
      const res = await fetch(`/api/agents/${id}/activity?${params}`);
      if (!res.ok) return;
      const data: Array<{
        id: string;
        timestamp: string;
        type: string;
        direction?: string;
        content: string;
        toolName?: string;
        metadata?: Record<string, string>;
      }> = await res.json();

      const entries: LogEntry[] = data.map((msg) => {
        seenIds.current.add(msg.id);
        const msgType = msg.type === "tool_call" ? "tool_request"
          : msg.type === "tool_result" ? "tool_response"
          : (msg.type || "message") as LogEntry["type"];
        return {
          id: msg.id,
          timestamp: msg.timestamp,
          type: msgType,
          direction: (msg.direction as "incoming" | "outgoing") || undefined,
          content: msg.content,
          toolName: msg.toolName || msg.metadata?.tool_name,
          metadata: msg.metadata,
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
    setLogs([]);
    setHistoryLoaded(false);
    seenIds.current.clear();
    fetchHistory(agentId, executionId);
    const interval = setInterval(() => fetchHistory(agentId, executionId), 2000);
    return () => clearInterval(interval);
  }, [agentId, executionId, fetchHistory]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Only auto-scroll if user is near the bottom (within 150px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  if (!agentId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an agent to view logs.
      </div>
    );
  }

  const groups = groupLogs(logs);

  // Count tool calls for the header
  const toolCount = groups.filter((g) => g.kind === "tool").length;

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
        <Terminal className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">Activity</span>
        {toolCount > 0 && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
            {toolCount} tool {toolCount === 1 ? "call" : "calls"}
          </span>
        )}
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className="py-1">
          {logs.length === 0 ? (
            <p className="py-8 text-center text-xs text-zinc-500">
              {historyLoaded ? "No activity yet." : "Loading activity..."}
            </p>
          ) : (
            groups.map((group, i) => {
              if (group.kind === "tool") {
                return <ToolCallRow key={group.request.id} group={group} />;
              }
              return <TextRow key={group.entry.id} entry={group.entry} />;
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
