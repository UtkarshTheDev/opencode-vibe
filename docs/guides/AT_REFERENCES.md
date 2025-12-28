# @ Reference System Implementation Guide

```
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║   ┌─────────────────────────────────────────────────────┐    ║
    ║   │     █████╗ ████████╗    ██████╗ ███████╗███████╗    │    ║
    ║   │    ██╔══██╗╚══██╔══╝    ██╔══██╗██╔════╝██╔════╝    │    ║
    ║   │    ███████║   ██║       ██████╔╝█████╗  █████╗      │    ║
    ║   │    ██╔══██║   ██║       ██╔══██╗██╔══╝  ██╔══╝      │    ║
    ║   │    ██║  ██║   ██║       ██║  ██║███████╗██║         │    ║
    ║   │    ╚═╝  ╚═╝   ╚═╝       ╚═╝  ╚═╝╚══════╝╚═╝         │    ║
    ║   │                                                     │    ║
    ║   │          @ REFERENCE IMPLEMENTATION GUIDE           │    ║
    ║   └─────────────────────────────────────────────────────┘    ║
    ║                                                               ║
    ║   How to implement file and agent @ references in your       ║
    ║   React client with autocomplete and API integration         ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
```

---

## Table of Contents

1. [Overview](#1-overview)
2. [File Search API](#2-file-search-api)
3. [Agent Lookup](#3-agent-lookup)
4. [Autocomplete Flow](#4-autocomplete-flow)
5. [Parsing @ References](#5-parsing--references)
6. [Converting to API Parts](#6-converting-to-api-parts)
7. [Complete React Implementation](#7-complete-react-implementation)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Overview

The @ reference system allows users to attach files and reference agents in their prompts:

```
User types: "Explain @src/api/routes.ts and refactor it"
                    ↑
                    File reference - triggers autocomplete
```

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                     @ REFERENCE FLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. DETECTION                                                       │
│     User types "@" → Regex detects pattern → Show autocomplete      │
│                                                                     │
│  2. SEARCH                                                          │
│     Query typed after "@" → API call → Fuzzy match → Results        │
│                                                                     │
│  3. SELECTION                                                       │
│     User picks result → Create "pill" element → Insert in input     │
│                                                                     │
│  4. SUBMISSION                                                      │
│     Parse DOM → Extract file refs → Convert to FilePart → Send      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Insight

**The server reads file content, not the client.** When you send a `FilePart` with a `file://` URL, the server:

1. Reads the file from disk
2. Creates a synthetic `TextPart` with the file content
3. Injects it into the conversation context

You just need to send the file path - the server handles the rest.

---

## 2. File Search API

### Endpoint

```
GET /find/file?query={query}&dirs={true|false}
```

### Parameters

| Parameter | Type              | Required | Description                         |
| --------- | ----------------- | -------- | ----------------------------------- |
| `query`   | string            | Yes      | Search pattern (fuzzy matched)      |
| `dirs`    | "true" \| "false" | No       | Include directories (default: true) |

### Response

```typescript
// Returns array of relative file paths
string[]

// Example response
[
  "src/api/routes.ts",
  "src/api/router.ts",
  "src/api/route-handler.ts",
  "src/lib/routing.ts"
]
```

### How Search Works

The server uses **fuzzysort** for fuzzy matching:

```typescript
// Server implementation (simplified)
import fuzzysort from "fuzzysort";

async function searchFiles(query: string, limit = 10, includeDirs = true) {
  // Get all files in project (cached)
  const { files, dirs } = await getProjectFiles();

  // Combine files and dirs if requested
  const items = includeDirs ? [...files, ...dirs] : files;

  // Empty query returns first N items
  if (!query) {
    return items.slice(0, limit);
  }

  // Fuzzy search
  const results = fuzzysort.go(query, items, { limit });
  return results.map((r) => r.target);
}
```

### SDK Usage

```typescript
// Using the generated SDK
const results = await sdk.client.find.files({
  query: "route",
  dirs: "true",
});

console.log(results.data);
// ["src/api/routes.ts", "src/routes/index.ts", ...]
```

### Direct Fetch

```typescript
// Without SDK
async function searchFiles(query: string): Promise<string[]> {
  const params = new URLSearchParams({ query, dirs: "true" });
  const res = await fetch(`${baseUrl}/find/file?${params}`);
  return res.json();
}
```

---

## 3. Agent Lookup

### Important: No @agent Syntax

**There is NO `@agent` autocomplete in the current system.** Agent selection is done via a separate UI dropdown, not inline @ references.

### Agent List API

```
GET /agent
```

### Response

```typescript
interface Agent {
  name: string; // e.g., "build", "explore", "plan"
  description?: string; // When to use this agent
  mode: "primary" | "subagent" | "all";
  native: boolean; // Built-in vs custom
  hidden?: boolean; // Internal agents
  default?: boolean; // Default agent
  color?: string; // Hex color
  // ... other fields
}

// Response is Agent[]
```

### Filtering Selectable Agents

Only show agents that users can select (not hidden, not subagent-only):

```typescript
async function getSelectableAgents(): Promise<Agent[]> {
  const res = await fetch(`${baseUrl}/agent`);
  const agents: Agent[] = await res.json();

  return agents.filter(
    (a) => !a.hidden && (a.mode === "primary" || a.mode === "all"),
  );
}
```

### If You Want @agent Autocomplete

You could implement it yourself:

```typescript
// Detect @agent pattern
const agentMatch = text.match(/@([a-z]+)$/i);

if (agentMatch) {
  const query = agentMatch[1];
  const agents = await getSelectableAgents();
  const filtered = agents.filter((a) =>
    a.name.toLowerCase().includes(query.toLowerCase()),
  );
  showAgentAutocomplete(filtered);
}
```

But note: The API expects agent selection via the `agent` field in the request body, not as a message part.

---

## 4. Autocomplete Flow

### 4.1 Trigger Detection

Detect when user types `@` followed by characters:

```typescript
function detectAtReference(text: string, cursorPosition: number) {
  // Get text up to cursor
  const textBeforeCursor = text.substring(0, cursorPosition);

  // Match @ followed by non-whitespace
  const match = textBeforeCursor.match(/@(\S*)$/);

  if (match) {
    return {
      query: match[1], // Text after @
      start: match.index!, // Position of @
      end: cursorPosition, // Current cursor
    };
  }

  return null;
}
```

### 4.2 Debounced Search

Don't spam the API on every keystroke:

```typescript
import { useDebouncedCallback } from "use-debounce";

function useFileSearch() {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useDebouncedCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/find/file?query=${encodeURIComponent(query)}&dirs=true`,
      );
      const data = await res.json();
      setResults(data);
    } finally {
      setLoading(false);
    }
  }, 150); // 150ms debounce

  return { results, loading, search };
}
```

### 4.3 Keyboard Navigation

Handle arrow keys and enter in autocomplete:

```typescript
function useAutocompleteNavigation<T>(items: T[], onSelect: (item: T) => void) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
      case "Tab":
        e.preventDefault();
        if (items[activeIndex]) {
          onSelect(items[activeIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        // Close autocomplete
        break;
    }
  };

  return { activeIndex, handleKeyDown };
}
```

### 4.4 Positioning the Popover

Position autocomplete near the @ character:

```typescript
function getCaretCoordinates(element: HTMLElement): {
  top: number;
  left: number;
} {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { top: 0, left: 0 };
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return {
    top: rect.bottom + window.scrollY,
    left: rect.left + window.scrollX,
  };
}
```

---

## 5. Parsing @ References

### 5.1 The Challenge

The prompt input is a `contenteditable` div that contains:

- Text nodes (regular text)
- File "pill" elements (@ references)

You need to parse both into a structured format.

### 5.2 File Pill Structure

When a file is selected, insert a non-editable span:

```html
<span
  data-type="file"
  data-path="src/api/routes.ts"
  contenteditable="false"
  class="file-pill"
>
  @src/api/routes.ts
</span>
```

### 5.3 DOM Parsing

```typescript
interface TextPart {
  type: "text";
  content: string;
  start: number;
  end: number;
}

interface FilePart {
  type: "file";
  path: string;
  content: string; // "@path"
  start: number;
  end: number;
}

type PromptPart = TextPart | FilePart;

function parsePromptFromDOM(container: HTMLElement): PromptPart[] {
  const parts: PromptPart[] = [];
  let position = 0;
  let textBuffer = "";

  function flushText() {
    if (textBuffer) {
      parts.push({
        type: "text",
        content: textBuffer,
        start: position - textBuffer.length,
        end: position,
      });
      textBuffer = "";
    }
  }

  function visit(node: Node) {
    // Text node
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      textBuffer += text;
      position += text.length;
      return;
    }

    // Element node
    const el = node as HTMLElement;

    // File pill
    if (el.dataset?.type === "file") {
      flushText();
      const content = el.textContent || "";
      parts.push({
        type: "file",
        path: el.dataset.path!,
        content,
        start: position,
        end: position + content.length,
      });
      position += content.length;
      return;
    }

    // Line break
    if (el.tagName === "BR") {
      textBuffer += "\n";
      position += 1;
      return;
    }

    // Div (new line in contenteditable)
    if (el.tagName === "DIV") {
      if (parts.length > 0 || textBuffer) {
        textBuffer += "\n";
        position += 1;
      }
      el.childNodes.forEach(visit);
      return;
    }

    // Other elements - recurse
    el.childNodes.forEach(visit);
  }

  container.childNodes.forEach(visit);
  flushText();

  return parts;
}
```

### 5.4 Inserting File Pills

When user selects a file from autocomplete:

```typescript
function insertFilePill(
  container: HTMLElement,
  path: string,
  replaceStart: number,
  replaceEnd: number,
) {
  const selection = window.getSelection();
  if (!selection) return;

  // Create the pill element
  const pill = document.createElement("span");
  pill.textContent = `@${path}`;
  pill.dataset.type = "file";
  pill.dataset.path = path;
  pill.contentEditable = "false";
  pill.className = "file-pill";

  // Get current range
  const range = selection.getRangeAt(0);

  // Find and select the @query text to replace
  // This is tricky - need to find the text node containing the @
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
  );

  let currentPos = 0;
  let node: Text | null = null;

  while ((node = walker.nextNode() as Text | null)) {
    const nodeLength = node.length;
    if (currentPos + nodeLength >= replaceStart) {
      // Found the node containing our @
      const startOffset = replaceStart - currentPos;
      const endOffset = Math.min(replaceEnd - currentPos, nodeLength);

      // Create range to select the @query text
      const replaceRange = document.createRange();
      replaceRange.setStart(node, startOffset);

      // End might be in a different node
      if (currentPos + nodeLength >= replaceEnd) {
        replaceRange.setEnd(node, endOffset);
      } else {
        // Need to extend to next nodes
        replaceRange.setEndAfter(node);
      }

      // Delete the @query text and insert pill
      replaceRange.deleteContents();
      replaceRange.insertNode(pill);

      // Move cursor after pill
      const newRange = document.createRange();
      newRange.setStartAfter(pill);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      break;
    }
    currentPos += nodeLength;
  }
}
```

---

## 6. Converting to API Parts

### 6.1 API Part Types

```typescript
// Text part (for the prompt text)
interface ApiTextPart {
  id: string;
  type: "text";
  text: string;
}

