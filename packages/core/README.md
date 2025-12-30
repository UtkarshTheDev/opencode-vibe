# @opencode-vibe/core

The OpenCode engine. Provides everything you need to integrate OpenCode into your application—from simple Promise-based APIs to composable Effect programs for power users.

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

### 1. Promise API (Default - Most Users)

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
const parts = await parts.list("ses_123", "msg_456")
const part = await parts.get("ses_123", "msg_456", "part_789")

// Providers (AI models)
const providers = await providers.list()

// Projects
const projects = await projects.list()
const current = await projects.current()

// Servers (discovery)
const servers = await servers.list()
```

All functions return `Promise<T>`. No Effect knowledge required.

### 2. Effect API (Power Users)

Composable, testable, error handling built-in. Use this if you're building complex workflows.

```typescript
import { SessionAtom, MessageAtom, PartAtom } from "@opencode-vibe/core/atoms"
import { Effect } from "effect"

// Compose Effect programs
const program = Effect.gen(function* () {
  // Fetch sessions
  const sessions = yield* SessionAtom.list("/path/to/project")
  
  // Filter and map
  const recent = sessions.filter(s => s.createdAt > Date.now() - 86400000)
  
  // Fetch messages for first session
  if (recent.length > 0) {
    const messages = yield* MessageAtom.list(recent[0].id)
    return { session: recent[0], messageCount: messages.length }
  }
  
  return null
})

// Run it
const result = await Effect.runPromise(program)
```

Effect gives you:
- **Composability** - Chain operations without callback hell
- **Error handling** - Typed errors, no try/catch
- **Testability** - Mock dependencies, run in isolation
- **Concurrency** - Built-in parallelism with `Effect.all`

See `@opencode-vibe/core/atoms` for the full Effect API.

---

## Common Use Cases

### List Sessions for a Project

```typescript
import { sessions } from "@opencode-vibe/core"

const projectSessions = await sessions.list("/Users/joel/projects/myapp")
console.log(`${projectSessions.length} sessions`)
```

### Get All Messages in a Session

```typescript
import { messages } from "@opencode-vibe/core"

const sessionMessages = await messages.list("ses_abc123")
sessionMessages.forEach(msg => {
  console.log(`${msg.role}: ${msg.content}`)
})
```

### Get Tool Results from a Message

```typescript
import { parts } from "@opencode-vibe/core"

// Messages contain parts (tool calls, results, text, etc)
const messageParts = await parts.list("ses_123", "msg_456")

const toolResults = messageParts.filter(p => p.type === "tool_result")
toolResults.forEach(result => {
  console.log(`Tool ${result.toolName} returned:`, result.output)
})
```

### Real-Time Updates with SSE

```typescript
import { sse } from "@opencode-vibe/core"
import { Stream, Effect, Schedule, Duration } from "effect"

const stream = sse.connect({ url: "http://localhost:4056" })

// Listen for events with automatic reconnection
await Effect.runPromise(
  Stream.runForEach(stream, (event) =>
    Effect.sync(() => {
      console.log("Event:", event.type, event.payload)
    })
  ).pipe(
    Effect.retry(
      Schedule.exponential(Duration.seconds(3))
    )
  )
)
```

Events include:
- Session created/updated
- Message added
- Part updated (tool calls, results, streaming text)
- Provider changes

### Discover Running OpenCode Servers

```typescript
import { servers } from "@opencode-vibe/core"

const runningServers = await servers.list()
console.log(`Found ${runningServers.length} servers`)

runningServers.forEach(server => {
  console.log(`${server.host}:${server.port}`)
})
```

Useful for multi-instance setups where OpenCode runs on different ports.

---

## Types

All types are exported for TypeScript support:

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

const session: Session = {
  id: "ses_123",
  title: "Debug auth flow",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  // ... more fields
}
```

---

## Configuration

### Server URL

By default, connects to `http://localhost:4056`. Override with:

