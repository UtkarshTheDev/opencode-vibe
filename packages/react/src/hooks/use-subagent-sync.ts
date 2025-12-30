/**
 * Subagent sync hook
 *
 * Subscribes to SSE events and syncs subagent state for a given session.
 *
 * @module
 */

"use client"

import { useEffect, useRef } from "react"
import { useMultiServerSSE } from "./use-multi-server-sse.js"
import { subagents } from "@opencode-vibe/core/api"
import type { SubagentStateRef } from "@opencode-vibe/core/api"
import type { Message, Part } from "@opencode-vibe/core/types"
import type { GlobalEvent } from "../types/events.js"

/**
 * Options for useSubagentSync hook
 */
export interface UseSubagentSyncOptions {
	/**
	 * Session ID to sync subagent events for
	 */
	sessionId: string

	/**
	 * Optional directory to scope SSE subscription
	 */
	directory?: string
}

/**
 * Hook to sync subagent SSE events for a session
 *
 * This hook:
 * 1. Creates a subagent state ref on mount
 * 2. Subscribes to SSE events using useMultiServerSSE
 * 3. Filters for message.* and part.* events
 * 4. Dispatches events to the subagents API
 *
 * @param options - Session ID and optional directory
 *
 * @example
 * ```typescript
 * useSubagentSync({ sessionId: "abc123" })
 * useSubagentSync({ sessionId: "abc123", directory: "/path/to/project" })
 * ```
 */
export function useSubagentSync(options: UseSubagentSyncOptions): void {
	const { sessionId } = options
	const stateRef = useRef<SubagentStateRef | null>(null)
	// Track message-to-session mapping to resolve sessionID for parts
	const messageToSessionMap = useRef<Map<string, string>>(new Map())

	// Create subagent state on mount
	useEffect(() => {
		let mounted = true

		subagents.create().then((ref) => {
			if (mounted) {
				stateRef.current = ref
			}
		})

		return () => {
			mounted = false
		}
	}, [])

	// Subscribe to SSE events
	useMultiServerSSE({
		onEvent: (event: GlobalEvent) => {
			if (!stateRef.current) return

			// Filter by directory if specified
			if (options.directory && event.directory !== options.directory) {
				return
			}

			const { type, properties } = event.payload

			// Handle message events
			if (type === "message.created") {
				const message = properties as Message
				// Track message-to-session mapping
				messageToSessionMap.current.set(message.id, message.sessionID)
				void subagents.addMessage(stateRef.current, message.sessionID, message)
			} else if (type === "message.updated") {
				const message = properties as Message
				// Update mapping if needed
				messageToSessionMap.current.set(message.id, message.sessionID)
				void subagents.updateMessage(stateRef.current, message.sessionID, message)
			}
			// Handle part events
			else if (type === "part.created") {
				const part = properties as Part
				const sessionID = resolveSessionIdForPart(part, messageToSessionMap.current)
				void subagents.addPart(stateRef.current, sessionID, part.messageID, part)
			} else if (type === "part.updated") {
				const part = properties as Part
				const sessionID = resolveSessionIdForPart(part, messageToSessionMap.current)
				void subagents.updatePart(stateRef.current, sessionID, part.messageID, part)
			}
		},
	})
}

/**
 * Resolve session ID for a part
 *
 * Parts don't carry sessionID directly, so we need to resolve it from:
 * 1. The message-to-session mapping (built from message.created events)
 * 2. The part's sessionID property if present (backend may include it)
 * 3. Fallback to messageID (may cause issues but prevents crashes)
 *
 * @param part - The part to resolve sessionID for
 * @param messageToSessionMap - Map of messageID to sessionID
 * @returns The session ID for the part
 */
function resolveSessionIdForPart(part: Part, messageToSessionMap: Map<string, string>): string {
	// Check if sessionID is in the part properties (backend may include it)
	if ("sessionID" in part && typeof part.sessionID === "string") {
		return part.sessionID
	}

	// Look up sessionID from message-to-session mapping
	const sessionID = messageToSessionMap.get(part.messageID)
	if (sessionID) {
		return sessionID
	}

	// Fallback: use messageID (may cause issues but prevents crashes)
	// This should rarely happen in practice since message.created comes before part.created
	return part.messageID
}
