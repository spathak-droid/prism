"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cpu, Play, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface FactoryTemplate {
  complexity: string;
  name: string;
  description: string;
  nodes: string[];
}

export default function FactoryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [task, setTask] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [complexity, setComplexity] = useState("simple");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetch("/api/factory/templates")
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => {});
  }, []);

  const handleBrowse = async () => {
    try {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.path) setTargetDir(data.path);
      }
    } catch {
      // Browser folder picker not available
    }
  };

  const handleRun = async () => {
    if (!task.trim()) {
      toast.error("Enter a task description");
      return;
    }
    if (!targetDir.trim()) {
      toast.error("Enter a target directory");
      return;
    }

    setRunning(true);
    try {
      const res = await fetch("/api/factory/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task: task.trim(),
          target_dir: targetDir.trim(),
          complexity,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to start");
      }

      const data = await res.json();
      toast.success("Factory pipeline started!");
      router.push(`/workflows/${data.workflowId}?execution=${data.executionId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to start factory pipeline");
      setRunning(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.complexity === complexity);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Cpu className="h-6 w-6" />
          Factory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Give it a task and a folder. Factory picks the agents, builds the pipeline, and runs it.
        </p>
      </div>

      {/* Task */}
      <div className="space-y-2">
        <Label htmlFor="task">What do you want to build?</Label>
        <Textarea
          id="task"
          placeholder="Create a todo app with React and Express. Users can add, edit, complete, and delete todos. Use SQLite for storage."
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={4}
          className="resize-none"
        />
      </div>

      {/* Target Directory */}
      <div className="space-y-2">
        <Label htmlFor="dir">Target directory</Label>
        <div className="flex gap-2">
          <Input
            id="dir"
            placeholder="/Users/you/projects/my-app"
            value={targetDir}
            onChange={(e) => setTargetDir(e.target.value)}
          />
          <Button variant="outline" size="icon" onClick={handleBrowse} title="Browse">
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Complexity */}
      <div className="space-y-2">
        <Label>Complexity</Label>
        <div className="grid grid-cols-3 gap-3">
          {templates.map((t) => (
            <Card
              key={t.complexity}
              className={`cursor-pointer transition-all ${
                complexity === t.complexity
                  ? "border-primary bg-primary/5"
                  : "hover:border-muted-foreground/30"
              }`}
              onClick={() => setComplexity(t.complexity)}
            >
              <CardContent className="p-4">
                <div className="font-medium text-sm">{t.name}</div>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.nodes.map((n) => (
                    <Badge key={n} variant="secondary" className="text-[10px]">
                      {n}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Pipeline Preview */}
      {selectedTemplate && (
        <div className="text-xs text-muted-foreground">
          Pipeline: {selectedTemplate.nodes.join(" → ")}
        </div>
      )}

      {/* Run */}
      <Button
        onClick={handleRun}
        disabled={running || !task.trim() || !targetDir.trim()}
        className="w-full"
        size="lg"
      >
        {running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Starting pipeline...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Run Factory
          </>
        )}
      </Button>
    </div>
  );
}
