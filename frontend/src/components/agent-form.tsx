"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useAgentStore } from "@/lib/store";
import { apiFetch } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  model: string;
  provider: string;
  tools: string[];
  channels: string[];
  schedule: string | null;
  scheduledTask: string | null;
  memory: Record<string, string>;
  guardrails: Record<string, unknown>;
  [key: string]: unknown;
}

interface AgentFormProps {
  agent?: Agent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const AVAILABLE_TOOLS = [
  { id: "developer", name: "Developer", description: "Shell, file edit, write, directory tree" },
  { id: "analyze", name: "Analyze", description: "Code analysis and understanding" },
  { id: "computercontroller", name: "Computer Controller", description: "Screen control, mouse, keyboard" },
  { id: "memory", name: "Memory", description: "Persistent memory across sessions" },
];

const MODEL_OPTIONS: Record<string, { value: string; label: string }[]> = {
  "claude-code": [
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-haiku-4-20250514", label: "Claude Haiku 4" },
  ],
  anthropic: [
    { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-haiku-4-20250514", label: "Claude Haiku 4" },
  ],
  ollama: [
    { value: "llama3", label: "Llama 3" },
    { value: "codellama", label: "Code Llama" },
    { value: "mistral", label: "Mistral" },
  ],
};

function safeArr(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function safeObj(val: unknown): Record<string, unknown> {
  if (typeof val === "object" && val && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return {}; } }
  return {};
}

export default function AgentForm({ agent, open, onOpenChange, onSuccess }: AgentFormProps) {
  const { createAgent, updateAgent } = useAgentStore();
  const isEditing = !!agent;

  const [name, setName] = useState("");
  const [role, setRole] = useState("assistant");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [provider, setProvider] = useState("claude-code");
  const [model, setModel] = useState("claude-opus-4-20250514");
  const [tools, setTools] = useState<string[]>(["developer"]);
  const [channelInternal, setChannelInternal] = useState(true);
  const [channelTelegram, setChannelTelegram] = useState(false);
  const [schedule, setSchedule] = useState("");
  const [scheduledTask, setScheduledTask] = useState("");
  const [memory, setMemory] = useState("{}");
  const [costLimit, setCostLimit] = useState("1.0");
  const [rateLimit, setRateLimit] = useState("60");
  const [interactionMode, setInteractionMode] = useState("auto");
  const [availableSkills, setAvailableSkills] = useState<{ id: string; name: string; description: string; type: string; category: string }[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ running: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (agent) {
      setName(agent.name); setRole(agent.role); setSystemPrompt(agent.systemPrompt);
      setProvider(agent.provider); setModel(agent.model);
      setTools(safeArr(agent.tools).length ? safeArr(agent.tools) : ["developer"]);
      const ch = safeArr(agent.channels);
      setChannelInternal(ch.includes("internal") || ch.length === 0);
      setChannelTelegram(ch.includes("telegram"));
      setSchedule(agent.schedule ?? ""); setScheduledTask(agent.scheduledTask ?? "");
      setMemory(JSON.stringify(agent.memory ?? {}, null, 2));
      const g = safeObj(agent.guardrails);
      setCostLimit(String(g.cost_limit ?? g.costLimit ?? 1.0));
      setRateLimit(String(g.rate_limit ?? g.rateLimit ?? 60));
      const ir = safeObj(agent.interaction_rules ?? agent.interactionRules);
      setInteractionMode((ir.mode as string) || "auto");
      try { setSelectedSkills(JSON.parse((agent.skills as string) || "[]")); } catch { setSelectedSkills([]); }
    } else {
      setName(""); setRole("assistant"); setSystemPrompt("You are a helpful AI agent.");
      setProvider("claude-code"); setModel("claude-opus-4-20250514"); setTools(["developer"]);
      setChannelInternal(true); setChannelTelegram(false);
      setSchedule(""); setScheduledTask(""); setMemory("{}");
      setCostLimit("1.0"); setRateLimit("60");
      setInteractionMode("auto"); setSelectedSkills([]);
    }
    apiFetch("/api/telegram/status").then(setTelegramStatus).catch(() => setTelegramStatus(null));
    apiFetch("/api/skills").then(setAvailableSkills).catch(() => setAvailableSkills([]));
  }, [open, agent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const channels: string[] = [];
    if (channelInternal) channels.push("internal");
    if (channelTelegram) channels.push("telegram");
    let memObj = {};
    try { memObj = JSON.parse(memory); } catch {}

    const payload = {
      name, role, system_prompt: systemPrompt, provider, model, tools, channels,
      schedule: schedule || null, scheduled_task: scheduledTask || null,
      memory: memObj,
      guardrails: { cost_limit: parseFloat(costLimit) || 1.0, rate_limit: parseInt(rateLimit) || 60, blocked_actions: [] },
      interaction_rules: JSON.stringify({ mode: interactionMode }),
      skills: JSON.stringify(selectedSkills),
    };

    try {
      if (isEditing && agent) {
        await updateAgent(agent.id, payload as unknown as Record<string, unknown>);
      } else {
        await createAgent(payload as unknown as Record<string, unknown>);
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Agent" : "Create Agent"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update agent configuration." : "Configure a new AI agent."}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="model">Model</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="channels">Channels</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            {/* General */}
            <TabsContent value="general" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent" required />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="assistant" />
              </div>
              <div className="space-y-2">
                <Label>System Prompt</Label>
                <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="You are a helpful AI agent..." rows={8} className="font-mono text-sm" />
              </div>
            </TabsContent>

            {/* Model */}
            <TabsContent value="model" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={(v) => { setProvider(v); const m = MODEL_OPTIONS[v]; if (m?.length) setModel(m[0].value); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claude-code">Claude Code (Subscription)</SelectItem>
                    <SelectItem value="anthropic">Anthropic API</SelectItem>
                    <SelectItem value="ollama">Ollama (Local)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(MODEL_OPTIONS[provider] || []).map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Tools */}
            <TabsContent value="tools" className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">Select Goose extensions for this agent.</p>
              {AVAILABLE_TOOLS.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-md border p-4">
                  <div>
                    <Label>{t.name}</Label>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                  <Switch checked={tools.includes(t.id)} onCheckedChange={(c) => setTools(c ? [...tools, t.id] : tools.filter((x) => x !== t.id))} />
                </div>
              ))}
              {availableSkills.length > 0 && (
                <>
                  <div className="pt-2">
                    <Label className="text-base">Skills</Label>
                    <p className="text-sm text-muted-foreground">Enable additional skills for this agent.</p>
                  </div>
                  {availableSkills.map((skill) => (
                    <div key={skill.id} className="flex items-center justify-between rounded-md border p-4">
                      <div>
                        <Label>{skill.name}</Label>
                        <p className="text-xs text-muted-foreground">{skill.description}</p>
                        {skill.category && <Badge variant="secondary" className="mt-1 text-[10px]">{skill.category}</Badge>}
                      </div>
                      <Switch
                        checked={selectedSkills.includes(skill.id)}
                        onCheckedChange={(c) =>
                          setSelectedSkills(c ? [...selectedSkills, skill.id] : selectedSkills.filter((x) => x !== skill.id))
                        }
                      />
                    </div>
                  ))}
                </>
              )}
            </TabsContent>

            {/* Channels */}
            <TabsContent value="channels" className="space-y-4 pt-4">
              <div className="flex items-center justify-between rounded-md border p-4">
                <div><Label>Internal</Label><p className="text-xs text-muted-foreground">Chat via web interface</p></div>
                <Switch checked={channelInternal} onCheckedChange={setChannelInternal} />
              </div>
              <div className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div><Label>Telegram</Label><p className="text-xs text-muted-foreground">Bridge to Telegram bot</p></div>
                  <Switch checked={channelTelegram} onCheckedChange={setChannelTelegram} />
                </div>
                {channelTelegram && (
                  <div className="rounded bg-muted/50 p-3 text-xs space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Bot:</span>
                      {telegramStatus?.running
                        ? <Badge className="text-[10px] bg-green-600">Connected</Badge>
                        : <Badge variant="secondary" className="text-[10px]">Not running</Badge>}
                    </div>
                    {!telegramStatus?.running && <p className="text-muted-foreground">Set TELEGRAM_BOT_TOKEN in .env and restart.</p>}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Advanced */}
            <TabsContent value="advanced" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Schedule (cron)</Label>
                <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="*/5 * * * *" className="font-mono" />
                <p className="text-xs text-muted-foreground">Leave empty for on-demand. Cron syntax for recurring.</p>
              </div>
              <div className="space-y-2">
                <Label>Scheduled Task</Label>
                <Textarea value={scheduledTask} onChange={(e) => setScheduledTask(e.target.value)} placeholder="What should the agent do on schedule?" rows={2} />
              </div>
              <div className="space-y-2">
                <Label>Persistent Memory (JSON)</Label>
                <Textarea value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="{}" rows={3} className="font-mono text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cost Limit ($)</Label>
                  <Input type="number" step="0.01" value={costLimit} onChange={(e) => setCostLimit(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Rate Limit (req/min)</Label>
                  <Input type="number" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Interaction Mode</Label>
                <Select value={interactionMode} onValueChange={setInteractionMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Fully autonomous</SelectItem>
                    <SelectItem value="supervised">Requires approval for actions</SelectItem>
                    <SelectItem value="manual">Human drives each step</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Controls how much human oversight the agent requires.</p>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? (isEditing ? "Saving..." : "Creating...") : (isEditing ? "Save Changes" : "Create Agent")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
