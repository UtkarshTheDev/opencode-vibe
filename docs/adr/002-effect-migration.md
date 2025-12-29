# ADR 002: Effect-Powered Router for Type-Safe Async Operations

**Status:** Proposed  
**Date:** 2025-12-28  
**Deciders:** Joel Hooks, Architecture Team  
**Affected Components:** All server-side async operations

---

## Executive Summary

We will build a **type-safe router abstraction** powered by Effect-TS internally. Users define routes with a fluent builder API—no Effect knowledge required. The router handles retry, timeout, concurrency, and streaming declaratively. Effect runs under the hood, invisible to consumers.

**This is the UploadThing pattern applied to our entire async surface area.**

```typescript
// What users write (no Effect)
const o = createOpencodeRoute();

export const routes = {
  getSession: o({ timeout: "30s" })
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, sdk }) => sdk.session.get(input.id)),

  subscribeToEvents: o({ retry: "exponential", stream: true }).handler(
    async function* ({ sdk }) {
      for await (const event of sdk.global.event()) {
        yield event;
      }
    },
  ),
} satisfies OpencodeRouter;

// What runs internally (full Effect)
// - Retry policies via Effect.retry + Schedule
// - Timeouts via Effect.timeout
// - Streaming via Effect.Stream
// - Concurrency via Effect.forEach with { concurrency: N }
// - Typed errors via Effect<A, E, R>
```

---

## Context

### The Problem

OpenCode has 2000+ lines of manual async orchestration:

| Component        | Lines | Pain Points                                               |
| ---------------- | ----- | --------------------------------------------------------- |
| SSE Handling     | 796   | Manual reconnection, heartbeat, multi-server coordination |
| Message Queue    | 208   | Race conditions, backpressure, state sync                 |
| Server Discovery | 150+  | Timeout handling, parallel requests, error accumulation   |

Every async operation reinvents:

- Retry with exponential backoff
- Timeout handling with AbortController
- Concurrency limiting
- Error recovery
- Streaming with reconnection

**The code is correct but unmaintainable.** Each pattern is hand-rolled, tested in isolation, and subtly different.

### The Insight

UploadThing solved this exact problem. They use Effect internally but expose a clean builder API:

```typescript
// UploadThing's public API - no Effect knowledge needed
const f = createUploadthing();

export const uploadRouter = {
  imageUploader: f({ image: { maxFileSize: "4MB" } })
    .middleware(async ({ req }) => ({ userId: getUserId(req) }))
    .onUploadComplete(async ({ file }) => saveToDb(file)),
} satisfies FileRouter;
```

Internally, UploadThing uses:

