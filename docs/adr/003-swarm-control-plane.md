# ADR-003: OpenCode Vibe as Agent Swarm Control Plane

**Status:** Proposed  
**Date:** 2025-12-29  
**Deciders:** Joel Hooks, Architecture Team  
**Affected Components:** Control plane (`apps/web/`), Agent orchestration, Multi-user infrastructure

---

## Context

OpenCode currently operates as a **single-user, single-machine development assistant**. The Next.js 16 rebuild (ADR-001) establishes the foundation for transforming this architecture into a **multi-user agent swarm control plane** that coordinates distributed AI agents across Kubernetes clusters.

### Current State (Phase 0)

What exists today:

```
┌─────────────────────────────────────────────┐
│         CURRENT ARCHITECTURE                │
├─────────────────────────────────────────────┤
│                                             │
│  Single User (Developer)                    │
│       │                                     │
│       ▼                                     │
│  Next.js Web UI (apps/web/)                 │
│       │                                     │
│       ├── Multi-Server Discovery            │
│       │   └── /api/opencode-servers         │
│       │                                     │
│       ├── SSE Real-Time Sync                │
│       │   └── Zustand store + Immer         │
│       │                                     │
│       ├── Effect-TS Router System           │
│       │   └── Builder + Executor pattern    │
│       │                                     │
│       └── Session/Message UI                │
│                                             │
│  OpenCode Backend (single instance)         │
│       │                                     │
│       ├── Session Management                │
│       ├── Message/Part Streaming            │
│       ├── Provider Integration              │
│       └── Tool Orchestration                │
│                                             │
│  Local Filesystem Storage                   │
│       └── ~/.local/state/opencode/          │
│                                             │
└─────────────────────────────────────────────┘
```

**Key components already in place:**

1. **Multi-Server Discovery** - `/api/opencode-servers/route.ts` detects servers via mDNS
2. **SSE Real-Time Sync** - `use-sse.tsx` + Zustand store handle live updates
3. **Effect-TS Router** - `core/router/` provides graph-based workflow orchestration
4. **Message Streaming** - Parts update in real-time with binary search insertion

**Current limitations:**

- Single developer per OpenCode instance
- No agent-to-agent coordination primitives
- No distributed task decomposition
- Local filesystem persistence (no shared state)
- Direct SSE broadcast to all clients (no per-tenant isolation)

### The Vision: Multi-User Swarms in Kubernetes

Transform OpenCode Vibe into a **control plane** that orchestrates swarms of AI agents working collaboratively across distributed infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│              FUTURE ARCHITECTURE (k8s Swarms)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Multiple Teams (Tenants)                                       │
│       │                                                         │
│       ├── Team A (Bounded Context)                              │
│       │   ├── Developer 1 → OpenCode Vibe UI                    │
│       │   ├── Developer 2 → OpenCode Vibe UI                    │
│       │   └── Agents (pods):                                    │
│       │       ├── Coordinator (decompose tasks)                 │
│       │       ├── Worker 1 (implement feature A)                │
│       │       ├── Worker 2 (implement feature B)                │
│       │       └── Reviewer (validate PRs)                       │
│       │                                                         │
│       └── Team B (Bounded Context)                              │
│           └── Independent agent swarm...                        │
│                                                                 │
│  Control Plane (Kubernetes)                                     │
│       │                                                         │
│       ├── Task Decomposition (DAG workflows)                    │
│       ├── Agent Scheduling (pod autoscaling)                    │
│       ├── Event Bus (Redis Streams/Kafka)                       │
│       ├── Shared Memory (Mem0 + A-MEM + Zep)                    │
│       ├── File Reservations (optimistic locks)                  │
│       ├── Circuit Breakers (resilience)                         │
│       └── Observability (logs, traces, metrics)                 │
│                                                                 │
│  Persistent Storage (Multi-Tenant)                              │
│       ├── PostgreSQL (sessions, messages, agents)               │
│       ├── Vector DB (semantic memory - Mem0)                    │
│       ├── Graph DB (relationships - Zep)                        │
│       └── Object Storage (file artifacts)                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Research-Backed Architecture Decisions

From semantic memory research findings, the following patterns are **prerequisites** for production swarms:

#### 1. **Graph-Based Workflow Orchestration**

- Agents decompose goals into DAGs (sequential + branching steps)
- Coordinator maintains canonical task graph, workers execute nodes
- **Already have foundation**: Effect-TS router provides builder + executor patterns

