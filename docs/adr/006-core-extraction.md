# ADR 006: Extract @opencode-vibe/core - Thin Client Architecture

**Status:** Draft  
**Date:** 2025-12-29  
**Authors:** Joel Hooks, AI Swarm  
**Depends On:** ADR 005 (Package Extraction)

---

## Context

ADR 005 extracted `@opencode-vibe/router` and `@opencode-vibe/react` from `apps/web/`. This was Phase 1 - extracting the framework-agnostic router and React bindings.

**Current state after ADR 005:**

```
packages/
├── router/     # ✅ Extracted - Effect router, adapters, streaming
└── react/      # ✅ Extracted - Hooks, providers, Zustand store

apps/web/src/
├── core/       # ❌ Still here - client, discovery, SSE, routing
├── atoms/      # ❌ Still here - Effect atoms for SDK calls
├── lib/        # ❌ Still here - utilities (binary search, transforms)
└── components/ # App-specific UI (stays here)
```

**The goal:** Make `apps/web/` a **thin client** that only contains:
1. Next.js pages/routes (App Router)
2. UI components (ai-elements wrappers)
3. Styling (Tailwind)

Everything else should live in packages.

### What Remains to Extract

#### 1. Core Services (`apps/web/src/core/`)

| File | Purpose | Target Package |
|------|---------|----------------|
| `client.ts` | SDK client factory with smart routing | `@opencode-vibe/core` |
| `discovery.ts` | Effect Service for server discovery | `@opencode-vibe/core` |
| `server-discovery.ts` | Node.js lsof-based discovery | `@opencode-vibe/core` |
| `server-routing.ts` | Pure functions for server selection | `@opencode-vibe/core` |
| `multi-server-sse.ts` | SSE connection manager (singleton) | `@opencode-vibe/core` |
| `poc.ts` | CLI testing tool | Delete (dev-only) |

#### 2. Atoms Layer (`apps/web/src/atoms/`)

| Module | Purpose | Decision |
|--------|---------|----------|
| `messages.ts` | Fetch messages via Effect | Move to `@opencode-vibe/core` |
| `parts.ts` | Fetch parts via Effect | Move to `@opencode-vibe/core` |
| `sessions.ts` | Session CRUD via Effect | Move to `@opencode-vibe/core` |
| `providers.ts` | Provider list via Effect | Move to `@opencode-vibe/core` |
| `projects.ts` | Project list via Effect | Move to `@opencode-vibe/core` |
| `prompt.ts` | Prompt submission via Effect | Move to `@opencode-vibe/core` |
| `servers.ts` | Server discovery atom | Move to `@opencode-vibe/core` |
| `sse.ts` | SSE stream atom | Move to `@opencode-vibe/core` |
| `subagents.ts` | Subagent session tracking | Move to `@opencode-vibe/core` |

#### 3. Utilities (`apps/web/src/lib/`)

| File | Purpose | Decision |
|------|---------|----------|
| `binary.ts` | O(log n) sorted array ops | Move to `@opencode-vibe/core` |
| `utils.ts` | Tailwind `cn()` helper | Keep in app (UI-specific) |
| `transform-messages.ts` | SDK → ai-elements transform | Keep in app (UI-specific) |
| `prompt-api.ts` | Prompt parsing utilities | Move to `@opencode-vibe/core` |
| `prompt-parsing.ts` | Prompt part parsing | Move to `@opencode-vibe/core` |

---

## Decision

Create **`@opencode-vibe/core`** package containing:

1. **SDK Client Factory** - `createClient()` with smart multi-server routing
2. **Effect Services** - Server discovery, SSE streams, SDK operations
3. **Atoms** - Effect-based data fetching primitives
4. **Utilities** - Binary search, prompt parsing

### Package Structure

```
packages/core/
├── src/
│   ├── index.ts              # Public API
│   ├── client.ts             # SDK client factory
│   ├── discovery.ts          # ServerDiscovery Effect Service
│   ├── server-routing.ts     # Pure routing functions
│   ├── sse.ts                # SSE connection manager
│   ├── atoms/
│   │   ├── index.ts
│   │   ├── messages.ts
│   │   ├── parts.ts
│   │   ├── sessions.ts
│   │   ├── providers.ts
│   │   ├── projects.ts
│   │   ├── prompt.ts
│   │   ├── servers.ts
│   │   ├── sse.ts
│   │   └── subagents.ts
│   └── lib/
│       ├── binary.ts
│       ├── prompt-api.ts
│       └── prompt-parsing.ts
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

### Public API

```typescript
// Client
export { createClient, type ClientConfig } from "./client"

// Effect Services
export { ServerDiscovery, type ServerInfo } from "./discovery"
export { SSEManager, type SSEConfig } from "./sse"

