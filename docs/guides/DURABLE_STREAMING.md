# Durable Streaming Architecture Guide

```
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║   ┌─────────────────────────────────────────────────────┐    ║
    ║   │  ██████╗ ██╗   ██╗██████╗  █████╗ ██████╗ ██╗     ███████╗│
    ║   │  ██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔══██╗██║     ██╔════╝│
    ║   │  ██║  ██║██║   ██║██████╔╝███████║██████╔╝██║     █████╗  │
    ║   │  ██║  ██║██║   ██║██╔══██╗██╔══██║██╔══██╗██║     ██╔══╝  │
    ║   │  ██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝███████╗███████╗│
    ║   │  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚══════╝╚══════╝│
    ║   │                                                     │    ║
    ║   │         DURABLE STREAMING ARCHITECTURE              │    ║
    ║   └─────────────────────────────────────────────────────┘    ║
    ║                                                               ║
    ║   From fragile SSE to bulletproof real-time sync             ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
```

---

## The Problem: Fragile SSE

Your current architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CURRENT STATE (FRAGILE)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Client                          Server                             │
│  ──────                          ──────                             │
│                                                                     │
│  1. Connect SSE ──────────────►  /global/event                      │
│                                                                     │
│  2. Receive events ◄────────────  { type: "message.updated", ... }  │
│     { type: "message.part.updated", ... }                           │
│     { type: "session.status", ... }                                 │
│                                                                     │
│  3. ❌ Connection drops                                              │
│     - Tab backgrounded                                              │
│     - Network flap                                                  │
│     - Server restart                                                │
│     - Mobile app suspended                                          │
│                                                                     │
│  4. 😱 EVENTS LOST FOREVER                                          │
│     - No way to know what we missed                                 │
│     - Must refetch entire session state                             │
│     - Race conditions during reconnect                              │
│     - Duplicate events possible                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Problems:**

1. **No resumability** - When connection drops, events are lost
2. **No offset tracking** - Can't say "give me events after X"
3. **No durability** - Events only exist in-flight
4. **Reconnect races** - Fetching state while events stream = inconsistency
5. **lsof polling** - You're scanning for servers because there's no discovery

---

## The Solution: Durable Streams

The [Durable Streams Protocol](https://github.com/durable-streams/durable-streams) provides:

- **Offset-based resumability** - Resume from any point
- **Catch-up reads** - Fetch missed events on reconnect
- **Live tailing** - SSE mode for real-time updates
- **CDN-friendly** - HTTP-native, cacheable
- **Multi-client** - Same stream, multiple viewers

```
┌─────────────────────────────────────────────────────────────────────┐
│                     DESIRED STATE (DURABLE)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Client                          Server                             │
│  ──────                          ──────                             │
│                                                                     │
│  1. Connect with offset ────────►  GET /stream/session-123          │
│     ?offset=01JFXYZ...              ?offset=01JFXYZ&live=true       │
│     &live=true                                                      │
│                                                                     │
│  2. Receive events ◄────────────  Stream-Next-Offset: 01JFXYZ...    │
│     (with offset headers)         { type: "message.updated", ... }  │
│                                                                     │
│  3. ⚡ Connection drops                                              │
│     (client stores last offset)                                     │
│                                                                     │
│  4. ✅ Reconnect with offset ───►  GET /stream/session-123          │
│     ?offset=01JFXYZ...              ?offset=01JFXYZ&live=true       │
│                                                                     │
│  5. ✅ Catch-up + live ◄────────  Missed events + live tail         │
│     (no gaps, no duplicates)                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Current OpenCode SSE Architecture](#1-current-opencode-sse-architecture)
2. [What Durable Streams Adds](#2-what-durable-streams-adds)
3. [Implementation Options](#3-implementation-options)
4. [Client-Side Implementation](#4-client-side-implementation)
5. [Server-Side Changes](#5-server-side-changes)
6. [Migration Path](#6-migration-path)

---

## 1. Current OpenCode SSE Architecture

### How It Works Now

```typescript
// Server: packages/opencode/src/server/server.ts
app.get("/global/event", async (c) => {
  return streamSSE(c, async (stream) => {
    // Send connected event
    stream.writeSSE({
      data: JSON.stringify({
        payload: { type: "server.connected", properties: {} },
      }),
    });

    // Subscribe to bus events
    async function handler(event: any) {
      await stream.writeSSE({
        data: JSON.stringify(event),
      });
    }
    GlobalBus.on("event", handler);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: JSON.stringify({
          payload: { type: "server.heartbeat", properties: {} },
        }),
      });
    }, 30000);

    // Cleanup on disconnect
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        GlobalBus.off("event", handler);
        resolve();
      });
    });
  });
});
```

### What's Missing

| Feature            | Current              | Durable Streams    |
| ------------------ | -------------------- | ------------------ |
| Resumability       | ❌ None              | ✅ Offset-based    |
| Catch-up reads     | ❌ Must refetch all  | ✅ From any offset |
| Event persistence  | ❌ In-memory only    | ✅ Durable storage |
| Multi-tab dedup    | ❌ Each tab connects | ✅ Shared stream   |
| Reconnect handling | ❌ Manual, racy      | ✅ Automatic       |
| Event ordering     | ⚠️ Best-effort       | ✅ Guaranteed      |

---

## 2. What Durable Streams Adds

### Core Concepts

**Offset**: An opaque, lexicographically sortable token identifying a position in the stream.

```
Stream: [event1][event2][event3][event4][event5]
         ^       ^       ^       ^       ^
