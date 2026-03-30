"use client"

import { useState } from "react"
import { X, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* ── tiny helpers ──────────────────────────────────── */

function Box({
  label,
  sub,
  color,
  className,
}: {
  label: string
  sub?: string
  color: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-center backdrop-blur-sm transition-all hover:scale-105 hover:shadow-lg",
        className,
      )}
      style={{
        borderColor: `${color}40`,
        background: `linear-gradient(135deg, ${color}08, ${color}15)`,
        boxShadow: `0 0 20px ${color}08`,
      }}
    >
      <div className="text-sm font-semibold" style={{ color }}>
        {label}
      </div>
      {sub && (
        <div className="mt-0.5 text-[10px] text-zinc-500">{sub}</div>
      )}
    </div>
  )
}

function Arrow({
  direction = "down",
  label,
  color = "rgba(255,255,255,0.2)",
}: {
  direction?: "down" | "right" | "left" | "bidirectional"
  label?: string
  color?: string
}) {
  const isHorizontal = direction === "right" || direction === "left"
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1",
        isHorizontal ? "flex-row px-2" : "flex-col py-1",
      )}
    >
      {direction === "left" && (
        <span style={{ color }} className="text-xs">
          {"<"}
        </span>
      )}
      <div
        className={isHorizontal ? "h-px w-6" : "h-4 w-px"}
        style={{ background: color }}
      />
      {label && (
        <span className="text-[9px] text-zinc-600 whitespace-nowrap">
          {label}
        </span>
      )}
      {direction === "down" && (
        <span style={{ color }} className="text-[8px] -mt-1">
          {"▼"}
        </span>
      )}
      {direction === "right" && (
        <span style={{ color }} className="text-xs">
          {">"}
        </span>
      )}
      {direction === "bidirectional" && (
        <span style={{ color }} className="text-[8px] -mt-1">
          {"▼▲"}
        </span>
      )}
    </div>
  )
}

function SectionLabel({ children, color }: { children: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1" style={{ background: `${color}30` }} />
      <span className="text-[10px] font-medium tracking-widest uppercase" style={{ color: `${color}90` }}>
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: `${color}30` }} />
    </div>
  )
}

/* ── main diagram ──────────────────────────────────── */

