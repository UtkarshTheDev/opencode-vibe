/**
 * useSSE - Real-time event subscription hook for OpenCode
 *
 * Provides a context-based SSE subscription system. Components call useSSE()
 * to get a subscribe function, then subscribe to specific event types.
 *
 * The SSE connection is managed at the app level via SSEProvider.
 * Per SYNC_IMPLEMENTATION.md requirements (lines 296-413, 735-900).
 *
 * @example Basic usage
 * ```tsx
 * // In a component
 * const { subscribe } = useSSE()
 *
 * useEffect(() => {
 *   const unsubscribe = subscribe("message.updated", (event) => {
 *     console.log("Message updated:", event)
 *   })
 *   return unsubscribe
 * }, [subscribe])
 * ```
 *
 * @example In app layout (provider setup)
 * ```tsx
 * <SSEProvider url="http://localhost:3000">
 *   {children}
 * </SSEProvider>
 * ```
 */

import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useCallback,
	useState,
	type ReactNode,
} from "react"
import type { GlobalEvent } from "@opencode-ai/sdk/client"
import { EventSourceParserStream } from "eventsource-parser/stream"

/**
 * Event types that can be subscribed to
 */
export type SSEEventType =
	| "session.created"
	| "session.updated"
	| "session.deleted"
	| "session.diff"
	| "session.status"
	| "session.error"
	| "message.created"
	| "message.updated"
	| "message.removed"
	| "message.part.updated"
	| "message.part.removed"
	| "todo.updated"
	| "project.updated"
	| "provider.updated"
	| "global.disposed"
	| "server.connected"
	| "server.heartbeat"
	| "permission.updated"
	| "permission.replied"

/**
 * Callback function for SSE event subscriptions
 */
export type SSEEventCallback = (event: GlobalEvent) => void

/**
 * SSE context value - what useSSE() returns
 */
interface SSEContextValue {
	/** Subscribe to a specific event type. Returns unsubscribe function. */
	subscribe: (eventType: SSEEventType, callback: SSEEventCallback) => () => void
	/** Whether SSE is currently connected */
	connected: boolean
	/** Manually trigger reconnection */
	reconnect: () => void
}

const SSEContext = createContext<SSEContextValue | null>(null)

/**
 * SSE Provider props
 */
interface SSEProviderProps {
	/** Base URL for SSE endpoint (will append /global/event) */
	url: string
	/** Initial retry delay in ms (default: 3000 = 3s) */
	retryDelay?: number
	/** Maximum number of retry attempts (default: 10) */
	maxRetries?: number
	/** Children components */
	children: ReactNode
}

/**
 * Heartbeat timeout in ms (60s = 2x server heartbeat of 30s)
 * If no event received within this window, connection is considered dead.
 */
const HEARTBEAT_TIMEOUT_MS = 60_000

/**
 * SSEProvider - Manages SSE connection and event distribution
 *
 * Wrap your app with this provider to enable SSE subscriptions.
 * Uses fetch-based SSE with exponential backoff (3s → 6s → 12s → 24s → 30s cap).
 * Uses EventSourceParserStream for standardized SSE parsing.
 * Includes heartbeat monitoring (60s timeout) and visibility API support.
 *
 * Note: SSE connection only starts on the client (after hydration).
 * During SSR/prerender, the provider renders children without connecting.
 */
