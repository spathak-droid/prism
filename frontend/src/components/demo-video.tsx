"use client";

import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Sequence } from "remotion";

// ── Actual app colors (dark theme from globals.css) ──────────────────────────

const C = {
  bg: "hsl(222.2, 84%, 4.9%)",       // --background
  card: "hsl(222.2, 84%, 4.9%)",     // --card
  border: "hsl(217.2, 32.6%, 17.5%)", // --border
  muted: "hsl(215, 20.2%, 65.1%)",   // --muted-foreground
  accent: "hsl(217.2, 32.6%, 17.5%)", // --accent
  text: "hsl(210, 40%, 98%)",         // --foreground
  green: "#22c55e",
  blue: "#3b82f6",
  amber: "#f59e0b",
  purple: "#a855f7",
  red: "#ef4444",
  sidebarBg: "hsl(222.2, 84%, 4.9%)",
};

const font = "system-ui, -apple-system, sans-serif";
const mono = "ui-monospace, 'SF Mono', monospace";

// ── Shared UI pieces ─────────────────────────────────────────────────────────

function Sidebar({ activeItem }: { activeItem: string }) {
  const items = [
    { icon: "📁", label: "Projects" },
    { icon: "🤖", label: "Agents" },
    { icon: "🔀", label: "Workflows" },
    { icon: "📊", label: "Monitor" },
    { icon: "⚙️", label: "Settings" },
  ];
  return (
    <div style={{
      width: 220, height: "100%", background: C.sidebarBg,
      borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      padding: 0,
    }}>
      {/* Logo area */}
      <div style={{
        padding: "20px 16px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${C.muted}` }} />
        </div>
      </div>
      {/* Nav items */}
      <div style={{ padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => (
          <div key={item.label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 12px", borderRadius: 6, fontSize: 13, fontFamily: font,
            background: item.label === activeItem ? C.accent : "transparent",
            color: item.label === activeItem ? C.text : C.muted,
            fontWeight: item.label === activeItem ? 500 : 400,
          }}>
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppShell({ activeItem, children }: { activeItem: string; children: React.ReactNode }) {
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "row" }}>
      <Sidebar activeItem={activeItem} />
      <div style={{ flex: 1, overflow: "hidden", padding: 24 }}>
        {children}
      </div>
    </AbsoluteFill>
  );
}

function StatusDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 4, background: color }} />
      <span style={{ fontSize: 11, color: C.muted, textTransform: "capitalize" as const }}>{label}</span>
    </div>
  );
}

function Badge({ children, color = C.muted }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
      border: `1px solid ${color}30`, color, background: `${color}10`,
      textTransform: "uppercase" as const, letterSpacing: 0.5,
    }}>
      {children}
    </span>
  );
}

// ── Scene 1: Title ───────────────────────────────────────────────────────────

function TitleScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", transform: `scale(${scale})`, opacity }}>
        <div style={{ fontSize: 56, fontWeight: 700, color: C.text, letterSpacing: -2, fontFamily: font }}>
          Autonomous Collective
        </div>
        <div style={{ fontSize: 16, color: C.muted, marginTop: 12, letterSpacing: 6, textTransform: "uppercase" as const, fontFamily: font }}>
          AI Agent Orchestration Platform
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── Scene 2: Projects Page ───────────────────────────────────────────────────

