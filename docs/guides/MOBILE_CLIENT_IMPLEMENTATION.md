# OpenCode Mobile Client Implementation Guide

```
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║   ┌─────────────────────────────────────────────────────┐    ║
    ║   │  ___  ___  ___ _  _    ___ _    ___ ___ _  _ _____  │    ║
    ║   │ / _ \| _ \| __| \| |  / __| |  |_ _| __| \| |_   _| │    ║
    ║   │| (_) |  _/| _|| .` | | (__| |__ | || _|| .` | | |   │    ║
    ║   │ \___/|_|  |___|_|\_|  \___|____|___|___|_|\_| |_|   │    ║
    ║   │                                                     │    ║
    ║   │            MOBILE IMPLEMENTATION GUIDE              │    ║
    ║   └─────────────────────────────────────────────────────┘    ║
    ║                                                               ║
    ║   The definitive reference for building a mobile-first       ║
    ║   OpenCode client. Covers every API, type, and pattern.      ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
```

> **Prerequisites:** Read `SYNC_IMPLEMENTATION.md` and `COMMANDS_AND_REFERENCES.md` first.
> This guide assumes familiarity with SSE sync and prompt input patterns.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Session Management](#2-session-management)
3. [Model & Provider Selection](#3-model--provider-selection)
4. [Agent System](#4-agent-system)
5. [Permissions System](#5-permissions-system)
6. [File Diffs & Changes](#6-file-diffs--changes)
7. [Context & Token Management](#7-context--token-management)
8. [Error Handling](#8-error-handling)
9. [Mobile-Specific Implementation](#9-mobile-specific-implementation)
10. [Complete React Implementation](#10-complete-react-implementation)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MOBILE CLIENT ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │   UI Layer  │    │ State Layer │    │     Network Layer       │ │
│  │             │    │             │    │                         │ │
│  │ • Sessions  │◄──►│ • Zustand   │◄──►│ • SSE (real-time)       │ │
│  │ • Messages  │    │ • IndexedDB │    │ • REST (mutations)      │ │
│  │ • Diffs     │    │ • SyncQueue │    │ • Reconnection logic    │ │
│  │ • Agents    │    │             │    │                         │ │
│  │ • Perms     │    │             │    │                         │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│         │                  │                       │               │
│         └──────────────────┼───────────────────────┘               │
│                            ▼                                       │
│                   ┌─────────────────┐                              │
│                   │  OpenCode SDK   │                              │
│                   │  (Generated)    │                              │
│                   └─────────────────┘                              │
│                            │                                       │
│                            ▼                                       │
│                   ┌─────────────────┐                              │
│                   │ OpenCode Server │                              │
│                   │ (localhost:4096)│                              │
│                   └─────────────────┘                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Principles

1. **Server-Authoritative**: All state lives on the server. Client syncs via SSE.
2. **Optimistic Updates**: Show changes immediately, reconcile on SSE confirmation.
3. **Offline-Aware**: Queue mutations when offline, sync on reconnect.
4. **Mobile-First**: Touch interactions, bottom navigation, gesture support.

---

## 2. Session Management

### 2.1 Session Types

```typescript
// Core session type
interface Session {
  id: string; // Unique identifier
  projectID: string; // Project this session belongs to
  directory: string; // Working directory path
  parentID?: string; // Parent session (for forks)
  title: string; // Display title
  version: string; // OpenCode version
  time: {
    created: number; // Unix timestamp
    updated: number; // Last activity
    compacting?: number; // Currently compacting
    archived?: number; // Archived timestamp
  };
  summary?: {
    additions: number; // Total lines added
    deletions: number; // Total lines removed
    files: number; // Files changed
    diffs?: FileDiff[]; // Detailed diffs
  };
  share?: {
    url: string; // Public share URL
  };
  revert?: {
    messageID: string; // Revert point
    partID?: string; // Specific part
    snapshot?: string; // Git snapshot hash
    diff?: string; // Diff from snapshot
  };
}

// Session status (real-time)
type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };
```

### 2.2 Session API Endpoints

```typescript
// List all sessions
GET /session?directory={dir}
Response: Session[]

// Create session
POST /session?directory={dir}
Body: { parentID?: string, title?: string }
Response: Session

// Get session
GET /session/{sessionID}?directory={dir}
Response: Session

// Update session
PATCH /session/{sessionID}?directory={dir}
Body: { title?: string, time?: { archived?: number } }
Response: Session

// Delete session
DELETE /session/{sessionID}?directory={dir}
Response: boolean

// Fork session
POST /session/{sessionID}/fork?directory={dir}
Body: { messageID?: string }  // Fork point
Response: Session

// Get child sessions
GET /session/{sessionID}/children?directory={dir}
Response: Session[]

// Share session
POST /session/{sessionID}/share?directory={dir}
Response: Session  // with share.url populated

// Unshare session
DELETE /session/{sessionID}/share?directory={dir}
Response: Session

// Revert to message
POST /session/{sessionID}/revert?directory={dir}
Body: { messageID: string, partID?: string }
Response: Session

// Undo revert
POST /session/{sessionID}/unrevert?directory={dir}
Response: Session

// Abort active session
POST /session/{sessionID}/abort?directory={dir}
Response: boolean

// Get session status (all)
GET /session/status?directory={dir}
Response: Record<string, SessionStatus>

// Summarize/compact session
POST /session/{sessionID}/summarize?directory={dir}
Body: { providerID: string, modelID: string, auto?: boolean }
Response: boolean
```

### 2.3 Session SSE Events

```typescript
// Session created
{ type: "session.created", properties: { info: Session } }

// Session updated
{ type: "session.updated", properties: { info: Session } }

// Session deleted
{ type: "session.deleted", properties: { info: Session } }

// Session status changed
{ type: "session.status", properties: { sessionID: string, status: SessionStatus } }

// Session became idle
{ type: "session.idle", properties: { sessionID: string } }

// Session error
{ type: "session.error", properties: { sessionID?: string, error?: Error } }

// Session diff computed
{ type: "session.diff", properties: { sessionID: string, diff: FileDiff[] } }

// Session compacted
{ type: "session.compacted", properties: { sessionID: string } }
```

### 2.4 React Implementation

```typescript
// stores/session.ts
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface SessionState {
  sessions: Record<string, Session>;
  status: Record<string, SessionStatus>;
  activeSessionId: string | null;

  // Actions
  setSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setStatus: (id: string, status: SessionStatus) => void;
  setActive: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>()(
  immer((set) => ({
    sessions: {},
    status: {},
    activeSessionId: null,

    setSession: (session) =>
      set((state) => {
        state.sessions[session.id] = session;
      }),

    removeSession: (id) =>
      set((state) => {
        delete state.sessions[id];
        delete state.status[id];
        if (state.activeSessionId === id) {
          state.activeSessionId = null;
        }
      }),

    setStatus: (id, status) =>
      set((state) => {
        state.status[id] = status;
      }),

    setActive: (id) =>
      set((state) => {
        state.activeSessionId = id;
      }),
  })),
);

// hooks/useSession.ts
export function useSession(sessionId: string) {
  const session = useSessionStore((s) => s.sessions[sessionId]);
  const status = useSessionStore((s) => s.status[sessionId]);

  const fork = async (messageId?: string) => {
    const res = await fetch(`/session/${sessionId}/fork?directory=${dir}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageID: messageId }),
    });
    return res.json() as Promise<Session>;
  };

  const archive = async () => {
    const res = await fetch(`/session/${sessionId}?directory=${dir}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ time: { archived: Date.now() } }),
    });
    return res.json() as Promise<Session>;
  };

  const share = async () => {
    const res = await fetch(`/session/${sessionId}/share?directory=${dir}`, {
      method: "POST",
    });
    return res.json() as Promise<Session>;
  };

  const revert = async (messageId: string, partId?: string) => {
    const res = await fetch(`/session/${sessionId}/revert?directory=${dir}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageID: messageId, partID: partId }),
    });
    return res.json() as Promise<Session>;
  };

  const unrevert = async () => {
    const res = await fetch(`/session/${sessionId}/unrevert?directory=${dir}`, {
      method: "POST",
    });
    return res.json() as Promise<Session>;
  };

  const abort = async () => {
    await fetch(`/session/${sessionId}/abort?directory=${dir}`, {
      method: "POST",
    });
  };

  return {
    session,
    status,
    isIdle: status?.type === "idle",
    isBusy: status?.type === "busy",
    isRetrying: status?.type === "retry",
    retryInfo: status?.type === "retry" ? status : null,
    fork,
    archive,
    share,
    revert,
    unrevert,
    abort,
  };
}
```

### 2.5 Session List Component

```tsx
// components/SessionList.tsx
import { formatDistanceToNow } from "date-fns";