- `Effect.gen` for async orchestration ([handler.ts:103-150](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/_internal/handler.ts#L103-L150))
- `Context.Tag` for dependency injection ([handler.ts:50-52](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/_internal/handler.ts#L50-L52))
- `Schema` for runtime validation ([handler.ts:128-143](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/_internal/handler.ts#L128-L143))
- `@effect/platform` for HTTP handling ([handler.ts:1-15](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/_internal/handler.ts#L1-L15))

**We will apply this pattern to all OpenCode async operations.**

---

## Decision

### Build an Effect-Powered Router

We will create `@opencode/router` - a type-safe router where:

1. **Users write handlers with async/await** - No Effect syntax
2. **Route config declares behavior** - `{ timeout, retry, concurrency, stream }`
3. **Effect executes internally** - Retry, timeout, streaming, error handling
4. **Types flow end-to-end** - Input → Handler → Output fully inferred

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROUTER ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    PUBLIC API (No Effect)                          │ │
│  │                                                                    │ │
│  │  const o = createOpencodeRoute()                                  │ │
│  │                                                                    │ │
│  │  // Request-Response                                              │ │
│  │  getSession: o({ timeout: "30s" })                                │ │
│  │    .input(z.object({ id: z.string() }))                           │ │
│  │    .handler(async ({ input, sdk }) => ...)                        │ │
│  │                                                                    │ │
│  │  // Streaming                                                      │ │
│  │  subscribe: o({ retry: "exponential", stream: true })             │ │
│  │    .handler(async function* ({ sdk }) { yield* events })          │ │
│  │                                                                    │ │
│  │  // Concurrent                                                     │ │
│  │  discoverServers: o({ concurrency: 5, timeout: "2s" })            │ │
│  │    .input(z.object({ ports: z.array(z.number()) }))               │ │
│  │    .handler(async ({ input }) => checkPorts(input.ports))         │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    ROUTER RUNTIME (Effect)                         │ │
│  │                                                                    │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐ │ │
│  │  │ Route Parser │ │ Config       │ │ Executor     │ │ Response  │ │ │
│  │  │              │ │ Resolver     │ │              │ │ Encoder   │ │ │
│  │  │ Zod → Schema │ │              │ │ Effect.gen   │ │           │ │ │
│  │  │ validation   │ │ timeout →    │ │ with retry,  │ │ JSON or   │ │ │
│  │  │              │ │ Effect.timeout│ │ timeout,     │ │ Stream    │ │ │
│  │  │              │ │              │ │ concurrency  │ │           │ │ │
│  │  │              │ │ retry →      │ │              │ │           │ │ │
│  │  │              │ │ Schedule.*   │ │              │ │           │ │ │
│  │  │              │ │              │ │              │ │           │ │ │
│  │  │              │ │ stream →     │ │              │ │           │ │ │
│  │  │              │ │ Stream.*     │ │              │ │           │ │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └───────────┘ │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                     │
│                                    ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    FRAMEWORK ADAPTERS                              │ │
│  │                                                                    │ │
│  │  Next.js API Route    Server Action    Direct Call                │ │
│  │  createNextHandler()  createAction()   router.call()              │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Router API Design

### Route Configuration

```typescript
type RouteConfig = {
  // Timeout - how long before we give up
  timeout?: Duration; // "5s", "30s", "2m"

  // Retry - how to handle failures
  retry?:
    | "none"
    | "exponential" // 1s, 2s, 4s, 8s... up to 30s
    | "linear" // 1s, 2s, 3s, 4s...
    | {
        type: "exponential" | "linear";
        maxRetries?: number;
        maxDuration?: Duration;
        retryIf?: (error: unknown) => boolean;
      };

  // Concurrency - for batch operations
  concurrency?: number | "unbounded";

  // Streaming - for SSE/real-time
  stream?: boolean;

  // Cache - for repeated calls
  cache?: {
    ttl: Duration;
    key?: (input: unknown) => string;
  };
};
```

### Builder API

```typescript
// Create a route builder
const o = createOpencodeRoute();

// Basic route
const getSession = o({ timeout: "30s" })
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, sdk, signal }) => {
    return sdk.session.get(input.id);
  });

// Route with middleware
const protectedRoute = o({ timeout: "30s" })
  .input(z.object({ id: z.string() }))
  .middleware(async ({ sdk }) => {
    const user = await sdk.auth.getCurrentUser();
    if (!user) throw new UnauthorizedError();
    return { user };
  })
  .handler(async ({ input, ctx, sdk }) => {
    // ctx.user is available from middleware
    return sdk.session.get(input.id);
  });

// Streaming route
const subscribe = o({ retry: "exponential", stream: true }).handler(
  async function* ({ sdk, signal }) {
    const events = sdk.global.event();
    for await (const event of events) {
      if (signal.aborted) break;
      yield event;
    }
  },
);

// Batch route with concurrency
const checkServers = o({ concurrency: 5, timeout: "2s" })
  .input(z.object({ ports: z.array(z.number()) }))
  .handler(async ({ input }) => {
    // Router automatically parallelizes with concurrency limit
    return Promise.all(input.ports.map(checkPort));
  });
```

### Router Definition

```typescript
// apps/web/src/server/router.ts
import { createOpencodeRoute, createRouter } from "@opencode/router";
import { z } from "zod";

const o = createOpencodeRoute();

export const appRouter = createRouter({
  // Session operations
  session: {
    get: o({ timeout: "30s" })
      .input(z.object({ id: z.string() }))
      .handler(async ({ input, sdk }) => sdk.session.get(input.id)),

    list: o({ timeout: "30s", cache: { ttl: "5s" } }).handler(async ({ sdk }) =>
      sdk.session.list(),
    ),

    create: o({ timeout: "60s" })
      .input(z.object({ provider: z.string() }))
      .handler(async ({ input, sdk }) => sdk.session.create(input)),
  },

  // Real-time subscriptions
  subscribe: {
    events: o({ retry: "exponential", stream: true })
      .input(z.object({ directory: z.string() }))
      .handler(async function* ({ input, sdk }) {
        for await (const event of sdk.global.event()) {
          if (event.directory === input.directory) {
            yield event;
          }
        }
      }),

    messages: o({ retry: "exponential", stream: true })
      .input(z.object({ sessionId: z.string() }))
      .handler(async function* ({ input, sdk }) {
        for await (const msg of sdk.session.messages(input.sessionId)) {
          yield msg;
        }
      }),
  },

  // Server discovery
  servers: {
    discover: o({ concurrency: 5, timeout: "2s" })
      .input(z.object({ ports: z.array(z.number()) }))
      .handler(async ({ input }) => {
        const results = await Promise.all(
          input.ports.map(async (port) => {
            try {
              const res = await fetch(`http://localhost:${port}/health`);
              return res.ok ? { port, url: `http://localhost:${port}` } : null;
            } catch {
              return null;
            }
          }),
        );
        return results.filter(Boolean);
      }),
  },
});

