# OpenCode Web

Next.js 16 rebuild of the OpenCode web application with React Server Components.

## Getting Started

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Prompt Input Features

### Slash Commands (`/`)

Type `/` to execute actions:

- Autocomplete dropdown shows available commands
- Navigate with `↑`/`↓` arrow keys or Tab
- Press Enter to select
- Commands trigger workflows (e.g., `/fix`, `/test`, `/refactor`)

### File References (`@`)

Type `@` to reference files as context:

- Fuzzy file search across the codebase
- Navigate suggestions with keyboard
- Selected files appear as removable pills
- Multiple files can be referenced
- Files are included in message context metadata

### Components

- **PromptInput** - Main input orchestrator with autocomplete
- **Autocomplete** - Dropdown for slash commands and file search
- **FilePill** - Removable file reference badges

### Hooks

- **useFileSearch** - Fuzzy file search with debouncing
- **useCommands** - Available slash commands registry
- **useSendMessage** - Context-aware message dispatch to API

## Architecture

Built with:

- Next.js 16 (App Router, React Server Components)
- Bun runtime and package manager
- TypeScript with strict type checking
- TDD approach (119+ tests)
- Tailwind CSS for styling

See [AGENTS.md](../../AGENTS.md) for full architecture documentation.
