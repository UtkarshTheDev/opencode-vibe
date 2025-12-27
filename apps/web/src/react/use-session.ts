/**
 * useSession - Fetch and subscribe to real-time session updates
 *
 * Fetches a session by ID and subscribes to SSE for real-time updates.
 * Handles loading/error states and automatically re-fetches on SSE updates.
 *
 * Usage:
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const { session, loading, error } = useSession(sessionId)
 *
 *   if (loading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *   if (!session) return <div>Session not found</div>
 *
 *   return <div>{session.title}</div>
 * }
 * ```
 */

import { useEffect, useState } from "react"
import type { Session } from "@opencode-ai/sdk/client"
import { createClient } from "../core/client"
import { useSSE } from "./use-sse"

interface UseSessionReturn {
	session: Session | null
	loading: boolean
	error: Error | null
}

/**
 * Fetch a session by ID and subscribe to real-time updates via SSE
 *
 * @param sessionId - The session ID to fetch
 * @param directory - Optional directory to scope the request to a specific project
 * @returns Session data, loading state, and error state
 *
 * @example Basic usage
 * ```tsx
 * function SessionDetail({ id }: { id: string }) {
 *   const { session, loading, error } = useSession(id)
 *
 *   if (loading) return <Spinner />
 *   if (error) return <ErrorBanner error={error} />
 *   if (!session) return null
 *
 *   return (
 *     <div>
 *       <h1>{session.title}</h1>
 *       <p>Created: {new Date(session.time.created).toLocaleString()}</p>
 *     </div>
 *   )
 * }
 * ```
 *
 * @example With directory scoping
 * ```tsx
 * function SessionDetail({ id, dir }: { id: string; dir: string }) {
 *   const { session, loading, error } = useSession(id, dir)
 *   // ...
 * }
 * ```
 */
export function useSession(sessionId: string, directory?: string): UseSessionReturn {
	const [session, setSession] = useState<Session | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)
	const { subscribe } = useSSE()

	// Initial fetch
	useEffect(() => {
		let cancelled = false

		async function fetchSession() {
			try {
				setLoading(true)
				setError(null)

				const client = createClient(directory)
				const result = await client.session.get({
					path: { id: sessionId },
				})

				if (cancelled) return

				// The SDK returns { data: Session, error: undefined } on success
				if (result.data) {
					setSession(result.data)
				} else if (result.error) {
					// BadRequestError | NotFoundError don't have message property
					// Use generic error message for now
					throw new Error("Failed to fetch session")
				}
			} catch (err) {
				if (cancelled) return
				setError(err instanceof Error ? err : new Error(String(err)))
			} finally {
				if (!cancelled) {
					setLoading(false)
				}
			}
		}

		fetchSession()

		return () => {
			cancelled = true
		}
	}, [sessionId, directory])

	// Subscribe to SSE updates for this session
	useEffect(() => {
		const unsubscribe = subscribe("session.updated", (event) => {
			// event.payload.type === "session.updated"
			// event.payload.properties.info contains the updated Session
			if (
				event.payload.type === "session.updated" &&
				event.payload.properties.info.id === sessionId
			) {
				setSession(event.payload.properties.info)
			}
		})

		return unsubscribe
	}, [sessionId, subscribe])

	return { session, loading, error }
}