export type AppRouter = typeof appRouter;
```

### Framework Adapters

#### Next.js API Route

```typescript
// apps/web/src/app/api/[...opencode]/route.ts
import { createNextHandler } from "@opencode/router/next";
import { appRouter } from "@/server/router";

const handler = createNextHandler({
  router: appRouter,
  createContext: async (req) => ({
    sdk: createOpencodeClient({ baseUrl: getBaseUrl(req) }),
  }),
});

export { handler as GET, handler as POST };
```

#### Server Actions

```typescript
// apps/web/src/server/actions.ts
"use server";

import { createAction } from "@opencode/router/next";
import { appRouter } from "./router";

export const getSession = createAction(appRouter.session.get);
export const listSessions = createAction(appRouter.session.list);
export const subscribeToEvents = createAction(appRouter.subscribe.events);
```

#### Direct Call (Server Components)

```typescript
// apps/web/src/app/session/[id]/page.tsx
import { createCaller } from "@opencode/router";
import { appRouter } from "@/server/router";

export default async function SessionPage({ params }: { params: { id: string } }) {
  const caller = createCaller(appRouter, {
    sdk: createOpencodeClient({ baseUrl: process.env.OPENCODE_URL }),
  });

  const session = await caller.session.get({ id: params.id });

  return <SessionView session={session} />;
}
```

---

## Streaming Architecture

### The Key Insight

Streaming routes use **async generators**. The router runtime converts these to the appropriate streaming primitive:

```typescript
// User writes an async generator
const subscribe = o({ stream: true, retry: "exponential" }).handler(
  async function* ({ sdk }) {
    for await (const event of sdk.global.event()) {
      yield event;
    }
  },
);

// Router runtime converts to Effect.Stream internally
// Effect.Stream.fromAsyncIterable(generator)
//   .pipe(Stream.retry(Schedule.exponential("1s")))
//   .pipe(Stream.timeout("30s"))

// Framework adapter converts to appropriate response
// Next.js: ReadableStream → Response
// Server Action: AsyncIterable
// Direct: AsyncGenerator
```

### Streaming with Retry

```typescript
// Route definition
const subscribeWithRetry = o({
  stream: true,
  retry: {
    type: "exponential",
    maxRetries: 10,
    retryIf: (err) => err instanceof ConnectionError,
  },
}).handler(async function* ({ sdk, signal }) {
  for await (const event of sdk.global.event()) {
    if (signal.aborted) return;
    yield event;
  }
});

// Internal Effect implementation
const executeStream = (route: StreamRoute, ctx: Context) =>
  Effect.gen(function* () {
    const generator = route.handler(ctx);

    return Stream.fromAsyncIterable(
      generator,
      (e) => new StreamError({ cause: e }),
    ).pipe(
      Stream.retry(
        Schedule.exponential("1 second").pipe(
          Schedule.upTo("30 seconds"),
          Schedule.whileInput((err) => route.config.retry.retryIf(err)),
        ),
      ),
      Stream.interruptWhen(Effect.fromPromise(() => ctx.signal.aborted)),
    );
  });
