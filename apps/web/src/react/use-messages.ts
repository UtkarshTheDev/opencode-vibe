/**
 * useMessages - Hook for accessing messages with real-time updates
 *
 * Combines Zustand store with SSE subscriptions to provide reactive
 * message data. Subscribes to message.created, message.updated, and
 * message.part.updated events and automatically updates the store.
 *
 * @example
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const messages = useMessages(sessionId)
 *
 *   return <div>{messages.map(msg => <Message key={msg.id} {...msg} />)}</div>
 * }
 * ```
 */

import { useEffect, useRef } from "react"
import { useSSE } from "./use-sse"
import { useOpencodeStore, type Message } from "./store"

// Reusable empty array to avoid creating new references
const EMPTY_MESSAGES: Message[] = []

/**
 * useMessages - Get messages from store and subscribe to updates
 *
 * @param sessionId - ID of the session to retrieve messages for
 * @returns Array of messages for the session (empty if none exist)
 */
export function useMessages(sessionId: string): Message[] {
	const { subscribe } = useSSE()

	// Get messages from store (reactive - updates when store changes)
	// Return stable EMPTY_MESSAGES reference when no messages exist
	const messages = useOpencodeStore((state) => state.messages[sessionId] || EMPTY_MESSAGES)

	// Subscribe to SSE events for real-time updates
	useEffect(() => {
		// Helper to safely extract properties from event payload
		const getProperties = (event: { payload?: { properties?: unknown } }) => {
			return event.payload?.properties as { info?: Message; sessionID?: string } | undefined
		}

		// message.created - new message in any session
		const unsubscribeCreated = subscribe("message.created", (event) => {
			// event.payload.properties.info contains Message data
			// event.payload.properties.sessionID tells us which session
			const props = getProperties(event)
			const messageData = props?.info
			const messageSessionId = props?.sessionID

			if (messageSessionId === sessionId && messageData) {
				// Check if message already exists (dedupe)
				const store = useOpencodeStore.getState()
				const existingMessages = store.messages[sessionId] || []
				const exists = existingMessages.some((msg) => msg.id === messageData.id)

				if (!exists) {
					store.addMessage(messageData)
				}
			}
		})

		// message.updated - message content or metadata changed
		const unsubscribeUpdated = subscribe("message.updated", (event) => {
			const props = getProperties(event)
			const messageData = props?.info
			const messageSessionId = props?.sessionID

			if (messageSessionId === sessionId && messageData) {
				// Update entire message with new data
				useOpencodeStore.getState().updateMessage(sessionId, messageData.id, (draft) => {
					Object.assign(draft, messageData)
				})
			}
		})

		// message.part.updated - tool calls, results, streaming chunks
		const unsubscribePartUpdated = subscribe("message.part.updated", (event) => {
			const props = getProperties(event)
			const messageData = props?.info
			const messageSessionId = props?.sessionID

			if (messageSessionId === sessionId && messageData) {
				// Update entire message with new data (includes parts)
				useOpencodeStore.getState().updateMessage(sessionId, messageData.id, (draft) => {
					Object.assign(draft, messageData)
				})
			}
		})

		// Cleanup subscriptions
		return () => {
			unsubscribeCreated()
			unsubscribeUpdated()
			unsubscribePartUpdated()
		}
	}, [sessionId, subscribe])

	return messages
}