export function SSEProvider({
	url,
	retryDelay = 3000,
	maxRetries = 10,
	children,
}: SSEProviderProps) {
	const [mounted, setMounted] = useState(false)
	const retryCount = useRef(0)
	const abortController = useRef<AbortController | null>(null)
	const connectedRef = useRef(false)
	const listenersRef = useRef<Map<SSEEventType, Set<SSEEventCallback>>>(new Map())
	const heartbeatTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isBackgrounded = useRef(false)

	// Store config in ref to avoid recreating connect callback
	const configRef = useRef({ url, retryDelay, maxRetries })
	configRef.current = { url, retryDelay, maxRetries }

	/**
	 * Dispatch event to all subscribers of that event type
	 * Stored in ref to make connect callback stable
	 *
	 * NOTE: We do NOT call store.handleSSEEvent() here. That would bypass
	 * directory filtering. Instead, OpenCodeProvider subscribes to events
	 * and calls store.handleEvent() with proper directory scoping.
	 */
	const dispatchEventRef = useRef((event: GlobalEvent) => {
		const eventType = event.payload?.type as SSEEventType
		if (!eventType) return

		const callbacks = listenersRef.current.get(eventType)
		if (callbacks) {
			// DIAGNOSTIC: Measure time to execute all subscriber callbacks
			const callbackStartTime = performance.now()
			console.log(`[SSE] Dispatching to ${callbacks.size} subscriber(s) for ${eventType}`)

			let callbackIndex = 0
			for (const callback of callbacks) {
				try {
					const cbStart = performance.now()
					callback(event)
					const cbDuration = performance.now() - cbStart

					// Log slow callbacks (>5ms is suspicious)
					if (cbDuration > 5) {
						console.warn(
							`[SSE] Slow callback #${callbackIndex} for ${eventType}: ${cbDuration.toFixed(2)}ms`,
						)
					}

					callbackIndex++
				} catch (error) {
					console.error(`SSE callback error for ${eventType}:`, error)
				}
			}

			const totalCallbackTime = performance.now() - callbackStartTime
			console.log(
				`[SSE] All callbacks completed for ${eventType}: ${totalCallbackTime.toFixed(2)}ms`,
			)
		} else {
			console.log(`[SSE] No subscribers for ${eventType}`)
		}
	})

	/**
	 * Reset heartbeat timeout - called on every event received
	 * Stored in ref to make connect callback stable
	 */
	const resetHeartbeatRef = useRef((reconnectFn: () => void) => {
		// Clear existing timeout
		if (heartbeatTimeout.current) {
			clearTimeout(heartbeatTimeout.current)
		}
		// Set new timeout - if no event in 60s, reconnect
		heartbeatTimeout.current = setTimeout(() => {
			console.warn("SSE heartbeat timeout - reconnecting")
			reconnectFn()
		}, HEARTBEAT_TIMEOUT_MS)
	})

	/**
	 * Connect to SSE endpoint
	 * IMPORTANT: This callback is stable (no dependencies) to prevent reconnection loops
	 * Uses refs for all callbacks to maintain stability
	 */
	const connect = useCallback(async () => {
		// Don't connect if backgrounded
		if (isBackgrounded.current) return

		const {
			url: currentUrl,
			retryDelay: currentRetryDelay,
			maxRetries: currentMaxRetries,
		} = configRef.current

		// Abort any existing connection
		abortController.current?.abort()
		abortController.current = new AbortController()

		// Clear any pending heartbeat timeout
		if (heartbeatTimeout.current) {
			clearTimeout(heartbeatTimeout.current)
		}

		try {
			const response = await fetch(`${currentUrl}/global/event`, {
				signal: abortController.current.signal,
				headers: {
					Accept: "text/event-stream",
					"Cache-Control": "no-cache",
				},
			})

			if (!response.ok) {
				throw new Error(`SSE failed: ${response.status} ${response.statusText}`)
			}

			if (!response.body) {
				throw new Error("No body in SSE response")
			}

			// Reset retry count on successful connection
			retryCount.current = 0
			connectedRef.current = true

			// Start heartbeat monitoring
			resetHeartbeatRef.current(connect)

			// Use EventSourceParserStream for standardized SSE parsing
			const stream = response.body
				.pipeThrough(new TextDecoderStream())
				.pipeThrough(new EventSourceParserStream())

			const reader = stream.getReader()
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				// DIAGNOSTIC: Start timing when SSE event arrives
				const sseArrivalTime = performance.now()

				const data = JSON.parse(value.data) as GlobalEvent
				const eventType = data.payload?.type as SSEEventType

				// Log event arrival with metadata
				console.log(`[SSE] Event arrived: ${eventType}`, {
					timestamp: new Date().toISOString(),
					arrivalTime: sseArrivalTime,
					directory: data.directory,
					payload: data.payload,
				})

				// Reset heartbeat on every event (including server.heartbeat)
				resetHeartbeatRef.current(connect)

				// DIAGNOSTIC: Measure dispatch time
				console.time(`sse-dispatch-${eventType}-${sseArrivalTime}`)
				dispatchEventRef.current(data)
				console.timeEnd(`sse-dispatch-${eventType}-${sseArrivalTime}`)
			}

			// Stream ended normally - reconnect
			connectedRef.current = false
			if (retryCount.current < currentMaxRetries) {
				const backoff = Math.min(currentRetryDelay * 2 ** retryCount.current, 30000)
				retryCount.current++
				setTimeout(connect, backoff)
			}
		} catch (error) {
			if ((error as Error).name === "AbortError") return

			connectedRef.current = false
			console.error("SSE connection error:", error)

			// Retry with exponential backoff
			const { retryDelay: currentRetryDelay, maxRetries: currentMaxRetries } = configRef.current
			if (retryCount.current < currentMaxRetries) {
				const backoff = Math.min(currentRetryDelay * 2 ** retryCount.current, 30000)
				retryCount.current++
				setTimeout(connect, backoff)
			}
		}
	}, [])

	/**
	 * Subscribe to an event type
	 * @deprecated Use Zustand store selectors instead. SSE events now update store directly.
	 */
	const subscribe = useCallback(
		(eventType: SSEEventType, callback: SSEEventCallback): (() => void) => {
			if (!listenersRef.current.has(eventType)) {
				listenersRef.current.set(eventType, new Set())
			}
			listenersRef.current.get(eventType)!.add(callback)

			// Return unsubscribe function
			return () => {
				const callbacks = listenersRef.current.get(eventType)
				if (callbacks) {
					callbacks.delete(callback)
					if (callbacks.size === 0) {
						listenersRef.current.delete(eventType)
					}
				}
			}
		},
		[],
	)

	/**
	 * Manual reconnect
	 */
	const reconnect = useCallback(() => {
		retryCount.current = 0
		connect()
	}, [connect])

	// Mark as mounted (client-side only)
	useEffect(() => {
		setMounted(true)
	}, [])

	// Handle visibility changes - disconnect when backgrounded, reconnect when foregrounded
	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				// App returned to foreground - reconnect
				isBackgrounded.current = false
				retryCount.current = 0 // Reset retries on foreground
				connect()
			} else {
				// App went to background - abort connection to save battery
				isBackgrounded.current = true
				abortController.current?.abort()
				if (heartbeatTimeout.current) {
					clearTimeout(heartbeatTimeout.current)
				}
			}
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange)
		}
	}, [connect])

	// Connect on mount, cleanup on unmount (client-side only)
	useEffect(() => {
		if (!mounted) return
		connect()
		return () => {
			abortController.current?.abort()
			if (heartbeatTimeout.current) {
				clearTimeout(heartbeatTimeout.current)
			}
		}
	}, [connect, mounted])

	const value: SSEContextValue = {
		subscribe,
		connected: connectedRef.current,
		reconnect,
	}

	return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>
}

/**
 * useSSE - Hook to access SSE subscription system
 *
 * Must be used within an SSEProvider. Returns subscribe function
 * for subscribing to specific event types.
 *
 * @returns Object with subscribe function, connected state, and reconnect function
 * @throws Error if used outside SSEProvider
 *
 * @example
 * ```tsx
 * const { subscribe } = useSSE()
 *
 * useEffect(() => {
 *   const unsubscribe = subscribe("message.updated", (event) => {
 *     console.log("Message:", event.payload)
 *   })
 *   return unsubscribe
 * }, [subscribe])
 * ```
 */
export function useSSE(): SSEContextValue {
	const context = useContext(SSEContext)
	if (!context) {
		throw new Error("useSSE must be used within an SSEProvider")
	}
	return context
}