```typescript
import { OPENCODE_URL } from "@opencode-vibe/core"

// Via environment variable
process.env.NEXT_PUBLIC_OPENCODE_URL = "http://my-server:4056"

// Or import the constant
console.log(OPENCODE_URL) // "http://localhost:4056" or env value
```

### Directory Scoping

Most APIs accept an optional `directory` parameter to scope operations to a specific project:

```typescript
// All sessions across all projects
const all = await sessions.list()

// Sessions for a specific project
const project = await sessions.list("/Users/joel/projects/myapp")
```

---

## Advanced: Effect Composition

If you're using Effect, you can compose atoms into larger programs:

```typescript
import { SessionAtom, MessageAtom, PartAtom } from "@opencode-vibe/core/atoms"
import { Effect } from "effect"

const analyzeSession = (sessionId: string) =>
  Effect.gen(function* () {
    const messages = yield* MessageAtom.list(sessionId)
    
    // Fetch all parts for all messages in parallel
    const allParts = yield* Effect.all(
      messages.map(msg => PartAtom.list(sessionId, msg.id)),
      { concurrency: 5 }
    )
    
    const toolCalls = allParts
      .flat()
      .filter(p => p.type === "tool_call")
    
    return {
      messageCount: messages.length,
      toolCallCount: toolCalls.length,
    }
  })

// Run it
const stats = await Effect.runPromise(analyzeSession("ses_123"))
```

---

## Submodules

Import specific modules for smaller bundle sizes:

```typescript
// Promise API (default)
import { sessions, messages } from "@opencode-vibe/core"

// Effect atoms (power users)
import { SessionAtom, MessageAtom } from "@opencode-vibe/core/atoms"

// Server discovery
import { servers } from "@opencode-vibe/core"
import { ServerAtom } from "@opencode-vibe/core/atoms"

// SSE streaming
import { sse } from "@opencode-vibe/core"
import { SSEAtom } from "@opencode-vibe/core/atoms"

// Router (advanced)
import { createRouter } from "@opencode-vibe/core/router"

// Utilities
import { binarySearch, parsePrompt } from "@opencode-vibe/core/utils"

// Types only
import type { Session, Message, Part } from "@opencode-vibe/core/types"
```

---

## Error Handling

### Promise API

```typescript
import { sessions } from "@opencode-vibe/core"

try {
  const session = await sessions.get("invalid-id")
  if (!session) {
    console.log("Session not found")
  }
} catch (error) {
  console.error("Failed to fetch session:", error)
}
```

### Effect API

```typescript
import { SessionAtom } from "@opencode-vibe/core/atoms"
import { Effect } from "effect"

const program = SessionAtom.get("ses_123").pipe(
  Effect.catchTag("NotFound", () => Effect.succeed(null)),
  Effect.catchAll(error => {
    console.error("Unexpected error:", error)
    return Effect.fail(error)
  })
)

const result = await Effect.runPromise(program)
```

---

## Testing

Both APIs are testable. For Promise API, just mock the underlying Effect atoms. For Effect API, use Effect's testing utilities:

```typescript
import { SessionAtom } from "@opencode-vibe/core/atoms"
import { Effect } from "effect"
import { describe, it, expect } from "bun:test"

describe("Session operations", () => {
  it("fetches sessions", async () => {
    const program = SessionAtom.list("/test/path")
    const result = await Effect.runPromise(program)
    expect(Array.isArray(result)).toBe(true)
  })
})
```

---

## What's Next?

- **React Integration**: See `@opencode-vibe/react` for hooks and providers
- **Server Discovery**: Use `servers.list()` to find running OpenCode instances
- **Real-Time Sync**: Subscribe to SSE events for live updates
- **Effect Patterns**: Check out Effect's documentation for advanced composition patterns

---

## Contributing

Tests live alongside source files (`.test.ts`). Run with:

```bash
bun test src/
```

Type check before committing:

```bash
bun run type-check
```

---

## License

MIT