function ProjectsScene() {
  const frame = useCurrentFrame();

  const projects = [
    { name: "Fruit Ninja", brief: "Build a fruit ninja game with React and TypeScript", status: "completed", complexity: "medium", color: C.green },
    { name: "E-Commerce API", brief: "REST API with auth, products, and orders", status: "building", complexity: "complex", color: C.purple },
    { name: "Portfolio Site", brief: "Personal portfolio with blog and dark mode", status: "planning", complexity: "simple", color: C.blue },
  ];

  return (
    <AppShell activeItem="Projects">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <FadeIn delay={5}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: C.text, fontFamily: font }}>Projects</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4, fontFamily: font }}>Manage your AI-powered software projects.</div>
            </div>
            <div style={{
              padding: "8px 16px", borderRadius: 6, background: C.text, color: C.bg,
              fontSize: 13, fontWeight: 500, fontFamily: font, display: "flex", alignItems: "center", gap: 6,
            }}>
              + New Project
            </div>
          </div>
        </FadeIn>

        {/* Project cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {projects.map((p, i) => (
            <FadeIn key={p.name} delay={20 + i * 12}>
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
                padding: 16, display: "flex", flexDirection: "column", gap: 12,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text, fontFamily: font }}>{p.name}</div>
                  <StatusDot color={p.color} label={p.status} />
                </div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, fontFamily: font }}>{p.brief}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 10, color: `${C.muted}90`, fontFamily: mono }}>/tmp/{p.name.toLowerCase().replace(/\s/g, "-")}</div>
                  <Badge>{p.complexity}</Badge>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

// ── Scene 3: Project Detail with Agent Pipeline ──────────────────────────────

function ProjectDetailScene() {
  const frame = useCurrentFrame();

  const agents = [
    { name: "Researcher", role: "researcher", status: "completed" },
    { name: "Planner", role: "planner", status: "completed" },
    { name: "Builder", role: "coder", status: "running" },
    { name: "Reviewer", role: "reviewer", status: "idle" },
    { name: "Deployer", role: "deployer", status: "idle" },
  ];

  const toolCalls = [
    { icon: "✓", tool: "Read", detail: "src/App.tsx", color: C.green },
    { icon: "✓", tool: "Write", detail: "src/components/Game.tsx", color: C.green },
    { icon: "✓", tool: "Bash", detail: "npm test", color: C.green },
    { icon: "⟳", tool: "Edit", detail: "src/utils/physics.ts", color: C.amber },
  ];

  return (
    <AppShell activeItem="Projects">
      <div style={{ display: "flex", gap: 0, height: "100%" }}>
        {/* Left sidebar - project info */}
        <div style={{
          width: 260, borderRight: `1px solid ${C.border}`, paddingRight: 16,
          display: "flex", flexDirection: "column", gap: 16,
        }}>
          <FadeIn delay={5}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, fontFamily: font }}>
              ← Projects
            </div>
          </FadeIn>

          <FadeIn delay={10}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: font }}>Fruit Ninja</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <StatusDot color={C.purple} label="building" />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5, fontFamily: font }}>
                Build a fruit ninja game with React...
              </div>
            </div>
          </FadeIn>

          {/* Pipeline steps */}
          <FadeIn delay={20}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 1, fontFamily: font }}>Pipeline</div>
          </FadeIn>
          {agents.map((a, i) => {
            const statusColor = a.status === "completed" ? C.green : a.status === "running" ? C.amber : C.muted;
            return (
              <FadeIn key={a.name} delay={25 + i * 8}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 10, border: `2px solid ${statusColor}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: statusColor,
                    background: a.status === "completed" ? `${C.green}20` : "transparent",
                  }}>
                    {a.status === "completed" ? "✓" : a.status === "running" ? "⟳" : ""}
                  </div>
                  <div style={{ fontSize: 12, color: a.status === "running" ? C.text : C.muted, fontFamily: font, fontWeight: a.status === "running" ? 500 : 400 }}>
                    {a.name}
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>

        {/* Right panel - Agent log */}
        <div style={{ flex: 1, paddingLeft: 16, display: "flex", flexDirection: "column" }}>
          <FadeIn delay={15}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              borderBottom: `1px solid ${C.border}`, paddingBottom: 10, marginBottom: 12,
            }}>
              <span style={{ fontSize: 13, color: C.muted, fontFamily: font }}>▸</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: C.text, fontFamily: font }}>Activity</span>
              <Badge color={C.amber}>4 tool calls</Badge>
            </div>
          </FadeIn>

          {/* Tool call rows - matching agent-log-panel style */}
          {toolCalls.map((tc, i) => (
            <FadeIn key={i} delay={30 + i * 15}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                borderRadius: 6, fontSize: 12, fontFamily: font, marginBottom: 2,
              }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: `${tc.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: tc.color }}>
                  {tc.icon}
                </div>
                <span style={{ color: C.text, fontWeight: 500, minWidth: 50 }}>{tc.tool}</span>
                <span style={{ color: C.muted, fontFamily: mono, fontSize: 11 }}>{tc.detail}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: `${C.muted}80`, fontFamily: mono }}>
                  {`2:5${i}:3${i} PM`}
                </span>
              </div>
            </FadeIn>
          ))}

          {/* Text output */}
          <FadeIn delay={95}>
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", marginTop: 4,
            }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: `${C.blue}80` }}>
                💬
              </div>
              <div style={{ fontSize: 12, color: `${C.text}cc`, lineHeight: 1.6, fontFamily: font }}>
                All 12 tests passing. Physics module implements gravity, spawn velocity, and off-screen detection with frame-rate independence.
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </AppShell>
  );
}