#### 2. **Event-Driven Architecture with Hybrid Coordination**

- Event-driven for independent tasks (loose coupling, scalable)
- Direct-call for dependent tasks (tight coupling, debuggable)
- **Current gap**: Global SSE broadcast needs per-tenant event filtering

#### 3. **Shared Context Between Subagents**

- **Critical finding**: Independent subagents produce conflicting outputs
- Options evaluated:
  - Shared context buffer passed to all subagents ✅
  - Event stream that all agents subscribe to ✅
  - Coordinator maintains canonical state ✅
- **Current gap**: No cross-agent context sharing mechanism

#### 4. **Hybrid Memory Architecture**

From memory research comparison:

| Component        | Technology    | Purpose                                       | Priority |
| ---------------- | ------------- | --------------------------------------------- | -------- |
| **Semantic**     | Mem0          | Vector DB + Graph DB for semantic search      | Phase 3  |
| **Adaptive**     | A-MEM         | Zettelkasten-style interconnected memories    | Phase 4  |
| **Temporal**     | Zep           | Bi-temporal graph for "what did we know when" | Phase 5  |
| **Working**      | Zustand/Immer | Current task context (in-memory)              | Phase 0  |
| **Optimization** | 90% reduction | Token cost via selective retrieval            | Phase 3+ |

#### 5. **Bounded Contexts with Clear Contracts**

- Each agent type has isolated domain model
- Communication through well-defined input/output specs
- **Current gap**: No bounded context isolation, single global instance

#### 6. **Optimistic Concurrency for Independent Work**

- Assume conflicts rare, detect at commit time (file diffs)
- Better for independent agents than pessimistic locking
- **Current gap**: No conflict detection, agents work blind

#### 7. **Observability Infrastructure**

Non-negotiable for production:

- **Logging**: Capture all agent decisions + reasoning
- **Tracing**: Track request flow through multi-agent system
- **Metrics**: Monitor performance, latency, error rates
- **Debugging**: Replay and inspect agent behavior

**Current gap**: Console logs only, no structured observability

---

## Decision

**OpenCode Vibe will evolve into a multi-user agent swarm control plane, deployed to Kubernetes, with the following phased rollout:**

### Architectural Principles

1. **Preserve What Works** - Multi-server discovery, SSE sync, Effect-TS router
2. **Add Coordination Primitives** - Task graphs, event filtering, context sharing
3. **Bounded Contexts** - Per-project/tenant isolation at infrastructure level
4. **Hybrid Orchestration** - Event-driven for parallelism, direct-call for dependencies
5. **Observability First** - Structured logging/tracing from Phase 1
6. **Incremental Complexity** - Each phase adds ONE major capability

### What We're Preserving

| Component                  | Current Implementation     | Why Preserve                             |
| -------------------------- | -------------------------- | ---------------------------------------- |
| **SSE Real-Time Sync**     | `use-sse.tsx` + Zustand    | Proven latency (<50ms), works at scale   |
| **Effect-TS Router**       | `core/router/` DAG builder | Graph orchestration foundation           |
| **Multi-Server Discovery** | `/api/opencode-servers`    | Enables swarm member discovery           |
| **Message Streaming**      | Binary search + Immer      | Efficient O(log n) updates               |
| **OpenAPI SDK**            | Generated from spec        | Type-safe client, no manual API wrappers |

### What We're Adding

| Phase  | Capability               | Technology                                | Why                                             |
| ------ | ------------------------ | ----------------------------------------- | ----------------------------------------------- |
| **P1** | Multi-Server Discovery   | mDNS + Next.js API routes                 | Already done, foundation for swarm awareness    |
| **P2** | Async Swarm Workers      | Server Actions + Effect-TS router         | Decouple task execution from UI thread          |
| **P3** | Multi-User Environment   | PostgreSQL + per-tenant event filtering   | Enable team collaboration                       |
| **P4** | Cloud Deployment         | Docker + managed Postgres + Redis Streams | Persistent state, distributed event bus         |
| **P5** | Kubernetes Orchestration | K8s + autoscaling + circuit breakers      | Agent lifecycle management, resilience at scale |

---

## Current State (Phase 0) - Deep Dive

### Multi-Server Discovery (Completed)

**File:** `apps/web/src/app/api/opencode-servers/route.ts`

Discovers OpenCode instances via mDNS:

