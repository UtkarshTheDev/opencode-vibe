# @opencode/core (future package)

**Framework-agnostic service layer.**

This folder will be extracted to `packages/core` when patterns stabilize.

## Purpose

- SDK client factory (`createOpencodeClient()`)
- 15+ namespaced APIs (session, provider, project, file, tool, etc.)
- Event streaming (SSE)
- Type definitions
- No React dependencies - can be used by web, desktop (Tauri), CLI, VSCode extension

## Extraction Trigger

Extract to `packages/core` after **third use** of a pattern.

Wait for patterns to emerge organically - premature abstraction is worse than duplication.
