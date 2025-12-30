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
 * 3. Filters events to only process registered subagent sessions
 * 4. Handles out-of-order delivery by queueing parts that arrive before their message
 * 5. Dispatches events to the subagents API
 *
 * **Important:** Only processes events for subagents that have been registered via
 * `subagents.registerSubagent()`. Unregistered sessions are silently ignored.
 *
 * @param options - Session ID (currently unused, for future parent-child filtering) and optional directory
 *
 * @example
 * ```typescript
 * useSubagentSync({ sessionId: "abc123" })
 * useSubagentSync({ sessionId: "abc123", directory: "/path/to/project" })
 * ```
 */
export function useSubagentSync(options: UseSubagentSyncOptions): void {
	const stateRef = useRef<SubagentStateRef | null>(null)
	// Track message-to-session mapping to resolve sessionID for parts
	const messageToSessionMap = useRef<Map<string, string>>(new Map())
	// Queue parts that arrive before their message
	const pendingParts = useRef<Map<string, Part[]>>(new Map())

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

	// Helper to flush pending parts for a message
	const flushPendingParts = (messageId: string, sessionId: string) => {
		const pending = pendingParts.current.get(messageId)
		if (pending && stateRef.current) {
			for (const part of pending) {
				void subagents.addPart(stateRef.current, sessionId, part.messageID, part)
			}
			pendingParts.current.delete(messageId)
		}
	}

	// Helper to handle part events (created or updated)
	const handlePartEvent = (part: Part, isUpdate: boolean) => {
		const sessionID = messageToSessionMap.current.get(part.messageID)
		if (sessionID && stateRef.current) {
			// We have the message, process the part directly
			if (isUpdate) {
				void subagents.updatePart(stateRef.current, sessionID, part.messageID, part)
			} else {
				void subagents.addPart(stateRef.current, sessionID, part.messageID, part)
			}
		} else {
			// Message hasn't arrived yet, queue the part
			const pending = pendingParts.current.get(part.messageID) || []
			pending.push(part)
			pendingParts.current.set(part.messageID, pending)
		}
	}

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

				// Only process messages from registered subagents
				subagents.getSessions(stateRef.current).then((sessions) => {
					if (!sessions[message.sessionID]) {
						return // Ignore unregistered sessions
					}

					// Track message-to-session mapping
					messageToSessionMap.current.set(message.id, message.sessionID)
					void subagents.addMessage(stateRef.current!, message.sessionID, message)

					// Flush any pending parts for this message
					flushPendingParts(message.id, message.sessionID)
				})
			} else if (type === "message.updated") {
				const message = properties as Message

				// Only process messages from registered subagents
				subagents.getSessions(stateRef.current).then((sessions) => {
					if (!sessions[message.sessionID]) {
						return // Ignore unregistered sessions
					}

					// Update mapping if needed
					messageToSessionMap.current.set(message.id, message.sessionID)
					void subagents.updateMessage(stateRef.current!, message.sessionID, message)
				})
			}
			// Handle part events (note: event types are "message.part.created", not "part.created")
			else if (type === "message.part.created") {
				handlePartEvent(properties as Part, false)
			} else if (type === "message.part.updated") {
				handlePartEvent(properties as Part, true)
			}
		},
	})
}
