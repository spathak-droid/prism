"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Wifi, WifiOff, MessageSquare, Send, ChevronRight, Filter } from "lucide-react";
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

interface PersistedEvent {
  id: string;
  type: string;
  timestamp: string;
  agentId?: string;
  projectId?: string;
  status?: string;
  content?: string;
  direction?: string;
  channel?: string;
  workflowId?: string;
  executionId?: string;
  toolName?: string;
  toolType?: string;
  metadata?: Record<string, unknown>;
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

function EventTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    "agent:status": "bg-blue-900/50 text-blue-400 border-blue-800",
    "agent:message": "bg-purple-900/50 text-purple-400 border-purple-800",
    "agent:tool": "bg-amber-900/50 text-amber-400 border-amber-800",
    "workflow:update": "bg-cyan-900/50 text-cyan-400 border-cyan-800",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[type] || "bg-muted text-muted-foreground border-border"}`}
    >
      {type.replace("agent:", "").replace("workflow:", "")}
    </span>
  );
}

function ChannelBadge({ channel }: { channel?: string }) {
  if (!channel) return null;
  const styles: Record<string, string> = {
    telegram: "border-blue-800 text-blue-400",
    internal: "border-gray-700 text-gray-400",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[channel] || "border-gray-700 text-gray-400"}`}
    >
      {channel}
    </span>
  );
}