Offset:  0       1       2       3       4 (tail)
```

**Read Modes**:

1. **Catch-up**: Fetch all events from offset to current tail (HTTP response ends)
2. **Live (Long-poll)**: Wait for new events, return when available
3. **Live (SSE)**: Continuous stream of new events

### Protocol Overview

```
# Create a stream for a session
PUT /stream/session-{sessionID}
Content-Type: application/x-ndjson

# Append events (server-side)
POST /stream/session-{sessionID}
Content-Type: application/x-ndjson

{"type":"message.updated","properties":{...}}
{"type":"message.part.updated","properties":{...}}

# Read from beginning (catch-up)
GET /stream/session-{sessionID}
→ Returns all events, Stream-Next-Offset header

# Read from offset (resume)
GET /stream/session-{sessionID}?offset=01JFXYZ...
→ Returns events after offset

# Live tail (SSE mode)
GET /stream/session-{sessionID}?offset=01JFXYZ...&live=sse
→ SSE stream of new events
```

### Key Headers

| Header               | Direction | Purpose                          |
| -------------------- | --------- | -------------------------------- |
| `Stream-Offset`      | Request   | Start reading from this offset   |
| `Stream-Next-Offset` | Response  | Offset after last returned event |
| `Stream-Tail-Offset` | Response  | Current end of stream            |

---

## 3. Implementation Options

### Option A: Full Durable Streams Server

Use the official durable-streams server as a sidecar:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │              │     │              │     │              │        │
│  │   OpenCode   │────►│   Durable    │◄────│    Client    │        │
│  │   Server     │     │   Streams    │     │              │        │
│  │              │     │   Server     │     │              │        │
│  └──────────────┘     └──────────────┘     └──────────────┘        │
│        │                     │                    │                 │
│        │  POST /stream/...   │   GET /stream/...  │                 │
│        │  (append events)    │   (read events)    │                 │
│        │                     │                    │                 │
│        └─────────────────────┴────────────────────┘                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Pros**: Full protocol support, battle-tested, CDN-ready
**Cons**: Additional process, more infrastructure

### Option B: Embed in OpenCode Server

Implement the protocol directly in OpenCode:

```typescript
// Simplified durable stream implementation
interface DurableStream {
  id: string;
  events: Array<{ offset: string; data: string }>;
  tailOffset: string;
}

const streams = new Map<string, DurableStream>();

// Append event (called from Bus)
function appendEvent(streamId: string, event: BusEvent) {
  const stream = streams.get(streamId) || createStream(streamId);
  const offset = generateOffset(); // ULID or similar
  stream.events.push({ offset, data: JSON.stringify(event) });
  stream.tailOffset = offset;
}

// Read endpoint
app.get("/stream/:streamId", async (c) => {
  const streamId = c.req.param("streamId");
  const offset = c.req.query("offset");
  const live = c.req.query("live");

  const stream = streams.get(streamId);
  if (!stream) return c.notFound();

  // Find events after offset
  const events = offset
    ? stream.events.filter((e) => e.offset > offset)
    : stream.events;

  if (live === "sse") {
    // SSE mode with catch-up
    return streamSSE(c, async (sse) => {
      // Send catch-up events
      for (const event of events) {
        sse.writeSSE({
          id: event.offset,
          data: event.data,
        });
      }

      // Then live tail...
    });
  }

  // Catch-up mode
  c.header("Stream-Next-Offset", stream.tailOffset);
  return c.json(events.map((e) => JSON.parse(e.data)));
});
```

**Pros**: No additional infrastructure, simpler deployment
**Cons**: Must implement persistence, less battle-tested

### Option C: Hybrid - Client-Side Durability

Keep current SSE, add client-side offset tracking with REST fallback:

```typescript
// Client tracks last seen offset
let lastOffset = localStorage.getItem(`stream-offset-${sessionId}`);

// On reconnect, fetch missed events via REST
async function reconnect() {
  // Fetch events since last offset
  const missed = await fetch(
    `/session/${sessionId}/events?after=${lastOffset}`,
  ).then((r) => r.json());

  // Apply missed events
  for (const event of missed) {
    handleEvent(event);
    lastOffset = event.id;
  }

  // Then reconnect SSE
  connectSSE();
}
```

**Pros**: Minimal server changes, works today
**Cons**: Not true durability, still has race windows

---

## 4. Client-Side Implementation

### Using @durable-streams/client

```typescript
import { DurableStreamClient } from "@durable-streams/client";

const client = new DurableStreamClient({
  baseUrl: "http://localhost:4096",
});

// Subscribe to session events with automatic resume
const subscription = client.subscribe(`/stream/session-${sessionId}`, {
  // Start from stored offset or beginning
  offset: localStorage.getItem(`offset-${sessionId}`) || undefined,

  onEvent: (event, offset) => {
    // Handle event
    handleEvent(JSON.parse(event));

    // Store offset for resume
    localStorage.setItem(`offset-${sessionId}`, offset);
  },

  onError: (error) => {
    console.error("Stream error:", error);
    // Client automatically reconnects with last offset
  },
});

// Later: unsubscribe
subscription.close();
```

### Manual Implementation (No Library)

```typescript
class DurableEventSource {
  private eventSource: EventSource | null = null;
  private lastOffset: string | null = null;
  private sessionId: string;
  private onEvent: (event: any) => void;

  constructor(sessionId: string, onEvent: (event: any) => void) {
    this.sessionId = sessionId;
    this.onEvent = onEvent;
    this.lastOffset = localStorage.getItem(`offset-${sessionId}`);
  }

  connect() {
    const url = new URL(`/stream/session-${this.sessionId}`, baseUrl);
    url.searchParams.set("live", "sse");
    if (this.lastOffset) {
      url.searchParams.set("offset", this.lastOffset);
    }

    this.eventSource = new EventSource(url.toString());

    this.eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);

