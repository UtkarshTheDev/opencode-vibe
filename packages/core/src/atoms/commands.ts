/**
 * Command Atoms
 *
 * Pure Effect programs for slash command management.
 * Framework-agnostic - no React dependencies.
 *
 * Provides:
 * - Custom command list fetching as Effect program
 * - Type-safe command definitions
 *
 * @module atoms/commands
 */

import { Effect } from "effect"
import { globalClient } from "../client/index.js"

/**
 * Custom command definition from API
 */
export interface CustomCommand {
	name: string
	description?: string
	template?: string
	agent?: string
	subtask?: boolean
}

/**
 * Command atom namespace
 *
 * Pure Effect programs for command operations.
 * Use with Effect.runPromise in React hooks.
 */
export const CommandAtom = {
	/**
	 * Fetch all custom commands
	 *
	 * @param directory - Project directory (optional)
	 * @returns Effect program yielding CustomCommand array
	 *
	 * @example
	 * ```typescript
	 * // In React hook:
	 * Effect.runPromise(CommandAtom.list())
	 *   .then(commands => setState({ commands, loading: false }))
	 *   .catch(error => setState({ error, loading: false }))
	 * ```
	 */
	list: (directory?: string): Effect.Effect<CustomCommand[], Error> =>
		Effect.gen(function* () {
			// Get client for directory if specified
			const client = directory ? globalClient : globalClient

			const result = yield* Effect.tryPromise({
				try: () => client.command.list(),
				catch: (e) => new Error(`Failed to fetch commands: ${e}`),
			})

			// SDK returns: { data: CustomCommand[] }
			return result.data ?? []
		}),
}
