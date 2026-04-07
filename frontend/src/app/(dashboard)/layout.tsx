"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  GitBranch,
  Activity,
  Settings,
  Menu,
  X,
  FolderKanban,
  Cpu,
  Circle,
  Loader2,
  Square,
} from "lucide-react";
import { FactoryLogoMark } from "@/components/factory-logo-mark";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toaster } from "sonner";

const navItems = [
  { href: "/factory", icon: Cpu, label: "Factory" },
  { href: "/projects", icon: FolderKanban, label: "Projects" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/workflows", icon: GitBranch, label: "Workflows" },
  { href: "/monitor", icon: Activity, label: "Monitor" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface ProcessInfo {
  agent_id: string;
  name: string;
  model: string;
  status: string;
  has_process: boolean;
  pid: number | null;
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);

  useEffect(() => {
    const fetchProcesses = () => {
      fetch("/api/processes")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: ProcessInfo[]) => setProcesses(data))
        .catch(() => {});
    };
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000);
    return () => clearInterval(interval);
  }, []);

  const running = processes.filter((p) => p.status === "running");
  const idle = processes.filter((p) => p.status !== "running" && p.status !== "error");
  const errored = processes.filter((p) => p.status === "error");

  return (
    <div className="flex h-full flex-col bg-background border-r border-border w-64">
      {/* Header / Brand */}
      <div className="flex flex-col items-center justify-between px-4 py-6 border-b border-border">
        <Link href="/" className="flex flex-col items-center" onClick={onClose}>
          <FactoryLogoMark className="h-15 w-15" />
        </Link>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Running Processes */}
      <div className="px-2 py-3 border-t border-border">
        <div className="flex items-center gap-2 px-2 mb-2">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Processes</span>
          {running.length > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-blue-400">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {running.length}
            </span>
          )}
        </div>
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {running.map((p) => (
            <div key={p.agent_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-blue-500/10">
              <Loader2 className="h-3 w-3 text-blue-400 animate-spin shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{p.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {p.model.split("-").slice(0, 2).join("-")}
                  {p.pid ? ` · PID ${p.pid}` : ""}
                </div>
              </div>
              <button
                className="shrink-0 p-0.5 rounded hover:bg-red-500/20 transition-colors"
                title={`Stop ${p.name}`}
                onClick={() => {
                  fetch(`/api/agents/${p.agent_id}/kill`, { method: "POST" })
                    .then(() => setProcesses((prev) => prev.map((x) => x.agent_id === p.agent_id ? { ...x, status: "idle", has_process: false, pid: null } : x)));
                }}
              >
                <Square className="h-3 w-3 text-red-400" />
              </button>
            </div>
          ))}
          {errored.map((p) => (
            <div key={p.agent_id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-red-500/10">
              <Circle className="h-2.5 w-2.5 text-red-400 fill-red-400 shrink-0" />
              <div className="text-xs truncate text-red-400">{p.name}</div>
            </div>
          ))}
          {idle.map((p) => (
            <div key={p.agent_id} className="flex items-center gap-2 px-2 py-1.5">
              <Circle className="h-2.5 w-2.5 text-muted-foreground/40 fill-muted-foreground/40 shrink-0" />
              <div className="text-xs truncate text-muted-foreground/60">{p.name}</div>
            </div>
          ))}
          {processes.length === 0 && (
            <p className="text-[10px] text-muted-foreground/40 px-2">No agents registered</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-1">
        <p className="text-xs text-muted-foreground px-1">Prism v1.0.0</p>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="fixed inset-y-0 left-0 z-50 flex">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <FactoryLogoMark className="h-6 w-6" />
          <span className="font-semibold">Prism</span>
        </header>

        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  );
}