export function SessionList() {
  const sessions = useSessionStore((s) => Object.values(s.sessions));
  const status = useSessionStore((s) => s.status);
  const setActive = useSessionStore((s) => s.setActive);

  // Sort by most recently updated
  const sorted = useMemo(
    () =>
      [...sessions]
        .filter((s) => !s.time.archived)
        .sort((a, b) => b.time.updated - a.time.updated),
    [sessions],
  );

  return (
    <div className="session-list">
      {sorted.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          status={status[session.id]}
          onSelect={() => setActive(session.id)}
        />
      ))}
    </div>
  );
}

function SessionCard({
  session,
  status,
  onSelect,
}: {
  session: Session;
  status?: SessionStatus;
  onSelect: () => void;
}) {
  const statusIndicator = useMemo(() => {
    if (!status) return null;
    switch (status.type) {
      case "busy":
        return <span className="status-busy">Working...</span>;
      case "retry":
        return (
          <span className="status-retry">
            Retrying in {Math.ceil((status.next - Date.now()) / 1000)}s
          </span>
        );
      default:
        return null;
    }
  }, [status]);

  return (
    <button onClick={onSelect} className="session-card">
      <div className="session-title">{session.title}</div>
      <div className="session-meta">
        {formatDistanceToNow(session.time.updated, { addSuffix: true })}
        {session.summary && (
          <span className="session-changes">
            +{session.summary.additions} -{session.summary.deletions}
          </span>
        )}
      </div>
      {statusIndicator}
      {session.parentID && <span className="session-forked">Forked</span>}
    </button>
  );
}
```

---

## 3. Model & Provider Selection

### 3.1 Provider Types

```typescript
// Provider source - how it was loaded
type ProviderSource = "env" | "config" | "custom" | "api";

// Provider info
interface Provider {
  id: string; // e.g., "anthropic", "openai"
  name: string; // Display name
  source: ProviderSource; // How loaded
  env: string[]; // Env vars to check
  key?: string; // API key (if source is env/api)
  options: Record<string, any>; // Provider-specific config
  models: Record<string, Model>; // Available models
}

// Model definition
interface Model {
  id: string; // e.g., "claude-sonnet-4-20250514"
  providerID: string;
  name: string; // Display name
  family?: string; // Model family
  status: "alpha" | "beta" | "deprecated" | "active";
  release_date: string;

  capabilities: {
    temperature: boolean; // Supports temperature
    reasoning: boolean; // Extended thinking
    attachment: boolean; // File attachments
    toolcall: boolean; // Function calling
    input: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      pdf: boolean;
    };
    output: {
      text: boolean;
      audio: boolean;
      image: boolean;
      video: boolean;
      pdf: boolean;
    };
    interleaved: boolean | { field: "reasoning_content" | "reasoning_details" };
  };

  cost: {
    input: number; // Per 1M tokens
    output: number;
    cache: { read: number; write: number };
    experimentalOver200K?: {
      // Different pricing >200K context
      input: number;
      output: number;
      cache: { read: number; write: number };
    };
  };

  limit: {
    context: number; // Max context window
    output: number; // Max output tokens
  };

  options: Record<string, any>;
  headers: Record<string, string>;

  api: {
    id: string; // API model ID
    url: string; // API endpoint
    npm: string; // SDK package
  };
}
```

### 3.2 Authentication Types

```typescript
// OAuth authentication
interface OAuthAuth {
  type: "oauth";
  refresh: string; // Refresh token
  access: string; // Access token
  expires: number; // Expiry timestamp
  enterpriseUrl?: string; // Enterprise URL
}

// API key authentication
interface ApiAuth {
  type: "api";
  key: string; // API key
}

// Well-known authentication
interface WellKnownAuth {
  type: "wellknown";
  key: string;
  token: string;
}

type Auth = OAuthAuth | ApiAuth | WellKnownAuth;

// Auth method offered by provider
interface AuthMethod {
  type: "oauth" | "api";
  label: string; // Display label
}

// OAuth authorization response
interface Authorization {
  url: string; // Auth URL to open
  method: "auto" | "code"; // Auto-redirect or manual code
  instructions: string; // User instructions
}
```

### 3.3 Provider API Endpoints

```typescript
// List providers
GET /provider/list
Response: {
  available: Provider[]         // All known providers
  connected: Provider[]         // Authenticated providers
}

// Get auth methods
GET /provider/auth
Response: Record<string, AuthMethod[]>

// Start OAuth flow
POST /provider/oauth/authorize
Body: { providerID: string, method: number }
Response: Authorization | undefined

// Complete OAuth flow
POST /provider/oauth/callback
Body: { providerID: string, method: number, code?: string }
Response: boolean

// Set API key
POST /provider/api
Body: { providerID: string, key: string }
Response: void
```

### 3.4 Recent Models Persistence

```typescript
// Stored in localStorage
interface ModelState {
  recent: Array<{ providerID: string; modelID: string }>; // Max 5
  favorite: Array<{ providerID: string; modelID: string }>;
}

// Selection priority:
// 1. Agent-specific model (if valid)
// 2. CLI --model flag
// 3. Config model field
// 4. First valid recent model
// 5. First model from first provider
```

### 3.5 React Implementation

```typescript
// stores/provider.ts
interface ProviderState {
  providers: Record<string, Provider>;
  connected: Set<string>;
  recentModels: Array<{ providerID: string; modelID: string }>;
  selectedModel: { providerID: string; modelID: string } | null;

  setProviders: (available: Provider[], connected: Provider[]) => void;
  addRecent: (providerID: string, modelID: string) => void;
  selectModel: (providerID: string, modelID: string) => void;
}

