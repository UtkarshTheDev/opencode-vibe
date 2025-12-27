/**
 * useSession - Hook for accessing session data with real-time updates
 *
 * Combines Zustand store with SSE subscriptions to provide reactive
 * session data. Subscribes to session.updated events and automatically
 * updates the store when events arrive.
 *
 * @example
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const session = useSession(sessionId)
 *
 *   if (!session) return <div>Session not found</div>
 *
 *   return <div>{session.title}</div>
 * }
 * ```
 */

import { useEffect } from "react"
import { useSSE } from "./use-sse"
import { useOpencodeStore, type Session } from "./store"

/**
 * useSession - Get session from store and subscribe to updates
 *
 * @param sessionId - ID of the session to retrieve
 * @returns Session object or undefined if not found
 */
export function useSession(sessionId: string): Session | undefined {
	const { subscribe } = useSSE()

	// Get session from store (reactive - updates when store changes)
	const session = useOpencodeStore((state) => state.getSession(sessionId))

	// Subscribe to session.updated events
	useEffect(() => {
		const unsubscribe = subscribe("session.updated", (event) => {
			// Safely extract properties from event payload
			const props = event.payload?.properties as { info?: Session } | undefined
			const sessionData = props?.info
			if (!sessionData) return

			// Only update if this is our session
			if (sessionData.id === sessionId) {
				useOpencodeStore.getState().addSession(sessionData)
			}
		})

		return unsubscribe
	}, [sessionId, subscribe])

	return session
}