// ── Scene 4: Workflow Builder ─────────────────────────────────────────────────

function WorkflowScene() {
  const frame = useCurrentFrame();

  const nodes = [
    { x: 60, y: 80, label: "Researcher", color: C.blue },
    { x: 260, y: 80, label: "Planner", color: C.purple },
    { x: 460, y: 80, label: "Builder", color: C.amber },
    { x: 660, y: 80, label: "Reviewer", color: C.green },
    { x: 660, y: 220, label: "Deployer", color: C.red },
  ];

  const edges = [
    { from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 },
  ];

  // Feedback loop edge (reviewer → builder)
  const feedbackEdge = { from: 3, to: 2 };

  return (
    <AppShell activeItem="Workflows">
      <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
        <FadeIn delay={5}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: C.text, fontFamily: font }}>Workflow Builder</div>
            <div style={{ display: "flex", gap: 8 }}>
              <Badge color={C.green}>Development Pipeline</Badge>
            </div>
          </div>
        </FadeIn>

        {/* Canvas */}
        <div style={{
          flex: 1, background: `${C.card}`, border: `1px solid ${C.border}`, borderRadius: 8,
          position: "relative", overflow: "hidden",
        }}>
          {/* Grid dots */}
          <svg width="100%" height="100%" style={{ position: "absolute", opacity: 0.3 }}>
            <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill={C.muted} opacity="0.3" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>

          {/* Edges */}
          <svg width="100%" height="100%" style={{ position: "absolute" }}>
            {edges.map((e, i) => {
              const fromNode = nodes[e.from];
              const toNode = nodes[e.to];
              const delay = 20 + i * 12;
              const progress = interpolate(frame - delay, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
              return (
                <line key={i}
                  x1={fromNode.x + 75} y1={fromNode.y + 25}
                  x2={fromNode.x + 75 + (toNode.x - fromNode.x) * progress} y2={fromNode.y + 25 + (toNode.y - fromNode.y) * progress}
                  stroke={C.muted} strokeWidth={2} opacity={0.5}
                  strokeDasharray="6 4"
                />
              );
            })}
            {/* Feedback edge */}
            {frame > 70 && (
              <path
                d={`M ${nodes[3].x + 40} ${nodes[3].y + 50} C ${nodes[3].x + 40} ${nodes[3].y + 120}, ${nodes[2].x + 75} ${nodes[2].y + 120}, ${nodes[2].x + 75} ${nodes[2].y + 50}`}
                stroke={C.red} strokeWidth={2} fill="none" opacity={0.6}
                strokeDasharray="6 4"
              />
            )}
          </svg>

          {/* Nodes */}
          {nodes.map((node, i) => {
            const delay = 10 + i * 10;
            const opacity = interpolate(frame - delay, [0, 10], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
            const scale = interpolate(frame - delay, [0, 10], [0.8, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
            return (
              <div key={node.label} style={{
                position: "absolute", left: node.x, top: node.y,
                width: 150, padding: "10px 12px",
                background: C.bg, border: `1px solid ${node.color}60`,
                borderRadius: 8, opacity, transform: `scale(${scale})`,
                boxShadow: `0 0 12px ${node.color}15`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: node.color }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text, fontFamily: font }}>{node.label}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: font }}>Agent Node</div>
              </div>
            );
          })}

          {/* Feedback label */}
          {frame > 75 && (
            <FadeIn delay={75}>
              <div style={{
                position: "absolute", left: nodes[2].x + 100, top: nodes[2].y + 100,
                fontSize: 10, color: C.red, fontFamily: font, fontWeight: 500,
                background: `${C.bg}ee`, padding: "2px 8px", borderRadius: 4,
                border: `1px solid ${C.red}30`,
              }}>
                rejected → retry
              </div>
            </FadeIn>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ── Scene 5: Monitor Page ────────────────────────────────────────────────────

function MonitorScene() {
  const frame = useCurrentFrame();

  const stats = [
    { value: "5", label: "Total Agents", color: C.text },
    { value: "2", label: "Running", color: C.green },
    { value: "47", label: "Events", color: C.text },
    { value: "3", label: "Telegram", color: C.text },
    { value: "12.4k", label: "Est. Tokens", color: C.text },
  ];

  const agentCards = [
    { name: "Researcher", model: "claude-sonnet", status: "idle", tokens: "3.2k", msgs: "8" },
    { name: "Planner", model: "claude-opus", status: "idle", tokens: "4.1k", msgs: "5" },
    { name: "Builder", model: "claude-opus", status: "running", tokens: "5.1k", msgs: "24" },
    { name: "Reviewer", model: "claude-sonnet", status: "idle", tokens: "0", msgs: "0" },
  ];

  return (
    <AppShell activeItem="Monitor">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <FadeIn delay={5}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 600, color: C.text, fontFamily: font }}>Monitor</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4, fontFamily: font }}>System events, agent activity, and message logs.</div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 12,
              background: `${C.green}15`, border: `1px solid ${C.green}30`,
              fontSize: 12, color: C.green, fontFamily: font,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: C.green }} /> Live
            </div>
          </div>
        </FadeIn>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 12 }}>
          {stats.map((s, i) => (
            <FadeIn key={s.label} delay={10 + i * 6}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: font }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: font }}>{s.label}</div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Agent status cards */}
        <FadeIn delay={45}>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.muted, fontFamily: font, marginBottom: -8 }}>Agent Status</div>
        </FadeIn>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          {agentCards.map((a, i) => {
            const dotColor = a.status === "running" ? C.green : "#52525b";
            return (
              <FadeIn key={a.name} delay={50 + i * 8}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: dotColor }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.text, fontFamily: font }}>{a.name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: font, marginTop: 4 }}>{a.model}</div>
                  {parseInt(a.tokens) > 0 && (
                    <div style={{ fontSize: 10, color: C.muted, fontFamily: font, marginTop: 2 }}>
                      {a.tokens} tokens · {a.msgs} msgs
                    </div>
                  )}
                </div>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