export const useProviderStore = create<ProviderState>()(
  persist(
    immer((set, get) => ({
      providers: {},
      connected: new Set(),
      recentModels: [],
      selectedModel: null,

      setProviders: (available, connected) =>
        set((state) => {
          available.forEach((p) => {
            state.providers[p.id] = p;
          });
          state.connected = new Set(connected.map((p) => p.id));
        }),

      addRecent: (providerID, modelID) =>
        set((state) => {
          // Remove if exists
          state.recentModels = state.recentModels.filter(
            (m) => !(m.providerID === providerID && m.modelID === modelID),
          );
          // Add to front
          state.recentModels.unshift({ providerID, modelID });
          // Keep max 5
          state.recentModels = state.recentModels.slice(0, 5);
        }),

      selectModel: (providerID, modelID) =>
        set((state) => {
          state.selectedModel = { providerID, modelID };
          // Also add to recent
          get().addRecent(providerID, modelID);
        }),
    })),
    { name: "opencode-models" },
  ),
);

// hooks/useModelSelector.ts
export function useModelSelector() {
  const providers = useProviderStore((s) => s.providers);
  const connected = useProviderStore((s) => s.connected);
  const recentModels = useProviderStore((s) => s.recentModels);
  const selectedModel = useProviderStore((s) => s.selectedModel);
  const selectModel = useProviderStore((s) => s.selectModel);

  // Get all available models from connected providers
  const availableModels = useMemo(() => {
    const models: Array<Model & { provider: Provider }> = [];
    for (const providerId of connected) {
      const provider = providers[providerId];
      if (!provider) continue;
      for (const model of Object.values(provider.models)) {
        if (model.status !== "deprecated") {
          models.push({ ...model, provider });
        }
      }
    }
    return models;
  }, [providers, connected]);

  // Get recent models that are still available
  const validRecentModels = useMemo(() => {
    return recentModels.filter(({ providerID, modelID }) => {
      const provider = providers[providerID];
      return provider && connected.has(providerID) && provider.models[modelID];
    });
  }, [recentModels, providers, connected]);

  return {
    availableModels,
    recentModels: validRecentModels,
    selectedModel,
    selectModel,
    getModel: (providerID: string, modelID: string) =>
      providers[providerID]?.models[modelID],
  };
}
```

### 3.6 Model Selector Component

```tsx
// components/ModelSelector.tsx
export function ModelSelector() {
  const { availableModels, recentModels, selectedModel, selectModel } =
    useModelSelector();

  const [open, setOpen] = useState(false);

  const currentModel = selectedModel
    ? availableModels.find(
        (m) =>
          m.providerID === selectedModel.providerID &&
          m.id === selectedModel.modelID,
      )
    : null;

  return (
    <div className="model-selector">
      <button onClick={() => setOpen(true)} className="model-trigger">
        {currentModel ? (
          <>
            <span className="model-name">{currentModel.name}</span>
            <span className="model-provider">{currentModel.provider.name}</span>
          </>
        ) : (
          <span>Select Model</span>
        )}
      </button>

      {open && (
        <div className="model-dropdown">
          {recentModels.length > 0 && (
            <div className="model-section">
              <div className="model-section-title">Recent</div>
              {recentModels.map(({ providerID, modelID }) => {
                const model = availableModels.find(
                  (m) => m.providerID === providerID && m.id === modelID,
                );
                if (!model) return null;
                return (
                  <ModelOption
                    key={`${providerID}/${modelID}`}
                    model={model}
                    onSelect={() => {
                      selectModel(providerID, modelID);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </div>
          )}

          <div className="model-section">
            <div className="model-section-title">All Models</div>
            {availableModels.map((model) => (
              <ModelOption
                key={`${model.providerID}/${model.id}`}
                model={model}
                onSelect={() => {
                  selectModel(model.providerID, model.id);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelOption({
  model,
  onSelect,
}: {
  model: Model & { provider: Provider };
  onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} className="model-option">
      <div className="model-option-name">{model.name}</div>
      <div className="model-option-meta">
        <span>{model.provider.name}</span>
        {model.capabilities.reasoning && <span>Reasoning</span>}
        <span>{(model.limit.context / 1000).toFixed(0)}K</span>
      </div>
    </button>
  );
}
```

---

## 4. Agent System

### 4.1 Agent Types

```typescript
// Agent mode
type AgentMode = "primary" | "subagent" | "all";

// Agent definition
interface Agent {
  name: string; // Unique identifier
  description?: string; // When to use this agent
  mode: AgentMode; // How it can be invoked
  native: boolean; // Built-in vs custom
  hidden?: boolean; // Internal agents (compaction, title, summary)
  default?: boolean; // Default agent for new sessions

  // Model settings
  model?: { providerID: string; modelID: string };
  temperature?: number;
  topP?: number;
  maxSteps?: number; // Max agentic iterations

  // Appearance
  color?: string; // Hex color code

  // System prompt
  prompt?: string;

  // Tool configuration
  tools: Record<string, boolean>;

  // Permission configuration
  permission: {
    edit: "ask" | "allow" | "deny";
    bash: Record<string, "ask" | "allow" | "deny">;
    skill: Record<string, "ask" | "allow" | "deny">;
    webfetch?: "ask" | "allow" | "deny";
    doom_loop?: "ask" | "allow" | "deny";
    external_directory?: "ask" | "allow" | "deny";
  };

  // Additional options
  options: Record<string, unknown>;
}
```

### 4.2 Built-in Agents

| Agent        | Mode     | Purpose                          | Hidden |
| ------------ | -------- | -------------------------------- | ------ |
| `build`      | primary  | General-purpose coding (default) | No     |
| `plan`       | primary  | Read-only planning/exploration   | No     |
| `general`    | subagent | Multi-step task execution        | Yes    |
| `explore`    | subagent | Fast codebase exploration        | Yes    |
| `compaction` | primary  | Session summarization            | Yes    |
| `title`      | primary  | Generate session titles          | Yes    |
| `summary`    | primary  | Generate session summaries       | Yes    |

### 4.3 Agent API Endpoints

```typescript
// List all agents
GET /agent
Response: Agent[]

// Note: Agents are configured via opencode.json or .opencode/agent/*.md files
// There's no runtime API to create/modify agents
```

### 4.4 React Implementation

```typescript
// stores/agent.ts
interface AgentState {
  agents: Record<string, Agent>;
  selectedAgent: string | null;

  setAgents: (agents: Agent[]) => void;
  selectAgent: (name: string) => void;
}

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    agents: {},
    selectedAgent: null,

    setAgents: (agents) =>
      set((state) => {
        agents.forEach((a) => {
          state.agents[a.name] = a;
        });
        // Set default if none selected
        if (!state.selectedAgent) {
          const defaultAgent =
            agents.find((a) => a.default) ||
            agents.find((a) => a.name === "build");
          if (defaultAgent) state.selectedAgent = defaultAgent.name;
        }
      }),

    selectAgent: (name) =>
      set((state) => {
        state.selectedAgent = name;
      }),
  })),
);

// hooks/useAgents.ts
export function useAgents() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgent = useAgentStore((s) => s.selectedAgent);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  // Filter to only show selectable agents (primary or all mode, not hidden)
  const selectableAgents = useMemo(
    () =>
      Object.values(agents).filter(
        (a) => !a.hidden && (a.mode === "primary" || a.mode === "all"),
      ),
    [agents],
  );

  const currentAgent = selectedAgent ? agents[selectedAgent] : null;

  return {
    agents: selectableAgents,
    currentAgent,
    selectAgent,
  };
}
```

### 4.5 Agent Selector Component

```tsx
// components/AgentSelector.tsx
export function AgentSelector() {
  const { agents, currentAgent, selectAgent } = useAgents();
  const [open, setOpen] = useState(false);

  return (
    <div className="agent-selector">
      <button
        onClick={() => setOpen(true)}
        className="agent-trigger"
        style={{ borderColor: currentAgent?.color }}
      >
        <span className="agent-name">
          {currentAgent?.name || "Select Agent"}
        </span>
      </button>

      {open && (
        <div className="agent-dropdown">
          {agents.map((agent) => (
            <button
              key={agent.name}
              onClick={() => {
                selectAgent(agent.name);
                setOpen(false);
              }}
              className="agent-option"
              style={{ borderLeftColor: agent.color }}
            >
              <div className="agent-option-name">{agent.name}</div>
              {agent.description && (
                <div className="agent-option-desc">{agent.description}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 5. Permissions System

### 5.1 Permission Types

```typescript
// Permission types
type PermissionType =
  | "edit" // File editing
  | "bash" // Shell commands
  | "skill" // Skill loading
  | "webfetch" // Web fetching
  | "doom_loop" // Infinite loop detection
  | "external_directory"; // Access outside project

// Permission levels
type PermissionLevel = "ask" | "allow" | "deny";

// Permission request
interface Permission {
  id: string; // Unique ID
  type: PermissionType;
  pattern?: string | string[]; // Wildcard pattern(s)
  sessionID: string;
  messageID: string;
  callID?: string; // Tool call ID
  title: string; // Human-readable description
  metadata: Record<string, unknown>;
  time: { created: number };
}

// Permission response
type PermissionResponse = "once" | "always" | "reject";
```

### 5.2 Permission SSE Events

```typescript
// Permission requested
{
  type: "permission.updated",
  properties: Permission
}

// Permission responded
{
  type: "permission.replied",
  properties: {
    sessionID: string
    permissionID: string
    response: PermissionResponse
  }
}
```

### 5.3 Permission API Endpoint

```typescript
// Respond to permission request
POST / session / { sessionID } / permissions / { permissionID };
Body: {
  response: "once" | "always" | "reject";
}
Response: boolean;
```

### 5.4 React Implementation

```typescript
// stores/permission.ts
interface PermissionState {
  pending: Record<string, Permission>; // By permission ID

  addPending: (permission: Permission) => void;
  removePending: (id: string) => void;
  respond: (
    sessionID: string,
    permissionID: string,
    response: PermissionResponse,
  ) => Promise<void>;
}

export const usePermissionStore = create<PermissionState>()(
  immer((set) => ({
    pending: {},

    addPending: (permission) =>
      set((state) => {
        state.pending[permission.id] = permission;
      }),

    removePending: (id) =>
      set((state) => {
        delete state.pending[id];
      }),

    respond: async (sessionID, permissionID, response) => {
      await fetch(`/session/${sessionID}/permissions/${permissionID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      set((state) => {
        delete state.pending[permissionID];
      });
    },
  })),
);

// hooks/usePermissions.ts
export function usePermissions(sessionId: string) {
  const pending = usePermissionStore((s) => s.pending);
  const respond = usePermissionStore((s) => s.respond);

  // Filter to this session's permissions
  const sessionPermissions = useMemo(
    () => Object.values(pending).filter((p) => p.sessionID === sessionId),
    [pending, sessionId],
  );

  const approve = (permissionId: string, always = false) =>
    respond(sessionId, permissionId, always ? "always" : "once");

  const reject = (permissionId: string) =>
    respond(sessionId, permissionId, "reject");

  return {
    permissions: sessionPermissions,
    hasPending: sessionPermissions.length > 0,
    approve,
    reject,
  };
}
```

### 5.5 Permission Dialog Component

```tsx
// components/PermissionDialog.tsx
export function PermissionDialog({ sessionId }: { sessionId: string }) {
  const { permissions, approve, reject } = usePermissions(sessionId);

  if (permissions.length === 0) return null;

  const current = permissions[0];

  return (
    <div className="permission-dialog">
      <div className="permission-header">
        <PermissionIcon type={current.type} />
        <span className="permission-type">{current.type}</span>
      </div>

      <div className="permission-title">{current.title}</div>

      {current.pattern && (
        <div className="permission-pattern">
          Pattern:{" "}
          {Array.isArray(current.pattern)
            ? current.pattern.join(", ")
            : current.pattern}
        </div>
      )}

      {current.metadata && (
        <div className="permission-metadata">
          <pre>{JSON.stringify(current.metadata, null, 2)}</pre>
        </div>
      )}

      <div className="permission-actions">
        <button
          onClick={() => reject(current.id)}
          className="permission-reject"
        >
          Reject
        </button>
        <button
          onClick={() => approve(current.id, false)}
          className="permission-once"
        >
          Allow Once
        </button>
        <button
          onClick={() => approve(current.id, true)}
          className="permission-always"
        >
          Always Allow
        </button>
      </div>

      {permissions.length > 1 && (
        <div className="permission-queue">
          +{permissions.length - 1} more pending
        </div>
      )}
    </div>
  );
}

function PermissionIcon({ type }: { type: PermissionType }) {
  switch (type) {
    case "edit":
      return <FileEditIcon />;
    case "bash":
      return <TerminalIcon />;
    case "skill":
      return <BookIcon />;
    case "webfetch":
      return <GlobeIcon />;
    case "doom_loop":
      return <AlertIcon />;
    case "external_directory":
      return <FolderIcon />;
  }
}
```

---

## 6. File Diffs & Changes

### 6.1 Diff Types

```typescript
// File status
type FileStatus = "added" | "deleted" | "modified";

// File info (from git status)
interface FileInfo {
  path: string;
  added: number; // Lines added
  removed: number; // Lines removed
  status: FileStatus;
}

// Full diff with content
interface FileDiff {
  file: string; // File path
  before: string; // Content before
  after: string; // Content after
  additions: number; // Lines added
  deletions: number; // Lines removed
}

// File content with optional diff
interface FileContent {
  type: "text";
  content: string;
  diff?: string; // Unified diff format
  patch?: {
    oldFileName: string;
    newFileName: string;
    oldHeader?: string;
    newHeader?: string;
    hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: string[];
    }>;
    index?: string;
  };
  encoding?: "base64";
  mimeType?: string;
}
```

### 6.2 Diff API Endpoints

```typescript
// Get git status
GET /file/status?directory={dir}
Response: FileInfo[]

// Get file content with diff
GET /file/content?path={path}&directory={dir}
Response: FileContent

// Get session diffs
GET /session/{sessionID}/diff?directory={dir}&messageID={messageID?}
Response: FileDiff[]
```

### 6.3 Diff SSE Events

```typescript
// Session diff computed
{
  type: "session.diff",
  properties: {
    sessionID: string
    diff: FileDiff[]
  }
}
```

### 6.4 React Implementation

```typescript
// stores/diff.ts
interface DiffState {
  sessionDiffs: Record<string, FileDiff[]>; // By session ID
  fileStatus: FileInfo[];

  setSessionDiff: (sessionId: string, diffs: FileDiff[]) => void;
  setFileStatus: (status: FileInfo[]) => void;
}

export const useDiffStore = create<DiffState>()(
  immer((set) => ({
    sessionDiffs: {},
    fileStatus: [],

    setSessionDiff: (sessionId, diffs) =>
      set((state) => {
        state.sessionDiffs[sessionId] = diffs;
      }),

    setFileStatus: (status) =>
      set((state) => {
        state.fileStatus = status;
      }),
  })),
);

// hooks/useDiffs.ts
export function useSessionDiffs(sessionId: string) {
  const diffs = useDiffStore((s) => s.sessionDiffs[sessionId] || []);

  const summary = useMemo(
    () => ({
      files: diffs.length,
      additions: diffs.reduce((sum, d) => sum + d.additions, 0),
      deletions: diffs.reduce((sum, d) => sum + d.deletions, 0),
    }),
    [diffs],
  );

  return { diffs, summary };
}
```

### 6.5 Diff Display Components

```tsx
// components/DiffSummary.tsx
export function DiffSummary({ sessionId }: { sessionId: string }) {
  const { diffs, summary } = useSessionDiffs(sessionId);

  if (diffs.length === 0) return null;

  return (
    <div className="diff-summary">
      <span className="diff-files">{summary.files} files</span>
      <span className="diff-additions">+{summary.additions}</span>
      <span className="diff-deletions">-{summary.deletions}</span>
    </div>
  );
}

// components/DiffViewer.tsx
export function DiffViewer({ diff }: { diff: FileDiff }) {
  const [view, setView] = useState<"unified" | "split">("unified");

  // Parse diff into hunks
  const hunks = useMemo(() => parseDiff(diff.before, diff.after), [diff]);

  return (
    <div className="diff-viewer">
      <div className="diff-header">
        <span className="diff-filename">{diff.file}</span>
        <div className="diff-stats">
          <span className="diff-add">+{diff.additions}</span>
          <span className="diff-del">-{diff.deletions}</span>
        </div>
        <div className="diff-view-toggle">
          <button
            onClick={() => setView("unified")}
            data-active={view === "unified"}
          >
            Unified
          </button>
          <button
            onClick={() => setView("split")}
            data-active={view === "split"}
          >
            Split
          </button>
        </div>
      </div>

      <div className={`diff-content diff-${view}`}>
        {view === "unified" ? (
          <UnifiedDiff hunks={hunks} />
        ) : (
          <SplitDiff hunks={hunks} />
        )}
      </div>
    </div>
  );
}

// components/DiffBars.tsx - Visual summary (like GitHub)
export function DiffBars({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  const total = additions + deletions;
  const addPct = total > 0 ? (additions / total) * 100 : 0;
  const delPct = total > 0 ? (deletions / total) * 100 : 0;

  // 5 blocks max
  const blocks = 5;
  const addBlocks = Math.round((addPct / 100) * blocks);
  const delBlocks = Math.round((delPct / 100) * blocks);
  const emptyBlocks = blocks - addBlocks - delBlocks;

  return (
    <div className="diff-bars">
      {Array(addBlocks)
        .fill(null)
        .map((_, i) => (
          <span key={`add-${i}`} className="diff-bar diff-bar-add" />
        ))}
      {Array(delBlocks)
        .fill(null)
        .map((_, i) => (
          <span key={`del-${i}`} className="diff-bar diff-bar-del" />
        ))}
      {Array(emptyBlocks)
        .fill(null)
        .map((_, i) => (
          <span key={`empty-${i}`} className="diff-bar diff-bar-empty" />
        ))}
    </div>
  );
}
```

---

## 7. Context & Token Management

### 7.1 Token Types

```typescript
// Token breakdown per message
interface TokenUsage {
  input: number; // Fresh input tokens
  output: number; // Generated tokens
  reasoning: number; // Extended thinking tokens
  cache: {
    read: number; // Cache hits
    write: number; // Cache writes
  };
}

// Assistant message with tokens
interface AssistantMessage {
  id: string;
  sessionID: string;
  role: "assistant";
  cost: number; // Total cost in dollars
  tokens: TokenUsage;
  // ... other fields
}

// Step finish part (per-step tracking)
interface StepFinishPart {
  id: string;
  type: "step-finish";
  reason: string; // Finish reason
  cost: number; // Cost for this step
  tokens: TokenUsage;
  snapshot?: string; // Git snapshot hash
}
```

### 7.2 Compaction System

```typescript
// Compaction config
interface CompactionConfig {
  auto?: boolean; // Enable auto-compaction (default: true)
  prune?: boolean; // Enable pruning (default: true)
}

// Compaction part (marks compaction point)
interface CompactionPart {
  id: string;
  type: "compaction";
  auto: boolean; // Auto-triggered vs manual
}

// Overflow detection:
// count = input + cache.read + output
// usable = context_limit - min(output_limit, 32000)
// overflow = count > usable

// Pruning:
// - Walks backwards through messages
// - Skips last 2 turns
// - Accumulates tool outputs until 40K tokens
// - Marks outputs beyond 40K as compacted
// - Protected tools (skill) never pruned
```

### 7.3 React Implementation

```typescript
// hooks/useContextUsage.ts
export function useContextUsage(sessionId: string) {
  const messages = useMessageStore((s) => s.messages[sessionId] || []);
  const model = useProviderStore((s) => {
    const selected = s.selectedModel;
    if (!selected) return null;
    return s.providers[selected.providerID]?.models[selected.modelID];
  });

  // Calculate total token usage
  const usage = useMemo(() => {
    const totals: TokenUsage = {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    };

    for (const msg of messages) {
      if (msg.role === "assistant" && msg.tokens) {
        totals.input += msg.tokens.input;
        totals.output += msg.tokens.output;
        totals.reasoning += msg.tokens.reasoning;
        totals.cache.read += msg.tokens.cache.read;
        totals.cache.write += msg.tokens.cache.write;
      }
    }

    return totals;
  }, [messages]);

  // Calculate context percentage
  const contextPct = useMemo(() => {
    if (!model) return 0;
    const count = usage.input + usage.cache.read + usage.output;
    const usable = model.limit.context - Math.min(model.limit.output, 32000);
    return Math.min((count / usable) * 100, 100);
  }, [usage, model]);

  // Calculate total cost
  const totalCost = useMemo(() => {
    return messages
      .filter((m): m is AssistantMessage => m.role === "assistant")
      .reduce((sum, m) => sum + (m.cost || 0), 0);
  }, [messages]);

  return {
    usage,
    contextPct,
    totalCost,
    isNearLimit: contextPct > 80,
    isOverLimit: contextPct >= 100,
  };
}
```

### 7.4 Context Usage Component

```tsx
// components/ContextUsage.tsx
export function ContextUsage({ sessionId }: { sessionId: string }) {
  const { usage, contextPct, totalCost, isNearLimit } =
    useContextUsage(sessionId);

  return (
    <div className={`context-usage ${isNearLimit ? "context-warning" : ""}`}>
      <div className="context-bar">
        <div className="context-fill" style={{ width: `${contextPct}%` }} />
      </div>

      <div className="context-stats">
        <div className="context-stat">
          <span className="stat-label">Input</span>
          <span className="stat-value">{formatTokens(usage.input)}</span>
        </div>
        <div className="context-stat">
          <span className="stat-label">Output</span>
          <span className="stat-value">{formatTokens(usage.output)}</span>
        </div>
        {usage.reasoning > 0 && (
          <div className="context-stat">
            <span className="stat-label">Reasoning</span>
            <span className="stat-value">{formatTokens(usage.reasoning)}</span>
          </div>
        )}
        <div className="context-stat">
          <span className="stat-label">Cache</span>
          <span className="stat-value">{formatTokens(usage.cache.read)}</span>
        </div>
      </div>

      <div className="context-cost">${totalCost.toFixed(4)}</div>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}
```

---

## 8. Error Handling

### 8.1 Error Types

```typescript
// Provider authentication error
interface ProviderAuthError {
  name: "ProviderAuthError";
  data: {
    providerID: string;
    message: string;
  };
}

// API error (rate limits, overload, etc.)
interface ApiError {
  name: "APIError";
  data: {
    message: string;
    statusCode?: number;
    isRetryable: boolean;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    metadata?: Record<string, string>;
  };
}

// Unknown error
interface UnknownError {
  name: "UnknownError";
  data: { message: string };
}

// Output length exceeded
interface MessageOutputLengthError {
  name: "MessageOutputLengthError";
  data: Record<string, unknown>;
}

// User aborted
interface MessageAbortedError {
  name: "MessageAbortedError";
  data: { message: string };
}

type SessionError =
  | ProviderAuthError
  | ApiError
  | UnknownError
  | MessageOutputLengthError
  | MessageAbortedError;
```

### 8.2 Retry Logic

```typescript
// Retry configuration
const RETRY_INITIAL_DELAY = 2000; // 2 seconds
const RETRY_BACKOFF_FACTOR = 2; // Exponential
const RETRY_MAX_DELAY_NO_HEADERS = 30000; // 30 second cap

// Retryable conditions:
// - APIError with isRetryable: true
// - Rate limit errors (429, rate_limit)
// - Provider overload (exhausted, unavailable, Overloaded)
// - Server errors (server_error)

// Delay calculation:
// 1. Check Retry-After-Ms header (milliseconds)
// 2. Check Retry-After header (seconds or HTTP date)
// 3. Fallback to exponential backoff with cap
```

### 8.3 Error SSE Events

```typescript
// Session error
{
  type: "session.error",
  properties: {
    sessionID?: string
    error?: SessionError
  }
}

// Session status (includes retry info)
{
  type: "session.status",
  properties: {
    sessionID: string
    status: {
      type: "retry"
      attempt: number
      message: string
      next: number  // Timestamp of next retry
    }
  }
}
```

### 8.4 React Implementation

```typescript
// stores/error.ts
interface ErrorState {
  errors: Record<string, SessionError>; // By session ID

  setError: (sessionId: string, error: SessionError) => void;
  clearError: (sessionId: string) => void;
}

export const useErrorStore = create<ErrorState>()(
  immer((set) => ({
    errors: {},

    setError: (sessionId, error) =>
      set((state) => {
        state.errors[sessionId] = error;
      }),

    clearError: (sessionId) =>
      set((state) => {
        delete state.errors[sessionId];
      }),
  })),
);

// hooks/useSessionError.ts
export function useSessionError(sessionId: string) {
  const error = useErrorStore((s) => s.errors[sessionId]);
  const status = useSessionStore((s) => s.status[sessionId]);
  const clearError = useErrorStore((s) => s.clearError);

  const isRetrying = status?.type === "retry";
  const retryInfo = isRetrying ? status : null;

  const errorMessage = useMemo(() => {
    if (!error) return null;

    switch (error.name) {
      case "ProviderAuthError":
        return `Authentication failed for ${error.data.providerID}: ${error.data.message}`;
      case "APIError":
        return error.data.message;
      case "UnknownError":
        return error.data.message;
      case "MessageOutputLengthError":
        return "Output exceeded maximum length";
      case "MessageAbortedError":
        return "Message was aborted";
      default:
        return "An unknown error occurred";
    }
  }, [error]);

  const isRetryable = error?.name === "APIError" && error.data.isRetryable;

  return {
    error,
    errorMessage,
    isRetrying,
    retryInfo,
    isRetryable,
    clearError: () => clearError(sessionId),
  };
}
```

### 8.5 Error Display Components

```tsx
// components/SessionError.tsx
export function SessionError({ sessionId }: { sessionId: string }) {
  const { error, errorMessage, isRetrying, retryInfo } =
    useSessionError(sessionId);

  if (!error && !isRetrying) return null;

  if (isRetrying && retryInfo) {
    return (
      <div className="session-retry">
        <span className="retry-message">{retryInfo.message}</span>
        <RetryCountdown next={retryInfo.next} />
        <span className="retry-attempt">Attempt #{retryInfo.attempt}</span>
      </div>
    );
  }

  return (
    <div className="session-error">
      <AlertIcon />
      <span className="error-message">{errorMessage}</span>
      {error?.name === "ProviderAuthError" && (
        <button className="error-action">Configure Provider</button>
      )}
    </div>
  );
}

function RetryCountdown({ next }: { next: number }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, Math.ceil((next - Date.now()) / 1000));
      setSeconds(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [next]);

  return <span className="retry-countdown">Retrying in {seconds}s</span>;
}
```

### 8.6 Notification System

```tsx
// components/NotificationProvider.tsx
interface Notification {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  sessionId?: string;
  time: number;
  viewed: boolean;
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Listen for SSE events
  useEffect(() => {
    const handleEvent = (event: SSEEvent) => {
      if (event.type === "session.error" && event.properties.error) {
        setNotifications((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "error",
            message: event.properties.error.data.message,
            sessionId: event.properties.sessionID,
            time: Date.now(),
            viewed: false,
          },
        ]);

        // Play error sound
        playSound("error");
      }

      if (event.type === "session.idle") {
        // Play completion sound
        playSound("complete");
      }
    };

    // Subscribe to SSE
    return subscribeToSSE(handleEvent);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, setNotifications }}>
      {children}
      <NotificationToasts />
    </NotificationContext.Provider>
  );
}
```

---

## 9. Mobile-Specific Implementation

### 9.1 PWA Configuration

```typescript
// next.config.js (or vite.config.ts)
import withPWA from 'next-pwa'

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com/,
      handler: 'StaleWhileRevalidate',
      options: { cacheName: 'google-fonts' },
    },
  ],
})

// public/manifest.json
{
  "name": "OpenCode",
  "short_name": "OpenCode",
  "description": "AI coding assistant",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1e1e2e",
  "theme_color": "#89b4fa",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 9.2 Offline Support

```typescript
// lib/offline.ts
import { openDB, DBSchema } from "idb";

interface OpenCodeDB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: { "by-updated": number };
  };
  messages: {
    key: string;
    value: Message;
    indexes: { "by-session": string };
  };
  pendingMutations: {
    key: string;
    value: {
      id: string;
      type: "create" | "update" | "delete";
      endpoint: string;
      body?: unknown;
      timestamp: number;
    };
  };
}

const dbPromise = openDB<OpenCodeDB>("opencode", 1, {
  upgrade(db) {
    const sessionStore = db.createObjectStore("sessions", { keyPath: "id" });
    sessionStore.createIndex("by-updated", "time.updated");

    const messageStore = db.createObjectStore("messages", { keyPath: "id" });
    messageStore.createIndex("by-session", "sessionID");

    db.createObjectStore("pendingMutations", { keyPath: "id" });
  },
});

// Cache sessions locally
export async function cacheSession(session: Session) {
  const db = await dbPromise;
  await db.put("sessions", session);
}

// Get cached sessions
export async function getCachedSessions(): Promise<Session[]> {
  const db = await dbPromise;
  return db.getAllFromIndex("sessions", "by-updated");
}

// Queue mutation for offline sync
export async function queueMutation(
  mutation: Omit<OpenCodeDB["pendingMutations"]["value"], "id" | "timestamp">,
) {
  const db = await dbPromise;
  await db.add("pendingMutations", {
    ...mutation,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  });
}

// Sync pending mutations
export async function syncPendingMutations() {
  const db = await dbPromise;
  const pending = await db.getAll("pendingMutations");

  for (const mutation of pending.sort((a, b) => a.timestamp - b.timestamp)) {
    try {
      await fetch(mutation.endpoint, {
        method: mutation.type === "delete" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
      });
      await db.delete("pendingMutations", mutation.id);
    } catch (e) {
      // Stop on first failure, will retry later
      break;
    }
  }
}
```

### 9.3 SSE Reconnection with Visibility API

```typescript
// hooks/useSSE.ts
export function useSSE(url: string, directory: string) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(
      `${url}?directory=${encodeURIComponent(directory)}`,
    );
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      attemptRef.current = 0;
    };

    es.onerror = () => {
      setConnected(false);
      es.close();

      // Exponential backoff
      const delay = Math.min(3000 * Math.pow(2, attemptRef.current), 30000);
      attemptRef.current++;

      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleSSEEvent(data);
    };
  }, [url, directory]);

  // Handle visibility changes
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Reconnect when app becomes visible
        if (!connected) {
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [connected, connect]);

  // Initial connection
  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { connected };
}
```

### 9.4 Touch Gestures

```typescript
// hooks/useSwipeGesture.ts
import { useGesture } from '@use-gesture/react'

interface SwipeConfig {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number
}

export function useSwipeGesture(config: SwipeConfig) {
  const { threshold = 50 } = config

  return useGesture({
    onDrag: ({ movement: [mx, my], direction: [dx, dy], velocity: [vx, vy], cancel }) => {
      const absX = Math.abs(mx)
      const absY = Math.abs(my)

      // Determine if horizontal or vertical swipe
      if (absX > absY && absX > threshold) {
        if (dx > 0 && config.onSwipeRight) {
          config.onSwipeRight()
          cancel()
        } else if (dx < 0 && config.onSwipeLeft) {
          config.onSwipeLeft()
          cancel()
        }
      } else if (absY > absX && absY > threshold) {
        if (dy > 0 && config.onSwipeDown) {
          config.onSwipeDown()
          cancel()
        } else if (dy < 0 && config.onSwipeUp) {
          config.onSwipeUp()
          cancel()
        }
      }
    },
  })
}

// Usage in message list
export function MessageList({ sessionId }: { sessionId: string }) {
  const { revert } = useSession(sessionId)

  const bind = useSwipeGesture({
    onSwipeRight: (messageId) => {
      // Show revert option
      setShowRevertFor(messageId)
    },
    onSwipeLeft: (messageId) => {
      // Show fork option
      setShowForkFor(messageId)
    },
  })

  return (
    <div className="message-list">
      {messages.map((msg) => (
        <div key={msg.id} {...bind(msg.id)}>
          <MessageBubble message={msg} />
        </div>
      ))}
    </div>
  )
}
```

### 9.5 Pull-to-Refresh

```tsx
// components/PullToRefresh.tsx
import { useDrag } from "@use-gesture/react";
import { animated, useSpring } from "@react-spring/web";

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [{ y }, api] = useSpring(() => ({ y: 0 }));

  const bind = useDrag(
    async ({ movement: [, my], last, cancel }) => {
      if (refreshing) {
        cancel();
        return;
      }

      if (last) {
        if (my > 80) {
          setRefreshing(true);
          api.start({ y: 60 });
          await onRefresh();
          setRefreshing(false);
        }
        api.start({ y: 0 });
      } else {
        api.start({ y: Math.min(my * 0.5, 100), immediate: true });
      }
    },
    { axis: "y", bounds: { top: 0 }, rubberband: true },
  );

  return (
    <div {...bind()} style={{ touchAction: "pan-x" }}>
      <animated.div
        className="pull-indicator"
        style={{
          height: y,
          opacity: y.to([0, 80], [0, 1]),
        }}
      >
        {refreshing ? <Spinner /> : <ArrowDownIcon />}
      </animated.div>
      {children}
    </div>
  );
}
```

### 9.6 Bottom Navigation

```tsx
// components/BottomNav.tsx
export function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { href: '/', icon: HomeIcon, label: 'Sessions' },
    { href: '/files', icon: FolderIcon, label: 'Files' },
    { href: '/settings', icon: SettingsIcon, label: 'Settings' },
  ]

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`bottom-nav-item ${pathname === tab.href ? 'active' : ''}`}
        >
          <tab.icon className="bottom-nav-icon" />
          <span className="bottom-nav-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  )
}

// styles/bottom-nav.css
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  background: var(--color-bg-panel);
  border-top: 1px solid var(--color-border);
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 100;
}

.bottom-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  color: var(--color-text-muted);
}

.bottom-nav-item.active {
  color: var(--color-primary);
}
```

### 9.7 Safe Area Handling

```css
/* styles/safe-areas.css */
:root {
  --safe-area-top: env(safe-area-inset-top);
  --safe-area-bottom: env(safe-area-inset-bottom);
  --safe-area-left: env(safe-area-inset-left);
  --safe-area-right: env(safe-area-inset-right);
}

.app-container {
  padding-top: var(--safe-area-top);
  padding-bottom: calc(var(--safe-area-bottom) + 60px); /* + bottom nav */
  padding-left: var(--safe-area-left);
  padding-right: var(--safe-area-right);
}

.header {
  padding-top: calc(var(--safe-area-top) + 12px);
}

.input-container {
  padding-bottom: calc(
    var(--safe-area-bottom) + 72px
  ); /* + bottom nav + padding */
}
```

### 9.8 Haptic Feedback

```typescript
// lib/haptics.ts
export function haptic(
  type: "light" | "medium" | "heavy" | "success" | "error",
) {
  if (!("vibrate" in navigator)) return;

  switch (type) {
    case "light":
      navigator.vibrate(10);
      break;
    case "medium":
      navigator.vibrate(20);
      break;
    case "heavy":
      navigator.vibrate(30);
      break;
    case "success":
      navigator.vibrate([10, 50, 10]);
      break;
    case "error":
      navigator.vibrate([30, 50, 30, 50, 30]);
      break;
  }
}

// Usage
function handleSend() {
  haptic("light");
  sendMessage();
}

function handleError() {
  haptic("error");
  showError();
}
```

---

## 10. Complete React Implementation

### 10.1 App Structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx              # Session list
│   ├── session/
│   │   └── [id]/
│   │       └── page.tsx      # Session view
│   ├── files/
│   │   └── page.tsx          # File browser
│   └── settings/
│       └── page.tsx          # Settings
├── components/
│   ├── SessionList.tsx
│   ├── SessionView.tsx
│   ├── MessageList.tsx
│   ├── MessageBubble.tsx
│   ├── PromptInput.tsx
│   ├── ModelSelector.tsx
│   ├── AgentSelector.tsx
│   ├── PermissionDialog.tsx
│   ├── DiffViewer.tsx
│   ├── ContextUsage.tsx
│   ├── BottomNav.tsx
│   └── PullToRefresh.tsx
├── stores/
│   ├── session.ts
│   ├── message.ts
│   ├── provider.ts
│   ├── agent.ts
│   ├── permission.ts
│   ├── diff.ts
│   └── error.ts
├── hooks/
│   ├── useSSE.ts
│   ├── useSession.ts
│   ├── useMessages.ts
│   ├── useModelSelector.ts
│   ├── useAgents.ts
│   ├── usePermissions.ts
│   ├── useSessionDiffs.ts
│   ├── useContextUsage.ts
│   ├── useSessionError.ts
│   └── useSwipeGesture.ts
├── lib/
│   ├── api.ts
│   ├── offline.ts
│   ├── haptics.ts
│   └── sounds.ts
└── styles/
    ├── globals.css
    ├── safe-areas.css
    └── components/
```

### 10.2 Root Layout

```tsx
// app/layout.tsx
import { NotificationProvider } from "@/components/NotificationProvider";
import { SSEProvider } from "@/components/SSEProvider";
import { BottomNav } from "@/components/BottomNav";
import "@/styles/globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#1e1e2e" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <SSEProvider>
          <NotificationProvider>
            <main className="app-container">{children}</main>
            <BottomNav />
          </NotificationProvider>
        </SSEProvider>
      </body>
    </html>
  );
}
```

### 10.3 SSE Provider

```tsx
// components/SSEProvider.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSessionStore } from "@/stores/session";
import { useMessageStore } from "@/stores/message";
import { usePermissionStore } from "@/stores/permission";
import { useDiffStore } from "@/stores/diff";
import { useErrorStore } from "@/stores/error";

interface SSEContextValue {
  connected: boolean;
  directory: string | null;
  setDirectory: (dir: string) => void;
}

const SSEContext = createContext<SSEContextValue | null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [directory, setDirectory] = useState<string | null>(null);

  const setSession = useSessionStore((s) => s.setSession);
  const removeSession = useSessionStore((s) => s.removeSession);
  const setStatus = useSessionStore((s) => s.setStatus);
  const addMessage = useMessageStore((s) => s.addMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const addPart = useMessageStore((s) => s.addPart);
  const updatePart = useMessageStore((s) => s.updatePart);
  const addPending = usePermissionStore((s) => s.addPending);
  const removePending = usePermissionStore((s) => s.removePending);
  const setSessionDiff = useDiffStore((s) => s.setSessionDiff);
  const setError = useErrorStore((s) => s.setError);

  useEffect(() => {
    if (!directory) return;

    let es: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    let attempt = 0;

    const connect = () => {
      es = new EventSource(
        `/global/event?directory=${encodeURIComponent(directory)}`,
      );

      es.onopen = () => {
        setConnected(true);
        attempt = 0;
      };

      es.onerror = () => {
        setConnected(false);
        es?.close();

        const delay = Math.min(3000 * Math.pow(2, attempt), 30000);
        attempt++;
        reconnectTimeout = setTimeout(connect, delay);
      };

      es.onmessage = (event) => {
        const { payload } = JSON.parse(event.data);

        switch (payload.type) {
          case "session.created":
          case "session.updated":
            setSession(payload.properties.info);
            break;
          case "session.deleted":
            removeSession(payload.properties.info.id);
            break;
          case "session.status":
            setStatus(payload.properties.sessionID, payload.properties.status);
            break;
          case "session.error":
            if (payload.properties.error) {
              setError(payload.properties.sessionID, payload.properties.error);
            }
            break;
          case "session.diff":
            setSessionDiff(
              payload.properties.sessionID,
              payload.properties.diff,
            );
            break;
          case "message.created":
            addMessage(payload.properties.info);
            break;
          case "message.updated":
            updateMessage(payload.properties.info);
            break;
          case "part.created":
            addPart(payload.properties.part);
            break;
          case "part.updated":
            updatePart(payload.properties.part);
            break;
          case "permission.updated":
            addPending(payload.properties);
            break;
          case "permission.replied":
            removePending(payload.properties.permissionID);
            break;
        }
      };
    };

    // Handle visibility
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !connected) {
        connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    connect();

    return () => {
      es?.close();
      clearTimeout(reconnectTimeout);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [directory]);

  return (
    <SSEContext.Provider value={{ connected, directory, setDirectory }}>
      {children}
    </SSEContext.Provider>
  );
}

export function useSSEContext() {
  const ctx = useContext(SSEContext);
  if (!ctx) throw new Error("useSSEContext must be used within SSEProvider");
  return ctx;
}
```

### 10.4 Session View Page

```tsx
// app/session/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useSession } from "@/hooks/useSession";
import { useMessages } from "@/hooks/useMessages";
import { MessageList } from "@/components/MessageList";
import { PromptInput } from "@/components/PromptInput";
import { SessionHeader } from "@/components/SessionHeader";
import { PermissionDialog } from "@/components/PermissionDialog";
import { SessionError } from "@/components/SessionError";
import { ContextUsage } from "@/components/ContextUsage";
import { PullToRefresh } from "@/components/PullToRefresh";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const { session, status, abort } = useSession(id);
  const { messages, sendMessage, refresh } = useMessages(id);

  if (!session) {
    return <div className="loading">Loading session...</div>;
  }

  return (
    <div className="session-page">
      <SessionHeader session={session} status={status} onAbort={abort} />

      <SessionError sessionId={id} />

      <PullToRefresh onRefresh={refresh}>
        <MessageList sessionId={id} messages={messages} />
      </PullToRefresh>

      <div className="session-footer">
        <ContextUsage sessionId={id} />
        <PromptInput
          sessionId={id}
          onSend={sendMessage}
          disabled={status?.type === "busy"}
        />
      </div>

      <PermissionDialog sessionId={id} />
    </div>
  );
}
```

---

## Summary

This guide covers everything needed to build a mobile-first OpenCode client:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION CHECKLIST                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Core Features                                                      │
│  ─────────────                                                      │
│  [x] Session CRUD (create, read, update, delete)                    │
│  [x] Session fork/share/archive/revert                              │
│  [x] Model/provider selection with recent models                    │
│  [x] Agent selection (primary agents only)                          │
│  [x] Permission request/response flow                               │
│  [x] File diffs with unified/split views                            │
│  [x] Context/token tracking with usage bar                          │
│  [x] Error handling with retry logic                                │
│                                                                     │
│  Mobile Features                                                    │
│  ───────────────                                                    │
│  [x] PWA configuration (manifest, service worker)                   │
│  [x] Offline support (IndexedDB, mutation queue)                    │
│  [x] SSE reconnection with visibility API                           │
│  [x] Touch gestures (swipe, pull-to-refresh)                        │
│  [x] Bottom navigation                                              │
│  [x] Safe area handling                                             │
│  [x] Haptic feedback                                                │
│                                                                     │
│  State Management                                                   │
│  ────────────────                                                   │
│  [x] Zustand stores for all domains                                 │
│  [x] SSE event routing to stores                                    │
│  [x] Optimistic updates with reconciliation                         │
│  [x] Persistent storage (localStorage, IndexedDB)                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Related Guides

- **SYNC_IMPLEMENTATION.md** - SSE sync patterns, message streaming
- **COMMANDS_AND_REFERENCES.md** - Slash commands, @ references, prompt input

### API Reference

- **Base URL**: `http://localhost:4096` (or Tailscale URL)
- **SSE Endpoint**: `GET /global/event?directory={dir}`
- **Directory Header**: `x-opencode-directory` (must match exactly)

---

_Last updated: December 2024_