// Atoms (Effect-based data fetching)
export * from "./atoms"

// Utilities
export { Binary } from "./lib/binary"
export { parsePrompt, type PromptPart } from "./lib/prompt-parsing"
```

### Dependency Graph

```
@opencode-vibe/core
  ├── effect (peer)
  ├── @opencode-ai/sdk (peer)
  └── eventsource-parser

@opencode-vibe/react
  ├── @opencode-vibe/core (dependency)
  ├── @opencode-vibe/router (dependency)
  ├── react (peer)
  └── zustand

@opencode-vibe/router
  ├── effect (peer)
  └── (no other deps)

apps/web
  ├── @opencode-vibe/core
  ├── @opencode-vibe/react
  ├── @opencode-vibe/router
  ├── next
  └── ai-elements
```

---

## Thin Client Architecture

After extraction, `apps/web/` becomes a thin presentation layer:

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── page.tsx            # Home page (project list)
│   │   ├── session/[id]/       # Session pages
│   │   └── provider/[id]/      # Provider pages
│   ├── components/
│   │   ├── ai-elements/        # ai-elements wrappers
│   │   ├── prompt/             # Prompt input components
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   ├── utils.ts            # cn() helper
│   │   └── transform-messages.ts # SDK → UIMessage transform
│   └── styles/
│       └── globals.css         # Tailwind styles
├── public/                     # Static assets
├── next.config.ts
└── package.json
```

**What stays in the app:**
- Next.js routing and pages
- UI components (ai-elements wrappers, shadcn/ui)
- Styling (Tailwind, CSS)
- Message transform (SDK types → ai-elements types)

**What moves to packages:**
- SDK client and multi-server routing
- Effect services (discovery, SSE)
- Data fetching atoms
- Business logic utilities

---

## Migration Strategy

### Phase 1: Create Package Scaffold
1. Create `packages/core/` with package.json, tsconfig
2. Add workspace dependency to root package.json
3. Set up build scripts

### Phase 2: Move Core Services
1. Move `client.ts`, `discovery.ts`, `server-routing.ts`
2. Move `multi-server-sse.ts` → `sse.ts`
3. Update imports in `apps/web/`
4. Run tests, fix any breaks

### Phase 3: Move Atoms
1. Move all `apps/web/src/atoms/*.ts` to `packages/core/src/atoms/`
2. Update imports in hooks that consume atoms
3. Run tests

### Phase 4: Move Utilities
1. Move `binary.ts`, `prompt-api.ts`, `prompt-parsing.ts`
2. Update imports
3. Run tests

### Phase 5: Update React Package
1. Add `@opencode-vibe/core` as dependency to `@opencode-vibe/react`
2. Update hooks to import from `@opencode-vibe/core`
3. Remove duplicated code

### Phase 6: Cleanup
1. Delete empty directories in `apps/web/src/`
2. Update AGENTS.md with new structure
3. Run full test suite
4. Run production build

---

## Consequences

### Positive

1. **Reusability** - Core can be used by CLI, desktop app, VSCode extension
2. **Testability** - Core logic tested in isolation from React/Next.js
3. **Clear boundaries** - UI layer has no business logic
4. **Faster iteration** - Change core without rebuilding UI
5. **Better DX** - Smaller app, faster builds

### Negative

1. **More packages** - 3 packages instead of 1 app
2. **Version coordination** - Must keep packages in sync
3. **Initial migration effort** - ~2-3 hours of work
4. **Import path changes** - All consumers need updates

### Risks

1. **Circular dependencies** - Mitigated by strict layer architecture
2. **Type mismatches** - Mitigated by shared types in core
3. **Build order** - Mitigated by turbo dependency graph

---

## Success Criteria

1. `apps/web/src/core/` is empty (deleted)
2. `apps/web/src/atoms/` is empty (deleted)
3. `apps/web/src/lib/` only contains `utils.ts` and `transform-messages.ts`
4. All tests pass (910+ tests)
5. Production build succeeds
6. No runtime errors in dev mode

---

## Open Questions

1. **Should atoms stay in core or move to react?**
   - Atoms use Effect but are consumed by React hooks
   - Leaning toward core since they're framework-agnostic

2. **Should we extract a `@opencode-vibe/sdk` wrapper?**
   - Currently using `@opencode-ai/sdk` directly
   - Could wrap with typed Effect layer
   - Defer until needed

3. **Should SSE manager be an Effect Service?**
   - Currently a singleton class
   - Could be Effect.Stream based
   - Defer - current implementation works

---

## References

- [ADR 001: Next.js Rebuild](./001-nextjs-rebuild.md)
- [ADR 005: Package Extraction](./005-swarmtools-extraction.md)
- [Core Inventory](./scratch/005-inventory-core.md)
- [React Inventory](./scratch/005-inventory-react.md)
