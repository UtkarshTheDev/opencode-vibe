/**
 * useMessages - Bridge Promise API to React state
 *
 * Wraps messages.list from @opencode-vibe/core/api and manages React state.
 * Provides loading, error, and data states for message list.
 *
 * @example
 * ```tsx
 * function MessageList({ sessionId }: { sessionId: string }) {
 *   const { messages, loading, error, refetch } = useMessages({ sessionId })
 *
 *   if (loading) return <div>Loading messages...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *
 *   return (
 *     <ul>
 *       {messages.map(m => <li key={m.id}>{m.role}: {m.id}</li>)}
 *     </ul>
 *   )
 * }
 * ```
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { messages } from "@opencode-vibe/core/api"
import type { Message } from "@opencode-vibe/core/types"

export interface UseMessagesOptions {
	/** Session ID to fetch messages for */
	sessionId: string
	/** Project directory (optional) */
	directory?: string
}

export interface UseMessagesReturn {
	/** Array of messages, sorted by ID */
	messages: Message[]
	/** Loading state */
	loading: boolean
	/** Error if fetch failed */
	error: Error | null
	/** Refetch messages */
	refetch: () => void
}

/**
 * Hook to fetch message list using Promise API from core
 *
 * @param options - Options with sessionId and optional directory
 * @returns Object with messages, loading, error, and refetch
 */
export function useMessages(options: UseMessagesOptions): UseMessagesReturn {
	const [messageList, setMessageList] = useState<Message[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	const fetch = useCallback(() => {
		setLoading(true)
		setError(null)

		messages
			.list(options.sessionId, options.directory)
			.then((data: Message[]) => {
				setMessageList(data)
				setError(null)
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				setMessageList([])
			})
			.finally(() => {
				setLoading(false)
			})
	}, [options.sessionId, options.directory])

	useEffect(() => {
		fetch()
	}, [fetch])

	return {
		messages: messageList,
		loading,
		error,
		refetch: fetch,
	}
}
