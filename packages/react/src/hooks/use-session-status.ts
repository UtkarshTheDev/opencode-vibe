/**
 * useSessionStatus - Track session running/idle status
 *
 * Fetches session data once on mount, then subscribes to real-time
 * status updates via SSE events.
 *
 * @example
 * ```tsx
 * function SessionIndicator({ sessionId }: { sessionId: string }) {
 *   const { running, isLoading, status } = useSessionStatus({ sessionId })
 *
 *   if (isLoading) return <div>Loading...</div>
 *   return <div>{running ? "Running" : "Idle"}</div>
 * }
 * ```
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { sessions } from "@opencode-vibe/core/api"
import { useMultiServerSSE } from "./use-multi-server-sse"
import type { GlobalEvent } from "../types/events"

export interface UseSessionStatusOptions {
	/** Session ID to track */
	sessionId: string
	/** Project directory (optional) */
	directory?: string
}

export interface SessionStatus {
	/** Whether session is running */
	running: boolean
	/** Loading state */
	isLoading: boolean
	/** Session status (future: from SSE) */
	status?: "running" | "pending" | "completed" | "error"
}

/**
 * Hook to track session status
 *
 * Fetches initial status from API, then subscribes to real-time
 * status updates via SSE events.
 *
 * @param options - Options with sessionId and optional directory
 * @returns Object with running, isLoading, and status
 */
export function useSessionStatus(options: UseSessionStatusOptions): SessionStatus {
	const [running, setRunning] = useState(false)
	const [isLoading, setIsLoading] = useState(true)
	const [status, setStatus] = useState<SessionStatus["status"]>(undefined)

	// Initial fetch on mount
	const fetch = useCallback(() => {
		setIsLoading(true)

		sessions
			.get(options.sessionId, options.directory)
			.then((session) => {
				if (session) {
					// Initial state - assume idle until SSE tells us otherwise
					setRunning(false)
					setStatus(undefined)
				} else {
					setRunning(false)
					setStatus(undefined)
				}
			})
			.catch(() => {
				setRunning(false)
				setStatus("error")
			})
			.finally(() => {
				setIsLoading(false)
			})
	}, [options.sessionId, options.directory])

	useEffect(() => {
		fetch()
	}, [fetch])

	// Subscribe to SSE events for real-time status updates
	const handleEvent = useCallback(
		(event: GlobalEvent) => {
			// Only process session.status events
			if (event.payload.type !== "session.status") return

			// Type-safe property extraction
			const props = event.payload.properties as {
				sessionID: string
				status: { type: "busy" | "idle" }
			}

			// Only update if this event is for our session
			if (props.sessionID !== options.sessionId) return

			// Update running state based on status type
			const isRunning = props.status.type === "busy"
			setRunning(isRunning)
		},
		[options.sessionId],
	)

	useMultiServerSSE({ onEvent: handleEvent })

	return {
		running,
		isLoading,
		status,
	}
}