```typescript
export async function GET(request: NextRequest) {
  const servers = await discoverServers(3000); // 3s timeout
  return Response.json({
    servers: servers.map((s) => ({
      name: s.name,
      host: s.addresses[0],
      port: s.port,
      url: `http://${s.addresses[0]}:${s.port}`,
    })),
  });
}
```

**What this enables:**

- Detect all OpenCode backend instances on local network
- Connect to multiple servers from single UI
- Foundation for swarm member discovery

**Gap for swarms:** No agent identity, no role assignment, no health checks

### SSE Real-Time Sync (Completed)

**File:** `apps/web/src/react/use-sse.tsx`

Connects to SSE endpoint, dispatches events to Zustand store:

```typescript
export function useSSE(baseUrl: string) {
  useEffect(() => {
    const client = createOpencodeClient({ baseUrl });

    async function connect() {
      const events = await client.global.event();
      for await (const event of events.stream) {
        useOpencodeStore.getState().handleSSEEvent(event);
      }
    }

    connect();
  }, [baseUrl]);
}
```

**Zustand store handles events:**

```typescript
// apps/web/src/react/store.ts
handleSSEEvent(event: GlobalEvent) {
  // Binary search insertion for messages/parts
  const index = Binary.search(state.messages, event.properties.info.id);
  if (index.found) {
    // Update existing
    state.messages[index.index] = event.properties.info;
  } else {
    // Insert at correct position
    state.messages.splice(index.index, 0, event.properties.info);
  }
}
```

**What this enables:**

- <50ms event propagation from backend to UI
- Efficient O(log n) updates via binary search
- Scales to 100s of messages per session

**Gap for swarms:** Global broadcast (no tenant filtering), no agent-to-agent events

### Effect-TS Router (Completed)

**Files:** `apps/web/src/core/router/*.ts`

Graph-based workflow orchestration with builder + executor pattern:

```typescript
// Builder: Define DAG
const workflow = RouterBuilder.create()
  .addNode("task-1", async () => {
    /* work */
  })
  .addNode("task-2", async () => {
    /* work */
  })
  .addEdge("task-1", "task-2") // Sequential dependency
  .build();

