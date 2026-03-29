"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { FolderOpen, ChevronRight, ChevronLeft, Lock } from "lucide-react";
import { useProjectStore } from "@/lib/store";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewProjectDialog({
  open,
  onOpenChange,
}: NewProjectDialogProps) {
  const router = useRouter();
  const { createProject, loading } = useProjectStore();

  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedPreset, setSelectedPreset] = useState<string | null>("simple");
  const [activeStages, setActiveStages] = useState<string[]>(["planner", "coder", "reviewer"]);

  const STAGE_ORDER = ["researcher", "planner", "approval", "coder", "reviewer", "deployer"] as const;
  const LOCKED_STAGES = new Set(["planner", "coder"]);

  const PRESETS: Record<string, { label: string; description: string; stages: string[] }> = {
    simple: {
      label: "Simple",
      description: "Plan, build, review",
      stages: ["planner", "coder", "reviewer"],
    },
    medium: {
      label: "Medium",
      description: "Research, plan, approve, build, review, deploy",
      stages: ["researcher", "planner", "approval", "coder", "reviewer", "deployer"],
    },
    complex: {
      label: "Complex",
      description: "Full pipeline with all stages",
      stages: ["researcher", "planner", "approval", "coder", "reviewer", "deployer"],
    },
  };

  const handlePresetSelect = (key: string) => {
    setSelectedPreset(key);
    setActiveStages([...PRESETS[key].stages]);
  };

  const handleToggleStage = (stage: string) => {
    if (LOCKED_STAGES.has(stage)) return;
    setActiveStages((prev) => {
      const next = prev.includes(stage)
        ? prev.filter((s) => s !== stage)
        : [...prev, stage].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
      const matchingPreset = Object.entries(PRESETS).find(
        ([, p]) => JSON.stringify(p.stages) === JSON.stringify(next)
      );
      setSelectedPreset(matchingPreset ? matchingPreset[0] : null);
      return next;
    });
  };

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      const data = await res.json();
      if (data.path) {
        setTargetDir(data.path);
      }
    } catch {
      // ignore
    } finally {
      setBrowsing(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !brief.trim() || !targetDir.trim()) return;
    const created = await createProject({
      name: name.trim(),
      brief: brief.trim(),
      targetDir: targetDir.trim(),
      stages: activeStages,
    });
    onOpenChange(false);
    resetForm();
    if (created?.id) {
      router.push(`/projects/${created.id}`);
    }
  };

  const resetForm = () => {
    setName("");
    setBrief("");
    setTargetDir("");
    setStep(1);
    setSelectedPreset("simple");
    setActiveStages(["planner", "coder", "reviewer"]);
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "New Project" : "Pipeline Configuration"}
          </DialogTitle>
          {step === 2 && (
            <p className="text-sm text-muted-foreground">
              Choose a preset or toggle individual stages
            </p>
          )}
        </DialogHeader>

        {step === 1 ? (
          <>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="proj-name">Name</Label>
                <Input
                  id="proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My App"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-brief">Brief</Label>
                <Textarea
                  id="proj-brief"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Describe what you want to build..."
                  rows={6}
                  className="resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-target">Target Directory</Label>
                <div className="flex gap-2">
                  <Input
                    id="proj-target"
                    value={targetDir}
                    onChange={(e) => setTargetDir(e.target.value)}
                    placeholder="/Users/san/Desktop/projects/my-app"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleBrowse}
                    disabled={browsing}
                    title="Browse for folder"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pick an existing folder or type a new path (it will be created)
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!name.trim() || !brief.trim() || !targetDir.trim()}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => handlePresetSelect(key)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    selectedPreset === key
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <p className="text-sm font-medium capitalize">{preset.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                </button>
              ))}
            </div>

            <div className="space-y-1.5 mt-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Stages {!selectedPreset && "(Custom)"}
              </Label>
              <div className="space-y-1">
                {STAGE_ORDER.map((stage) => {
                  const isActive = activeStages.includes(stage);
                  const isLocked = LOCKED_STAGES.has(stage);
                  return (
                    <button
                      key={stage}
                      onClick={() => handleToggleStage(stage)}
                      disabled={isLocked}
                      className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? "border-primary/50 bg-primary/5"
                          : "border-border opacity-50"
                      } ${isLocked ? "cursor-not-allowed" : "cursor-pointer hover:border-muted-foreground/50"}`}
                    >
                      <span className="capitalize">{stage === "coder" ? "Builder" : stage}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {isLocked && <Lock className="h-3 w-3" />}
                        {isActive ? "On" : "Off"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-1.5 overflow-x-auto py-1">
              {activeStages.map((stage, i) => (
                <div key={stage} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
                  <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 border border-primary/20 whitespace-nowrap capitalize">
                    {stage === "coder" ? "Builder" : stage}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                Create Project
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