// File part (for @ references)
interface ApiFilePart {
  id: string;
  type: "file";
  mime: string;
  url: string; // file:///absolute/path
  filename: string;
  source: {
    type: "file";
    text: {
      value: string; // The "@path" as typed
      start: number; // Position in prompt
      end: number;
    };
    path: string; // Absolute path
  };
}
```

### 6.2 Conversion Function

```typescript
function convertToApiParts(
  parts: PromptPart[],
  projectRoot: string,
): (ApiTextPart | ApiFilePart)[] {
  const apiParts: (ApiTextPart | ApiFilePart)[] = [];

  // Combine all text into one part
  const textContent = parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.content)
    .join("");

  if (textContent.trim()) {
    apiParts.push({
      id: generateId("part"),
      type: "text",
      text: textContent,
    });
  }

  // Convert file references
  const fileParts = parts.filter((p): p is FilePart => p.type === "file");

  for (const file of fileParts) {
    const absolutePath = path.join(projectRoot, file.path);
    const filename = path.basename(file.path);

    apiParts.push({
      id: generateId("part"),
      type: "file",
      mime: "text/plain",
      url: `file://${absolutePath}`,
      filename,
      source: {
        type: "file",
        text: {
          value: file.content, // "@src/api/routes.ts"
          start: file.start,
          end: file.end,
        },
        path: absolutePath,
      },
    });
  }

  return apiParts;
}
```

### 6.3 Line Selection (Optional)

If you support selecting specific lines:

```typescript
interface FilePartWithSelection extends FilePart {
  selection?: {
    startLine: number;
    endLine: number;
  };
}

