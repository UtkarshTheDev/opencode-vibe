/**
 * useParts - Bridge Promise API to React state
 *
 * Wraps parts.list from @opencode-vibe/core/api and manages React state.
 * Provides loading, error, and data states for part list.
 *
 * @example
 * ```tsx
 * function PartList({ sessionId }: { sessionId: string }) {
 *   const { parts, loading, error, refetch } = useParts({ sessionId })
 *
 *   if (loading) return <div>Loading parts...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *
 *   return (
 *     <ul>
 *       {parts.map(p => <li key={p.id}>{p.type}</li>)}
 *     </ul>
 *   )
 * }
 * ```
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { parts } from "@opencode-vibe/core/api"
import type { Part } from "@opencode-vibe/core/types"

export interface UsePartsOptions {
	/** Session ID to fetch parts for */
	sessionId: string
	/** Project directory (optional) */
	directory?: string
}

export interface UsePartsReturn {
	/** Array of parts, sorted by ID */
	parts: Part[]
	/** Loading state */
	loading: boolean
	/** Error if fetch failed */
	error: Error | null
	/** Refetch parts */
	refetch: () => void
}

/**
 * Hook to fetch part list using Promise API from core
 *
 * @param options - Options with sessionId and optional directory
 * @returns Object with parts, loading, error, and refetch
 */
export function useParts(options: UsePartsOptions): UsePartsReturn {
	const [partList, setPartList] = useState<Part[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	const fetch = useCallback(() => {
		setLoading(true)
		setError(null)

		parts
			.list(options.sessionId, options.directory)
			.then((data: Part[]) => {
				setPartList(data)
				setError(null)
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				setPartList([])
			})
			.finally(() => {
				setLoading(false)
			})
	}, [options.sessionId, options.directory])

	useEffect(() => {
		fetch()
	}, [fetch])

	return {
		parts: partList,
		loading,
		error,
		refetch: fetch,
	}
}
