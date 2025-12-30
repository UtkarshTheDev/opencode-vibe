/**
 * useSession - Bridge Promise API to React state
 *
 * Wraps sessions.get from @opencode-vibe/core/api and manages React state.
 * Provides loading, error, and data states for a single session.
 *
 * @example
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const { session, loading, error, refetch } = useSession({ sessionId })
 *
 *   if (loading) return <div>Loading session...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *   if (!session) return <div>Session not found</div>
 *
 *   return <div>{session.title}</div>
 * }
 * ```
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { sessions } from "@opencode-vibe/core/api"
import type { Session } from "@opencode-vibe/core/types"

export interface UseSessionOptions {
	/** Session ID to fetch */
	sessionId: string
	/** Project directory (optional) */
	directory?: string
}

export interface UseSessionReturn {
	/** Session data or null if not found */
	session: Session | null
	/** Loading state */
	loading: boolean
	/** Error if fetch failed */
	error: Error | null
	/** Refetch session */
	refetch: () => void
}

/**
 * Hook to fetch a single session using Promise API from core
 *
 * @param options - Options with sessionId and optional directory
 * @returns Object with session, loading, error, and refetch
 */
export function useSession(options: UseSessionOptions): UseSessionReturn {
	const [session, setSession] = useState<Session | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	const fetch = useCallback(() => {
		setLoading(true)
		setError(null)

		sessions
			.get(options.sessionId, options.directory)
			.then((data: Session | null) => {
				setSession(data)
				setError(null)
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				setSession(null)
			})
			.finally(() => {
				setLoading(false)
			})
	}, [options.sessionId, options.directory])

	useEffect(() => {
		fetch()
	}, [fetch])

	return {
		session,
		loading,
		error,
		refetch: fetch,
	}
}