```

### Client Consumption

```typescript
// React hook for streaming routes
function useSubscription<T>(
  action: () => AsyncIterable<T>,
  deps: unknown[]
) {
  const [events, setEvents] = useState<T[]>([]);
  const [status, setStatus] = useState<"idle" | "connected" | "error">("idle");

  useEffect(() => {
    const controller = new AbortController();

    async function subscribe() {
      setStatus("connected");
      try {
        for await (const event of action()) {
          if (controller.signal.aborted) break;
          setEvents((prev) => [...prev, event]);
        }
      } catch (err) {
        setStatus("error");
      }
    }

    subscribe();
    return () => controller.abort();
  }, deps);

  return { events, status };
}

// Usage
function SessionMessages({ sessionId }: { sessionId: string }) {
  const { events, status } = useSubscription(
    () => subscribeToMessages({ sessionId }),
    [sessionId]
  );

  return (
    <div>
      {status === "connected" && <span>Live</span>}
      {events.map((msg) => <Message key={msg.id} {...msg} />)}
    </div>
  );
}
```

---

## Effect Internals

### Route Executor

```typescript
// packages/router/src/executor.ts
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

export const executeRoute = <TInput, TOutput>(
  route: Route<TInput, TOutput>,
  input: TInput,
  ctx: RouteContext,
): Effect.Effect<TOutput, RouteError, RouterEnv> =>
  Effect.gen(function* () {
    // 1. Validate input
    const validatedInput = yield* validateInput(route.inputSchema, input);

    // 2. Run middleware chain
    const middlewareCtx = yield* runMiddleware(route.middleware, ctx);

    // 3. Execute handler with config
    const handlerCtx = { ...ctx, ...middlewareCtx, input: validatedInput };

    if (route.config.stream) {
      return yield* executeStreamHandler(route, handlerCtx);
    } else {
      return yield* executeRequestHandler(route, handlerCtx);
    }
  });

const executeRequestHandler = <TInput, TOutput>(
  route: Route<TInput, TOutput>,
  ctx: HandlerContext<TInput>,
): Effect.Effect<TOutput, RouteError, RouterEnv> => {
  let effect = Effect.tryPromise({
    try: () => route.handler(ctx),
    catch: (e) => new HandlerError({ cause: e }),
  });

  // Apply timeout
  if (route.config.timeout) {
    effect = effect.pipe(
      Effect.timeout(parseDuration(route.config.timeout)),
      Effect.catchTag("TimeoutException", () =>
        Effect.fail(new TimeoutError({ duration: route.config.timeout })),
      ),
    );
  }

  // Apply retry
  if (route.config.retry && route.config.retry !== "none") {
    effect = effect.pipe(Effect.retry(buildSchedule(route.config.retry)));
  }

  return effect;
};

const executeStreamHandler = <TInput, TOutput>(
  route: Route<TInput, TOutput>,
  ctx: HandlerContext<TInput>,
): Effect.Effect<Stream.Stream<TOutput, RouteError>, RouteError, RouterEnv> =>
  Effect.gen(function* () {
    const generator = route.handler(ctx) as AsyncGenerator<TOutput>;

    let stream = Stream.fromAsyncIterable(
      generator,
      (e) => new StreamError({ cause: e }),
    );

    // Apply retry to stream
    if (route.config.retry && route.config.retry !== "none") {
      stream = stream.pipe(Stream.retry(buildSchedule(route.config.retry)));
    }

    return stream;
  });

const buildSchedule = (
  retry: RetryConfig,
): Schedule.Schedule<unknown, unknown> => {
  if (retry === "exponential") {
    return Schedule.exponential("1 second").pipe(Schedule.upTo("30 seconds"));
  }
  if (retry === "linear") {
    return Schedule.spaced("1 second").pipe(Schedule.upTo("30 seconds"));
  }

  const base =
    retry.type === "exponential"
      ? Schedule.exponential("1 second")
      : Schedule.spaced("1 second");

  let schedule = base;

  if (retry.maxRetries) {
    schedule = schedule.pipe(Schedule.upTo(retry.maxRetries));
  }
  if (retry.maxDuration) {
    schedule = schedule.pipe(Schedule.upTo(parseDuration(retry.maxDuration)));
  }
  if (retry.retryIf) {
    schedule = schedule.pipe(Schedule.whileInput(retry.retryIf));
  }

  return schedule;
};
```

### Typed Errors

```typescript
// packages/router/src/errors.ts
import { Data } from "effect";