export function ArchitectureDiagram() {
  const [open, setOpen] = useState(false)

  const c = {
    frontend: "#60a5fa", // blue
    api: "#a78bfa",      // purple
    services: "#34d399", // green
    graphs: "#fb923c",   // orange
    db: "#f472b6",       // pink
    external: "#fbbf24", // yellow
    goose: "#22d3ee",    // cyan
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 border-zinc-700 bg-zinc-900/80 backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-zinc-800 text-xs shadow-lg"
      >
        <Layers className="h-3.5 w-3.5" />
        Architecture
      </Button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* modal */}
          <div className="relative z-10 w-[95vw] max-w-5xl max-h-[90vh] overflow-auto rounded-2xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl shadow-2xl">
            {/* header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-sm px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">
                  System Architecture
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Prism — AI Agent Orchestration Platform
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* diagram body */}
            <div className="p-6 space-y-6">
              {/* ── FRONTEND ── */}
              <SectionLabel color={c.frontend}>Frontend — Next.js + React Flow + Zustand</SectionLabel>
              <div className="grid grid-cols-5 gap-3">
                <Box label="Projects" sub="Create & manage" color={c.frontend} />
                <Box label="Agents" sub="Chat & configure" color={c.frontend} />
                <Box label="Workflows" sub="React Flow builder" color={c.frontend} />
                <Box label="Monitor" sub="Real-time events" color={c.frontend} />
                <Box label="Settings" sub="Configuration" color={c.frontend} />
              </div>

              <div className="flex items-center justify-center gap-3">
                <Arrow direction="down" label="REST + SSE" color={c.api} />
              </div>

              {/* ── API LAYER ── */}
              <SectionLabel color={c.api}>API Layer — FastAPI</SectionLabel>
              <div className="grid grid-cols-4 gap-3">
                <Box label="/api/projects" sub="CRUD + approve + resume" color={c.api} />
                <Box label="/api/agents" sub="CRUD + activity + usage" color={c.api} />
                <Box label="/api/workflows" sub="CRUD + execute" color={c.api} />
                <Box label="/api/stream" sub="SSE streaming" color={c.api} />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2">
                <Box label="/api/messages" sub="Chat history" color={c.api} />
                <Box label="/api/events" sub="Event stream" color={c.api} />
                <Box label="/api/approvals" sub="Gate management" color={c.api} />
              </div>

              <div className="flex items-center justify-center gap-3">
                <Arrow direction="down" color={c.services} />
              </div>

              {/* ── SERVICES ── */}
              <SectionLabel color={c.services}>Services Layer</SectionLabel>
              <div className="grid grid-cols-2 gap-6">
                {/* left: core services */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Box label="Pipeline" sub="Middleware chain" color={c.services} />
                    <Box label="Event Bus" sub="Pub/sub + persistence" color={c.services} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Box label="Goose Manager" sub="Subprocess orchestrator" color={c.goose} />
                    <Box label="Stream Parser" sub="JSON stream decoder" color={c.goose} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Box label="Scheduler" sub="APScheduler" color={c.services} />
                    <Box label="Skills" sub="Prompt injection" color={c.services} />
                    <Box label="Guardrails" sub="Rate & cost limits" color={c.services} />
                  </div>
                </div>

                {/* right: graph pipelines */}
                <div className="space-y-3">
                  <SectionLabel color={c.graphs}>LangGraph Pipelines</SectionLabel>
                  {/* simple */}
                  <div className="rounded-lg border p-3" style={{ borderColor: `${c.graphs}25`, background: `${c.graphs}05` }}>
                    <div className="text-[10px] font-medium mb-2" style={{ color: `${c.graphs}90` }}>
                      Simple Pipeline
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Planner</span>
                      <span className="text-zinc-600 text-[10px]">→</span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Coder</span>
                      <span className="text-zinc-600 text-[10px]">→</span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Reviewer</span>
                    </div>
                  </div>
                  {/* medium */}
                  <div className="rounded-lg border p-3" style={{ borderColor: `${c.graphs}25`, background: `${c.graphs}05` }}>
                    <div className="text-[10px] font-medium mb-2" style={{ color: `${c.graphs}90` }}>
                      Medium / Complex Pipeline
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Researcher</span>
                      <span className="text-zinc-600 text-[10px]">→</span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Planner</span>
                      <span className="text-zinc-600 text-[10px]">→</span>
                      <span className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400">Approval</span>
                      <span className="text-zinc-600 text-[10px]">→</span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Coder</span>
                      <span className="text-zinc-600 text-[10px]">→</span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Reviewer</span>
                      <span className="text-zinc-600 text-[10px]">→</span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">Deployer</span>
                    </div>
                  </div>
                  {/* sandbox */}
                  <div className="rounded-lg border p-3" style={{ borderColor: `${c.graphs}25`, background: `${c.graphs}05` }}>
                    <div className="text-[10px] font-medium mb-2" style={{ color: `${c.graphs}90` }}>
                      Sandbox — User-defined DAGs
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">React Flow nodes → LangGraph</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <Arrow direction="down" color={c.goose} />
              </div>

              {/* ── EXECUTION ── */}
              <SectionLabel color={c.goose}>Execution</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                <Box
                  label="Goose CLI"
                  sub="Subprocess per agent"
                  color={c.goose}
                  className="col-span-1"
                />
                <Box
                  label="Claude Code / Opus 4"
                  sub="LLM provider"
                  color={c.goose}
                  className="col-span-1"
                />
                <Box
                  label="Tools"
                  sub="developer, analyze, custom"
                  color={c.goose}
                  className="col-span-1"
                />
              </div>

              <div className="flex items-center justify-center gap-3">
                <Arrow direction="down" color={c.db} />
              </div>

              {/* ── DATA / EXTERNAL ── */}
              <SectionLabel color={c.db}>Data & Integrations</SectionLabel>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <Box label="SQLite" sub="SQLAlchemy ORM" color={c.db} />
                    <Box label="File System" sub="Project dirs + state.json" color={c.db} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <Box label="Agents" sub="table" color={c.db} />
                    <Box label="Projects" sub="table" color={c.db} />
                    <Box label="Messages" sub="table" color={c.db} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Box label="Events" sub="table" color={c.db} />
                    <Box label="Workflows" sub="table" color={c.db} />
                    <Box label="Skills" sub="table" color={c.db} />
                  </div>
                </div>
                <div className="space-y-3">
                  <Box label="Telegram Bot" sub="Commands + agent binding" color={c.external} />
                  <Box label="APScheduler" sub="CRON-based agent tasks" color={c.external} />
                  <Box label="LangGraph Checkpointer" sub="Thread memory persistence" color={c.external} />
                </div>
              </div>

              {/* legend */}
              <div className="mt-6 pt-4 border-t border-zinc-800/50">
                <div className="flex flex-wrap gap-4 justify-center">
                  {[
                    { label: "Frontend", color: c.frontend },
                    { label: "API", color: c.api },
                    { label: "Services", color: c.services },
                    { label: "Pipelines", color: c.graphs },
                    { label: "Execution", color: c.goose },
                    { label: "Data", color: c.db },
                    { label: "Integrations", color: c.external },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ background: item.color }}
                      />
                      <span className="text-[10px] text-zinc-500">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