// Executor: Run workflow
const result = await RouterExecutor.execute(workflow);
```

**What this enables:**

- Sequential and parallel task execution
- Dependency resolution
- Error handling with rollback

**Gap for swarms:** No distributed execution, runs in single process

### Message/Part Streaming (Completed)

**File:** `apps/web/src/react/use-messages-with-parts.ts`

Combines messages + parts into unified stream:

```typescript
export function useMessagesWithParts(sessionID: string) {
  const messages = useOpencodeStore((state) =>
    state.messages.filter((m) => m.sessionID === sessionID),
  );

  const parts = useOpencodeStore((state) =>
    messages.flatMap((m) => state.parts[m.id] ?? []),
  );

  // Deferred value lags during rapid updates (prevents UI blocking)
  const deferredParts = useDeferredValue(parts);

  return { messages, parts: deferredParts };
}
```

**What this enables:**

- Real-time UI updates as parts stream in
- Intentional lag via `useDeferredValue` (1-2 frames) prevents blocking
- React.memo optimization for unchanged parts

**Gap for swarms:** No inter-agent part visibility, no shared "currently doing" status

---

## Phases (To Be Detailed by Subsequent Workers)

### Phase 1: Multi-Server Discovery ✅

**Status:** COMPLETE  
**Deliverable:** UI can discover and connect to multiple OpenCode instances  
**Files:** `apps/web/src/app/api/opencode-servers/route.ts`

### Phase 2: Async Swarm Workers

**Goal:** Decouple agent task execution from UI thread  
**Approach:** Server Actions spawn Effect-TS workflows in background  
**Deliverable:** Agents can work on tasks asynchronously, UI polls for status  
**Files:** TBD by subsequent worker

**Key capabilities:**

- Task decomposition into DAG
- Worker assignment to nodes
- Progress reporting via SSE
- Error recovery with retries

### Phase 3: Multi-User Environment

**Goal:** Support multiple developers working on same project  
**Approach:** Migrate from filesystem to PostgreSQL, add per-user session isolation  
**Deliverable:** Team collaboration with isolated contexts  
**Files:** TBD by subsequent worker

**Key capabilities:**

- Per-user authentication (Tailscale network auth preserved)
- Shared project state, isolated user sessions
- Event bus filtering by user/project
- Semantic memory (Mem0) for shared learnings

### Phase 4: Cloud Deployment

**Goal:** Deploy to managed infrastructure (AWS/GCP/Vercel)  
**Approach:** Docker containers + managed Postgres + Redis Streams  
**Deliverable:** Multi-tenant SaaS deployment  
**Files:** TBD by subsequent worker

**Key capabilities:**

- Persistent storage (PostgreSQL + Object Storage)
- Distributed event bus (Redis Streams/Kafka)
- Agent autoscaling (serverless functions + containers)
- Monitoring (Datadog/New Relic)

### Phase 5: Kubernetes Orchestration

**Goal:** Full agent lifecycle management at scale  
**Approach:** Kubernetes pods for agents, autoscaling, circuit breakers  
**Deliverable:** Production-grade multi-user swarms  
**Files:** TBD by subsequent worker

**Key capabilities:**

- Pod-per-agent deployment
- Horizontal pod autoscaling (HPA)
- Circuit breakers for resilience
- Hybrid memory (Mem0 + A-MEM + Zep)
- Observability stack (Prometheus + Grafana + Jaeger)

---

## Consequences

### Positive

1. **Scales to Teams** - Multi-user support enables team collaboration, not just single-developer workflows
2. **Agent Specialization** - Coordinator/worker/reviewer roles enable division of labor
3. **Fault Tolerance** - Kubernetes + circuit breakers prevent cascade failures
4. **Cost Efficiency** - Autoscaling agents based on load reduces idle compute
5. **Shared Learning** - Mem0 semantic memory enables agents to learn from each other's work
6. **Production Ready** - Observability + error recovery make swarms reliable enough to trust
7. **Flexible Deployment** - Can run on localhost (Phase 0), cloud (Phase 4), or k8s (Phase 5)

### Negative

1. **Complexity Explosion** - Each phase adds significant operational complexity
2. **Storage Migration Risk** - Filesystem → Postgres migration could lose data without careful planning
3. **Distributed Systems Challenges** - Event ordering, consistency, partition tolerance
4. **Cost of Coordination** - Agent-to-agent communication overhead vs independent execution
5. **Vendor Lock-In** - Kubernetes, cloud-specific services reduce portability
6. **Learning Curve** - Team needs expertise in distributed systems, k8s, observability

### Risks & Mitigations

| Risk                                 | Probability | Impact | Mitigation                                                    |
| ------------------------------------ | ----------- | ------ | ------------------------------------------------------------- |
| **Event bus performance bottleneck** | Medium      | High   | Benchmark Redis Streams early, prototype filtering in Phase 2 |
| **Agent coordination overhead**      | High        | Medium | Use hybrid orchestration (event-driven + direct-call)         |
| **Storage migration data loss**      | Low         | High   | Export filesystem state to JSON before Postgres migration     |
| **k8s operational complexity**       | High        | Medium | Hire SRE, use managed k8s (EKS/GKE), start simple             |
| **Memory system integration**        | Medium      | Medium | Prototype Mem0 in Phase 3, defer A-MEM/Zep to Phase 5         |
| **Observability gaps**               | Medium      | High   | Add structured logging in Phase 1, tracing in Phase 2         |

---

## Implementation Notes

### Phase 0 Foundations Already in Place

**No additional work required for Phase 0.** The following components are production-ready:

- ✅ Multi-server discovery (`/api/opencode-servers`)
- ✅ SSE real-time sync (`use-sse.tsx` + Zustand)
- ✅ Effect-TS router (`core/router/`)
- ✅ Message streaming (binary search + Immer)
- ✅ Next.js 16 web UI (ADR-001)

**Next step:** Assign Phase 1 worker to detail async swarm orchestration.

### Key Architectural Constraints

From research findings, these are **non-negotiable** for production swarms:

1. **Context sharing between agents** - Prevents conflicting outputs
2. **Bounded contexts** - Per-project/tenant isolation
3. **Hybrid orchestration** - Event-driven for parallelism, direct-call for dependencies
4. **Observability infrastructure** - Logging, tracing, metrics from Day 1
5. **Optimistic concurrency** - File-level conflict detection, not pessimistic locks
6. **Human-in-the-loop** - Approval checkpoints for high-stakes decisions

### Technology Decisions Deferred

The following decisions are intentionally deferred to later phases:

- **Event bus choice** (Redis Streams vs Kafka) - Phase 4
- **Memory system details** (Mem0 vs A-MEM vs Zep) - Phase 3-5
- **Kubernetes platform** (EKS vs GKE vs self-managed) - Phase 5
- **Monitoring stack** (Datadog vs New Relic vs Prometheus) - Phase 4

**Why defer?** Let patterns emerge from earlier phases before committing to specific technologies.

---

## Alternatives Considered

### Alternative 1: Fix Current Single-User Architecture

**Approach:** Enhance existing backend with better task orchestration, no UI changes  
**Rejected because:**

- Doesn't solve multi-user problem
- Filesystem storage doesn't scale to teams
- Global SSE broadcast breaks with tenant isolation

### Alternative 2: Microservices from Day 1

**Approach:** Build Phase 5 architecture immediately (k8s, distributed services)  
**Rejected because:**

- Massive upfront complexity
- No validated patterns yet
- Premature optimization
- Team doesn't have distributed systems expertise

**Our choice:** Phased rollout lets us learn and adapt

### Alternative 3: Serverless-Only (No Kubernetes)

**Approach:** Use Lambda/Cloud Functions for all agents, no k8s  
**Rejected because:**

- Cold starts kill agent responsiveness
- Stateful agents (memory, context) don't fit serverless model
- Cost at scale (per-invocation pricing)

**Our choice:** Hybrid (serverless + k8s) in Phase 4+

---

## Success Metrics

| Phase  | Key Metric                                | Target            |
| ------ | ----------------------------------------- | ----------------- |
| **P0** | Multi-server discovery latency            | <3s               |
| **P1** | SSE event propagation                     | <50ms             |
| **P2** | Task decomposition → first agent assigned | <2s               |
| **P3** | Concurrent users per project              | 10+               |
| **P4** | Agent spawn latency (cloud)               | <5s               |
| **P5** | Agent autoscaling response time           | <30s              |
| **P5** | Token cost reduction (semantic memory)    | 90%               |
| **P5** | Swarm coordination overhead               | <10% of work time |

---

## References

### Research Sources (Semantic Memory)

- **Memory ID:** `9f0fb44f-62c3-4431-b055-48fe9166e35a` - Multi-agent coordination patterns
- **Memory ID:** `8f40a346-1d73-4b68-a4ef-63bac426e88a` - Memory architecture comparison (Mem0, A-MEM, Zep)
- **Memory ID:** `1798ca87-9fae-4357-a50b-9435ba26e2ff` - ADR documentation patterns

### Key Insights Applied

1. **Graph-based workflow orchestration** → Effect-TS router (already implemented)
2. **Shared context buffer** → Deferred to Phase 2 (async worker context)
3. **Bounded contexts** → Phase 3 (per-tenant isolation)
4. **Hybrid orchestration** → Architectural principle, applied all phases
5. **Mem0 for semantic memory** → Phase 3 (90% token reduction)
6. **Observability prerequisite** → Phase 1+ (structured logging)

### Internal References

- **ADR-001:** Next.js Rebuild (`docs/adr/001-nextjs-rebuild.md`)
- **Effect-TS Router:** `apps/web/src/core/router/*.ts`
- **SSE Integration:** `apps/web/src/react/use-sse.tsx`
- **Multi-Server Discovery:** `apps/web/src/app/api/opencode-servers/route.ts`

### External Technologies

- **Mem0:** https://github.com/mem0ai/mem0 (semantic memory)
- **A-MEM:** https://github.com/OpenBMB/A-MEM (adaptive memory)
- **Zep:** https://github.com/getzep/zep (temporal knowledge graph)
- **Effect-TS:** https://effect.website (functional programming)
- **Redis Streams:** https://redis.io/docs/data-types/streams/ (event bus)

---

## Questions for Discussion

1. **Phase 2 Scope:** Should async workers use Server Actions or separate worker processes?
2. **Event Bus:** Redis Streams vs Kafka for Phase 4? What's the latency/cost tradeoff?
3. **Memory Priority:** Mem0 first (Phase 3) or defer all memory to Phase 5?
4. **Observability:** Datadog vs self-hosted Prometheus? Budget implications?
5. **Migration Path:** How do we migrate existing users from Phase 0 (localhost) to Phase 4 (cloud)?
6. **Human-in-the-Loop:** Where should approval checkpoints live? UI or backend?

---

## Approval

- [ ] Architecture Lead
- [ ] Team Lead
- [ ] Product Lead
- [ ] DevOps/SRE Lead (for Phase 4+)

---

## Changelog

| Date       | Author   | Change                                  |
| ---------- | -------- | --------------------------------------- |
| 2025-12-29 | BoldHawk | Initial proposal, Phase 0 documentation |