export class RouteError extends Data.TaggedError("RouteError")<{
  route: string;
  cause: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  route: string;
  issues: z.ZodIssue[];
}> {}

export class TimeoutError extends Data.TaggedError("TimeoutError")<{
  route: string;
  duration: string;
}> {}

export class HandlerError extends Data.TaggedError("HandlerError")<{
  route: string;
  cause: unknown;
}> {}

export class StreamError extends Data.TaggedError("StreamError")<{
  route: string;
  cause: unknown;
}> {}

// Error handling in routes
const getSession = o({ timeout: "30s" })
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, sdk }) => {
    const session = await sdk.session.get(input.id);
    if (!session) {
      throw new NotFoundError({ entity: "Session", id: input.id });
    }
    return session;
  })
  .onError((err) => {
    // Custom error handling
    if (err instanceof NotFoundError) {
      return { status: 404, body: { error: "Session not found" } };
    }
    throw err; // Re-throw for default handling
  });
```

### Runtime and Context

```typescript
// packages/router/src/runtime.ts
import { ManagedRuntime, Layer, Context } from "effect";

// Router environment
export class RouterEnv extends Context.Tag("RouterEnv")<
  RouterEnv,
  {
    sdk: OpencodeClient;
    request?: Request;
    signal: AbortSignal;
  }
>() {}

// Create runtime once, reuse across requests
export const createRouterRuntime = (config: RouterConfig) => {
  const layer = Layer.succeed(RouterEnv, {
    sdk: config.sdk,
    signal: new AbortController().signal,
  });

  return ManagedRuntime.make(layer);
};