      // Extract offset from SSE id field
      if (e.lastEventId) {
        this.lastOffset = e.lastEventId;
        localStorage.setItem(`offset-${this.sessionId}`, this.lastOffset);
      }

      this.onEvent(event);
    };

    this.eventSource.onerror = () => {
      // Reconnect with last offset (automatic resume)
      setTimeout(() => this.connect(), 1000);
    };
  }

  disconnect() {
    this.eventSource?.close();
  }
}
```

### React Hook

```typescript
function useDurableStream(sessionId: string) {
  const [events, setEvents] = useState<Event[]>([]);
  const [connected, setConnected] = useState(false);
  const [offset, setOffset] = useState<string | null>(() =>
    localStorage.getItem(`offset-${sessionId}`),
  );

  useEffect(() => {
    const stream = new DurableEventSource(sessionId, (event) => {
      setEvents((prev) => [...prev, event]);
    });

    stream.connect();
    setConnected(true);

    return () => {
      stream.disconnect();
      setConnected(false);
    };
  }, [sessionId]);

  return { events, connected, offset };
}
```

---

## 5. Server-Side Changes

### Minimal Changes to OpenCode

To support durable streaming, OpenCode needs:

1. **Event persistence** - Store events with offsets
2. **Offset-based reads** - Query events after offset
3. **SSE with catch-up** - Send missed events before live tail

### Event Storage Schema

```typescript
interface StoredEvent {
  id: string; // ULID - lexicographically sortable
  sessionId: string; // Which session this belongs to
  type: string; // Event type
  payload: any; // Event data
  timestamp: number; // When it occurred
}

// Storage options:
// 1. SQLite (simple, local)
// 2. Append to session file (already have file storage)
// 3. Separate event log files
```

### Modified Bus Handler

```typescript
// In GlobalBus or Bus
function publish(event: BusEvent) {
  // Generate offset
  const offset = ulid();

  // Store event
  await EventStore.append({
    id: offset,
    sessionId: event.sessionID,
    type: event.type,
    payload: event.properties,
    timestamp: Date.now(),
  });

  // Emit to live subscribers (existing behavior)
  emit("event", { ...event, offset });
}
```

### New Endpoint

```typescript
app.get("/stream/session/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const offset = c.req.query("offset");
  const live = c.req.query("live");

  // Get events after offset
  const events = await EventStore.query({
    sessionId,
    afterOffset: offset,
  });

  if (live === "sse") {
    return streamSSE(c, async (stream) => {
      // 1. Send catch-up events
      for (const event of events) {
        stream.writeSSE({
          id: event.id, // SSE spec: lastEventId for resume
          data: JSON.stringify({
            type: event.type,
            properties: event.payload,
          }),
        });
      }

      // 2. Subscribe to live events
      const handler = (event: any) => {
        if (event.sessionID === sessionId) {
          stream.writeSSE({
            id: event.offset,
            data: JSON.stringify(event),
          });
        }
      };

      GlobalBus.on("event", handler);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          GlobalBus.off("event", handler);
          resolve();
        });
      });
    });
  }

  // Catch-up only (no live)
  const tailOffset =
    events.length > 0 ? events[events.length - 1].id : offset || "0";

  c.header("Stream-Next-Offset", tailOffset);
  return c.json(events);
});
```

---

## 6. Client vs Server Responsibilities

### Who Does What?

| Feature               | Server (OpenCode)      | Client (Your App) |
| --------------------- | ---------------------- | ----------------- |
| Add event IDs to SSE  | ✅ Required            | -                 |
| Store last offset     | -                      | ✅ Required       |
| Reconnect with offset | -                      | ✅ Required       |
| Event persistence     | ✅ Optional (Level 2+) | -                 |
| Catch-up endpoint     | ✅ Optional (Level 2+) | -                 |

### No Fork - Contribute Upstream

**We don't fork OpenCode.** The goal is to contribute improvements upstream so everyone benefits. The changes needed are minimal and non-breaking.

### Level 1: Pure Client-Side (Works Today)

The quick win requires **zero server changes**. OpenCode's SSE already works - you just need smarter reconnect logic:

```typescript
// Your client - no server changes needed
class ResilientEventSource {
  private lastMessageId: string | null = null;
  private sessionId: string;
  private baseUrl: string;

  constructor(sessionId: string, baseUrl: string) {
    this.sessionId = sessionId;
    this.baseUrl = baseUrl;
    this.lastMessageId = localStorage.getItem(`lastMsg-${sessionId}`);
  }

  connect() {
    const es = new EventSource(`${this.baseUrl}/global/event`);

    es.onmessage = (e) => {
      const event = JSON.parse(e.data);

      // Track message order using IDs from payload
      const msgId =
        event.payload?.properties?.info?.id ||
        event.payload?.properties?.part?.id;

      if (msgId) {
        this.lastMessageId = msgId;
        localStorage.setItem(`lastMsg-${this.sessionId}`, this.lastMessageId);
      }

      this.handleEvent(event);
    };

    es.onerror = () => {
      es.close();
      this.reconnectWithCatchUp();
    };
  }

  async reconnectWithCatchUp() {
    // Fetch current state via REST (endpoint already exists!)
    const messages = await fetch(
      `${this.baseUrl}/session/${this.sessionId}/message?limit=50`,
    ).then((r) => r.json());

    // Reconcile with local state
    this.reconcile(messages);

    // Reconnect SSE with backoff
    setTimeout(() => this.connect(), 1000);
  }

  private reconcile(messages: MessageWithParts[]) {
    // Compare with local state, apply missing updates
    // ...
  }