function convertFilePartWithSelection(
  file: FilePartWithSelection,
  projectRoot: string,
): ApiFilePart {
  const absolutePath = path.join(projectRoot, file.path);

  // Add line range as query params
  let url = `file://${absolutePath}`;
  if (file.selection) {
    url += `?start=${file.selection.startLine}&end=${file.selection.endLine}`;
  }

  return {
    id: generateId("part"),
    type: "file",
    mime: "text/plain",
    url,
    filename: path.basename(file.path),
    source: {
      type: "file",
      text: {
        value: file.content,
        start: file.start,
        end: file.end,
      },
      path: absolutePath,
    },
  };
}
```

### 6.4 Sending to API

```typescript
async function sendMessage(
  sessionId: string,
  parts: (ApiTextPart | ApiFilePart)[],
  options: {
    agent: string;
    model: { providerID: string; modelID: string };
  },
) {
  const res = await fetch(`/session/${sessionId}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-opencode-directory": projectDirectory,
    },
    body: JSON.stringify({
      parts,
      agent: options.agent,
      model: options.model,
    }),
  });

  return res.json();
}
```

---

## 7. Complete React Implementation

### 7.1 Types

```typescript
// types/prompt.ts

export interface TextPart {
  type: "text";
  content: string;
  start: number;
  end: number;
}

export interface FilePart {
  type: "file";
  path: string;
  content: string;
  start: number;
  end: number;
  selection?: {
    startLine: number;
    endLine: number;
  };
}

export type PromptPart = TextPart | FilePart;

export interface AtMatch {
  query: string;
  start: number;
  end: number;
}
```

### 7.2 File Search Hook

```typescript
// hooks/useFileSearch.ts
import { useState, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";

export function useFileSearch(baseUrl: string, directory: string) {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useDebouncedCallback(async (query: string) => {
    if (!query) {
      // Show recent/common files when query is empty
      setLoading(true);
      try {
        const res = await fetch(`${baseUrl}/find/file?query=&dirs=true`, {
          headers: { "x-opencode-directory": directory },
        });
        if (!res.ok) throw new Error(`Search failed: ${res.status}`);
        setResults(await res.json());
        setError(null);
      } catch (e) {
        setError(e as Error);
        setResults([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ query, dirs: "true" });
      const res = await fetch(`${baseUrl}/find/file?${params}`, {
        headers: { "x-opencode-directory": directory },
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      setResults(await res.json());
      setError(null);
    } catch (e) {
      setError(e as Error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, 150);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, loading, error, search, clear };
}
```

### 7.3 Autocomplete Hook

```typescript
// hooks/useAutocomplete.ts
import { useState, useEffect, useCallback } from "react";

interface UseAutocompleteOptions<T> {
  items: T[];
  onSelect: (item: T) => void;
  onClose: () => void;
}

export function useAutocomplete<T>({
  items,
  onSelect,
  onClose,
}: UseAutocompleteOptions<T>) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset index when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [items]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (items.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % items.length);
          break;

        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + items.length) % items.length);
          break;

        case "Enter":
        case "Tab":
          e.preventDefault();
          onSelect(items[activeIndex]);
          break;

        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [items, activeIndex, onSelect, onClose],
  );

  return { activeIndex, handleKeyDown };
}
```

### 7.4 Prompt Input Component

```tsx
// components/PromptInput.tsx
import { useRef, useState, useCallback, useEffect } from "react";
import { useFileSearch } from "@/hooks/useFileSearch";
import { useAutocomplete } from "@/hooks/useAutocomplete";
import {
  parsePromptFromDOM,
  insertFilePill,
  detectAtReference,
} from "@/lib/prompt";
import type { PromptPart, AtMatch } from "@/types/prompt";

interface PromptInputProps {
  baseUrl: string;
  directory: string;
  onSubmit: (parts: PromptPart[]) => void;
  disabled?: boolean;
}

export function PromptInput({
  baseUrl,
  directory,
  onSubmit,
  disabled,
}: PromptInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [atMatch, setAtMatch] = useState<AtMatch | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const { results, loading, search, clear } = useFileSearch(baseUrl, directory);

  const handleSelect = useCallback(
    (path: string) => {
      if (!editorRef.current || !atMatch) return;

      insertFilePill(editorRef.current, path, atMatch.start, atMatch.end);
      setShowAutocomplete(false);
      setAtMatch(null);
      clear();
    },
    [atMatch, clear],
  );

  const { activeIndex, handleKeyDown } = useAutocomplete({
    items: results,
    onSelect: handleSelect,
    onClose: () => {
      setShowAutocomplete(false);
      setAtMatch(null);
      clear();
    },
  });

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    const parts = parsePromptFromDOM(editorRef.current);
    const text = parts
      .map((p) => (p.type === "text" ? p.content : ""))
      .join("");

    // Get cursor position
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    // Calculate cursor position in text (simplified)
    const cursorPos = text.length; // This needs proper calculation

    // Detect @ pattern
    const match = detectAtReference(text, cursorPos);

    if (match) {
      setAtMatch(match);
      setShowAutocomplete(true);
      search(match.query);
    } else {
      setAtMatch(null);
      setShowAutocomplete(false);
      clear();
    }
  }, [search, clear]);

  const handleSubmit = useCallback(() => {
    if (!editorRef.current || disabled) return;

    const parts = parsePromptFromDOM(editorRef.current);

    // Check if there's any content
    const hasContent = parts.some(
      (p) => p.type === "file" || (p.type === "text" && p.content.trim()),
    );

    if (!hasContent) return;

    onSubmit(parts);

    // Clear editor
    editorRef.current.innerHTML = "";
  }, [onSubmit, disabled]);

  const handleKeyDownEditor = useCallback(
    (e: React.KeyboardEvent) => {
      // If autocomplete is open, let it handle keys
      if (showAutocomplete && results.length > 0) {
        if (
          ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)
        ) {
          handleKeyDown(e);
          return;
        }
      }

      // Submit on Enter (without shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [showAutocomplete, results, handleKeyDown, handleSubmit],
  );

  return (
    <div className="prompt-input-container">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        className="prompt-editor"
        onInput={handleInput}
        onKeyDown={handleKeyDownEditor}
        data-placeholder="Type a message... Use @ to reference files"
      />

      {showAutocomplete && (
        <FileAutocomplete
          results={results}
          loading={loading}
          activeIndex={activeIndex}
          onSelect={handleSelect}
        />
      )}

      <button
        onClick={handleSubmit}
        disabled={disabled}
        className="submit-button"
      >
        Send
      </button>
    </div>
  );
}

function FileAutocomplete({
  results,
  loading,
  activeIndex,
  onSelect,
}: {
  results: string[];
  loading: boolean;
  activeIndex: number;
  onSelect: (path: string) => void;
}) {
  if (loading) {
    return (
      <div className="autocomplete-popover">
        <div className="autocomplete-loading">Searching...</div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="autocomplete-popover">
        <div className="autocomplete-empty">No files found</div>
      </div>
    );
  }

  return (
    <div className="autocomplete-popover">
      {results.map((path, index) => (
        <button
          key={path}
          className={`autocomplete-item ${index === activeIndex ? "active" : ""}`}
          onClick={() => onSelect(path)}
        >
          <FileIcon path={path} />
          <span className="file-path">{path}</span>
        </button>
      ))}
    </div>
  );
}

function FileIcon({ path }: { path: string }) {
  const ext = path.split(".").pop()?.toLowerCase();
  // Return appropriate icon based on extension
  return <span className="file-icon">{ext === "ts" ? "📄" : "📁"}</span>;
}
```

### 7.5 Prompt Utilities

```typescript
// lib/prompt.ts
import type { PromptPart, AtMatch } from "@/types/prompt";

export function detectAtReference(
  text: string,
  cursorPosition: number,
): AtMatch | null {
  const textBeforeCursor = text.substring(0, cursorPosition);
  const match = textBeforeCursor.match(/@(\S*)$/);

  if (match && match.index !== undefined) {
    return {
      query: match[1],
      start: match.index,
      end: cursorPosition,
    };
  }

  return null;
}

export function parsePromptFromDOM(container: HTMLElement): PromptPart[] {
  const parts: PromptPart[] = [];
  let position = 0;
  let textBuffer = "";

  function flushText() {
    if (textBuffer) {
      parts.push({
        type: "text",
        content: textBuffer,
        start: position - textBuffer.length,
        end: position,
      });
      textBuffer = "";
    }
  }

  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      textBuffer += text;
      position += text.length;
      return;
    }

    const el = node as HTMLElement;

    if (el.dataset?.type === "file") {
      flushText();
      const content = el.textContent || "";
      parts.push({
        type: "file",
        path: el.dataset.path!,
        content,
        start: position,
        end: position + content.length,
      });
      position += content.length;
      return;
    }

    if (el.tagName === "BR") {
      textBuffer += "\n";
      position += 1;
      return;
    }

    if (el.tagName === "DIV") {
      if (parts.length > 0 || textBuffer) {
        textBuffer += "\n";
        position += 1;
      }
      el.childNodes.forEach(visit);
      return;
    }

    el.childNodes.forEach(visit);
  }

  container.childNodes.forEach(visit);
  flushText();

  return parts;
}

export function insertFilePill(
  container: HTMLElement,
  path: string,
  replaceStart: number,
  replaceEnd: number,
) {
  const selection = window.getSelection();
  if (!selection) return;

  // Create pill
  const pill = document.createElement("span");
  pill.textContent = `@${path}`;
  pill.dataset.type = "file";
  pill.dataset.path = path;
  pill.contentEditable = "false";
  pill.className = "file-pill";

  // Find text to replace
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentPos = 0;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const nodeEnd = currentPos + node.length;

    if (nodeEnd > replaceStart) {
      const startOffset = replaceStart - currentPos;
      const endOffset = Math.min(replaceEnd - currentPos, node.length);

      // Split node if needed
      if (startOffset > 0) {
        node = node.splitText(startOffset);
      }

      // Delete the @query text
      const deleteLength = Math.min(replaceEnd - replaceStart, node.length);
      node.deleteData(0, deleteLength);

      // Insert pill before remaining text
      node.parentNode?.insertBefore(pill, node);

      // Add space after pill
      const space = document.createTextNode(" ");
      pill.parentNode?.insertBefore(space, pill.nextSibling);

      // Move cursor after space
      const range = document.createRange();
      range.setStartAfter(space);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      break;
    }

    currentPos = nodeEnd;
  }
}
```

### 7.6 API Conversion

```typescript
// lib/api.ts
import type { PromptPart } from "@/types/prompt";

interface ApiTextPart {
  id: string;
  type: "text";
  text: string;
}

interface ApiFilePart {
  id: string;
  type: "file";
  mime: string;
  url: string;
  filename: string;
  source: {
    type: "file";
    text: { value: string; start: number; end: number };
    path: string;
  };
}

let partCounter = 0;
function generatePartId(): string {
  return `part_${Date.now()}_${partCounter++}`;
}

export function convertToApiParts(
  parts: PromptPart[],
  projectRoot: string,
): (ApiTextPart | ApiFilePart)[] {
  const apiParts: (ApiTextPart | ApiFilePart)[] = [];

  // Combine text parts
  const text = parts
    .filter(
      (p): p is Extract<PromptPart, { type: "text" }> => p.type === "text",
    )
    .map((p) => p.content)
    .join("");

  if (text.trim()) {
    apiParts.push({
      id: generatePartId(),
      type: "text",
      text,
    });
  }

  // Convert file parts
  for (const part of parts) {
    if (part.type !== "file") continue;

    // Handle both absolute and relative paths
    const absolutePath = part.path.startsWith("/")
      ? part.path
      : `${projectRoot}/${part.path}`;

    const filename = part.path.split("/").pop() || part.path;

    apiParts.push({
      id: generatePartId(),
      type: "file",
      mime: "text/plain",
      url: `file://${absolutePath}`,
      filename,
      source: {
        type: "file",
        text: {
          value: part.content,
          start: part.start,
          end: part.end,
        },
        path: absolutePath,
      },
    });
  }

  return apiParts;
}
```

### 7.7 CSS Styles

```css
/* styles/prompt-input.css */

