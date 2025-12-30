/**
 * Sessions API - Promise-based wrapper
 *
 * Promise-based API for session operations.
 * Wraps SessionAtom Effect programs with Effect.runPromise.
 *
 * @module api/sessions
 */

import { Effect } from "effect"
import { SessionAtom, type ModelSelection } from "../atoms/sessions.js"
import type { Session } from "../types/index.js"

/**
 * Session API namespace
 *
 * Promise-based wrappers around SessionAtom.
 */
export const sessions = {
	/**
	 * Fetch all sessions for a directory
	 *
	 * @param directory - Project directory (optional)
	 * @returns Promise that resolves to Session array
	 *
	 * @example
	 * ```typescript
	 * const sessions = await sessions.list("/my/project")
	 * console.log(sessions.length)
	 * ```
	 */
	list: (directory?: string): Promise<Session[]> => Effect.runPromise(SessionAtom.list(directory)),

	/**
	 * Fetch a single session by ID
	 *
	 * @param id - Session ID
	 * @param directory - Project directory (optional)
	 * @returns Promise that resolves to Session or null
	 *
	 * @example
	 * ```typescript
	 * const session = await sessions.get("ses_123")
	 * if (session) {
	 *   console.log(session.title)
	 * }
	 * ```
	 */
	get: (id: string, directory?: string): Promise<Session | null> =>
		Effect.runPromise(SessionAtom.get(id, directory)),

	/**
	 * Create a new session
	 *
	 * @param title - Optional session title
	 * @param directory - Project directory (optional)
	 * @returns Promise that resolves to created Session
	 *
	 * @example
	 * ```typescript
	 * const session = await sessions.create("My Session")
	 * console.log(session.id)
	 * ```
	 */
	create: (title?: string, directory?: string): Promise<Session> =>
		Effect.runPromise(SessionAtom.create(title, directory)),

	/**
	 * Send a prompt to a session asynchronously (fire-and-forget)
	 *
	 * @param sessionId - Session ID
	 * @param parts - Array of prompt parts
	 * @param model - Optional model selection (e.g., { providerID: "anthropic", modelID: "claude-3-sonnet" })
	 * @param directory - Project directory (optional)
	 * @returns Promise that resolves when prompt is sent
	 *
	 * @example
	 * ```typescript
	 * await sessions.promptAsync("ses_123", [
	 *   { type: "text", content: "Hello", start: 0, end: 5 }
	 * ])
	 * ```
	 */
	promptAsync: (
		sessionId: string,
		parts: unknown[],
		model?: ModelSelection,
		directory?: string,
	): Promise<void> =>
		Effect.runPromise(SessionAtom.promptAsync(sessionId, parts, model, directory)),

	/**
	 * Execute a slash command in a session
	 *
	 * @param sessionId - Session ID
	 * @param command - Slash command name (without the /)
	 * @param args - Command arguments as string
	 * @param directory - Project directory (optional)
	 * @returns Promise that resolves when command is executed
	 *
	 * @example
	 * ```typescript
	 * await sessions.command("ses_123", "swarm", "Add auth")
	 * ```
	 */
	command: (sessionId: string, command: string, args: string, directory?: string): Promise<void> =>
		Effect.runPromise(SessionAtom.command(sessionId, command, args, directory)),
}

// Export types for consumers
export type { Session, ModelSelection }