  private handleEvent(event: any) {
    // Your event handling logic
    // ...
  }
}
```

**This works today** because:

- `GET /session/:id/message?limit=N` already exists
- Messages and parts have IDs you can track
- You just need smarter client reconnect logic

### Level 2+: Contribute to OpenCode

For **true durability** (offset-based catch-up), OpenCode needs a small change. This is a ~5 line PR:

```typescript
// packages/opencode/src/server/server.ts line ~161
// BEFORE:
async function handler(event: any) {
  await stream.writeSSE({
    data: JSON.stringify(event),
  });
}

// AFTER:
async function handler(event: any) {
  await stream.writeSSE({
    id: ulid(), // ← Add SSE event ID for resumability
    data: JSON.stringify(event),
  });
}
```

**Why this matters:**

- SSE spec has built-in `lastEventId` support
- Browsers automatically send `Last-Event-ID` header on reconnect
- Server can use this to resume from the right point
- Non-breaking change - clients that don't use it are unaffected

### Contribution Roadmap

```
┌─────────────────────────────────────────────────────────────────┐
│                  CONTRIBUTION PLAN                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PR #1: Add Event IDs to SSE (5 lines)                          │
│  ─────────────────────────────────────                          │
│  • Add `id: ulid()` to stream.writeSSE calls                    │
│  • Non-breaking, backwards compatible                           │
│  • Enables client-side offset tracking                          │
│                                                                 │
│  PR #2: Event Persistence (Optional, Larger)                    │
│  ────────────────────────────────────────────                   │
│  • Store events with offsets in session storage                 │
│  • Add `?after=<offset>` query param to message endpoint        │
│  • Enables true catch-up reads                                  │
│                                                                 │
│  PR #3: SSE Catch-Up Mode (Optional, Larger)                    │
│  ───────────────────────────────────────────                    │
│  • New endpoint: GET /stream/session/:id?offset=X&live=sse      │
│  • Sends missed events, then live tails                         │
│  • Full durable streams semantics                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### What NOT To Do

❌ **Don't fork OpenCode** - Maintenance burden, falls behind upstream
❌ **Don't add a proxy layer** - Extra infrastructure, latency, complexity
❌ **Don't build parallel event storage** - Duplicates data, sync issues

✅ **Do contribute upstream** - Everyone benefits, no maintenance burden
✅ **Do client-side resilience first** - Works today, no blockers
✅ **Do propose small, focused PRs** - Easier to review and merge

---

## 7. Migration Path

### Phase 1: Add Offset Tracking (No Breaking Changes)

