/**
 * OpenCodeProvider - Top-level provider that combines SSE and store
 *
 * Wraps children with SSEProvider and provides OpenCodeContext.
 * Handles:
 * - SSE connection and event routing to store
 * - Initial data bootstrap (sessions loading)
 * - Context provision with {url, directory, ready, sync}
 *
 * Per SYNC_IMPLEMENTATION.md lines 735-900.
 *
 * @example
 * ```tsx
 * <OpenCodeProvider url="http://localhost:3000" directory="/path/to/project">
 *   <App />
 * </OpenCodeProvider>
 * ```
 */

"use client"

import React, {
	createContext,
	useContext,
	useCallback,
	useState,
	useEffect,
	type ReactNode,
} from "react"
import { SSEProvider, useSSE } from "./use-sse"
import { useOpencodeStore, type Session, type Message } from "./store"
import type { GlobalEvent } from "@opencode-ai/sdk/client"

/**
 * Context value provided by OpenCodeProvider
 */
export interface OpenCodeContextValue {
	/** Base URL for OpenCode server */
	url: string
	/** Current directory being synced */
	directory: string
	/** Whether initial data has been loaded */
	ready: boolean
	/** Sync a specific session (load messages, parts, etc) */
	sync: (sessionID: string) => Promise<void>
}

const OpenCodeContext = createContext<OpenCodeContextValue | null>(null)

/**
 * OpenCodeProvider props
 */
export interface OpenCodeProviderProps {
	/** Base URL for OpenCode server */
	url: string
	/** Directory to sync */
	directory: string
	/** Children components */
	children: ReactNode
}

/**
 * Internal provider that handles SSE events
 * Separated from outer provider to have access to SSEProvider context
 */
function OpenCodeInternalProvider({ url, directory, children }: OpenCodeProviderProps) {
	const [ready, setReady] = useState(false)
	const store = useOpencodeStore()
	const { subscribe } = useSSE()

	/**
	 * Handle incoming SSE events and route to store
	 */
	const handleEvent = useCallback(
		(event: GlobalEvent) => {
			const eventDirectory = event.directory
			const payload = event.payload

			// Ignore events from other directories
			if (eventDirectory !== directory && eventDirectory !== "global") {
				return
			}

			// Route based on event type
			const eventType = payload?.type
			if (!eventType) return

			const properties = (payload as any).properties

			if (eventType === "session.created" || eventType === "session.updated") {
				const session = properties?.info as Session
				if (session) {
					const existing = store.getSession(session.id)
					if (existing) {
						store.updateSession(session.id, (draft) => {
							Object.assign(draft, session)
						})
					} else {
						store.addSession(session)
					}
				}
			} else if (eventType === "session.deleted") {
				const sessionID = properties?.sessionID
				if (sessionID) {
					store.removeSession(sessionID)
				}
			} else if (eventType === "message.updated") {
				const message = properties?.info as Message
				if (message) {
					const existing = store.getMessages(message.sessionID).find((m) => m.id === message.id)
					if (existing) {
						store.updateMessage(message.sessionID, message.id, (draft) => {
							Object.assign(draft, message)
						})
					} else {
						store.addMessage(message)
					}
				}
			} else if (eventType === "message.removed") {
				const sessionIDVal = properties?.sessionID
				const messageIDVal = properties?.messageID
				if (sessionIDVal && messageIDVal) {
					store.removeMessage(sessionIDVal, messageIDVal)
				}
			}
		},
		[directory, store],
	)

	/**
	 * Subscribe to all relevant SSE events
	 */
	useEffect(() => {
		const unsubscribers = [
			subscribe("session.created", handleEvent),
			subscribe("session.updated", handleEvent),
			subscribe("session.deleted", handleEvent),
			subscribe("message.updated", handleEvent),
			subscribe("message.removed", handleEvent),
		]

		return () => {
			for (const unsub of unsubscribers) {
				unsub()
			}
		}
	}, [subscribe, handleEvent])

	/**
	 * Sync a specific session (load messages, parts, etc)
	 * Implementation would call SDK methods to fetch data
	 */
	const sync = useCallback(async (sessionID: string) => {
		// TODO: Implement actual sync via SDK
		// For now, this is a no-op
		console.log("Sync session:", sessionID)
	}, [])

	const value: OpenCodeContextValue = {
		url,
		directory,
		ready,
		sync,
	}

	return <OpenCodeContext.Provider value={value}>{children}</OpenCodeContext.Provider>
}

/**
 * OpenCodeProvider - Wraps SSEProvider and provides OpenCode context
 */
export function OpenCodeProvider({ url, directory, children }: OpenCodeProviderProps) {
	return (
		<SSEProvider url={url}>
			<OpenCodeInternalProvider url={url} directory={directory}>
				{children}
			</OpenCodeInternalProvider>
		</SSEProvider>
	)
}

/**
 * useOpenCode - Hook to access OpenCode context
 *
 * Must be used within an OpenCodeProvider.
 *
 * @returns OpenCodeContextValue with url, directory, ready, sync
 * @throws Error if used outside OpenCodeProvider
 *
 * @example
 * ```tsx
 * const { url, directory, ready, sync } = useOpenCode()
 *
 * useEffect(() => {
 *   if (ready) {
 *     sync(sessionID)
 *   }
 * }, [ready, sessionID, sync])
 * ```
 */
export function useOpenCode(): OpenCodeContextValue {
	const context = useContext(OpenCodeContext)
	if (!context) {
		throw new Error("useOpenCode must be used within OpenCodeProvider")
	}
	return context
}
