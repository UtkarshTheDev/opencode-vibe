/**
 * OpenCode SDK client factory
 *
 * Creates a configured client for connecting to the OpenCode server.
 * Default server runs on localhost:4096.
 */

import { createOpencodeClient } from "@opencode-ai/sdk/client"

export type { OpencodeClient } from "@opencode-ai/sdk/client"

/**
 * Default OpenCode server URL
 * Can be overridden via NEXT_PUBLIC_OPENCODE_URL env var
 */
export const OPENCODE_URL = process.env.NEXT_PUBLIC_OPENCODE_URL ?? "http://localhost:4056"

/**
 * Create an OpenCode client instance
 *
 * @param directory - Optional project directory for scoping requests
 * @returns Configured OpencodeClient with all namespaces (session, provider, etc.)
 *
 * @example
 * ```ts
 * const client = createClient()
 * const sessions = await client.session.list()
 * ```
 *
 * @example With directory scoping
 * ```ts
 * const client = createClient("/path/to/project")
 * const sessions = await client.session.list() // Only sessions for this project
 * ```
 */
export function createClient(directory?: string) {
	return createOpencodeClient({
		baseUrl: OPENCODE_URL,
		directory,
	})
}

/**
 * Singleton client for global operations (no directory scoping)
 * Use createClient(directory) for project-scoped operations
 */
export const globalClient = createClient()