.prompt-input-container {
  position: relative;
  display: flex;
  gap: 8px;
  padding: 12px;
  background: var(--color-bg-panel);
  border-top: 1px solid var(--color-border);
}

.prompt-editor {
  flex: 1;
  min-height: 40px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  outline: none;
  font-size: 14px;
  line-height: 1.5;
}

.prompt-editor:focus {
  border-color: var(--color-primary);
}

.prompt-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--color-text-muted);
  pointer-events: none;
}

/* File pill styling */
.file-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin: 0 2px;
  background: var(--color-primary);
  color: white;
  border-radius: 4px;
  font-size: 13px;
  font-family: monospace;
  cursor: default;
  user-select: all;
}

.file-pill::before {
  content: "📄";
  margin-right: 4px;
  font-size: 12px;
}

/* Autocomplete popover */
.autocomplete-popover {
  position: absolute;
  bottom: 100%;
  left: 12px;
  right: 12px;
  max-height: 300px;
  overflow-y: auto;
  background: var(--color-bg-panel);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  margin-bottom: 8px;
  z-index: 100;
}

.autocomplete-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
}

.autocomplete-item:hover,
.autocomplete-item.active {
  background: var(--color-bg-element);
}

.autocomplete-item .file-path {
  font-family: monospace;
  color: var(--color-text);
}

