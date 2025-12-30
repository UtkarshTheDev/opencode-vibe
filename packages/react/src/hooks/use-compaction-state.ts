/**
 * useCompactionState - Hook to track session compaction state
 *
 * Monitors the state of prompt compaction for a given session via SSE events.
 * Subscribes to compaction.* events and updates state in real-time.
 *
 * @example
 * ```tsx
 * function CompactionIndicator({ sessionId }: { sessionId: string }) {
 *   const { isCompacting, progress } = useCompactionState({ sessionId })
 *
 *   if (!isCompacting) return null
 *
 *   return (
 *     <div>
 *       Compacting: {progress}
 *     </div>
 *   )
 * }
 * ```
 */

"use client"

import { useState } from "react"
import { useMultiServerSSE } from "./use-multi-server-sse"
import type { GlobalEvent } from "../types/events"

export interface UseCompactionStateOptions {
	/** Session ID to track compaction state for */
	sessionId: string
	/** Optional directory filter */
	directory?: string
}

export type CompactionProgress = "pending" | "generating" | "complete"

export interface CompactionState {
	/** Whether compaction is currently in progress */
	isCompacting: boolean
	/** Whether this is an automatic compaction (vs user-triggered) */
	isAutomatic: boolean
	/** Current stage of compaction process */
	progress: CompactionProgress
	/** Timestamp when compaction started (0 if not compacting) */
	startedAt: number
}

const DEFAULT_STATE: CompactionState = {
	isCompacting: false,
	isAutomatic: false,
	progress: "complete",
	startedAt: 0,
}

/**
 * Hook to get compaction state for a session
 *
 * Subscribes to SSE events for real-time compaction status updates.
 * Handles compaction.started, compaction.progress, and compaction.completed events.
 *
 * @param options - Options with sessionId and optional directory
 * @returns Current compaction state
 */
export function useCompactionState(options: UseCompactionStateOptions): CompactionState {
	const [state, setState] = useState<CompactionState>(DEFAULT_STATE)

	// Subscribe to SSE events
	useMultiServerSSE({
		onEvent: (event: GlobalEvent) => {
			// Only process compaction events
			if (!event.payload.type.startsWith("compaction.")) {
				return
			}

			// Only process events for our session
			if (event.payload.properties.sessionID !== options.sessionId) {
				return
			}

			// Handle different compaction event types
			if (event.payload.type === "compaction.started") {
				setState({
					isCompacting: true,
					isAutomatic: Boolean(event.payload.properties.automatic),
					progress: "pending",
					startedAt: Number(event.payload.properties.timestamp) || Date.now(),
				})
			} else if (event.payload.type === "compaction.progress") {
				setState((prev) => ({
					...prev,
					progress: (event.payload.properties.progress as CompactionProgress) || prev.progress,
				}))
			} else if (event.payload.type === "compaction.completed") {
				setState(DEFAULT_STATE)
			}
		},
	})

	return state
}