function DirectionBadge({ direction }: { direction?: string }) {
  if (!direction) return null;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        direction === "incoming"
          ? "border-blue-800 text-blue-400"
          : "border-green-800 text-green-400"
      }`}
    >
      {direction === "incoming" ? "IN" : "OUT"}
    </span>
  );
}

export default function MonitorPage() {
  const { agents, fetchAgents } = useAgentStore();
  const { projects, fetchProjects } = useProjectStore();
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<PersistedEvent[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/messages?limit=100");
      if (res.ok) setMessages(await res.json());
    } catch { /* ignore */ }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (selectedProjectId !== "all") params.set("projectId", selectedProjectId);
      if (selectedEventType !== "all") params.set("type", selectedEventType);
      if (selectedChannel !== "all") params.set("channel", selectedChannel);
      const res = await fetch(`/api/events-log?${params}`);
      if (res.ok) setEvents(await res.json());
    } catch { /* ignore */ }
  }, [selectedProjectId, selectedEventType, selectedChannel]);

  useEffect(() => {
    fetchAgents();
    fetchProjects();
    fetchMessages();
    fetchEvents();
    // Poll agents/messages at a slower cadence (SSE handles events in real-time)
    const interval = setInterval(() => {
      fetchAgents();
      fetchMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchAgents, fetchProjects, fetchMessages, fetchEvents]);

  // SSE for real-time events — parse data directly instead of refetching
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (event.type === "heartbeat") return;
        const mapped: PersistedEvent = {
          id: event.id || `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: event.type,
          timestamp: event.timestamp || new Date().toISOString(),
          agentId: event.agent_id,
          projectId: event.project_id,
          status: event.status,
          content: event.content,
          direction: event.direction,
          channel: event.channel,
          workflowId: event.workflow_id,
          executionId: event.execution_id,
          toolName: event.tool_name,
          toolType: event.tool_type,
        };
        setEvents((prev) => [...prev, mapped]);
        // Also refresh agents since status may have changed
        fetchAgents();
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => setConnected(false);
    return () => { es.close(); setConnected(false); };
  }, [fetchAgents]);

  const agentNameMap = new Map(agents.map((a) => [a.id, a.name]));
  const projectNameMap = new Map(projects.map((p) => [p.id, p.name]));

  const [usageData, setUsageData] = useState<Record<string, { tokens: number; messages: number }>>({});

  // Fetch usage stats
  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch("/api/agents/usage/all");
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, { tokens: number; messages: number }> = {};
          for (const entry of data) {
            map[entry.agentId] = { tokens: entry.approximateTokens, messages: entry.messageCount };
          }
          setUsageData(map);
        }
      } catch { /* ignore */ }
    }
    fetchUsage();
    const interval = setInterval(fetchUsage, 10000);
    return () => clearInterval(interval);
  }, []);

  const runningAgents = agents.filter((a) => a.status === "running").length;
  const telegramMessages = messages.filter((m) => m.channel === "telegram").length;
  const totalTokens = Object.values(usageData).reduce((sum, u) => sum + u.tokens, 0);

  // Get unique event types for filter
  const eventTypes = [...new Set(events.map((e) => e.type))];

  // Selected event detail
  const selectedEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId)
    : null;

  // Get logs (messages) related to selected event's agent
  const selectedEventLogs = selectedEvent?.agentId
    ? messages.filter(
        (m) =>
          m.fromAgentId === selectedEvent.agentId ||
          m.toAgentId === selectedEvent.agentId
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitor</h1>
          <p className="text-sm text-muted-foreground">
            System events, agent activity, and message logs.
          </p>
        </div>
        <Badge
          variant={connected ? "default" : "secondary"}
          className="flex items-center gap-1.5"
        >
          {connected ? (
            <><Wifi className="h-3 w-3" /> Live</>
          ) : (
            <><WifiOff className="h-3 w-3" /> Disconnected</>
          )}
        </Badge>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-3">
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
            <div className="text-2xl font-bold">{events.length}</div>
            <div className="text-xs text-muted-foreground">Events</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{telegramMessages}</div>
            <div className="text-xs text-muted-foreground">Telegram</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens}</div>
            <div className="text-xs text-muted-foreground">Est. Tokens</div>
          </CardContent>
        </Card>
      </div>

      {/* Agent status cards */}
      <div>
        <h2 className="text-sm font-medium mb-3">Agent Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {agents.map((agent) => (
            <Card key={agent.id}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <StatusDot status={agent.status} />
                  <span className="truncate text-sm font-medium">{agent.name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {agent.model?.split("-").slice(0, 2).join("-") || agent.provider}
                </div>
                {usageData[agent.id] && usageData[agent.id].tokens > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    {usageData[agent.id].tokens > 1000
                      ? `${(usageData[agent.id].tokens / 1000).toFixed(1)}k tokens`
                      : `${usageData[agent.id].tokens} tokens`}
                    {" · "}{usageData[agent.id].messages} msgs
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); setSelectedEventId(null); }}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedEventType} onValueChange={(v) => { setSelectedEventType(v); setSelectedEventId(null); }}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {eventTypes.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedChannel} onValueChange={(v) => { setSelectedChannel(v); setSelectedEventId(null); }}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="telegram">Telegram</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Events → Logs two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Events Panel */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Events</CardTitle>
              <span className="text-xs text-muted-foreground">({events.length})</span>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No events recorded yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {[...events].reverse().map((event) => (
                    <button
                      key={event.id}
                      onClick={() => setSelectedEventId(event.id === selectedEventId ? null : event.id)}
                      className={`w-full text-left flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                        event.id === selectedEventId
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="shrink-0 font-mono text-muted-foreground w-[60px] text-[10px] pt-0.5">
                        {formatTime(event.timestamp)}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <EventTypeBadge type={event.type} />
                          <ChannelBadge channel={event.channel} />
                          <DirectionBadge direction={event.direction} />
                          {event.agentId && (
                            <span className="text-[10px] font-medium">
                              {agentNameMap.get(event.agentId) || event.agentId.slice(0, 8)}
                            </span>
                          )}
                          {event.projectId && (
                            <span className="text-[10px] text-muted-foreground">
                              {projectNameMap.get(event.projectId) || event.projectId.slice(0, 8)}
                            </span>
                          )}
                        </div>
                        {event.content && (
                          <p className="text-muted-foreground line-clamp-1">
                            {event.content}
                          </p>
                        )}
                        {event.status && !event.content && (
                          <p className="text-muted-foreground">{event.status}</p>
                        )}
                      </div>
                      <ChevronRight className={`shrink-0 h-3 w-3 text-muted-foreground mt-0.5 transition-transform ${
                        event.id === selectedEventId ? "rotate-90" : ""
                      }`} />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Logs Panel — shows detail for selected event */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">
                {selectedEvent ? "Event Detail & Logs" : "Logs"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {!selectedEvent ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Select an event to see details and related logs.
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Event Detail */}
                  <div className="rounded-md border p-3 space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <EventTypeBadge type={selectedEvent.type} />
                      <ChannelBadge channel={selectedEvent.channel} />
                      <DirectionBadge direction={selectedEvent.direction} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Time: </span>
                        {formatTime(selectedEvent.timestamp)}
                      </div>
                      {selectedEvent.agentId && (
                        <div>
                          <span className="text-muted-foreground">Agent: </span>
                          {agentNameMap.get(selectedEvent.agentId) || selectedEvent.agentId.slice(0, 8)}
                        </div>
                      )}
                      {selectedEvent.projectId && (
                        <div>
                          <span className="text-muted-foreground">Project: </span>
                          {projectNameMap.get(selectedEvent.projectId) || selectedEvent.projectId.slice(0, 8)}
                        </div>
                      )}
                      {selectedEvent.status && (
                        <div>
                          <span className="text-muted-foreground">Status: </span>
                          {selectedEvent.status}
                        </div>
                      )}
                      {selectedEvent.toolName && (
                        <div>
                          <span className="text-muted-foreground">Tool: </span>
                          {selectedEvent.toolName}
                        </div>
                      )}
                      {selectedEvent.workflowId && (
                        <div>
                          <span className="text-muted-foreground">Workflow: </span>
                          {selectedEvent.workflowId.slice(0, 8)}
                        </div>
                      )}
                    </div>
                    {selectedEvent.content && (
                      <div className="mt-2 rounded bg-muted/50 p-2">
                        <p className="text-muted-foreground whitespace-pre-wrap">{selectedEvent.content}</p>
                      </div>
                    )}
                  </div>

                  {/* Related Agent Logs */}
                  {selectedEvent.agentId && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-muted-foreground">
                        Agent Message Log ({selectedEventLogs.length})
                      </h3>
                      {selectedEventLogs.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No messages for this agent.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {[...selectedEventLogs].reverse().map((msg) => (
                            <div
                              key={msg.id}
                              className="rounded-md border px-2.5 py-1.5 text-xs space-y-0.5"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-muted-foreground text-[10px]">
                                  {formatTimeAgo(msg.timestamp)}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 ${
                                    msg.fromAgentId
                                      ? "border-green-800 text-green-400"
                                      : "border-blue-800 text-blue-400"
                                  }`}
                                >
                                  {msg.fromAgentId ? "OUT" : "IN"}
                                </Badge>
                                {msg.fromAgentId ? (
                                  <span className="font-medium">
                                    {agentNameMap.get(msg.fromAgentId) || "Agent"}
                                  </span>
                                ) : (
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
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Telegram Log */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Telegram</CardTitle>
            <span className="text-xs text-muted-foreground">
              ({telegramMessages})
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            {telegramMessages === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No Telegram messages yet.
              </p>
            ) : (
              <div className="space-y-1">
                {[...messages]
                  .filter((m) => m.channel === "telegram")
                  .reverse()
                  .map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-md border px-2.5 py-1.5 text-xs space-y-0.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground text-[10px]">
                          {formatTimeAgo(msg.timestamp)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 ${
                            msg.fromAgentId
                              ? "border-green-800 text-green-400"
                              : "border-blue-800 text-blue-400"
                          }`}
                        >
                          {msg.fromAgentId ? "OUT" : "IN"}
                        </Badge>
                        {msg.fromAgentId ? (
                          <span className="font-medium">
                            {agentNameMap.get(msg.fromAgentId) || "Agent"} → User
                          </span>
                        ) : msg.toAgentId ? (
                          <span className="font-medium">
                            User → {agentNameMap.get(msg.toAgentId) || "Agent"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">User</span>
                        )}
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
  );
}
