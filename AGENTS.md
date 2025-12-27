# AGENTS.md

## ⚠️ CRITICAL: Chrome DevTools = Subagent ONLY

**NEVER use `chrome-devtools_*` tools directly in the main conversation.**

Chrome DevTools dumps massive snapshots that will exhaust your context window. Always spawn a subagent:

```
Task(
  subagent_type="explore",
  description="Debug via Chrome DevTools",
  prompt="Use chrome-devtools_* to investigate <issue>. Report findings."
)
```

This keeps the expensive DOM/network data in disposable subagent context.

---

## Project Overview

**opencode-next** - Next.js 16 rebuild of the OpenCode web application.

This is the initial scaffold for rebuilding OpenCode's web UI from SolidJS to Next.js 16+ with React Server Components. Currently a simple Bun project that will evolve into a turborepo monorepo (`opencode-vibe`) with extracted packages.

### Current State

- ✅ Basic Bun project scaffold
- ✅ TypeScript configuration
- ✅ Architecture Decision Record (ADR 001)
- ⏳ Next.js app implementation (in progress)
- ⏳ Turborepo migration (planned)
- ⏳ Package extraction (planned)

See `docs/adr/001-nextjs-rebuild.md` for full architecture rationale and migration plan.

---

## Tech Stack

| Layer          | Technology                                                | Why                                                                |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| **Runtime**    | [Bun](https://bun.com)                                    | Fast all-in-one runtime, 10x faster installs, built-in test runner |
| **Framework**  | Next.js 16 canary                                         | React Server Components, App Router, Turbopack                     |
| **Bundler**    | [Turbopack](https://turbo.build/pack)                     | Next-gen bundler, faster than Webpack                              |
| **Monorepo**   | [Turborepo](https://turbo.build/repo) (planned)           | Monorepo orchestration, incremental builds                         |
| **Language**   | TypeScript 5+                                             | Type safety, LSP support                                           |
| **Type Check** | [typescript-go](https://github.com/jdx/rtx)               | Bleeding edge, 10x faster than tsc                                 |
| **Linting**    | [oxlint](https://oxc.rs/)                                 | Fast Rust-based linter                                             |
| **Formatting** | [Biome](https://biomejs.dev/)                             | Fast formatter, Prettier replacement                               |
| **Chat UI**    | [ai-elements](https://github.com/vercel-labs/ai-elements) | Battle-tested React components for chat UIs                        |
| **Styling**    | Tailwind CSS                                              | Utility-first CSS (preserved from SolidJS app)                     |

### Why Next.js 16?

Current OpenCode web app (SolidJS) has:

- **Provider Hell** - 13+ nested context providers
- **Mobile UX Issues** - 5 confirmed bugs from framework mismatch
- **Maintenance Burden** - 403-line GlobalSyncProvider god object

Next.js 16 enables:

- **Flat hierarchy** - RSC eliminates provider nesting
- **Better mobile patterns** - React hooks map to scroll behavior
- **Code reduction** - ai-elements eliminates chat UI boilerplate (30-40% reduction)
- **Easier hiring** - React is 10x more common than SolidJS

---

## Directory Structure

### Current (Simple Bun Project)

```
opencode-next/
├── docs/
│   └── adr/
│       └── 001-nextjs-rebuild.md   # Architecture rationale
├── node_modules/
├── .hive/
│   └── issues.jsonl                # Work tracking
├── .cursor/
│   └── rules/                      # Cursor IDE rules
├── package.json                    # Bun dependencies
├── tsconfig.json                   # TypeScript config
├── bun.lock                        # Lockfile
├── index.ts                        # Entry point
├── README.md                       # Basic setup
├── CLAUDE.md                       # AI agent conventions
└── AGENTS.md                       # This file
```

### Planned (Turborepo Monorepo)

After extraction, directory structure will become:

```
opencode-vibe/
├── apps/
│   └── web/                        # Next.js 16 app
│       ├── app/                    # App Router pages
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── session/[id]/page.tsx
│       ├── src/
│       │   ├── core/               # → @opencode/core (future package)
│       │   ├── react/              # → @opencode/react (future package)
│       │   └── ui/                 # → @opencode/ui (future package)
│       └── package.json
├── packages/
│   ├── core/                       # SDK + service layer (extracted)
│   ├── react/                      # React bindings (extracted)
│   └── ui/                         # Shared components (extracted)
├── turbo.json
└── package.json
```

**Extraction Strategy:**

1. **Phase 1** - Build in `apps/web/src/` folders
2. **Phase 2** - Extract to `packages/` when patterns stabilize
3. **No premature extraction** - Wait for third use before creating package

---

## Development Commands

### Setup

```bash
# Install dependencies (uses Bun, not npm/pnpm)
bun install
```

### Development

```bash
# Run dev server (when Next.js app exists)
bun dev

# Build for production
bun build

# Type check (uses typescript-go if installed, fallback to tsc)
bun run typecheck
```

### Code Quality

```bash
# Lint (oxlint)
bun lint

# Format (biome)
bun format

# Fix formatting
bun format:fix
```

### Testing

```bash
# Run tests (uses bun:test)
bun test

# Watch mode
bun test --watch
```

---

## Conventions

### TDD (Non-Negotiable)

```
RED → GREEN → REFACTOR
```

**Every feature. Every bug fix. No exceptions.**

1. **RED** - Write failing test first
2. **GREEN** - Minimum code to pass
3. **REFACTOR** - Clean up while green

**Bug fixes:** Write test that reproduces bug FIRST, then fix. Prevents regression forever.

See `@knowledge/tdd-patterns.md` for full doctrine.

### Dependency Management

**CRITICAL:** Never edit `package.json` manually.

```bash
# ✅ CORRECT - Use bun CLI
bun add <package>           # Production dependency
bun add -d <package>        # Dev dependency
bun remove <package>        # Uninstall

# ❌ WRONG - Manual edits
# Editing package.json directly breaks lockfile integrity
```

**Why?** Bun manages lockfile hashes. Manual edits cause version drift and phantom dependency issues.

### Bun-First Development

**Use Bun instead of Node.js, npm, pnpm, or vite.**

```bash
# ✅ Use Bun equivalents
bun <file>                  # Instead of node <file>
bun test                    # Instead of jest/vitest
bun build <file.html>       # Instead of webpack/vite
bun install                 # Instead of npm/pnpm install
bunx <package>              # Instead of npx

# ❌ Don't use these
node index.ts               # Use: bun index.ts
npm install                 # Use: bun install
npx tsc                     # Use: bunx tsc
```

See `CLAUDE.md` for full Bun API reference.

### Network Authentication

**No app-level auth needed.** Tailscale provides network-level authentication.

This means:

- No OAuth flows in the web app
- No JWT tokens in cookies
- No user login/logout UI
- Trust the network layer

---

## Future Extraction Notes

### Planned Packages

When extracting to turborepo, these will become separate packages:

#### `@opencode/core`

**Framework-agnostic service layer.**

```typescript
// SDK client factory
export function createOpencodeClient(config: {
  baseUrl: string;
  directory?: string;
}): OpencodeClient

// Namespaces (15 total)
client.session.*      // CRUD, messages, prompt
client.provider.*     // List, OAuth
client.project.*      // List, current, update
client.file.*         // List, read, status
client.tool.*         // List tools, schemas
// ... 10 more
```

**Purpose:** Can be used by web, desktop (Tauri), CLI, VSCode extension.

#### `@opencode/react`

**React bindings for OpenCode.**

```typescript
// Hooks
useSession(sessionID: string)
useMessages(sessionID: string)
useSSE(baseUrl: string)
useProvider()

// Context
<OpenCodeProvider baseUrl="..." directory="...">
  {children}
</OpenCodeProvider>
```

**Purpose:** React-specific integration, usable by any React app.

#### `@opencode/ui`

**Shared UI components.**

```typescript
// Components (TBD - wait for patterns to emerge)
<ChatUI />
<CodeViewer />
<DiffViewer />
<SessionList />
```

**Purpose:** Reusable components across UIs (web, desktop).

### Extraction Triggers

**WAIT FOR THIRD USE** before extracting.

| Pattern Usage  | Action                                |
| -------------- | ------------------------------------- |
| **First use**  | Implement in `apps/web/src/`          |
| **Second use** | Note duplication, consider extraction |
| **Third use**  | Extract to `packages/`                |

**Why?** Premature abstraction is worse than duplication. Let patterns emerge organically.

---

## Architecture Highlights

### AsyncLocalStorage DI Pattern

**Preserved from backend.** Elegant, portable, no changes needed.

```typescript
// Backend: packages/opencode/src/util/context.ts
export namespace Context {
  export function create<T>(name: string) {
    const storage = new AsyncLocalStorage<T>();
    return {
      use() {
        return storage.getStore()!;
      },
      provide<R>(value: T, fn: () => R) {
        return storage.run(value, fn);
      },
    };
  }
}

// Usage: Per-directory instance scoping
Instance.provide({ directory: "/path" }, async () => {
  // All code here has access to directory context
  const dir = Instance.directory;
});
```

### SSE Real-Time Sync

**Preserved approach, integrated via Server Actions.**

```typescript
// Current (SolidJS)
const events = await client.global.event();
for await (const event of events.stream) {
  emitter.emit(event.directory, event.payload);
}

// Future (React)
export function useSSE(baseUrl: string) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = createOpencodeClient({ baseUrl });

    async function connect() {
      const events = await client.global.event();
      setConnected(true);

      for await (const event of events.stream) {
        listeners.current
          .get(event.directory)
          ?.forEach((fn) => fn(event.payload));
      }
    }

    connect().catch(() => setConnected(false));
  }, [baseUrl]);

  // ... subscribe logic
}
```

### OpenAPI SDK Codegen

**Preserved workflow.** No changes to SDK generation.

```
OpenAPI Spec (openapi.json)
  ↓ @hey-api/openapi-ts
Generated Types (types.gen.ts)
  ↓
Generated Client (client.gen.ts)
  ↓
SDK Wrapper (sdk.gen.ts) ← Namespaced classes
  ↓
Public API (client.ts) ← createOpencodeClient()
  ↓
Consumer (apps/web/)
```

**Source of truth:** `packages/sdk/openapi.json` (OpenAPI 3.1.1)

---

## Known Gotchas

### SDK

- **No timeout on requests** - AI operations can run for minutes. `req.timeout = false` in client factory.
- **Directory scoping** - `x-opencode-directory` header routes requests to specific project instance.
- **Dual SDK instances** - One for SSE (no timeout), one for requests (10min timeout).

### Backend

- **No database** - All data in filesystem (`~/.local/state/opencode/`). No migrations, no transactions.
- **Event bus is global** - `GlobalBus.emit()` broadcasts to ALL clients. No per-client filtering.
- **Instance caching** - `Instance.provide()` caches per directory. Dispose required to clear cache.
- **SSE heartbeat required** - 30s heartbeat prevents WKWebView 60s timeout on mobile Safari.

### State Management

- **Binary search everywhere** - Updates use binary search on sorted arrays. Assumes IDs are sortable (they are - ULIDs).
- **Session limit** - UI loads 5 sessions by default + any updated in last 4 hours. Older sessions lazy-loaded.

---

## References

### Documentation

- [ADR 001: Next.js Rebuild](docs/adr/001-nextjs-rebuild.md) - Full architecture rationale
- [Bun API Docs](node_modules/bun-types/docs/) - Local Bun reference
- [Next.js Docs](https://nextjs.org/docs) - Next.js 16 App Router
- [ai-elements](https://github.com/vercel-labs/ai-elements) - Chat UI components

### Related Projects

- `packages/opencode` - Backend (Hono server, AsyncLocalStorage DI)
- `packages/sdk` - OpenAPI-generated SDK with 15 namespaces
- `packages/app` - Current SolidJS app (being replaced)

### Key Files

| File                             | Purpose                                |
| -------------------------------- | -------------------------------------- |
| `docs/adr/001-nextjs-rebuild.md` | Architecture rationale, migration plan |
| `CLAUDE.md`                      | AI agent conventions, Bun usage        |
| `.hive/issues.jsonl`             | Work tracking (git-backed)             |
| `package.json`                   | Bun dependencies                       |
| `tsconfig.json`                  | TypeScript configuration               |

---

## Migration Status

**Phase 1: Scaffold & Basic Session View** (Current)

- [x] Create Next.js 16 project scaffolding (this repo)
- [x] Document architecture (ADR 001)
- [ ] Set up Tailwind, TypeScript, ESLint
- [ ] Implement layout hierarchy (no provider nesting)
- [ ] Create session list page (RSC)
- [ ] Create session detail page with ai-elements ChatUI

**Phase 2: Real-Time Sync via SSE** (Week 2)

- [ ] Implement `useSSE` hook with reconnection
- [ ] Create Server Actions for SDK calls
- [ ] Implement message streaming
- [ ] Handle part updates (tool calls, results)

**Phase 3: Full Feature Parity** (Week 3)

- [ ] Implement all session features
- [ ] Add code/diff viewers
- [ ] Implement search/filtering
- [ ] Add provider management UI

**Phase 4: Mobile-First Polish** (Week 4)

- [ ] Fix auto-scroll on session load
- [ ] Add scroll-to-bottom FAB
- [ ] Responsive design for mobile
- [ ] Test on real devices

See ADR 001 for detailed timeline and success criteria.

---

## Questions or Issues?

- **Architecture questions:** See `docs/adr/001-nextjs-rebuild.md`
- **Bun usage:** See `CLAUDE.md`
- **Work tracking:** Check `.hive/issues.jsonl` or run `bd list`
- **SDK reference:** `packages/sdk/openapi.json` (OpenAPI 3.1.1)