// Framework adapter uses runtime
export const createNextHandler = (opts: { router: Router }) => {
  const runtime = createRouterRuntime(opts);

  return async (req: Request) => {
    const path = getRoutePath(req);
    const route = opts.router.resolve(path);
    const input = await parseInput(req);

    const result = await runtime.runPromise(
      executeRoute(route, input, { request: req }),
    );

    if (route.config.stream) {
      return new Response(streamToReadable(result), {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    return Response.json(result);
  };
};
```

---

## Migration Strategy

### Phase 1: Router Foundation (Week 1-2)

**Goal:** Build the router package with core functionality

```
packages/router/
├── src/
│   ├── builder.ts      # createOpencodeRoute(), fluent API
│   ├── router.ts       # createRouter(), route resolution
│   ├── executor.ts     # Effect-based execution engine
│   ├── errors.ts       # Typed error classes
│   ├── runtime.ts      # ManagedRuntime setup
│   ├── adapters/
│   │   ├── next.ts     # createNextHandler(), createAction()
│   │   └── direct.ts   # createCaller()
│   └── index.ts        # Public exports
├── package.json
└── tsconfig.json
```

**Deliverables:**

- [ ] `createOpencodeRoute()` builder with full type inference
- [ ] Route config: `timeout`, `retry`, `concurrency`
- [ ] Request-response execution with Effect
- [ ] Next.js adapter (API routes)
- [ ] Direct caller for Server Components
- [ ] 100% test coverage on executor

**Dependencies:**

```json
{
  "dependencies": {
    "effect": "3.17.7",
    "@effect/platform": "0.90.3",
    "@effect/schema": "0.90.3"
  },
  "peerDependencies": {
    "zod": "^3.22.0"
  }
}
```

### Phase 2: Streaming Support (Week 3-4)

**Goal:** Add streaming routes with retry/reconnection

**Deliverables:**

- [ ] `stream: true` config option
- [ ] Async generator handler support
- [ ] Stream retry with Effect.Stream
- [ ] SSE response encoding
- [ ] `useSubscription` React hook
- [ ] Streaming tests with mock generators

**Key Implementation:**

```typescript
// Streaming route
const subscribe = o({ stream: true, retry: "exponential" }).handler(
  async function* ({ sdk }) {
    for await (const event of sdk.global.event()) {
      yield event;
    }
  },
);

// Internal: Convert to Effect.Stream with retry
Stream.fromAsyncIterable(generator)
  .pipe(Stream.retry(Schedule.exponential("1s")))
  .pipe(Stream.mapEffect((event) => Effect.succeed(event)));
```

### Phase 3: Server Discovery Migration (Week 5)

**Goal:** Migrate first real route to prove the pattern

**Current Code:** `apps/web/src/app/api/opencode-servers/route.ts` (150+ lines)

**New Code:**

```typescript
// apps/web/src/server/router.ts
export const appRouter = createRouter({
  servers: {
    discover: o({ concurrency: 5, timeout: "2s" })
      .input(
        z.object({
          ports: z.array(z.number()).default([3000, 3001, 3002, 4096]),
        }),
      )
      .handler(async ({ input }) => {
        const results = await Promise.all(
          input.ports.map(async (port) => {
            try {
              const res = await fetch(`http://localhost:${port}/health`);
              if (!res.ok) return null;
              const data = await res.json();
              return { port, url: `http://localhost:${port}`, ...data };
            } catch {
              return null;
            }
          }),
        );
        return results.filter(Boolean);
      }),
  },
});

// apps/web/src/app/api/opencode-servers/route.ts
import { createNextHandler } from "@opencode/router/next";
import { appRouter } from "@/server/router";

export const GET = createNextHandler({
  router: appRouter,
  endpoint: "servers.discover",
});
```

**Expected Reduction:** 150 lines → 30 lines (80% reduction)

### Phase 4: SSE Migration (Week 6-8)

**Goal:** Migrate SSE handling to streaming routes

**Current Code:**

- `apps/web/src/react/use-sse.tsx` (342 lines)
- `apps/web/src/react/use-multi-server-sse.ts` (454 lines)

**New Code:**

```typescript
// Server: Streaming route
export const appRouter = createRouter({
  subscribe: {
    events: o({ stream: true, retry: "exponential" })
      .input(z.object({ directory: z.string() }))
      .handler(async function* ({ input, sdk }) {
        for await (const event of sdk.global.event()) {
          if (event.directory === input.directory) {
            yield event;
          }
        }
      }),

    multiServer: o({ stream: true, retry: "exponential" })
      .input(z.object({ servers: z.array(z.string()) }))
      .handler(async function* ({ input, sdk }) {
        // Merge streams from multiple servers
        const streams = input.servers.map((url) =>
          sdk.withBaseUrl(url).global.event(),
        );

        for await (const event of mergeAsyncIterables(streams)) {
          yield event;
        }
      }),
  },
});

// Client: Simple hook
function useEvents(directory: string) {
  return useSubscription(() => subscribeToEvents({ directory }), [directory]);
}

function useMultiServerEvents(servers: string[]) {
  return useSubscription(
    () => subscribeToMultiServer({ servers }),
    [servers.join(",")],
  );
}
```

**Expected Reduction:** 796 lines → 100 lines (87% reduction)

### Phase 5: Message Queue Migration (Week 9-10)

**Goal:** Migrate message processing to router

**Current Code:** `apps/web/src/app/session/[id]/session-messages.tsx` (208 lines)

**New Code:**

```typescript
export const appRouter = createRouter({
  messages: {
    stream: o({ stream: true, retry: "exponential" })
      .input(z.object({ sessionId: z.string() }))
      .handler(async function* ({ input, sdk }) {
        for await (const msg of sdk.session.messages(input.sessionId)) {
          yield msg;
        }
      }),

    send: o({ timeout: "30s" })
      .input(
        z.object({
          sessionId: z.string(),
          content: z.string(),
        }),
      )
      .handler(async ({ input, sdk }) => {
        return sdk.session.sendMessage(input.sessionId, input.content);
      }),
  },
});
```

**Expected Reduction:** 208 lines → 40 lines (81% reduction)

### Phase 6: Full Rollout (Week 11-12)

**Goal:** Migrate remaining routes, remove legacy code

- [ ] Migrate all API routes to router
- [ ] Migrate all Server Actions to router
- [ ] Remove legacy async utilities
- [ ] Update documentation
- [ ] Performance benchmarks

---

## Success Metrics

### Quantitative

| Metric                    | Baseline | Target | Measurement                     |
| ------------------------- | -------- | ------ | ------------------------------- |
| **Total Async Lines**     | 2000+    | 400    | Line count in router + handlers |
| **Code Reduction**        | 0%       | 80%    | (Baseline - Target) / Baseline  |
| **Route Definitions**     | 0        | 20+    | Count of routes in appRouter    |
| **Effect Imports (app/)** | 0        | 0      | No Effect in application code   |
| **Type Errors**           | N/A      | 0      | Full type inference working     |

### Qualitative

- [ ] **Zero Effect Knowledge Required** - New devs productive without Effect training
- [ ] **Declarative Config** - All retry/timeout/concurrency in route config
- [ ] **Streaming Just Works** - SSE with automatic reconnection
- [ ] **Type Safety** - Input → Handler → Output fully inferred
- [ ] **Testable** - Mock handlers, not Effect internals

---

## Package Structure

```
packages/
├── router/                    # @opencode/router
│   ├── src/
│   │   ├── builder.ts         # Route builder API
│   │   ├── router.ts          # Router creation
│   │   ├── executor.ts        # Effect execution engine
│   │   ├── stream.ts          # Streaming support
│   │   ├── errors.ts          # Typed errors
│   │   ├── runtime.ts         # ManagedRuntime
│   │   ├── adapters/
│   │   │   ├── next.ts        # Next.js integration
│   │   │   └── direct.ts      # Direct caller
│   │   └── index.ts
│   ├── effect.ts              # @opencode/router/effect (escape hatch)
│   └── package.json
│
└── router-react/              # @opencode/router-react
    ├── src/
    │   ├── use-subscription.ts
    │   ├── use-query.ts
    │   └── index.ts
    └── package.json
```

---

## Type Inference

### Full Chain Inference

```typescript
// Route definition
const getSession = o({ timeout: "30s" })
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, sdk }) => {
    //              ^? { id: string }
    const session = await sdk.session.get(input.id);
    return session;
    //     ^? Session
  });

