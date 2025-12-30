/**
 * useMessagesWithParts - Composition hook combining messages and parts
 *
 * Combines useMessages and useParts hooks to provide a unified view
 * of messages with their associated parts.
 *
 * @example
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const { messages, loading, error } = useMessagesWithParts({ sessionId })
 *
 *   if (loading) return <div>Loading...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *
 *   return (
 *     <div>
 *       {messages.map(msg => (
 *         <div key={msg.info.id}>
 *           <p>{msg.info.role}</p>
 *           {msg.parts.map(p => <span key={p.id}>{p.content}</span>)}
 *         </div>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */

"use client"

import { useMemo } from "react"
import { useMessages } from "./use-messages"
import { useParts } from "./use-parts"
import type { Message, Part } from "@opencode-vibe/core/types"

export interface UseMessagesWithPartsOptions {
	/** Session ID to fetch messages for */
	sessionId: string
	/** Project directory (optional) */
	directory?: string
}

export interface OpenCodeMessage {
	/** Message metadata */
	info: Message
	/** Parts associated with this message */
	parts: Part[]
}

export interface UseMessagesWithPartsReturn {
	/** Array of messages with their parts */
	messages: OpenCodeMessage[]
	/** Loading state - true if either messages or parts are loading */
	loading: boolean
	/** Error from either hook - messages error takes precedence */
	error: Error | null
	/** Refetch both messages and parts */
	refetch: () => Promise<void>
}

/**
 * Hook to fetch messages with their associated parts
 *
 * @param options - Options with sessionId and optional directory
 * @returns Object with messages (with parts), loading, error, and refetch
 */
export function useMessagesWithParts(
	options: UseMessagesWithPartsOptions,
): UseMessagesWithPartsReturn {
	const {
		messages: messageList,
		loading: messagesLoading,
		error: messagesError,
		refetch: refetchMessages,
	} = useMessages(options)

	const {
		parts: partList,
		loading: partsLoading,
		error: partsError,
		refetch: refetchParts,
	} = useParts(options)

	// Combine messages with their parts
	const messages = useMemo(() => {
		return messageList.map((message) => ({
			info: message,
			parts: partList.filter((part) => part.messageID === message.id),
		}))
	}, [messageList, partList])

	// Loading if either hook is loading
	const loading = messagesLoading || partsLoading

	// Error from either hook - messages error takes precedence
	const error = messagesError || partsError

	// Combined refetch
	const refetch = async () => {
		await Promise.all([refetchMessages(), refetchParts()])
	}

	return {
		messages,
		loading,
		error,
		refetch,
	}
}
