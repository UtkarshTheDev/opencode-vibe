/**
 * Hook for tracking context usage in a session
 *
 * Subscribes to SSE events and tracks token usage in real-time.
 */

"use client"

import { useState, useCallback } from "react"
import { useMultiServerSSE } from "./use-multi-server-sse"
import type { GlobalEvent } from "../types/events"

export interface UseContextUsageOptions {
	sessionId: string
	directory?: string
}

export interface ContextUsageState {
	used: number
	limit: number
	percentage: number
	remaining: number
	isNearLimit: boolean
	tokens: {
		input: number
		output: number
		cached: number
	}
}

const DEFAULT_STATE: ContextUsageState = {
	used: 0,
	limit: 200000,
	percentage: 0,
	remaining: 200000,
	isNearLimit: false,
	tokens: {
		input: 0,
		output: 0,
		cached: 0,
	},
}

/**
 * Extract token data from SSE event payload
 */
function extractTokens(
	event: GlobalEvent,
): { input: number; output: number; cached: number } | null {
	const props = event.payload.properties as {
		tokens?: {
			input?: number
			output?: number
			cache?: { read?: number; write?: number }
		}
	}

	if (!props.tokens) return null

	return {
		input: props.tokens.input ?? 0,
		output: props.tokens.output ?? 0,
		cached: props.tokens.cache?.read ?? 0,
	}
}

/**
 * Calculate derived context usage state from token data
 */
function calculateContextUsage(
	tokens: { input: number; output: number; cached: number },
	limit = 200000,
): ContextUsageState {
	const used = tokens.input + tokens.output
	const percentage = (used / limit) * 100
	const remaining = limit - used
	const isNearLimit = percentage > 80

	return {
		used,
		limit,
		percentage,
		remaining,
		isNearLimit,
		tokens: {
			input: tokens.input,
			output: tokens.output,
			cached: tokens.cached,
		},
	}
}

/**
 * Hook for accessing context usage state
 *
 * Subscribes to SSE events and tracks cumulative token usage for the session.
 *
 * @param options - Session ID and optional directory
 * @returns Context usage state that updates in real-time
 */
export function useContextUsage(options: UseContextUsageOptions): ContextUsageState {
	const { sessionId } = options
	const [state, setState] = useState<ContextUsageState>(DEFAULT_STATE)

	// Handle SSE events
	const handleEvent = useCallback(
		(event: GlobalEvent) => {
			// Filter events by sessionId
			const props = event.payload.properties as { sessionID?: string }
			if (props.sessionID !== sessionId) return

			// Extract token data
			const tokens = extractTokens(event)
			if (!tokens) return

			// Update state with cumulative tokens
			setState((prev) => {
				const cumulative = {
					input: prev.tokens.input + tokens.input,
					output: prev.tokens.output + tokens.output,
					cached: prev.tokens.cached + tokens.cached,
				}

				return calculateContextUsage(cumulative)
			})
		},
		[sessionId],
	)

	// Subscribe to SSE events
	useMultiServerSSE({ onEvent: handleEvent })

	return state
}

/**
 * Format token count with K/M suffix
 *
 * @param n - Token count
 * @returns Formatted string (e.g., "1.5K", "2.3M")
 */
export function formatTokens(n: number): string {
	if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
	if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
	return n.toString()
}