1. Add `id` field to SSE events (uses SSE spec's `lastEventId`)
2. Client stores last seen ID
3. On reconnect, client fetches `/session/:id/message` to catch up

```typescript
// Server: Add ID to existing SSE
stream.writeSSE({
  id: ulid(), // Add this
  data: JSON.stringify(event),
});

// Client: Track last ID
eventSource.onmessage = (e) => {
  if (e.lastEventId) {
    localStorage.setItem("lastEventId", e.lastEventId);
  }
  handleEvent(JSON.parse(e.data));
};
```

### Phase 2: Add Event Persistence

1. Store events in append-only log (per session)
2. Add `/stream/session/:id` endpoint with offset query
3. Client uses new endpoint for catch-up

### Phase 3: Full Durable Streams

1. Implement full protocol (or use durable-streams server)
2. Add `?live=sse` mode with catch-up
3. Deprecate old `/global/event` endpoint

### Phase 4: Multi-Tab Optimization

1. Use SharedWorker or BroadcastChannel for single connection
2. All tabs share one stream subscription
3. Reduces server load, improves consistency

---

## Quick Wins (Do Today)

### 1. Add Event IDs to Current SSE

```typescript
// server.ts - minimal change
stream.writeSSE({
  id: ulid(), // ← Add this line
  data: JSON.stringify(event),
});
```

### 2. Client Stores Last Event ID

```typescript
// Client
eventSource.onmessage = (e) => {
  if (e.lastEventId) {
    sessionStorage.setItem(`lastEvent-${sessionId}`, e.lastEventId);
  }
  // ... handle event
};
```

### 3. Reconnect with Catch-Up

```typescript
// On reconnect, fetch messages since disconnect
async function reconnect() {
  const lastEventId = sessionStorage.getItem(`lastEvent-${sessionId}`);

  // Fetch current state
  const messages = await fetch(`/session/${sessionId}/message?limit=50`).then(
    (r) => r.json(),
  );

  // Reconcile with local state
  reconcileMessages(messages);

  // Reconnect SSE
  connectSSE();
}
```

---

## 8. OpenCode Internals Deep Dive

### Event Flow Architecture

Understanding how events flow through OpenCode is critical for implementing durable streaming. Here's the complete architecture:

```
┌──────────────────────────────────────────────────────────────────────┐
│                    EVENT FLOW ARCHITECTURE                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Event Source                                                        │
│  (Session, Message, PTY, LSP, VCS, etc.)                             │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  Bus.publish(EventDefinition, properties)               │         │
│  │  • Type-safe via Zod schema                             │         │
│  │  • Routed to local subscribers                          │         │
│  └─────────────────────────────────────────────────────────┘         │
│         │                                                            │
│         ├─► Local Subscribers (Instance-scoped)                      │
│         │   • Session handlers                                       │
│         │   • File watchers                                          │
│         │   • PTY managers                                           │
│         │                                                            │
│         └─► GlobalBus.emit("event", { directory, payload })          │
│             │                                                        │
│             ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  GlobalBus (EventEmitter)                               │         │
│  │  • Broadcasts to ALL SSE clients                        │         │
│  │  • No persistence, in-memory only                       │         │
│  │  • No offset tracking                                   │         │
│  └─────────────────────────────────────────────────────────┘         │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────┐         │
│  │  /global/event SSE Endpoint                             │         │
│  │  • Streams events to connected clients                  │         │
│  │  • 30s heartbeat (WKWebView timeout prevention)         │         │
│  │  • No event IDs, no resumability                        │         │
│  └─────────────────────────────────────────────────────────┘         │
│         │                                                            │
│         ▼                                                            │
│  Client (Browser/App)                                                │
│  • Receives events in real-time                                      │
│  • ❌ No way to resume on disconnect                                  │
│  • ❌ No way to catch up missed events                                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Complete Event Registry (36 Events)

OpenCode publishes 36 distinct event types across 9 domains. Here's the complete registry:

#### Server Events (2)

| Event Type         | Payload | Purpose                        |
| ------------------ | ------- | ------------------------------ |
| `server.connected` | `{}`    | Client connected to SSE stream |
| `global.disposed`  | `{}`    | Server shutting down           |

#### Session Events (6)

| Event Type        | Payload                          | Purpose                  |
| ----------------- | -------------------------------- | ------------------------ |
| `session.created` | `{ info: SessionInfo }`          | New session created      |
| `session.updated` | `{ info: SessionInfo }`          | Session metadata changed |
| `session.deleted` | `{ id: string }`                 | Session deleted          |
| `session.diff`    | `{ id: string, diff: string }`   | Session state diff       |
| `session.error`   | `{ id: string, error: string }`  | Session error occurred   |
| `session.status`  | `{ id: string, status: string }` | Session status changed   |

#### Message Events (4)

| Event Type             | Payload                          | Purpose                          |
| ---------------------- | -------------------------------- | -------------------------------- |
| `message.updated`      | `{ info: MessageInfo }`          | Message created/updated          |
| `message.removed`      | `{ id: string }`                 | Message deleted                  |
| `message.part.updated` | `{ id: string, part: PartInfo }` | Message part (streaming content) |
| `message.part.removed` | `{ id: string, partId: string }` | Message part deleted             |

#### File Events (2)

| Event Type     | Payload                               | Purpose               |
| -------------- | ------------------------------------- | --------------------- |
| `file.edited`  | `{ path: string, changes: Change[] }` | File edited           |
| `file.updated` | `{ path: string, stat: FileStat }`    | File metadata changed |

#### PTY Events (4)

| Event Type    | Payload                            | Purpose                |
| ------------- | ---------------------------------- | ---------------------- |
| `pty.created` | `{ info: PTYInfo }`                | Terminal created       |
| `pty.updated` | `{ info: PTYInfo }`                | Terminal state changed |
| `pty.exited`  | `{ id: string, exitCode: number }` | Terminal exited        |
| `pty.deleted` | `{ id: string }`                   | Terminal deleted       |

#### LSP Events (1)

| Event Type        | Payload                                       | Purpose                     |
| ----------------- | --------------------------------------------- | --------------------------- |
| `lsp.diagnostics` | `{ file: string, diagnostics: Diagnostic[] }` | Language server diagnostics |

#### VCS Events (1)

| Event Type           | Payload                              | Purpose                   |
| -------------------- | ------------------------------------ | ------------------------- |
| `vcs.branch.updated` | `{ branch: string, commit: string }` | Git branch/commit changed |

#### Permission Events (2)

| Event Type           | Payload                            | Purpose                     |
| -------------------- | ---------------------------------- | --------------------------- |
| `permission.updated` | `{ info: PermissionInfo }`         | Permission granted/revoked  |
| `permission.replied` | `{ id: string, granted: boolean }` | Permission request answered |

#### IDE/Installation Events (4)

| Event Type                      | Payload                             | Purpose                           |
| ------------------------------- | ----------------------------------- | --------------------------------- |
| `ide.installed`                 | `{ name: string, version: string }` | IDE extension installed           |
| `installation.updated`          | `{ info: InstallationInfo }`        | Installation metadata changed     |
| `installation.update.available` | `{ version: string }`               | Update available for installation |
| `mcp.tools.changed`             | `{ tools: ToolDefinition[] }`       | MCP tools list changed            |

#### Other Events (10)

| Event Type             | Payload                             | Purpose                     |
| ---------------------- | ----------------------------------- | --------------------------- |
| `command.executed`     | `{ id: string, result: any }`       | Command executed            |
| `project.updated`      | `{ info: ProjectInfo }`             | Project metadata changed    |
| `session.todo.updated` | `{ id: string, todos: Todo[] }`     | Session todos changed       |
| `session.idle`         | `{ id: string }`                    | Session idle timeout        |
| `session.compacted`    | `{ id: string }`                    | Session compacted (cleanup) |
| `tui.prompt.append`    | `{ text: string }`                  | TUI prompt text appended    |
| `tui.command.execute`  | `{ command: string }`               | TUI command executed        |
| `tui.toast.show`       | `{ message: string, type: string }` | Toast notification shown    |

### Key Code Snippets

#### 1. Event Publishing Flow

```typescript
// packages/opencode/src/bus/index.ts
export async function publish<Definition extends BusEvent.Definition>(
  def: Definition,
  properties: z.output<Definition["properties"]>,
) {
  const payload = {
    type: def.type,
    properties,
  };

  // 1. Notify local subscribers (instance-scoped)
  const pending = [];
  for (const key of [def.type, "*"]) {
    const match = state().subscriptions.get(key);
    for (const sub of match ?? []) {
      pending.push(sub(payload));
    }
  }

  // 2. Broadcast to all SSE clients via GlobalBus
  GlobalBus.emit("event", {
    directory: Instance.directory,
    payload,
  });

  return Promise.all(pending);
}
```

#### 2. SSE Endpoint

```typescript
// packages/opencode/src/server/server.ts:149-188
app.get("/global/event", async (c) => {
  return streamSSE(c, async (stream) => {
    // Send connected event
    stream.writeSSE({
      data: JSON.stringify({
        payload: {
          type: "server.connected",
          properties: {},
        },
      }),
    });

    // Subscribe to bus events
    async function handler(event: any) {
      await stream.writeSSE({
        data: JSON.stringify(event),
      });
    }
    GlobalBus.on("event", handler);

    // Heartbeat every 30s (WKWebView timeout prevention)
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: JSON.stringify({
          payload: {
            type: "server.heartbeat",
            properties: {},
          },
        }),
      });
    }, 30000);

    // Cleanup on disconnect
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat);
        GlobalBus.off("event", handler);
        resolve();
      });
    });
  });
});
```

#### 3. Event Definition Pattern

```typescript
// Example: Session events
// packages/opencode/src/session/index.ts
export namespace Session {
  export const Created = BusEvent.define(
    "session.created",
    z.object({ info: Info }),
  );

