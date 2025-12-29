/**
 * useMessagesWithParts - Hook for accessing messages with their parts
 *
 * Combines messages and parts from the Zustand store into OpenCodeMessage format.
 * Real-time updates are handled automatically by useMultiServerSSE which
 * updates the store with events from ALL discovered OpenCode servers.
 *
 * This hook replaces the local state management in SessionMessages,
 * ensuring consistent real-time updates across all clients.
 *
 * PERFORMANCE: Uses useDeferredValue to debounce streaming updates.
 * During streaming, Zustand/Immer creates new object references on every part update.
 * useDeferredValue delays non-urgent updates, reducing transformMessages calls
 * from ~200-300 to ~10-20 during a typical stream.
 *
 * @example
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const messages = useMessagesWithParts(sessionId)
 *
 *   return <div>{messages.map(msg => <Message key={msg.info.id} {...msg} />)}</div>
 * }
 * ```
 */

import { useMemo, useDeferredValue, useEffect, useRef } from "react"
import { useOpencodeStore, type Message, type Part } from "./store"
import { useOpenCode } from "./provider"
import type { OpenCodeMessage } from "@/lib/transform-messages"

/**
 * Empty constants to avoid re-rendering when no data exists
 * CRITICAL: These must be stable references to prevent infinite loops
 * in useSyncExternalStore (which Zustand uses internally)
 */
const EMPTY_MESSAGES: Message[] = []
const EMPTY_PARTS: Part[] = []
const EMPTY_PARTS_MAP: Record<string, Part[]> = {}

/**
 * useMessagesWithParts - Hook for accessing session messages with their parts
 *
 * Reads from Zustand store and combines messages with their parts.
 * Store is automatically updated by useMultiServerSSE which receives
 * events from ALL discovered OpenCode servers (TUIs, serve processes, etc.)
 *
 * @param sessionId - ID of the session to get messages for
 * @returns Array of OpenCodeMessage (message info + parts) for the session
 */
export function useMessagesWithParts(sessionId: string): OpenCodeMessage[] {
	const { directory } = useOpenCode()

	// DIAGNOSTIC: Track render count and previous values
	const renderCount = useRef(0)
	const prevMessages = useRef<Message[] | null>(null)
	const prevPartsMap = useRef<Record<string, Part[]> | null>(null)
	const prevDeferredPartsMap = useRef<Record<string, Part[]> | null>(null)

	renderCount.current++
	const currentRender = renderCount.current

	console.log(`[HOOK] useMessagesWithParts render #${currentRender}`, {
		sessionId,
		directory,
		timestamp: Date.now(),
	})

	// Get messages from store (reactive - updates when store changes)
	const messages = useOpencodeStore(
		(state) => state.directories[directory]?.messages[sessionId] || EMPTY_MESSAGES,
	)

	// DIAGNOSTIC: Track when messages selector changes
	useEffect(() => {
		const messagesChanged = prevMessages.current !== messages
		const referenceChanged = prevMessages.current !== messages && prevMessages.current !== null

		console.log(`[HOOK] messages selector effect`, {
			render: currentRender,
			messagesChanged,
			referenceChanged,
			messagesLength: messages.length,
			prevLength: prevMessages.current?.length ?? 0,
			sameReference: prevMessages.current === messages,
			isEmptyConstant: messages === EMPTY_MESSAGES,
			messageIds: messages.map((m) => m.id),
		})

		prevMessages.current = messages
	}, [messages, currentRender])

	// Get all parts for this session's messages
	// We need to subscribe to the parts object to get updates
	// CRITICAL: Use stable EMPTY_PARTS_MAP reference to avoid infinite loop in useSyncExternalStore
	const partsMap = useOpencodeStore(
		(state) => state.directories[directory]?.parts ?? EMPTY_PARTS_MAP,
	)

	// DIAGNOSTIC: Track when partsMap selector changes
	useEffect(() => {
		const partsMapChanged = prevPartsMap.current !== partsMap
		const referenceChanged = prevPartsMap.current !== partsMap && prevPartsMap.current !== null

		// Count how many messages have parts
		const messagesWithParts = messages.filter((m) => partsMap[m.id]?.length > 0).length
		const partCounts = messages.map((m) => ({
			messageId: m.id,
			partCount: partsMap[m.id]?.length ?? 0,
			partIds: partsMap[m.id]?.map((p) => p.id) ?? [],
		}))

		console.log(`[HOOK] partsMap selector effect`, {
			render: currentRender,
			partsMapChanged,
			referenceChanged,
			sameReference: prevPartsMap.current === partsMap,
			isEmptyConstant: partsMap === EMPTY_PARTS_MAP,
			messagesWithParts,
			partCounts,
			totalPartArrays: Object.keys(partsMap).length,
		})

		prevPartsMap.current = partsMap
	}, [partsMap, messages, currentRender])

	// Defer parts updates to debounce streaming updates
	// React will prioritize urgent updates (user input) over deferred values
	// This reduces re-renders from ~200-300 to ~10-20 during streaming
	const deferredPartsMap = useDeferredValue(partsMap)

	// DIAGNOSTIC: Track when deferred value updates (lags behind partsMap)
	useEffect(() => {
		const deferredChanged = prevDeferredPartsMap.current !== deferredPartsMap
		const lagBehind = deferredPartsMap !== partsMap

		console.log(`[HOOK] deferredPartsMap effect`, {
			render: currentRender,
			deferredChanged,
			lagBehind,
			partsMapRef: partsMap === prevPartsMap.current ? "SAME" : "DIFFERENT",
			deferredRef: deferredPartsMap === prevDeferredPartsMap.current ? "SAME" : "DIFFERENT",
			isEmptyConstant: deferredPartsMap === EMPTY_PARTS_MAP,
		})

		prevDeferredPartsMap.current = deferredPartsMap
	}, [deferredPartsMap, partsMap, currentRender])

	// Combine messages with their parts
	// Memoize to avoid unnecessary recalculations
	const messagesWithParts = useMemo(() => {
		console.log(`[HOOK] useMemo recalculating messagesWithParts`, {
			render: currentRender,
			messagesLength: messages.length,
			deferredPartsMapKeys: Object.keys(deferredPartsMap).length,
			timestamp: Date.now(),
		})

		const result = messages.map((message): OpenCodeMessage => {
			const parts = deferredPartsMap[message.id] || EMPTY_PARTS
			console.log(`[HOOK] combining message ${message.id}`, {
				hasParts: parts !== EMPTY_PARTS,
				partCount: parts.length,
				partIds: parts.map((p) => p.id),
				// Log summary specifically for ToolPart state tracking
				partSummaries: parts.map((p) => ({
					id: p.id,
					type: p.type,
					summary: (p as any).state?.metadata?.summary || (p.metadata as any)?.summary,
				})),
			})

			return {
				info: message as unknown as OpenCodeMessage["info"],
				parts: parts as unknown as OpenCodeMessage["parts"],
			}
		})

		console.log(`[HOOK] useMemo complete`, {
			render: currentRender,
			resultLength: result.length,
		})

		return result
	}, [messages, deferredPartsMap, currentRender])

	// DIAGNOSTIC: Log final return
	console.log(`[HOOK] useMessagesWithParts returning`, {
		render: currentRender,
		messagesWithPartsLength: messagesWithParts.length,
		timestamp: Date.now(),
	})

	return messagesWithParts
}
