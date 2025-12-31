# @opencode-vibe/react

React hooks and providers for OpenCode — a type-safe interface to the OpenCode AI coding assistant.

## Install

```bash
bun add @opencode-vibe/react
```

**Peer dependencies:** Next.js 15/16, React 18/19

## Quick Start

Wrap your app with `OpencodeProvider`:

```tsx
import { OpencodeProvider } from "@opencode-vibe/react/providers";

export default function RootLayout({ children }) {
  return (
    <OpencodeProvider>
      {children}
    </OpencodeProvider>
  );
}
```

Use hooks in your components:

```tsx
import { useSession, useSendMessage } from "@opencode-vibe/react";

export function ChatUI({ sessionId }: { sessionId: string }) {
  const session = useSession({ sessionId });
  const { sendMessage, isLoading } = useSendMessage();

  return (
    <div>
      <h1>{session.data?.title}</h1>
      {/* ... */}
    </div>
  );
}
```

## Hooks

### Data Fetching
- `useSession(options)` — Unified facade for session data, messages, and status
- `useSessionList()` — List of sessions
- `useSessionData(sessionId)` — Session metadata
- `useProjects()` — Available projects
- `useCurrentProject()` — Active project
- `useServers()` — Discovery and connection to OpenCode servers
- `useProviders()` — Available AI providers and models

### Actions
- `useSendMessage(options)` — Send messages to AI
- `useCreateSession()` — Create new sessions
- `useCommands(options)` — Execute slash commands

### Utilities
- `useFileSearch(options)` — Fuzzy file search
- `useContextUsage()` — Token usage tracking
- `useSubagents()` — Subagent task management

## Providers

- `OpencodeProvider` — Root provider for OpenCode context
- `SSEProvider` — Server-Sent Events for real-time updates

## Store

Direct store access (Zustand-based):

```tsx
import { useOpencodeStore } from "@opencode-vibe/react/store";

const messages = useOpencodeStore((state) => state.messages);
```

## SSR Plugin (Next.js)

Provider-free architecture for server components:

```tsx
// next.config.ts
import { OpencodeSSRPlugin } from "@opencode-vibe/react";

export default {
  plugins: [OpencodeSSRPlugin({ apiUrl: process.env.OPENCODE_API_URL })],
};
```

```tsx
// app/layout.tsx
import { generateOpencodeHelpers } from "@opencode-vibe/react";

const { useSession } = generateOpencodeHelpers();
```

## Dependencies

- `@opencode-vibe/core` — Core SDK and types
- `zustand` — State management
- `immer` — Immutable updates