  export const Updated = BusEvent.define(
    "session.updated",
    z.object({ info: Info }),
  );

  export const Deleted = BusEvent.define(
    "session.deleted",
    z.object({ id: Identifier.schema("session") }),
  );
}

// Publishing
await Bus.publish(Session.Created, { info: sessionInfo });
```

### Recommended PR Changes

To add durability to OpenCode's SSE, propose these upstream changes:

#### PR #1: Add Event IDs to SSE (5 lines)

```typescript
// packages/opencode/src/server/server.ts:160-163
// BEFORE:
async function handler(event: any) {
  await stream.writeSSE({
    data: JSON.stringify(event),
  });
}

// AFTER:
import { ulid } from "ulidx";

async function handler(event: any) {
  await stream.writeSSE({
    id: ulid(), // ← Add this for resumability
    data: JSON.stringify(event),
  });
}
```

**Why this matters:**

- SSE spec has built-in `lastEventId` support
- Browsers automatically send `Last-Event-ID` header on reconnect
- Enables client-side offset tracking without server changes
- Non-breaking: clients that don't use it are unaffected

#### PR #2: Event Persistence (Optional, Larger)

```typescript
// Add to packages/opencode/src/bus/index.ts
import { Database } from "bun:sqlite";

const eventLog = new Database("events.db");

