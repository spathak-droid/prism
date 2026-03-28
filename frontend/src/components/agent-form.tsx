"use client";

import { useState, useEffect } from "react";
import { useAgentStore, type Agent } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const BUILTIN_TOOLS = ["developer", "analyze", "todo", "summon"] as const;

interface AgentFormProps {
  agent?: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function AgentForm({
  agent,
  open,
  onOpenChange,
  onSuccess,
}: AgentFormProps) {
  const { createAgent, updateAgent, loading } = useAgentStore();

  // General
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  // Model
  const [provider, setProvider] = useState("claude-code");
  const [model, setModel] = useState("default");

  // Tools
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  // Populate when editing
  useEffect(() => {
    if (agent) {
      setName(agent.name ?? "");
      setRole(agent.role ?? "");
      setSystemPrompt(agent.systemPrompt ?? "");
      setProvider(agent.provider ?? "claude-code");
      setModel(agent.model ?? "default");
      setSelectedTools(new Set(agent.tools ?? []));
    } else {
      setName("");
      setRole("");
      setSystemPrompt("");
      setProvider("claude-code");
      setModel("default");
      setSelectedTools(new Set());
    }
  }, [agent, open]);

  const toggleTool = (tool: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) {
        next.delete(tool);
      } else {
        next.add(tool);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    const data: Partial<Agent> = {
      name,
      role,
      systemPrompt,
      provider,
      model,
      tools: Array.from(selectedTools),
    };

    if (agent) {
      await updateAgent(agent.id, data);
    } else {
      await createAgent(data);
    }

    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent ? "Edit Agent" : "Create Agent"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1">General</TabsTrigger>
            <TabsTrigger value="model" className="flex-1">Model</TabsTrigger>
            <TabsTrigger value="tools" className="flex-1">Tools</TabsTrigger>
          </TabsList>

          {/* ── General ── */}
          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Name</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Agent"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-role">Role</Label>
              <Input
                id="agent-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Software Engineer"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-system-prompt">System Prompt</Label>
              <Textarea
                id="agent-system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful software engineering agent…"
                rows={5}
                className="resize-none"
              />
            </div>
          </TabsContent>

          {/* ── Model ── */}
          <TabsContent value="model" className="space-y-4 mt-4">
            <div className="space-y-1.5">
              <Label htmlFor="agent-provider">Provider</Label>
              <Input
                id="agent-provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="claude-code"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agent-model">Model</Label>
              <Input
                id="agent-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="default"
              />
            </div>
          </TabsContent>

          {/* ── Tools ── */}
          <TabsContent value="tools" className="mt-4">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select built-in tools to enable for this agent.
              </p>
              {BUILTIN_TOOLS.map((tool) => (
                <div key={tool} className="flex items-center justify-between">
                  <Label htmlFor={`tool-${tool}`} className="capitalize cursor-pointer">
                    {tool}
                  </Label>
                  <Switch
                    id={`tool-${tool}`}
                    checked={selectedTools.has(tool)}
                    onCheckedChange={() => toggleTool(tool)}
                  />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !name.trim()}>
            {agent ? "Save Changes" : "Create Agent"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
