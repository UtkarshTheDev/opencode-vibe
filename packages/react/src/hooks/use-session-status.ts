/**
 * useSessionStatus - Track session running/idle status
 *
 * Fetches session data once on mount, then subscribes to real-time
 * status updates via SSE events.
 *
 * Features a 60-second "cooldown" after streaming ends - the session
 * stays marked as "running" for a minute after the last activity,
 * making the indicator feel more natural and less abrupt.
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

import { useState, useEffect, useCallback, useRef } from "react"
import { sessions } from "@opencode-vibe/core/api"
import { useMultiServerSSE } from "./use-multi-server-sse"
import type { GlobalEvent } from "../types/events"

/** How long to keep "running" indicator lit after streaming ends */
const IDLE_COOLDOWN_MS = 60_000 // 1 minute

export interface UseSessionStatusOptions {
	/** Session ID to track */
	sessionId: string
	/** Project directory (optional) */
	directory?: string
	/** Override cooldown duration (ms) - mainly for testing */
	cooldownMs?: number
}

export interface SessionStatus {
	/** Whether session is running (includes cooldown period) */
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
 * status updates via SSE events. Includes a cooldown period after
 * streaming ends to keep the indicator "warm".
 *
 * @param options - Options with sessionId and optional directory
 * @returns Object with running, isLoading, and status
 */
export function useSessionStatus(options: UseSessionStatusOptions): SessionStatus {
	const [running, setRunning] = useState(false)
	const [isLoading, setIsLoading] = useState(true)
	const [status, setStatus] = useState<SessionStatus["status"]>(undefined)

	// Track cooldown timer
	const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const cooldownMs = options.cooldownMs ?? IDLE_COOLDOWN_MS

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (cooldownTimerRef.current) {
				clearTimeout(cooldownTimerRef.current)
			}
		}
	}, [])

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

			const isBusy = props.status.type === "busy"

			if (isBusy) {
				// Busy: cancel any pending cooldown and set running immediately
				if (cooldownTimerRef.current) {
					clearTimeout(cooldownTimerRef.current)
					cooldownTimerRef.current = null
				}
				setRunning(true)
			} else {
				// Idle: start cooldown timer instead of immediately going idle
				// Clear any existing timer first (resets the cooldown)
				if (cooldownTimerRef.current) {
					clearTimeout(cooldownTimerRef.current)
				}
				cooldownTimerRef.current = setTimeout(() => {
					setRunning(false)
					cooldownTimerRef.current = null
				}, cooldownMs)
			}
		},
		[options.sessionId, cooldownMs],
	)

	useMultiServerSSE({ onEvent: handleEvent })

	return {
		running,
		isLoading,
		status,
	}
}
