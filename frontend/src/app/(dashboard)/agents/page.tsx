"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Plus } from "lucide-react";
import { useAgentStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import AgentForm from "@/components/agent-form";

function StatusDot({ status }: { status: string }) {
  const color =
    status === "running"
      ? "bg-green-500"
      : status === "error"
      ? "bg-red-500"
      : "bg-gray-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export default function AgentsPage() {
  const router = useRouter();
  const { agents, fetchAgents, loading } = useAgentStore();
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and interact with your AI agents.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Agent
        </Button>
      </div>

      {/* Content */}
      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading agents…
        </div>
      ) : agents.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground border border-dashed border-border rounded-lg">
          <Bot className="h-12 w-12 opacity-40" />
          <p className="text-sm">No agents yet. Create one to get started.</p>
          <Button variant="outline" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Agent
          </Button>
        </div>
      ) : (
        /* Agent grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => router.push(`/agents/${agent.id}`)}
              className="cursor-pointer rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm truncate">{agent.name}</span>
                </div>
                <StatusDot status={agent.status} />
              </div>
              <div className="space-y-1">
                {agent.role && (
                  <p className="text-xs text-muted-foreground truncate">
                    Role: {agent.role}
                  </p>
                )}
                {agent.model && (
                  <p className="text-xs text-muted-foreground truncate">
                    Model: {agent.model}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AgentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => {
          setFormOpen(false);
          fetchAgents();
        }}
      />
    </div>
  );
}
