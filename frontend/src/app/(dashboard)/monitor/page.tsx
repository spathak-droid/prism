"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Wifi, WifiOff, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentStore, useProjectStore, type Message } from "@/lib/store";

interface MonitorEvent {
  id: string;
  type: string;
  timestamp: string;
  agentId?: string;
  status?: string;
  content?: string;
  direction?: string;
  workflowId?: string;
  executionId?: string;
  toolName?: string;
  toolType?: string;
  projectId?: string;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-green-500"
      : status === "error"
        ? "bg-red-500"
        : "bg-gray-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function formatTimeAgo(ts: string) {
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  } catch {
    return "";
  }
}

function EventBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    "agent:status": "bg-blue-900/50 text-blue-400 border-blue-800",
    "agent:message": "bg-purple-900/50 text-purple-400 border-purple-800",
    "agent:tool": "bg-amber-900/50 text-amber-400 border-amber-800",
    "workflow:update": "bg-cyan-900/50 text-cyan-400 border-cyan-800",
    connected: "bg-green-900/50 text-green-400 border-green-800",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[type] || "bg-muted text-muted-foreground"}`}
    >
      {type.replace("agent:", "").replace("workflow:", "")}
    </span>
  );
}

function formatEvent(
  event: MonitorEvent,
  agentNameMap: Map<string, string>
): string {
  const agentName = event.agentId
    ? agentNameMap.get(event.agentId) || event.agentId.slice(0, 8)
    : "";
  switch (event.type) {
    case "agent:status":
      return `${agentName} → ${event.status}`;
    case "agent:message":
      return `${agentName} ${event.direction === "incoming" ? "⬅" : "➡"} ${(event.content || "").slice(0, 150)}`;
    case "agent:tool":
      return `${agentName} ${event.toolType === "tool_request" ? "▶" : "✓"} ${event.toolName || "tool"}: ${(event.content || "").slice(0, 120)}`;
    case "workflow:update":
      return `Workflow ${event.status}`;
    case "connected":
      return "Monitor connected";
    default:
      return JSON.stringify(event).slice(0, 100);
  }
}

export default function MonitorPage() {
  const { agents, fetchAgents } = useAgentStore();
  const { projects, fetchProjects } = useProjectStore();
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const feedEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/messages?limit=50");
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAgents();
    fetchProjects();
    fetchMessages();
    const interval = setInterval(() => {
      fetchAgents();
      fetchMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents, fetchProjects, fetchMessages]);

  // SSE connection
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const event: MonitorEvent = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: data.type || "unknown",
          timestamp: data.timestamp || new Date().toISOString(),
          agentId: data.agentId,
          status: data.status,
          content: data.content,
          direction: data.direction,
          workflowId: data.workflowId,
          executionId: data.executionId,
          toolName: data.toolName,
          toolType: data.toolType,
          projectId: data.projectId,
        };
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > 200 ? next.slice(-200) : next;
        });
      } catch { /* ignore */ }
    };
    es.onerror = () => setConnected(false);
    return () => { es.close(); setConnected(false); };
  }, []);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));

  // Filter events by selected project
  const filteredEvents = selectedProjectId === "all"
    ? events
    : events.filter((e) => e.projectId === selectedProjectId);

  const totalMessages = messages.length;
  const telegramMessages = messages.filter((m) => m.channel === "telegram").length;
  const runningAgents = agents.filter((a) => a.status === "running").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Real-time agent activity and system events.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Project Filter */}
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge
            variant={connected ? "default" : "secondary"}
            className="flex items-center gap-1.5"
          >
            {connected ? (
              <><Wifi className="h-3 w-3" /> Connected</>
            ) : (
              <><WifiOff className="h-3 w-3" /> Disconnected</>
            )}
          </Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{agents.length}</div>
            <div className="text-xs text-muted-foreground">Total Agents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-500">{runningAgents}</div>
            <div className="text-xs text-muted-foreground">Running</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{totalMessages}</div>
            <div className="text-xs text-muted-foreground">Messages</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{telegramMessages}</div>
            <div className="text-xs text-muted-foreground">Telegram Messages</div>
          </CardContent>
        </Card>
      </div>

      {/* Agent status cards */}
      <div>
        <h2 className="text-sm font-medium mb-3">Agent Status</h2>
        <div className="flex flex-wrap gap-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="w-56">
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <StatusDot status={agent.status} />
                  <span className="truncate text-sm font-medium">{agent.name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {agent.provider}/{agent.model}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Event Feed */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Live Events</CardTitle>
              <span className="text-xs text-muted-foreground">({filteredEvents.length})</span>
              {filteredEvents.length > 0 && (
                <button
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setEvents([])}
                >
                  Clear
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {filteredEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {connected
                    ? "Listening... Chat with an agent or run a workflow."
                    : "Connecting..."}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs"
                    >
                      <span className="shrink-0 font-mono text-muted-foreground w-[60px] text-[10px]">
                        {formatTime(event.timestamp)}
                      </span>
                      <EventBadge type={event.type} />
                      <span className="min-w-0 flex-1 break-words">
                        {formatEvent(event, agentNameMap)}
                      </span>
                    </div>
                  ))}
                  <div ref={feedEndRef} />
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Messages */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Message Log</CardTitle>
              <span className="text-xs text-muted-foreground">({messages.length})</span>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No messages yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {[...messages].reverse().map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-md border px-2.5 py-1.5 text-xs space-y-0.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground text-[10px]">
                          {formatTimeAgo(msg.timestamp)}
                        </span>
                        {msg.fromAgentId && (
                          <span className="font-medium">
                            {agentNameMap.get(msg.fromAgentId) || "Agent"}
                          </span>
                        )}
                        {!msg.fromAgentId && (
                          <span className="text-muted-foreground">User</span>
                        )}
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                          {msg.channel}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground line-clamp-2">
                        {msg.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
