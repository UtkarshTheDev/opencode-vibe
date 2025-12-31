# @opencode-vibe/core

```
                            ██████╗ ██████╗ ███████╗███╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗
                           ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝
                    ████╗  ██║   ██║██████╔╝█████╗  ██╔██╗ ██║██║     ██║   ██║██║  ██║█████╗
                    ╚═══╝  ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██║     ██║   ██║██║  ██║██╔══╝
                           ╚██████╔╝██║     ███████╗██║ ╚████║╚██████╗╚██████╔╝██████╔╝███████╗
                            ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝

                           ██╗   ██╗██╗██████╗ ███████╗     ██████╗ ██████╗ ██████╗ ███████╗
                           ██║   ██║██║██╔══██╗██╔════╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
                    ████╗  ██║   ██║██║██████╔╝█████╗      ██║     ██║   ██║██████╔╝█████╗
                    ╚═══╝  ╚██╗ ██╔╝██║██╔══██╗██╔══╝      ██║     ██║   ██║██╔══██╗██╔══╝
                            ╚████╔╝ ██║██████╔╝███████╗    ╚██████╗╚██████╔╝██║  ██║███████╗
                             ╚═══╝  ╚═╝╚═════╝ ╚══════╝     ╚═════╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝

                                    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
                                    ┃     T H E   E N G I N E   C O R E     ┃
                                    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

The OpenCode engine. Everything you need to integrate OpenCode into your application—from simple Promise-based APIs to composable Effect programs for power users.

---

## Quick Start

### Install

```bash
bun add @opencode-vibe/core @opencode-ai/sdk
```

### Your First API Call (30 seconds)

```typescript
import { sessions } from "@opencode-vibe/core"

// List all sessions
const allSessions = await sessions.list()
console.log(`Found ${allSessions.length} sessions`)

// Get a specific session
const session = await sessions.get("session-id-here")
if (session) {
  console.log(`Session: ${session.title}`)
}
```

That's it. You're talking to OpenCode.

---

## Two APIs: Pick Your Style

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   PROMISE API                      EFFECT API                   │
│   ───────────                      ──────────                   │
│                                                                 │
│   await sessions.list()    vs     SessionAtom.list().pipe(...)  │
│                                                                 │
│   ✓ Simple                         ✓ Composable                 │
│   ✓ Familiar                       ✓ Type-safe errors           │
│   ✓ Quick start                    ✓ Testable                   │
│                                                                 │
│   Most users start here ───────►   Power users level up here   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Promise API (Default)

Simple, straightforward, async/await. Use this unless you have a reason not to.

```typescript
import { sessions, messages, parts, providers, projects } from "@opencode-vibe/core"

// Sessions
const allSessions = await sessions.list("/path/to/project")
const session = await sessions.get("ses_123")

// Messages
const msgs = await messages.list("ses_123")
const msg = await messages.get("ses_123", "msg_456")

// Parts (tool calls, results, etc)
const partsList = await parts.list("ses_123", "msg_456")
const part = await parts.get("ses_123", "msg_456", "part_789")

// Providers (AI models)
const providersList = await providers.list()

// Projects
const projectsList = await projects.list()
const current = await projects.current()

// Servers (discovery)
const serversList = await servers.list()
```

All functions return `Promise<T>`. No Effect knowledge required.

### Effect API (Power Users)

Composable, testable, error handling built-in. For complex workflows.

```typescript
import { SessionAtom, MessageAtom } from "@opencode-vibe/core/atoms"
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const sessions = yield* SessionAtom.list("/path/to/project")
  const messages = yield* MessageAtom.list(sessions[0].id)
  return { session: sessions[0], messageCount: messages.length }
})

const result = await Effect.runPromise(program)
```

Effect gives you composability, typed errors, testability, and concurrency. See `@opencode-vibe/core/atoms` for the full Effect API.

---

## Data Flow

```
                        ╭──────────────────────────────────────────────────────────╮
                        │                    DATA FLOW                             │
                        ╰──────────────────────────────────────────────────────────╯

                                    ┌─────────────┐
                                    │   PROJECT   │
                                    │  /my/app    │
                                    └──────┬──────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                   ┌────────────┐   ┌────────────┐   ┌────────────┐
                   │  SESSION   │   │  SESSION   │   │  SESSION   │
                   │  ses_001   │   │  ses_002   │   │  ses_003   │
                   └─────┬──────┘   └────────────┘   └────────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ MESSAGE  │ │ MESSAGE  │ │ MESSAGE  │
      │  user    │ │assistant │ │  user    │
      └────┬─────┘ └────┬─────┘ └──────────┘
           │            │
           ▼            ▼
      ┌─────────┐  ┌─────────┐
      │  PART   │  │  PART   │
      │  text   │  │  tool   │
      └─────────┘  └─────────┘
```

---

## Real-Time Updates with SSE

```
     ╔══════════════════════════════════════════════════════════════════╗
     ║                     SERVER-SENT EVENTS                           ║
     ╠══════════════════════════════════════════════════════════════════╣
     ║                                                                  ║
     ║    ┌──────────┐         SSE Stream          ┌──────────────┐    ║
     ║    │ OpenCode │  ═══════════════════════▶   │  Your App    │    ║
     ║    │  Server  │    session.created          │              │    ║
     ║    │          │    message.added            │   Real-time  │    ║
     ║    │  :4056   │    part.updated             │   Updates!   │    ║
     ║    └──────────┘                             └──────────────┘    ║
     ║                                                                  ║
     ╚══════════════════════════════════════════════════════════════════╝
```

```typescript
import { sse } from "@opencode-vibe/core"
import { Stream, Effect } from "effect"

const stream = sse.connect({ url: "http://localhost:4056" })

await Effect.runPromise(
  Stream.runForEach(stream, (event) =>
    Effect.sync(() => console.log("Event:", event.type, event.payload))
  )
)
```

Events: session created/updated, message added, part updated, provider changes.

---

## Configuration

### Server URL

Connects to `http://localhost:4056` by default. Override with:

```typescript
process.env.NEXT_PUBLIC_OPENCODE_URL = "http://my-server:4056"
```

### Directory Scoping

```typescript
// All sessions across all projects
const all = await sessions.list()

// Sessions for a specific project
const project = await sessions.list("/Users/joel/projects/myapp")
```

---

## Types

```typescript
import type {
  Session,
  Message,
  Part,
  Provider,
  Project,
  GlobalEvent,
  SSEConfig,
} from "@opencode-vibe/core"
```

---

## License

```
  ███╗   ███╗██╗████████╗
  ████╗ ████║██║╚══██╔══╝
  ██╔████╔██║██║   ██║
  ██║╚██╔╝██║██║   ██║
  ██║ ╚═╝ ██║██║   ██║
  ╚═╝     ╚═╝╚═╝   ╚═╝
```
