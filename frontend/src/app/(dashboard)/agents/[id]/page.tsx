"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bot,
  Loader2,
  Send,
  Trash2,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAgentStore, useMessageStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import AgentForm from "@/components/agent-form";

// ─── Types ─────────────────────────────────────────────────────────────────

type LocalMessage =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool_request"; name: string; content: string }
  | { kind: "tool_response"; name: string; content: string };

// ─── ToolBubble ────────────────────────────────────────────────────────────

function ToolBubble({
  type,
  name,
  content,
}: {
  type: "request" | "response";
  name: string;
  content: string;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs font-mono max-w-xl ${
        type === "request"
          ? "border-amber-700 bg-amber-950/40 text-amber-300"
          : "border-green-700 bg-green-950/40 text-green-300"
      }`}
    >
      <div className="font-semibold mb-1">
        {type === "request" ? "⚙ tool call: " : "✓ tool result: "}
        <span className="text-foreground">{name}</span>
      </div>
      <pre className="whitespace-pre-wrap break-all">{content}</pre>
    </div>
  );
}

// ─── StatusDot ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-green-500"
      : status === "error"
      ? "bg-red-500"
      : "bg-gray-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const { selectedAgent, fetchAgent, deleteAgent } = useAgentStore();
  const { messages, fetchMessages, clearMessages } = useMessageStore();

  const [editOpen, setEditOpen] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch agent + message history
  useEffect(() => {
    fetchAgent(agentId);
    clearMessages();
    fetchMessages(agentId, 50);
    setLocalMessages([]);
    setStreamingText(null);
  }, [agentId, fetchAgent, fetchMessages, clearMessages]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, streamingText, messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);
    setLocalMessages((prev) => [...prev, { kind: "user", text }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = `/api/stream/${agentId}?message=${encodeURIComponent(text)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantAccum = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;

          let parsed: {
            type: string;
            content?: string;
            toolName?: string;
            toolArgs?: unknown;
            error?: string;
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }

          if (parsed.type === "text") {
            assistantAccum += parsed.content ?? "";
            setStreamingText(assistantAccum);
          } else if (parsed.type === "tool_use") {
            // Flush accumulated text first
            if (assistantAccum) {
              const captured = assistantAccum;
              setLocalMessages((prev) => [
                ...prev,
                { kind: "assistant", text: captured },
              ]);
              assistantAccum = "";
              setStreamingText(null);
            }
            setLocalMessages((prev) => [
              ...prev,
              {
                kind: "tool_request",
                name: parsed.toolName ?? "tool",
                content:
                  typeof parsed.toolArgs === "string"
                    ? parsed.toolArgs
                    : JSON.stringify(parsed.toolArgs ?? {}, null, 2),
              },
            ]);
          } else if (parsed.type === "tool_result") {
            setLocalMessages((prev) => [
              ...prev,
              {
                kind: "tool_response",
                name: parsed.toolName ?? "tool",
                content: parsed.content ?? "",
              },
            ]);
          } else if (parsed.type === "error") {
            setLocalMessages((prev) => [
              ...prev,
              {
                kind: "assistant",
                text: `Error: ${parsed.error ?? "Unknown error"}`,
              },
            ]);
          }
        }
      }

      // Flush any remaining assistant text
      if (assistantAccum) {
        setLocalMessages((prev) => [
          ...prev,
          { kind: "assistant", text: assistantAccum },
        ]);
      }
      setStreamingText(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setLocalMessages((prev) => [
          ...prev,
          { kind: "assistant", text: "Connection error. Please try again." },
        ]);
      }
      setStreamingText(null);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [agentId, input, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this agent?")) return;
    await deleteAgent(agentId);
    router.push("/agents");
  };

  const agent = selectedAgent;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Agent info ── */}
      <div className="hidden lg:flex flex-col w-72 shrink-0 border-r border-border overflow-y-auto">
        <div className="p-4 space-y-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-fit -ml-2"
            onClick={() => router.push("/agents")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Agents
          </Button>

          {agent ? (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-muted-foreground" />
                <span className="font-semibold truncate">{agent.name}</span>
                <StatusDot status={agent.status} />
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                {agent.role && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Role</span>
                    <span className="truncate">{agent.role}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="truncate">{agent.provider}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Model</span>
                  <span className="truncate">{agent.model}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline">{agent.status}</Badge>
                </div>
              </div>

              {agent.channels && agent.channels.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Channels</p>
                    <div className="flex flex-wrap gap-1">
                      {agent.channels.map((c) => (
                        <Badge key={c} variant="secondary" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete
                </Button>
              </div>
            </Card>
          ) : (
            <div className="text-sm text-muted-foreground">Loading agent…</div>
          )}
        </div>
      </div>

      {/* ── Right: Chat ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/agents")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {agent && (
            <>
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{agent.name}</span>
              <StatusDot status={agent.status} />
            </>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {/* Persisted messages */}
            {messages.map((msg) => {
              const isUser = msg.fromAgentId === null;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[75%] text-sm ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Local streaming messages */}
            {localMessages.map((msg, idx) => {
              if (msg.kind === "user") {
                return (
                  <div key={idx} className="flex justify-end">
                    <div className="rounded-lg px-4 py-2 max-w-[75%] text-sm bg-primary text-primary-foreground">
                      {msg.text}
                    </div>
                  </div>
                );
              }
              if (msg.kind === "assistant") {
                return (
                  <div key={idx} className="flex justify-start">
                    <div className="rounded-lg px-4 py-2 max-w-[75%] text-sm bg-muted">
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                );
              }
              if (msg.kind === "tool_request") {
                return (
                  <div key={idx} className="flex justify-start">
                    <ToolBubble
                      type="request"
                      name={msg.name}
                      content={msg.content}
                    />
                  </div>
                );
              }
              if (msg.kind === "tool_response") {
                return (
                  <div key={idx} className="flex justify-start">
                    <ToolBubble
                      type="response"
                      name={msg.name}
                      content={msg.content}
                    />
                  </div>
                );
              }
              return null;
            })}

            {/* Currently streaming */}
            {streamingText !== null && (
              <div className="flex justify-start items-start gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-1 shrink-0" />
                <div className="rounded-lg px-4 py-2 max-w-[75%] text-sm bg-muted">
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{streamingText}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* Streaming indicator (no text yet) */}
            {streaming && streamingText === null && (
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-2 bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message agent… (Enter to send, Shift+Enter for newline)"
              className="resize-none min-h-[44px] max-h-40"
              rows={1}
              disabled={streaming}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              size="icon"
              className="shrink-0"
            >
              {streaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      {agent && (
        <AgentForm
          agent={agent}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSuccess={() => {
            setEditOpen(false);
            fetchAgent(agentId);
          }}
        />
      )}
    </div>
  );
}
