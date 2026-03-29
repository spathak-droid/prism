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
import { FolderOpen, ChevronRight } from "lucide-react";
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
  const { setPendingProject } = useProjectStore();

  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [browsing, setBrowsing] = useState(false);

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

  const handleNext = () => {
    if (!name.trim() || !brief.trim() || !targetDir.trim()) return;
    setPendingProject({
      name: name.trim(),
      brief: brief.trim(),
      targetDir: targetDir.trim(),
    });
    onOpenChange(false);
    resetForm();
    router.push("/workflows?projectMode=true");
  };

  const resetForm = () => {
    setName("");
    setBrief("");
    setTargetDir("");
  };

  const handleOpenChange = (val: boolean) => {
    if (!val) resetForm();
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>

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
            onClick={handleNext}
            disabled={!name.trim() || !brief.trim() || !targetDir.trim()}
          >
            Next — Configure Pipeline
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