// Router
const router = createRouter({
  session: { get: getSession },
});

// Caller - fully typed
const caller = createCaller(router, ctx);
const session = await caller.session.get({ id: "123" });
//    ^? Session

// Server Action - fully typed
const action = createAction(router.session.get);
const session = await action({ id: "123" });
//    ^? Session

// Error on wrong input
await caller.session.get({ wrong: "field" });
//                        ^^^^^^^^^^^^^^^^ Type error!
```

### Streaming Type Inference

```typescript
// Streaming route
const subscribe = o({ stream: true }).handler(async function* ({ sdk }) {
  for await (const event of sdk.global.event()) {
    yield event;
    //    ^? SSEEvent
  }
});

// Client receives AsyncIterable
const action = createAction(router.subscribe.events);
for await (const event of action({ directory: "/" })) {
  //             ^? SSEEvent
  console.log(event);
}
```

---

## Comparison: Before and After

### Server Discovery

**Before (150+ lines):**

```typescript
// Manual timeout, concurrency, error handling
export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  const ports = [3000, 3001, 3002, 4096];
  const results = [];

  // Manual concurrency limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < ports.length; i += BATCH_SIZE) {
    const batch = ports.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (port) => {
        try {
          const res = await fetch(`http://localhost:${port}/health`, {
            signal: controller.signal,
          });
          // ... 50 more lines of error handling
        } catch (err) {
          // ... error handling
        }
      }),
    );
    results.push(...batchResults);
  }

  clearTimeout(timeout);
  return Response.json(results.filter(Boolean));
}
```

**After (15 lines):**

```typescript
// Declarative config, Effect handles the rest
export const appRouter = createRouter({
  servers: {
    discover: o({ concurrency: 5, timeout: "2s" })
      .input(z.object({ ports: z.array(z.number()) }))
      .handler(async ({ input }) => {
        return Promise.all(input.ports.map(checkPort));
      }),
  },
});

