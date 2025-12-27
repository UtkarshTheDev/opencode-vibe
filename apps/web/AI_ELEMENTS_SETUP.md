# AI Elements Setup

## Installation Summary

Successfully initialized ai-elements in the Next.js 16 app on **December 26, 2024**.

## What Was Installed

### 1. ai-elements CLI (v1.6.3)

Used `shadcn@latest` to install all components from the ai-elements registry.

### 2. Components Installed

#### UI Base Components (19 components)

Located in `src/components/ui/`:

- button, tooltip, badge, collapsible, separator
- alert, hover-card, progress, dialog, card
- dropdown-menu, input, textarea, select, scroll-area
- carousel, button-group, command, input-group

#### AI Elements Components (30 components)

Located in `src/components/ai-elements/`:

- artifact, canvas, chain-of-thought, checkpoint
- code-block, confirmation, connection, context
- controls, conversation, edge, image
- inline-citation, loader, message, model-selector
- node, open-in-chat, panel, plan
- prompt-input, queue, reasoning, shimmer
- sources, suggestion, task, tool
- toolbar, web-preview

### 3. Dependencies Added

```json
{
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0",
    "class-variance-authority": "^0.7.1",
    "@radix-ui/react-slot": "^1.2.4"
  }
}
```

### 4. Configuration Files

- `components.json` - shadcn/ui configuration
- `src/lib/utils.ts` - Utility functions (cn helper)

## Fixes Applied

1. **Removed deprecated ts-expect-error comments** - These were for AI SDK v5 -> v6 migration and are no longer needed
2. **Changed button size from `icon-sm` to `icon`** - The shadcn button component doesn't have an `icon-sm` variant
3. **Added CardAction component** - Missing export in card.tsx needed by node.tsx

## How to Use

### Example: Basic Chat UI

```tsx
import { Conversation } from "@/components/ai-elements/conversation";
import { Message } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/ai-elements/prompt-input";

export default function ChatPage() {
  return (
    <Conversation>
      <Message role="user">Hello!</Message>
      <Message role="assistant">Hi there! How can I help?</Message>
      <PromptInput placeholder="Type your message..." />
    </Conversation>
  );
}
```

### Example: Code Block with Syntax Highlighting

```tsx
import { CodeBlock } from "@/components/ai-elements/code-block";

export default function CodeExample() {
  return (
    <CodeBlock language="typescript">
      {`const greeting = "Hello, world!";
console.log(greeting);`}
    </CodeBlock>
  );
}
```

### Example: Reasoning Display

```tsx
import { Reasoning } from "@/components/ai-elements/reasoning";
import { ChainOfThought } from "@/components/ai-elements/chain-of-thought";

export default function ThinkingDisplay() {
  return (
    <>
      <Reasoning>Analyzing the problem...</Reasoning>
      <ChainOfThought>
        <p>Step 1: Identify the input</p>
        <p>Step 2: Process the data</p>
        <p>Step 3: Generate output</p>
      </ChainOfThought>
    </>
  );
}
```

## Available Components Reference

| Component        | Description                         | Use Case          |
| ---------------- | ----------------------------------- | ----------------- |
| `Conversation`   | Container for chat messages         | Chat UIs          |
| `Message`        | Individual message display          | User/AI messages  |
| `PromptInput`    | Advanced input with model selection | AI chat input     |
| `CodeBlock`      | Syntax-highlighted code             | Code display      |
| `ChainOfThought` | Reasoning visualization             | Show AI thinking  |
| `Reasoning`      | Thought process display             | Explain decisions |
| `Loader`         | Loading states                      | AI processing     |
| `Plan`           | Task planning display               | Multi-step tasks  |
| `Tool`           | Tool usage display                  | Show tool calls   |
| `Context`        | Context consumption                 | Token usage       |
| `Image`          | AI-generated images                 | Image generation  |
| `InlineCitation` | Source citations                    | RAG responses     |

## Next Steps

1. **Install AI SDK** (if not already installed):

   ```bash
   bun add ai @ai-sdk/openai
   ```

2. **Create a chat route** in `src/app/api/chat/route.ts`

3. **Use the components** in your pages

## Documentation

- [AI Elements Official Docs](https://ai-sdk.dev/elements)
- [shadcn/ui Docs](https://ui.shadcn.com/)
- [AI SDK Docs](https://ai-sdk.dev/)

## Verification

✅ Build passes: `bun run build`
✅ Dev server runs: `bun dev`
✅ All components installed
✅ TypeScript errors resolved