// ── Scene 6: Telegram ────────────────────────────────────────────────────────

function TelegramScene() {
  const frame = useCurrentFrame();

  const messages = [
    { from: "user", text: "/use Researcher", delay: 15 },
    { from: "bot", text: "Now talking to Researcher. Send your message.", delay: 40 },
    { from: "user", text: "What's the best React state management in 2025?", delay: 60 },
    { from: "bot", text: "Based on my research:\n\n1. Zustand — lightweight, 4.5kb\n2. Jotai — atomic model\n3. TanStack Query — server state\n\nZustand recommended for most cases.", delay: 90 },
  ];

  return (
    <AppShell activeItem="Agents">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
        <FadeIn delay={5}>
          <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 4, fontFamily: font }}>
            External Channel Integration
          </div>
        </FadeIn>

        <FadeIn delay={10}>
          <div style={{
            width: 380, background: "#1a1a2e", borderRadius: 12,
            border: `1px solid ${C.border}`, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ background: "#2b5278", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: "#4a9fd5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "white", fontFamily: font, fontWeight: 600 }}>A</div>
              <div>
                <div style={{ fontSize: 13, color: "white", fontWeight: 600, fontFamily: font }}>AI Agent</div>
                <div style={{ fontSize: 10, color: "#8ab4d8", fontFamily: font }}>online</div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6, minHeight: 240 }}>
              {messages.map((msg, i) => {
                const opacity = interpolate(frame - msg.delay, [0, 8], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
                if (opacity <= 0) return null;
                const isUser = msg.from === "user";
                return (
                  <div key={i} style={{
                    opacity, alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "80%", background: isUser ? "#2b5278" : "#1e2d3d",
                    borderRadius: 10, padding: "7px 11px",
                    fontSize: 12, color: "white", lineHeight: 1.5,
                    whiteSpace: "pre-wrap", fontFamily: font,
                  }}>
                    {msg.text}
                  </div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </div>
    </AppShell>
  );
}

// ── Scene 7: Agent Form / Config ─────────────────────────────────────────────

function AgentConfigScene() {
  const frame = useCurrentFrame();

  return (
    <AppShell activeItem="Agents">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <FadeIn delay={5}>
          <div style={{ fontSize: 22, fontWeight: 600, color: C.text, fontFamily: font }}>Create Agent</div>
        </FadeIn>

        <FadeIn delay={12}>
          <div style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: 20, display: "flex", flexDirection: "column", gap: 16, maxWidth: 550,
          }}>
            {/* Form fields */}
            {[
              { label: "Name", value: "Code Reviewer" },
              { label: "Role", value: "code-reviewer" },
              { label: "Model", value: "claude-sonnet-4-20250514" },
            ].map((field, i) => (
              <FadeIn key={field.label} delay={18 + i * 8}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text, fontFamily: font }}>{field.label}</span>
                  <div style={{
                    padding: "8px 12px", borderRadius: 6,
                    border: `1px solid ${C.border}`, background: C.bg,
                    fontSize: 13, color: C.text, fontFamily: mono,
                  }}>{field.value}</div>
                </div>
              </FadeIn>
            ))}

            {/* System prompt */}
            <FadeIn delay={45}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.text, fontFamily: font }}>System Prompt</span>
                <div style={{
                  padding: "8px 12px", borderRadius: 6,
                  border: `1px solid ${C.border}`, background: C.bg,
                  fontSize: 11, color: C.muted, fontFamily: mono,
                  lineHeight: 1.6, height: 80, overflow: "hidden",
                }}>
                  You are a senior code reviewer.{"\n"}
                  Review code for correctness, security,{"\n"}
                  performance, and maintainability...
                </div>
              </div>
            </FadeIn>

            {/* Config badges */}
            <FadeIn delay={60}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <Badge color={C.green}>Guardrails: $1.00 limit</Badge>
                <Badge color={C.blue}>Mode: Auto</Badge>
                <Badge color={C.amber}>Schedule: None</Badge>
                <Badge color={C.purple}>Skills: code-review, security</Badge>
              </div>
            </FadeIn>
          </div>
        </FadeIn>
      </div>
    </AppShell>
  );
}