export const GET = createNextHandler({
  router: appRouter,
  endpoint: "servers.discover",
});
```

### SSE Subscription

**Before (796 lines across 2 files):**

```typescript
// Manual reconnection, heartbeat, multi-server coordination
export function useSSE(baseUrl: string) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const retryCount = useRef(0);
  const maxRetries = 5;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let heartbeatInterval: NodeJS.Timeout;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      eventSource = new EventSource(`${baseUrl}/events`);

      eventSource.onopen = () => {
        setConnected(true);
        retryCount.current = 0;

        // Heartbeat
        heartbeatInterval = setInterval(() => {
          // ... 30 lines of heartbeat logic
        }, 30000);
      };

      eventSource.onerror = () => {
        setConnected(false);
        eventSource?.close();

        // Exponential backoff
        if (retryCount.current < maxRetries) {
          const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
          reconnectTimeout = setTimeout(connect, delay);
          retryCount.current++;
        } else {
          setError(new Error("Max retries exceeded"));
        }
      };

      // ... 200 more lines
    };

    connect();

    return () => {
      eventSource?.close();
      clearInterval(heartbeatInterval);
      clearTimeout(reconnectTimeout);
    };
  }, [baseUrl]);

  // ... 300 more lines for multi-server coordination
}
```

**After (30 lines):**

```typescript
// Server: Streaming route with retry
export const appRouter = createRouter({
  subscribe: {
    events: o({ stream: true, retry: "exponential" })
      .input(z.object({ directory: z.string() }))
      .handler(async function* ({ sdk }) {
        for await (const event of sdk.global.event()) {
          yield event;
        }
      }),
  },
});

// Client: Simple hook
function useEvents(directory: string) {
  const { data, status } = useSubscription(
    () => subscribeToEvents({ directory }),
    [directory],
  );
  return { events: data, connected: status === "connected" };
}
```

---

## Risks and Mitigations

| Risk                                | Probability | Impact | Mitigation                                 |
| ----------------------------------- | ----------- | ------ | ------------------------------------------ |
| **Router abstraction too limiting** | Medium      | High   | Escape hatch via `@opencode/router/effect` |
| **Streaming complexity**            | Medium      | Medium | Extensive testing, fallback to polling     |
| **Type inference breaks**           | Low         | High   | Comprehensive type tests, TS 5.4+ required |
| **Effect version conflicts**        | Low         | Medium | Pin versions, test upgrades in isolation   |
| **Performance overhead**            | Low         | Low    | Benchmark vs raw fetch, optimize hot paths |

---

## Questions Resolved

1. **How does SSE work with Server Actions?**
   - Server Actions return `AsyncIterable`, client consumes with `for await`
   - Router converts async generator → Effect.Stream → AsyncIterable

2. **How do we enforce no Effect in app code?**
   - Effect only imported in `packages/router/src/`
   - ESLint rule: no `effect` imports outside router package

3. **What about complex retry logic?**
   - Route config supports full retry options: `{ type, maxRetries, maxDuration, retryIf }`
   - Maps to Effect.Schedule internally

4. **How do we test routes?**
   - Mock the handler, not Effect internals
   - `createTestCaller(router, { sdk: mockSdk })`

---

## References

### UploadThing Implementation

| File                                                                                                                           | Pattern          | Lines                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------- |
| [`upload-builder.ts`](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/_internal/upload-builder.ts) | Fluent builder   | 101-123                |
| [`handler.ts`](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/_internal/handler.ts)               | Effect execution | 50-52, 66-101, 103-150 |
| [`effect-platform.ts`](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/effect-platform.ts)         | Effect export    | 32-70                  |
| [`types.ts`](https://github.com/pingdotgg/uploadthing/blob/main/packages/uploadthing/src/types.ts)                             | Type inference   | 31, 33-40              |

### Effect Documentation

- [Effect.gen](https://effect.website/docs/guides/essentials/using-generators)
- [Effect.Stream](https://effect.website/docs/guides/streaming/stream)
- [Effect.Schedule](https://effect.website/docs/guides/scheduling/schedule)
- [ManagedRuntime](https://effect.website/docs/guides/runtime)

### Migration Targets

| File                                                 | Lines | Phase |
| ---------------------------------------------------- | ----- | ----- |
| `apps/web/src/app/api/opencode-servers/route.ts`     | 150+  | 3     |
| `apps/web/src/react/use-sse.tsx`                     | 342   | 4     |
| `apps/web/src/react/use-multi-server-sse.ts`         | 454   | 4     |
| `apps/web/src/app/session/[id]/session-messages.tsx` | 208   | 5     |

---

## Changelog

| Date       | Author              | Change                                 |
| ---------- | ------------------- | -------------------------------------- |
| 2025-12-28 | QuickMountain Agent | Initial proposal                       |
| 2025-12-29 | Claude              | Rewrite with router-first architecture |
