import { create } from 'zustand'
import { apiFetch } from './utils'

// Types
export interface Agent {
  id: string
  name: string
  role: string
  systemPrompt: string
  model: string
  provider: string
  tools: string[]
  channels: string[]
  schedule: string | null
  scheduledTask: string | null
  memory: Record<string, string>
  skills: string[]
  interactionRules: Record<string, unknown>
  guardrails: Record<string, unknown>
  isTemplate: boolean
  status: string
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  brief: string
  targetDir: string
  status: string
  complexity: string
  config: Record<string, unknown>
  planApproved: boolean
  agents: { id: string; name: string; role: string; status: string }[]
  approvalGates: { id: string; type: string; status: string; payload: Record<string, unknown>; feedback: string | null }[]
  state: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  fromAgentId: string | null
  toAgentId: string | null
  content: string
  type: string
  projectId: string | null
  channel: string
  metadata: Record<string, unknown>
  timestamp: string
}

export interface Workflow {
  id: string
  name: string
  description: string
  nodes: unknown[]
  edges: unknown[]
  isTemplate: boolean
  status: string
  createdAt: string
  updatedAt: string
}

export interface SSEEvent {
  type: string
  agent_id?: string
  tool_name?: string
  content?: string
  timestamp: string
  [key: string]: unknown
}

// Agent Store
interface AgentStore {
  agents: Agent[]
  selectedAgent: Agent | null
  loading: boolean
  fetchAgents: () => Promise<void>
  fetchAgent: (id: string) => Promise<void>
  createAgent: (data: Partial<Agent>) => Promise<Agent>
  updateAgent: (id: string, data: Partial<Agent>) => Promise<void>
  deleteAgent: (id: string) => Promise<void>
  setSelectedAgent: (agent: Agent | null) => void
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  selectedAgent: null,
  loading: false,
  fetchAgents: async () => {
    set({ loading: true })
    try {
      const agents = await apiFetch('/api/agents')
      set({ agents, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  fetchAgent: async (id: string) => {
    set({ loading: true })
    try {
      const agent = await apiFetch(`/api/agents/${id}`)
      set({ selectedAgent: agent, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  createAgent: async (data) => {
    const agent = await apiFetch('/api/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    set({ agents: [...get().agents, agent] })
    return agent
  },
  updateAgent: async (id, data) => {
    await apiFetch(`/api/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    await get().fetchAgents()
  },
  deleteAgent: async (id) => {
    await apiFetch(`/api/agents/${id}`, { method: 'DELETE' })
    set({ agents: get().agents.filter(a => a.id !== id) })
  },
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
}))

// Project Store
interface ProjectStore {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  pendingProject: { name: string; brief: string; targetDir: string } | null
  fetchProjects: () => Promise<void>
  fetchProject: (id: string) => Promise<void>
  createProject: (data: { name: string; brief: string; targetDir: string; stages?: string[] }) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  setPendingProject: (data: { name: string; brief: string; targetDir: string }) => void
  clearPendingProject: () => void
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,
  pendingProject: null,
  fetchProjects: async () => {
    set({ loading: true })
    try {
      const projects = await apiFetch('/api/projects')
      set({ projects, loading: false })
    } catch {
      set({ loading: false })
    }
  },
  fetchProject: async (id) => {
    const project = await apiFetch(`/api/projects/${id}`)
    set({ currentProject: project })
  },
  createProject: async (data) => {
    const project = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    set({ projects: [...get().projects, project] })
    return project
  },
  deleteProject: async (id) => {
    await apiFetch(`/api/projects/${id}`, { method: 'DELETE' })
    set({ projects: get().projects.filter((p) => p.id !== id) })
  },
  setPendingProject: (data) => set({ pendingProject: data }),
  clearPendingProject: () => set({ pendingProject: null }),
}))

// Message Store
interface MessageStore {
  messages: Message[]
  fetchMessages: (agentId?: string, limit?: number) => Promise<void>
  sendMessage: (agentId: string, content: string) => Promise<void>
  clearMessages: () => void
}

export const useMessageStore = create<MessageStore>((set, get) => ({
  messages: [],
  fetchMessages: async (agentId, limit) => {
    const params = new URLSearchParams()
    if (agentId) params.set('agentId', agentId)
    if (limit !== undefined) params.set('limit', String(limit))
    const query = params.toString() ? `?${params.toString()}` : ''
    const messages = await apiFetch(`/api/messages${query}`)
    set({ messages })
  },
  sendMessage: async (agentId, content) => {
    await apiFetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({ agentId, content }),
    })
    await get().fetchMessages(agentId)
  },
  clearMessages: () => set({ messages: [] }),
}))

// Monitor Store
interface MonitorStore {
  events: SSEEvent[]
  connected: boolean
  addEvent: (event: SSEEvent) => void
  clearEvents: () => void
  setConnected: (connected: boolean) => void
}

export const useMonitorStore = create<MonitorStore>((set, get) => ({
  events: [],
  connected: false,
  addEvent: (event) => {
    const events = [...get().events, event].slice(-500)  // Keep last 500
    set({ events })
  },
  clearEvents: () => set({ events: [] }),
  setConnected: (connected) => set({ connected }),
}))