export async function publish<Definition extends BusEvent.Definition>(
  def: Definition,
  properties: z.output<Definition["properties"]>,
) {
  const offset = ulid();
  const payload = { type: def.type, properties };

  // Store event with offset
  eventLog
    .prepare(
      `
    INSERT INTO events (id, sessionId, type, payload, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(
      offset,
      properties.sessionId || "global",
      def.type,
      JSON.stringify(payload),
      Date.now(),
    );

  // ... rest of publish logic
}
```

#### PR #3: Offset-Based Query Endpoint (Optional, Larger)

```typescript
// Add to packages/opencode/src/server/server.ts
app.get("/stream/session/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const offset = c.req.query("offset");
  const live = c.req.query("live");

  // Query events after offset
  const events = offset
    ? eventLog
        .prepare(
          `
        SELECT * FROM events 
        WHERE sessionId = ? AND id > ? 
        ORDER BY id ASC
      `,
        )
        .all(sessionId, offset)
    : eventLog
        .prepare(
          `
        SELECT * FROM events 
        WHERE sessionId = ? 
        ORDER BY id ASC
      `,
        )
        .all(sessionId);

  if (live === "sse") {
    return streamSSE(c, async (stream) => {
      // Send catch-up events
      for (const event of events) {
        stream.writeSSE({
          id: event.id,
          data: event.payload,
        });
      }

      // Then live tail...
      const handler = (busEvent: any) => {
        if (busEvent.sessionID === sessionId) {
          stream.writeSSE({
            id: busEvent.offset,
            data: JSON.stringify(busEvent),
          });
        }
      };
      GlobalBus.on("event", handler);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          GlobalBus.off("event", handler);
          resolve();
        });
      });
    });
  }

  // Catch-up only (no live)
  const tailOffset =
    events.length > 0 ? events[events.length - 1].id : offset || "0";
  c.header("Stream-Next-Offset", tailOffset);
  return c.json(events.map((e) => JSON.parse(e.payload)));
});
```

---

## 9. Durable Streams Protocol Reference

### Protocol Operations

The Durable Streams Protocol defines four HTTP operations:

#### PUT - Create Stream

Creates a new durable stream for a resource.

```
PUT /stream/session-{sessionID}
Content-Type: application/x-ndjson

# Optional: seed with initial events
{"type":"session.created","properties":{...}}
```

**Response:**

```
201 Created
Stream-Offset: 01JFXYZ...
Stream-Next-Offset: 01JFXYZ...
Stream-Tail-Offset: 01JFXYZ...
```

#### POST - Append Events

Appends events to an existing stream.

```
POST /stream/session-{sessionID}
Content-Type: application/x-ndjson

{"type":"message.updated","properties":{...}}
{"type":"message.part.updated","properties":{...}}
```

**Response:**

```
200 OK
Stream-Next-Offset: 01JFXYZ...
Stream-Tail-Offset: 01JFXYZ...
```

#### GET - Read Events

Reads events from a stream with multiple modes.

**Mode 1: Catch-up (fetch all events)**

```
GET /stream/session-{sessionID}
```

**Response:**

```
200 OK
Stream-Next-Offset: 01JFXYZ...
Stream-Tail-Offset: 01JFXYZ...
Content-Type: application/x-ndjson

{"type":"message.updated","properties":{...}}
{"type":"message.part.updated","properties":{...}}
```

**Mode 2: Resume from offset**

```
GET /stream/session-{sessionID}?offset=01JFXYZ...
```

**Response:**

```
200 OK
Stream-Next-Offset: 01JFXYZ...
Stream-Tail-Offset: 01JFXYZ...
Content-Type: application/x-ndjson

{"type":"message.updated","properties":{...}}
```

**Mode 3: Live tail (SSE)**

```
GET /stream/session-{sessionID}?offset=01JFXYZ...&live=sse
```

**Response:**

```
200 OK
Content-Type: text/event-stream

id: 01JFXYZ...
data: {"type":"message.updated","properties":{...}}

id: 01JFXYZ...
data: {"type":"message.part.updated","properties":{...}}
```

**Mode 4: Long-poll (wait for new events)**

```
GET /stream/session-{sessionID}?offset=01JFXYZ...&live=longpoll
```

**Response:**

```
200 OK
Stream-Next-Offset: 01JFXYZ...
Stream-Tail-Offset: 01JFXYZ...
Content-Type: application/x-ndjson

{"type":"message.updated","properties":{...}}
```

#### DELETE - Delete Stream

Deletes a stream and all its events.

```
DELETE /stream/session-{sessionID}
```

**Response:**

```
204 No Content
```

#### HEAD - Check Stream Status

Checks stream status without fetching events.

```
HEAD /stream/session-{sessionID}
```

**Response:**

```
200 OK
Stream-Offset: 01JFXYZ...
Stream-Next-Offset: 01JFXYZ...
Stream-Tail-Offset: 01JFXYZ...
```

### Offset Semantics

Understanding offsets is critical for correct implementation:

```
Stream State:
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ Event 1  │ Event 2  │ Event 3  │ Event 4  │ Event 5  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
  01JFX1     01JFX2     01JFX3     01JFX4     01JFX5
                                              (tail)

Offset Semantics:
─────────────────────────────────────────────────────

offset=undefined
  → Read from beginning (all events)
  → Returns: Event 1, 2, 3, 4, 5
  → Stream-Next-Offset: 01JFX5

offset=01JFX1
  → Read events AFTER 01JFX1
  → Returns: Event 2, 3, 4, 5
  → Stream-Next-Offset: 01JFX5

offset=01JFX3
  → Read events AFTER 01JFX3
  → Returns: Event 4, 5
  → Stream-Next-Offset: 01JFX5

offset=01JFX5
  → Read events AFTER 01JFX5 (tail)
  → Returns: (empty)
  → Stream-Next-Offset: 01JFX5
  → In live mode: waits for new events

Stream-Tail-Offset:
  → Current end of stream
  → Always returned in response headers
  → Use for monitoring stream position
```

### Client API

#### TypeScript Implementation

```typescript
interface StreamOptions {
  baseUrl: string;
  streamId: string;
  offset?: string;
  mode?: "catchup" | "live-sse" | "live-longpoll";
  onEvent?: (event: any, offset: string) => void;
  onError?: (error: Error) => void;
}

class DurableStreamClient {
  private lastOffset: string | null = null;
  private eventSource: EventSource | null = null;
  private options: StreamOptions;

  constructor(options: StreamOptions) {
    this.options = options;
    this.lastOffset = this.loadOffset();
  }

  async connect() {
    const url = new URL(
      `/stream/${this.options.streamId}`,
      this.options.baseUrl,
    );

    // Add offset if resuming
    if (this.lastOffset) {
      url.searchParams.set("offset", this.lastOffset);
    }

    // Add live mode
    if (this.options.mode === "live-sse") {
      url.searchParams.set("live", "sse");
    } else if (this.options.mode === "live-longpoll") {
      url.searchParams.set("live", "longpoll");
    }

    if (this.options.mode === "live-sse") {
      this.connectSSE(url.toString());
    } else {
      await this.fetchCatchUp(url.toString());
    }
  }

  private connectSSE(url: string) {
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      const offset = e.lastEventId;

      if (offset) {
        this.lastOffset = offset;
        this.saveOffset();
      }

      this.options.onEvent?.(event, offset);
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.options.onError?.(new Error("SSE connection lost"));
      // Reconnect with exponential backoff
      setTimeout(() => this.connect(), 1000);
    };
  }

  private async fetchCatchUp(url: string) {
    try {
      const response = await fetch(url);
      const nextOffset = response.headers.get("Stream-Next-Offset");

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            const event = JSON.parse(line);
            this.options.onEvent?.(event, nextOffset || this.lastOffset);
          }
        }

        buffer = lines[lines.length - 1];
      }

      if (nextOffset) {
        this.lastOffset = nextOffset;
        this.saveOffset();
      }

      // If live mode, continue with SSE
      if (this.options.mode?.startsWith("live")) {
        await this.connect();
      }
    } catch (error) {
      this.options.onError?.(error as Error);
    }
  }

  private loadOffset(): string | null {
    return localStorage.getItem(`stream-offset-${this.options.streamId}`);
  }

  private saveOffset() {
    if (this.lastOffset) {
      localStorage.setItem(
        `stream-offset-${this.options.streamId}`,
        this.lastOffset,
      );
    }
  }

  disconnect() {
    this.eventSource?.close();
  }
}
```

#### React Hook

```typescript
function useDurableStream(sessionId: string) {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const client = new DurableStreamClient({
      baseUrl: "http://localhost:4096",
      streamId: `session-${sessionId}`,
      mode: "live-sse",
      onEvent: (event, offset) => {
        setEvents((prev) => [...prev, event]);
      },
      onError: (err) => {
        setError(err);
        setConnected(false);
      },
    });

    client.connect();
    setConnected(true);

    return () => {
      client.disconnect();
      setConnected(false);
    };
  }, [sessionId]);

  return { events, connected, error };
}
```

### Migration Examples

#### Step 1: Add Offset Tracking to Current SSE

```typescript
// Before: Plain SSE with no resumability
class EventSource {
  connect() {
    const es = new EventSource("/global/event");
    es.onmessage = (e) => this.handleEvent(JSON.parse(e.data));
  }
}

// After: Track offsets for resumability
class ResilientEventSource {
  private lastOffset: string | null = null;

  connect() {
    const es = new EventSource("/global/event");

    es.onmessage = (e) => {
      // SSE spec: lastEventId is automatically set from 'id' field
      if (e.lastEventId) {
        this.lastOffset = e.lastEventId;
        localStorage.setItem("lastOffset", this.lastOffset);
      }
      this.handleEvent(JSON.parse(e.data));
    };

    es.onerror = () => {
      es.close();
      this.reconnectWithCatchUp();
    };
  }

  private async reconnectWithCatchUp() {
    // Fetch missed events via REST
    const response = await fetch(`/session/${sessionId}/message?limit=50`);
    const messages = await response.json();

    // Reconcile with local state
    this.reconcile(messages);

    // Reconnect SSE
    setTimeout(() => this.connect(), 1000);
  }
}
```

#### Step 2: Migrate to Durable Streams Endpoint

```typescript
// Before: Using /global/event
const es = new EventSource("/global/event");

// After: Using /stream/session-X with offset
const client = new DurableStreamClient({
  baseUrl: "http://localhost:4096",
  streamId: `session-${sessionId}`,
  mode: "live-sse",
  onEvent: (event, offset) => {
    handleEvent(event);
    // Offset automatically saved by client
  },
});

client.connect();
```

#### Step 3: Add Catch-Up Mode

```typescript
// Before: Reconnect always fetches full state
async function reconnect() {
  const messages = await fetch(`/session/${sessionId}/message`).then((r) =>
    r.json(),
  );
  reconcile(messages);
}

// After: Catch-up only fetches missed events
async function reconnect() {
  const lastOffset = localStorage.getItem(`stream-offset-${sessionId}`);

  // Fetch only events after last offset
  const response = await fetch(
    `/stream/session-${sessionId}?offset=${lastOffset}`,
  );
  const missedEvents = await response.ndjson();

  for (const event of missedEvents) {
    handleEvent(event);
  }
}
```

#### Step 4: Multi-Tab Coordination

```typescript
// Before: Each tab connects independently
// → Duplicate events, wasted bandwidth

// After: Use SharedWorker for single connection
class SharedStreamWorker {
  private client: DurableStreamClient;

  constructor(sessionId: string) {
    this.client = new DurableStreamClient({
      baseUrl: "http://localhost:4096",
      streamId: `session-${sessionId}`,
      mode: "live-sse",
      onEvent: (event, offset) => {
        // Broadcast to all tabs
        this.broadcast("event", { event, offset });
      },
    });
  }

  private broadcast(type: string, data: any) {
    // Use BroadcastChannel or SharedWorker port
    this.port.postMessage({ type, data });
  }
}

// In each tab:
const channel = new BroadcastChannel(`stream-${sessionId}`);
channel.onmessage = (e) => {
  if (e.data.type === "event") {
    handleEvent(e.data.event);
  }
};
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                     STREAMING ARCHITECTURE LEVELS                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Level 0: Current (Fragile)                                         │
│  ─────────────────────────                                          │
│  • Plain SSE, no IDs                                                │
│  • Events lost on disconnect                                        │
│  • Manual reconnect, full refetch                                   │
│                                                                     │
│  Level 1: Event IDs (Quick Win)                                     │
│  ─────────────────────────────                                      │
│  • Add ULID to each SSE event                                       │
│  • Client tracks lastEventId                                        │
│  • Catch-up via REST on reconnect                                   │
│                                                                     │
│  Level 2: Server-Side Persistence                                   │
│  ────────────────────────────────                                   │
│  • Store events with offsets                                        │
│  • Offset-based query endpoint                                      │
│  • True catch-up reads                                              │
│                                                                     │
│  Level 3: Full Durable Streams                                      │
│  ─────────────────────────────                                      │
│  • Implement protocol or use server                                 │
│  • SSE with automatic catch-up                                      │
│  • CDN-friendly, multi-client                                       │
│                                                                     │
│  Level 4: Production Grade                                          │
│  ─────────────────────────────                                      │
│  • SharedWorker for multi-tab                                       │
│  • Retention policies                                               │
│  • Compression, batching                                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Path

1. **Today**: Client-side resilience (works now, no server changes)
2. **This Week**: Open PR to OpenCode - add event IDs to SSE
3. **Next Sprint**: PR for event persistence + offset queries
4. **Future**: Full durable-streams semantics in OpenCode

### Philosophy

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   "We don't fork. We contribute."                               │
│                                                                 │
│   Bulletproof streaming should be a reality for everyone        │
│   using OpenCode, not just our app. Small, focused PRs          │
│   upstream benefit the entire ecosystem.                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The key insight: **You don't need the full protocol to get 80% of the benefit.** Just adding event IDs and client-side tracking eliminates most reconnect pain. And when we contribute those changes upstream, everyone wins.

---

_Last updated: December 2025_