// ── Scene 8: Outro ───────────────────────────────────────────────────────────

function OutroScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 15, stiffness: 60 } });

  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", transform: `scale(${scale})` }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: C.text, fontFamily: font }}>
          From Brief to Production
        </div>
        <div style={{ fontSize: 16, color: C.muted, marginTop: 12, fontFamily: font }}>
          One platform. Multiple agents. Real execution.
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 32 }}>
          {["Goose Runtime", "LangGraph", "SSE Streaming", "Telegram"].map((tag) => (
            <div key={tag} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: "5px 14px", fontSize: 11, color: C.muted, fontFamily: font,
            }}>
              {tag}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame - delay, [0, 12], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const y = interpolate(frame - delay, [0, 12], [15, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  return <div style={{ opacity, transform: `translateY(${y}px)` }}>{children}</div>;
}

// ── Main Composition ─────────────────────────────────────────────────────────

export const DemoComposition: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence from={0} durationInFrames={75}>
        <TitleScene />
      </Sequence>
      <Sequence from={75} durationInFrames={120}>
        <ProjectsScene />
      </Sequence>
      <Sequence from={195} durationInFrames={160}>
        <ProjectDetailScene />
      </Sequence>
      <Sequence from={355} durationInFrames={140}>
        <WorkflowScene />
      </Sequence>
      <Sequence from={495} durationInFrames={130}>
        <MonitorScene />
      </Sequence>
      <Sequence from={625} durationInFrames={120}>
        <AgentConfigScene />
      </Sequence>
      <Sequence from={745} durationInFrames={150}>
        <TelegramScene />
      </Sequence>
      <Sequence from={895} durationInFrames={105}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};

export const DEMO_DURATION = 1000;
export const DEMO_FPS = 30;
