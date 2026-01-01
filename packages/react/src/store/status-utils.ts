/**
 * Status utilities for deriving session status from multiple sources
 *
 * Three-source session status architecture:
 * 1. sessionStatus map - Populated by SSE session.status events
 * 2. Sub-agent activity - Task parts with status="running"
 * 3. Last message check - Assistant message without time.completed (bootstrap edge case)
 */

import type { SessionStatus } from "./types"

/**
 * OpencodeState type (minimal subset needed for deriveSessionStatus)
 */
interface OpencodeState {
	directories: Record<
		string,
		{
			sessionStatus?: Record<string, SessionStatus>
			messages?: Record<
				string,
				Array<{
					id: string
					role?: string
					time?: { created: number; completed?: number }
				}>
			>
			parts?: Record<
				string,
				Array<{
					type: string
					tool?: string
					state?: {
						status: string
					}
				}>
			>
		}
	>
}

/**
 * Options for deriveSessionStatus
 */
export interface DeriveSessionStatusOptions {
	/**
	 * Include sub-agent activity in status check
	 * @default true
	 */
	includeSubAgents?: boolean

	/**
	 * Include last message check (bootstrap edge case)
	 * @default false
	 */
	includeLastMessage?: boolean
}

/**
 * Derive session status from multiple sources
 *
 * Combines three sources of truth:
 * 1. **sessionStatus map** - Populated by SSE session.status events (main source)
 * 2. **Sub-agent activity** - Task parts with status="running" (parallel work indicator)
 * 3. **Last message check** - Assistant message without time.completed (bootstrap only)
 *
 * @param state - Zustand store state
 * @param sessionId - Session ID
 * @param directory - Project directory path
 * @param options - Status derivation options
 * @returns Session status ("running" | "completed")
 *
 * @example
 * ```tsx
 * const status = deriveSessionStatus(state, "ses-123", "/project", {
 *   includeSubAgents: true,
 *   includeLastMessage: false
 * })
 * ```
 */
export function deriveSessionStatus(
	state: OpencodeState,
	sessionId: string,
	directory: string,
	options: DeriveSessionStatusOptions = {},
): SessionStatus {
	const { includeSubAgents = true, includeLastMessage = false } = options

	const dir = state.directories[directory]
	if (!dir) return "completed"

	// SOURCE 1: Main session status from store (highest priority)
	const mainStatus = dir.sessionStatus?.[sessionId] ?? "completed"
	if (mainStatus === "running") return "running"

	// SOURCE 2: Sub-agent activity (task parts with status="running")
	if (includeSubAgents) {
		const messages = dir.messages?.[sessionId]
		if (messages) {
			for (const message of messages) {
				const parts = dir.parts?.[message.id]
				if (!parts) continue

				for (const part of parts) {
					if (part.type === "tool" && part.tool === "task" && part.state?.status === "running") {
						return "running"
					}
				}
			}
		}
	}

	// SOURCE 3: Last message check (bootstrap edge case)
	if (includeLastMessage) {
		const messages = dir.messages?.[sessionId]
		if (messages && messages.length > 0) {
			const lastMessage = messages[messages.length - 1]
			if (lastMessage.role === "assistant" && !lastMessage.time?.completed) {
				return "running"
			}
		}
	}

	return mainStatus
}
