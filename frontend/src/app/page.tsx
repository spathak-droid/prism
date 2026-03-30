"use client";

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { FactoryLogoAnimated } from '@/components/factory-logo-animated'
import { ArchitectureDiagram } from '@/components/architecture-diagram'

const DemoPlayer = dynamic(() => import('@/components/demo-player'), { ssr: false })

export default function Home() {
  return (
    <div className="relative min-h-screen bg-zinc-950">
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center px-6 pt-20 pb-16 text-center">
        {/* Background glow */}
        <div
          className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2"
          style={{
            width: 800,
            height: 400,
            background: 'radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, rgba(168,85,247,0.04) 40%, transparent 70%)',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Logo */}
          <FactoryLogoAnimated className="w-48 h-48 md:w-56 md:h-56" />

          <div className="flex items-center gap-3 text-[11px] tracking-[0.3em] uppercase text-zinc-500">
            <span className="h-px w-8 bg-zinc-700" />
            AI Agent Orchestration Platform
            <span className="h-px w-8 bg-zinc-700" />
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white tracking-tight">
            Autonomous Collective (PRISM)
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-zinc-400 font-light">
            Create AI agents, configure their behavior, and connect them into
            collaborative workflows that build real software autonomously.
          </p>

          <div className="flex items-center gap-4 mt-4">
            <Link
              href="/projects"
              className="rounded-full bg-white px-8 py-2.5 text-sm font-medium text-zinc-900 transition-all hover:bg-zinc-200"
            >
              Enter Dashboard
            </Link>
            <a
              href="https://www.loom.com/share/e315388b5e67478eab69fbe47a20ad97"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-zinc-700 px-8 py-2.5 text-sm text-zinc-400 transition-all hover:border-zinc-500 hover:text-white"
            >
              Watch Demo
            </a>
          </div>

          <div className="mt-6">
            <ArchitectureDiagram />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-center gap-12 py-8 border-y border-zinc-800/50">
        {[
          { value: "5", label: "SDLC Agents" },
          { value: "10+", label: "Configurable Dimensions" },
          { value: "SSE", label: "Real-time Streaming" },
          { value: "Telegram", label: "External Channel" },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Demo Video */}
      <div id="demo" className="px-6 py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold text-white mb-2">See it in Action</h2>
          <p className="text-sm text-zinc-500">From a project brief to a deployed application — fully autonomous.</p>
        </div>
        <DemoPlayer />
      </div>

      {/* Features Grid */}
      <div className="px-6 py-20 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold text-white mb-2">Platform Capabilities</h2>
            <p className="text-sm text-zinc-500">Everything you need to orchestrate AI agents at scale.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                title: "Agent CRUD",
                desc: "Create agents with custom system prompts, models, tools, and communication channels.",
              },
              {
                title: "Visual Workflow Builder",
                desc: "Drag-and-drop DAG editor with conditional edges, feedback loops, and execution.",
              },
              {
                title: "Live Monitoring",
                desc: "Real-time SSE streaming of agent status, tool calls, inter-agent messages, and token usage.",
              },
              {
                title: "Telegram Integration",
                desc: "Chat with any agent through Telegram. Full personality, memory, and tool access.",
              },
              {
                title: "Agent Configuration",
                desc: "Schedules, persistent memory, skills, interaction modes, guardrails — all from the UI.",
              },
              {
                title: "Automated Pipeline",
                desc: "From brief to working app. Agents research, plan, code, review, and deploy autonomously.",
              },
              {
                title: "Workflow Templates",
                desc: "Pre-built pipelines (Development, Research) that can be loaded and customized.",
              },
              {
                title: "Goose Runtime",
                desc: "Provider-agnostic agent execution via Goose CLI with structured JSON streaming.",
              },
              {
                title: "LangGraph Orchestration",
                desc: "State machines with conditional routing, parallel execution, and crash recovery.",
              },
            ].map((feat) => (
              <div
                key={feat.title}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors"
              >
                <h3 className="text-sm font-semibold text-white mb-1.5">{feat.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-6 py-8 border-t border-zinc-800/50 text-[11px] tracking-[0.2em] uppercase text-zinc-600">
        <span>Prism — AI Agent Orchestration</span>
        <span className="h-1 w-1 rounded-full bg-zinc-700" />
        <span>FastAPI + Next.js + Goose + LangGraph</span>
        <span className="h-1 w-1 rounded-full bg-zinc-700" />
        <span>SQLite</span>
      </div>
    </div>
  )
}