.autocomplete-loading,
.autocomplete-empty {
  padding: 12px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}

.submit-button {
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## 8. Troubleshooting

### Common Issues

#### Files Not Appearing in Autocomplete

**Symptoms:** Typing `@` shows no results or wrong files

**Causes & Solutions:**

1. **File cache is stale**
   - The server caches the file list
   - New files may not appear immediately
   - Solution: The cache refreshes automatically, but you can restart the server

2. **Wrong directory header**

   ```typescript
   // Make sure you're sending the correct directory
   fetch("/find/file?query=test", {
     headers: { "x-opencode-directory": "/correct/project/path" },
   });
   ```

3. **Query too specific**
   - Fuzzy search may not match if query is too long
   - Try shorter queries: `@rou` instead of `@routes.ts`

4. **Files in .gitignore**
   - By default, gitignored files are excluded
   - Check if your file is in `.gitignore`

#### Autocomplete Position Wrong

**Symptoms:** Popover appears in wrong location

**Solution:** Calculate position from caret, not from input element:

```typescript
function getCaretPosition() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return { top: rect.bottom, left: rect.left };
}
```

#### File Pills Not Inserting

**Symptoms:** Selecting a file doesn't insert the pill

**Causes & Solutions:**

1. **Selection lost**
   - Clicking autocomplete item loses focus
   - Use `mousedown` with `preventDefault` instead of `click`:

   ```tsx
   <button
     onMouseDown={(e) => {
       e.preventDefault() // Prevent focus loss
       onSelect(path)
     }}
   >
   ```

2. **DOM structure changed**
   - ContentEditable can create unexpected DOM
   - Normalize the DOM before parsing:
   ```typescript
   container.normalize(); // Merge adjacent text nodes
   ```

#### API Rejects File Parts

**Symptoms:** 400 error when sending message with files

**Causes & Solutions:**

1. **Missing required fields**

   ```typescript
   // All these fields are required
   {
     id: string,           // Must be unique
     type: 'file',
     mime: 'text/plain',   // Required
     url: 'file://...',    // Must be absolute path
     filename: string,     // Required
     source: { ... }       // Required
   }
   ```

2. **Relative path in URL**

   ```typescript
   // Wrong
   url: "file://src/api/routes.ts";

   // Correct
   url: "file:///Users/joel/project/src/api/routes.ts";
   ```

3. **Path doesn't exist**
   - Server validates file exists
   - Make sure path is correct and file is readable

#### Keyboard Navigation Not Working

**Symptoms:** Arrow keys don't navigate autocomplete

**Solution:** Make sure to prevent default and stop propagation:

```typescript
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (!showAutocomplete) return;

  if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    // Handle navigation
  }
};
```

### Debug Checklist

```
┌─────────────────────────────────────────────────────────────────────┐
│                     @ REFERENCE DEBUG CHECKLIST                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [ ] Directory header is set correctly                              │
│  [ ] API endpoint returns results (check Network tab)               │
│  [ ] Fuzzy search matches expected files                            │
│  [ ] @ pattern regex matches input                                  │
│  [ ] Autocomplete popover renders                                   │
│  [ ] Keyboard navigation works                                      │
│  [ ] File pill inserts correctly                                    │
│  [ ] DOM parsing extracts file parts                                │
│  [ ] API conversion creates valid FilePart                          │
│  [ ] Absolute path is correct                                       │
│  [ ] Server accepts the request                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                     @ REFERENCE IMPLEMENTATION                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  API Endpoints                                                      │
│  ─────────────                                                      │
│  GET /find/file?query={q}&dirs=true  → string[]                     │
│  GET /agent                          → Agent[]                      │
│                                                                     │
│  Key Types                                                          │
│  ─────────                                                          │
│  PromptPart = TextPart | FilePart                                   │
│  ApiFilePart = { id, type, mime, url, filename, source }            │
│                                                                     │
│  Flow                                                               │
│  ────                                                               │
│  1. Detect @ with regex: /@(\S*)$/                                  │
│  2. Search files with debounced API call                            │
│  3. Show autocomplete popover                                       │
│  4. Insert pill on selection                                        │
│  5. Parse DOM to extract parts                                      │
│  6. Convert to API format with absolute paths                       │
│  7. Send to /session/:id/message                                    │
│                                                                     │
│  Gotchas                                                            │
│  ───────                                                            │
│  • No @agent syntax - agents selected via dropdown                  │
│  • File paths must be absolute in API                               │
│  • ContentEditable is tricky - normalize DOM                        │
│  • Prevent focus loss on autocomplete click                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

_Last updated: December 2024_
