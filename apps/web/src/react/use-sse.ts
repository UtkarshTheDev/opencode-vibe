/**
 * useSSE - Real-time event subscription hook for OpenCode
 *
 * Connects to OpenCode SSE stream and provides subscriber pattern for event handling.
 * Handles connection state, reconnection, and cleanup.
 *
 * Usage:
 * ```tsx
 * function App() {
 *   const { state, subscribe } = useSSE()
 *
 *   useEffect(() => {
 *     return subscribe("session.created", (event) => {
 *       console.log("New session:", event)
 *     })
 *   }, [subscribe])
 *
 *   return <div>Connection: {state}</div>
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { GlobalEvent } from "@opencode-ai/sdk/client"
import { globalClient } from "../core/client"

type ConnectionState = "connecting" | "connected" | "disconnected" | "error"

type EventHandler = (event: GlobalEvent) => void

/**
 * useSSE hook for subscribing to OpenCode real-time events
 *
 * @returns Connection state and subscribe function
 *
 * @example Subscribe to specific event type
 * ```tsx
 * const { state, subscribe } = useSSE()
 *
 * useEffect(() => {
 *   const unsubscribe = subscribe("session.created", (event) => {
 *     // event.payload.type === "session.created"
 *     // event.payload.properties.info contains Session data
 *     // event.directory contains the project directory
 *   })
 *   return unsubscribe
 * }, [subscribe])
 * ```
 *
 * @example Subscribe to all events (wildcard)
 * ```tsx
 * useEffect(() => {
 *   const unsubscribe = subscribe("*", (event) => {
 *     console.log("Any event:", event.payload.type)
 *   })
 *   return unsubscribe
 * }, [subscribe])
 * ```
 */
export function useSSE() {
	const [state, setState] = useState<ConnectionState>("connecting")
	const subscribersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
	const unmountedRef = useRef(false)
	const abortControllerRef = useRef<AbortController | null>(null)

	// Memoized subscribe function - stable reference for useEffect dependencies
	const subscribe = useCallback((eventType: string, handler: EventHandler) => {
		const subscribers = subscribersRef.current

		if (!subscribers.has(eventType)) {
			subscribers.set(eventType, new Set())
		}

		subscribers.get(eventType)!.add(handler)

		// Return unsubscribe function
		return () => {
			subscribers.get(eventType)?.delete(handler)
			if (subscribers.get(eventType)?.size === 0) {
				subscribers.delete(eventType)
			}
		}
	}, [])

	useEffect(() => {
		unmountedRef.current = false
		const abortController = new AbortController()
		abortControllerRef.current = abortController

		async function connect() {
			try {
				if (unmountedRef.current) return

				setState("connecting")
				console.log("[SSE] Connecting to", globalClient)

				// SDK provides client.global.event() which returns { stream: AsyncIterable }
				const events = await globalClient.global.event()
				console.log("[SSE] Got events object:", events)

				if (unmountedRef.current) return

				setState("connected")
				console.log("[SSE] Connected, starting to consume stream")

				// Consume the async iterable stream
				for await (const event of events.stream) {
					console.log("[SSE] Received event:", event.payload?.type)
					if (unmountedRef.current || abortController.signal.aborted) {
						break
					}

					// Broadcast to subscribers
					const eventType = event.payload?.type
					if (eventType && subscribersRef.current.has(eventType)) {
						const handlers = subscribersRef.current.get(eventType)!
						handlers.forEach((handler) => {
							try {
								handler(event)
							} catch (error) {
								console.error(`Error in SSE event handler for ${eventType}:`, error)
							}
						})
					}

					// Also broadcast to wildcard subscribers (eventType: "*")
					if (subscribersRef.current.has("*")) {
						const handlers = subscribersRef.current.get("*")!
						handlers.forEach((handler) => {
							try {
								handler(event)
							} catch (error) {
								console.error("Error in SSE wildcard event handler:", error)
							}
						})
					}
				}

				// Stream ended gracefully
				if (!unmountedRef.current) {
					setState("disconnected")
				}
			} catch (error) {
				if (!unmountedRef.current) {
					console.error("[SSE] Connection error:", error)
					console.error("[SSE] Error details:", {
						name: (error as Error).name,
						message: (error as Error).message,
						stack: (error as Error).stack,
					})
					setState("error")
				}
			}
		}

		connect()

		// Cleanup on unmount
		return () => {
			unmountedRef.current = true
			abortController.abort()
			setState("disconnected")
		}
	}, []) // Empty deps - only run once on mount

	return { state, subscribe }
}
