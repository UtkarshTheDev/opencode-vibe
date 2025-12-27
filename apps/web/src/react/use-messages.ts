/**
 * useMessages - Fetch and subscribe to messages for a session
 *
 * Fetches initial messages via SDK and subscribes to SSE for real-time updates.
 * Handles message creation, updates, and part updates (tool calls, results).
 *
 * Usage:
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const { messages, loading, error } = useMessages(sessionId)
 *
 *   if (loading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *
 *   return <div>{messages.map(msg => <Message key={msg.id} {...msg} />)}</div>
 * }
 * ```
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Message, Part } from "@opencode-ai/sdk/client"
import type { UIMessage } from "ai"
import { createClient } from "../core/client"
import { useSSE } from "./use-sse"
import { transformMessages, type OpenCodeMessage } from "../lib/transform-messages"

interface UseMessagesResult {
	/** Messages for the session, transformed to ai-elements UIMessage format */
	messages: UIMessage[]
	/** True while fetching initial messages */
	loading: boolean
	/** Error from fetching or processing messages */
	error: Error | null
	/** Refetch messages from server */
	refetch: () => Promise<void>
}

/**
 * useMessages hook for fetching and subscribing to session messages
 *
 * @param sessionId - Session ID to fetch messages for
 * @param directory - Optional directory to scope the request to a specific project
 * @returns Messages array, loading state, error, and refetch function
 *
 * @example Basic usage
 * ```tsx
 * const { messages, loading, error } = useMessages("session-123")
 * ```
 *
 * @example With directory scoping
 * ```tsx
 * const { messages, loading, error } = useMessages("session-123", "/path/to/project")
 * ```
 *
 * @example With refetch
 * ```tsx
 * const { messages, refetch } = useMessages("session-123")
 * <button onClick={refetch}>Refresh</button>
 * ```
 */
export function useMessages(sessionId: string, directory?: string): UseMessagesResult {
	// Store raw SDK messages internally
	const [rawMessages, setRawMessages] = useState<OpenCodeMessage[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)
	const { subscribe } = useSSE()

	// Transform raw messages to UIMessage format for ai-elements
	const messages = useMemo(() => transformMessages(rawMessages), [rawMessages])

	// Fetch messages from server
	const fetchMessages = useCallback(async () => {
		try {
			setLoading(true)
			setError(null)

			const client = createClient(directory)
			const response = await client.session.messages({
				path: { id: sessionId },
			})

			// SDK returns { data: Message[] } structure
			// Convert to OpenCodeMessage format: {info: Message, parts: Part[]}
			if (response.data) {
				const opencodeMessages: OpenCodeMessage[] = response.data.map((msg) => ({
					info: msg,
					parts: (msg.parts as Part[]) || [],
				}))
				setRawMessages(opencodeMessages)
			} else {
				setRawMessages([])
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err))
			setError(error)
			console.error(`Failed to fetch messages for session ${sessionId}:`, error)
		} finally {
			setLoading(false)
		}
	}, [sessionId, directory])

	// Initial fetch
	useEffect(() => {
		fetchMessages()
	}, [fetchMessages])

	// Subscribe to SSE events for real-time updates
	useEffect(() => {
		// message.created - new message in any session
		const unsubscribeCreated = subscribe("message.created", (event) => {
			// event.payload.properties.info contains Message data
			// event.payload.properties.sessionID tells us which session
			const messageData = event.payload?.properties?.info as Message | undefined
			const messageSessionId = event.payload?.properties?.sessionID as string | undefined

			if (messageSessionId === sessionId && messageData) {
				// Convert to OpenCodeMessage format
				const opencodeMsg: OpenCodeMessage = {
					info: messageData,
					parts: (messageData.parts as Part[]) || [],
				}

				setRawMessages((prev) => {
					// Dedupe - don't add if already exists
					if (prev.some((msg) => msg.info.id === opencodeMsg.info.id)) {
						return prev
					}
					// Add new message, maintain chronological order
					return [...prev, opencodeMsg].sort(
						(a, b) => new Date(a.info.createdAt).getTime() - new Date(b.info.createdAt).getTime(),
					)
				})
			}
		})

		// message.updated - message content or metadata changed
		const unsubscribeUpdated = subscribe("message.updated", (event) => {
			const messageData = event.payload?.properties?.info as Message | undefined
			const messageSessionId = event.payload?.properties?.sessionID as string | undefined

			if (messageSessionId === sessionId && messageData) {
				// Convert to OpenCodeMessage format
				const opencodeMsg: OpenCodeMessage = {
					info: messageData,
					parts: (messageData.parts as Part[]) || [],
				}

				setRawMessages((prev) =>
					prev.map((msg) => (msg.info.id === opencodeMsg.info.id ? opencodeMsg : msg)),
				)
			}
		})

		// message.part.updated - tool calls, results, streaming chunks
		const unsubscribePartUpdated = subscribe("message.part.updated", (event) => {
			const messageData = event.payload?.properties?.info as Message | undefined
			const messageSessionId = event.payload?.properties?.sessionID as string | undefined

			if (messageSessionId === sessionId && messageData) {
				// Convert to OpenCodeMessage format
				const opencodeMsg: OpenCodeMessage = {
					info: messageData,
					parts: (messageData.parts as Part[]) || [],
				}

				setRawMessages((prev) =>
					prev.map((msg) => (msg.info.id === opencodeMsg.info.id ? opencodeMsg : msg)),
				)
			}
		})

		// Cleanup subscriptions
		return () => {
			unsubscribeCreated()
			unsubscribeUpdated()
			unsubscribePartUpdated()
		}
	}, [sessionId, subscribe])

	return {
		messages,
		loading,
		error,
		refetch: fetchMessages,
	}
}
