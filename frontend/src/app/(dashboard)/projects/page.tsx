"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import { useProjectStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import NewProjectDialog from "@/components/new-project-dialog";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  brief: string;
  targetDir: string;
  status: string;
  complexity: string;
  config: Record<string, unknown>;
}

const statusConfig: Record<
  string,
  { dot: string; label: string }
> = {
  planning: { dot: "bg-blue-500", label: "Planning" },
  approved: { dot: "bg-amber-500", label: "Approved" },
  building: { dot: "bg-purple-500", label: "Building" },
  reviewing: { dot: "bg-orange-500", label: "Reviewing" },
  complete: { dot: "bg-green-500", label: "Complete" },
  completed: { dot: "bg-green-500", label: "Complete" },
  failed: { dot: "bg-red-500", label: "Failed" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? { dot: "bg-muted-foreground", label: status };
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 rounded-full", cfg.dot)} />
      <span className="text-xs text-muted-foreground capitalize">{cfg.label}</span>
    </div>
  );
}

function ComplexityBadge({ complexity }: { complexity: string }) {
  const colors: Record<string, string> = {
    small: "text-green-400 bg-green-950/30 border-green-800/30",
    medium: "text-blue-400 bg-blue-950/30 border-blue-800/30",
    large: "text-amber-400 bg-amber-950/30 border-amber-800/30",
  };
  const color = colors[complexity] ?? "text-muted-foreground bg-muted/20 border-border";
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize", color)}>
      {complexity}
    </span>
  );
}

function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm leading-snug">{project.name}</h3>
        <StatusBadge status={project.status} />
      </div>

      {project.brief && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {project.brief}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        {project.targetDir && (
          <p className="font-mono text-[11px] text-muted-foreground/70 truncate flex-1">
            {project.targetDir}
          </p>
        )}
        {project.complexity && (
          <ComplexityBadge complexity={project.complexity} />
        )}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const router = useRouter();
  const { projects, fetchProjects, loading } = useProjectStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your AI-powered software projects.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Content */}
      {loading && projects.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground border border-dashed border-border rounded-lg">
          <FolderKanban className="h-12 w-12 opacity-40" />
          <p className="text-sm">No projects yet. Create one to get started.</p>
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => router.push(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      <NewProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
