/**
 * useSubscription hook for streaming routes
 * ADR 002 - React hook with visibility API and event batching
 */
import { useState, useEffect, useRef, useCallback } from "react"

/**
 * Subscription status
 */
export type SubscriptionStatus = "idle" | "connecting" | "connected" | "error" | "paused"

/**
 * Options for useSubscription
 */
export interface UseSubscriptionOptions {
	/** Pause when tab is hidden (default: true) */
	pauseOnHidden?: boolean
	/** Batch events for N ms before updating state (default: 16) */
	batchMs?: number
}

/**
 * Return type for useSubscription
 */
export interface UseSubscriptionResult<T> {
	/** Collected events */
	events: T[]
	/** Current subscription status */
	status: SubscriptionStatus
	/** Error if status is "error" */
	error: Error | null
}

/**
 * Subscribe to an async iterable with visibility API integration and event batching
 *
 * @param action - Function that returns an AsyncIterable to subscribe to
 * @param deps - Dependencies that trigger resubscription when changed
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * const { events, status, error } = useSubscription(
 *   () => caller("subscribe.events", {}),
 *   [sessionId],
 *   { pauseOnHidden: true, batchMs: 16 }
 * )
 * ```
 */
export function useSubscription<T>(
	action: () => AsyncIterable<T>,
	deps: unknown[],
	options: UseSubscriptionOptions = {},
): UseSubscriptionResult<T> {
	const { pauseOnHidden = true, batchMs = 16 } = options

	const [events, setEvents] = useState<T[]>([])
	const [status, setStatus] = useState<SubscriptionStatus>("idle")
	const [error, setError] = useState<Error | null>(null)

	const controllerRef = useRef<AbortController | null>(null)
	const batchRef = useRef<T[]>([])
	const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isPausedRef = useRef(false)

	const flushBatch = useCallback(() => {
		if (batchRef.current.length > 0) {
			setEvents((prev) => [...prev, ...batchRef.current])
			batchRef.current = []
		}
		batchTimeoutRef.current = null
	}, [])

	const queueEvent = useCallback(
		(event: T) => {
			if (batchMs === 0) {
				// Immediate update for testing - no batching
				setEvents((prev) => [...prev, event])
			} else {
				batchRef.current.push(event)
				if (!batchTimeoutRef.current) {
					batchTimeoutRef.current = setTimeout(flushBatch, batchMs)
				}
			}
		},
		[batchMs, flushBatch],
	)

	// Store action in ref to avoid recreating on every render
	const actionRef = useRef(action)
	actionRef.current = action

	// Create a stable deps key for useEffect
	const depsKey = JSON.stringify(deps)

	useEffect(() => {
		// Clear events on resubscribe
		setEvents([])
		setError(null)
		setStatus("idle")

		controllerRef.current = new AbortController()
		isPausedRef.current = false

		async function subscribe() {
			setStatus("connecting")

			try {
				const iterable = actionRef.current()
				setStatus("connected")

				for await (const event of iterable) {
					if (controllerRef.current?.signal.aborted) break
					if (isPausedRef.current) continue // Skip events while paused
					queueEvent(event)
				}
			} catch (err) {
				if (!controllerRef.current?.signal.aborted) {
					setError(err instanceof Error ? err : new Error(String(err)))
					setStatus("error")
				}
			}
		}

		// Visibility API integration
		function handleVisibilityChange() {
			if (!pauseOnHidden) return

			if (document.visibilityState === "hidden") {
				isPausedRef.current = true
				setStatus("paused")
			} else {
				isPausedRef.current = false
				setStatus("connected")
			}
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)
		subscribe()

		return () => {
			controllerRef.current?.abort()
			document.removeEventListener("visibilitychange", handleVisibilityChange)
			if (batchTimeoutRef.current) {
				clearTimeout(batchTimeoutRef.current)
				flushBatch()
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [depsKey, pauseOnHidden, queueEvent, flushBatch])

	return { events, status, error }
}
