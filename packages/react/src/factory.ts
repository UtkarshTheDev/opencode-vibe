/**
 * generateOpencodeHelpers - Factory for provider-free hooks
 *
 * Pattern: uploadthing's generateReactHelpers approach
 *
 * Usage:
 * ```tsx
 * // app/hooks.ts (create once)
 * export const { useSession, useSendMessage } = generateOpencodeHelpers()
 *
 * // components/session.tsx
 * import { useSession } from "@/app/hooks"
 * const session = useSession(id) // Just works, no provider
 * ```
 */
"use client"

import { useCallback, useEffect } from "react"
import type { OpencodeConfig } from "./next-ssr-plugin"
import { useOpencodeStore } from "./store"
import { useSendMessage as useBaseSendMessage } from "./hooks/use-send-message"
import type { Prompt } from "./types/prompt"

/**
 * Global config type augmentation
 */
declare global {
	interface Window {
		__OPENCODE?: OpencodeConfig
	}
}

/**
 * Get OpenCode configuration from globalThis (injected by SSR plugin)
 *
 * @param fallback - Optional fallback config for tests
 * @returns OpencodeConfig
 * @throws Error if no config found and no fallback provided
 *
 * @example
 * ```tsx
 * const config = getOpencodeConfig()
 * // { baseUrl: "/api/opencode/4056", directory: "/path" }
 * ```
 */
export function getOpencodeConfig(fallback?: OpencodeConfig): OpencodeConfig {
	// 1. Check globalThis (from SSR plugin)
	if (typeof window !== "undefined" && window.__OPENCODE) {
		return window.__OPENCODE
	}

	// 2. Fallback to provided config (for tests)
	if (fallback?.baseUrl) {
		return fallback
	}

	// 3. No config available - throw helpful error
	throw new Error(
		"OpenCode: No configuration found. " +
			"Did you forget to add <OpencodeSSRPlugin> to your layout?",
	)
}

/**
 * Factory function that creates type-safe OpenCode hooks
 *
 * @param config - Optional config for tests (production uses globalThis)
 * @returns Object with all OpenCode hooks
 *
 * @example
 * ```tsx
 * // app/hooks.ts
 * export const { useSession, useMessages, useSendMessage } = generateOpencodeHelpers()
 *
 * // component.tsx
 * import { useSession } from "@/app/hooks"
 * const session = useSession("session-123")
 * ```
 */
export function generateOpencodeHelpers<TRouter = any>(config?: OpencodeConfig) {
	/**
	 * Hook for accessing session data with real-time SSE updates
	 *
	 * @param sessionId - Session ID to fetch
	 * @returns Session object or undefined if not found
	 *
	 * @example
	 * ```tsx
	 * const session = useSession("session-123")
	 * if (session) {
	 *   console.log(session.title)
	 * }
	 * ```
	 */
	function useSession(sessionId: string) {
		const cfg = getOpencodeConfig(config)

		// Use Zustand store selector with useCallback to prevent unnecessary re-renders
		const session = useOpencodeStore(
			useCallback(
				(state) => {
					const dir = state.directories[cfg.directory]
					if (!dir) return undefined
					return dir.sessions.find((s) => s.id === sessionId)
				},
				[sessionId, cfg.directory],
			),
		)

		// Initialize directory on mount
		useEffect(() => {
			if (!cfg.directory) return
			useOpencodeStore.getState().initDirectory(cfg.directory)
		}, [cfg.directory])

		return session
	}

	/**
	 * Hook for accessing messages in a session with real-time updates
	 *
	 * @param sessionId - Session ID to get messages for
	 * @returns Array of messages for the session
	 *
	 * @example
	 * ```tsx
	 * const messages = useMessages("session-123")
	 * console.log(`${messages.length} messages`)
	 * ```
	 */
	function useMessages(sessionId: string) {
		const cfg = getOpencodeConfig(config)

		const messages = useOpencodeStore(
			useCallback(
				(state) => {
					const dir = state.directories[cfg.directory]
					if (!dir) return []
					return dir.messages[sessionId] || []
				},
				[sessionId, cfg.directory],
			),
		)

		useEffect(() => {
			if (!cfg.directory) return
			useOpencodeStore.getState().initDirectory(cfg.directory)
		}, [cfg.directory])

		return messages
	}

	/**
	 * Hook for sending messages to a session
	 *
	 * @param options - Session ID and optional directory
	 * @returns sendMessage function and isPending state
	 *
	 * @example
	 * ```tsx
	 * const { sendMessage, isPending } = useSendMessage({ sessionId: "session-123" })
	 * await sendMessage({ text: "Hello" })
	 * ```
	 */
	function useSendMessage(options: { sessionId: string }) {
		const cfg = getOpencodeConfig(config)

		// Use the existing useSendMessage hook from hooks/
		const { sendMessage: baseSendMessage, isLoading } = useBaseSendMessage({
			sessionId: options.sessionId,
			directory: cfg.directory,
		})

		// Wrap sendMessage to accept simplified { text: string } input
		const sendMessage = useCallback(
			async (input: { text: string }) => {
				// Convert simple text input to Prompt format
				const parts: Prompt = [
					{
						type: "text",
						content: input.text,
						start: 0,
						end: input.text.length,
					},
				]

				await baseSendMessage(parts)
			},
			[baseSendMessage],
		)

		return { sendMessage, isPending: isLoading }
	}

	return {
		useSession,
		useMessages,
		useSendMessage,
	}
}
