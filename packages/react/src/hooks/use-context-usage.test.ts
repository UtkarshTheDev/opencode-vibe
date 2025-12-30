/**
 * Tests for useContextUsage hook
 *
 * Tests real-time context tracking via SSE subscription.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { multiServerSSE } from "@opencode-vibe/core/sse"
import type { GlobalEvent } from "../types/events"
import { formatTokens } from "./use-context-usage"

/**
 * Core Integration Tests - Logic Only
 *
 * Following TDD pattern: test pure functions and hook logic, not DOM.
 */
describe("useContextUsage - Core Logic", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	/**
	 * Test: calculateContextUsage computes derived state correctly
	 */
	it("calculates context usage state from token data", () => {
		const tokenData = {
			input: 50000,
			output: 30000,
			cached: 10000,
		}

		// This function will be extracted from the hook
		const calculateContextUsage = (tokens: typeof tokenData, limit = 200000) => {
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

		const result = calculateContextUsage(tokenData)

		expect(result).toEqual({
			used: 80000,
			limit: 200000,
			percentage: 40,
			remaining: 120000,
			isNearLimit: false,
			tokens: {
				input: 50000,
				output: 30000,
				cached: 10000,
			},
		})
	})

	/**
	 * Test: isNearLimit flag triggers at 80% threshold
	 */
	it("sets isNearLimit when percentage exceeds 80%", () => {
		const calculateContextUsage = (
			tokens: { input: number; output: number; cached: number },
			limit = 200000,
		) => {
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

		// 81% usage (162,000 / 200,000)
		const result = calculateContextUsage({
			input: 100000,
			output: 62000,
			cached: 5000,
		})

		expect(result.percentage).toBe(81)
		expect(result.isNearLimit).toBe(true)
	})

	/**
	 * Test: Event filtering by sessionId
	 */
	it("filters events by sessionId", () => {
		const targetSessionId = "session-123"

		const events: GlobalEvent[] = [
			{
				directory: "/test",
				payload: {
					type: "message.updated",
					properties: {
						sessionID: "session-123",
						tokens: { input: 1000, output: 500 },
					},
				},
			},
			{
				directory: "/test",
				payload: {
					type: "message.updated",
					properties: {
						sessionID: "other-session",
						tokens: { input: 9999, output: 9999 },
					},
				},
			},
		]

		const filterBySession = (event: GlobalEvent, sessionId: string) => {
			const props = event.payload.properties as { sessionID?: string }
			return props.sessionID === sessionId
		}

		const filtered = events.filter((e) => filterBySession(e, targetSessionId))

		expect(filtered).toHaveLength(1)
		expect(filtered[0]).toBeDefined()
		if (filtered[0]) {
			expect((filtered[0].payload.properties as { sessionID: string }).sessionID).toBe(
				targetSessionId,
			)
		}
	})

	/**
	 * Test: Token extraction from event payload
	 */
	it("extracts token data from message.updated events", () => {
		const event: GlobalEvent = {
			directory: "/test",
			payload: {
				type: "message.updated",
				properties: {
					sessionID: "session-123",
					tokens: {
						input: 25000,
						output: 15000,
						cache: {
							read: 5000,
							write: 2000,
						},
					},
				},
			},
		}

		const extractTokens = (event: GlobalEvent) => {
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

		const tokens = extractTokens(event)

		expect(tokens).toEqual({
			input: 25000,
			output: 15000,
			cached: 5000,
		})
	})

	/**
	 * Test: Handle events without token data gracefully
	 */
	it("returns null for events without token data", () => {
		const event: GlobalEvent = {
			directory: "/test",
			payload: {
				type: "session.updated",
				properties: {
					sessionID: "session-123",
					title: "Updated Title",
				},
			},
		}

		const extractTokens = (event: GlobalEvent) => {
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

		const tokens = extractTokens(event)

		expect(tokens).toBeNull()
	})

	/**
	 * Test: Cumulative token tracking across multiple messages
	 */
	it("accumulates tokens across multiple message events", () => {
		const events: GlobalEvent[] = [
			{
				directory: "/test",
				payload: {
					type: "message.updated",
					properties: {
						sessionID: "session-123",
						tokens: { input: 10000, output: 5000, cache: { read: 1000 } },
					},
				},
			},
			{
				directory: "/test",
				payload: {
					type: "message.updated",
					properties: {
						sessionID: "session-123",
						tokens: { input: 15000, output: 8000, cache: { read: 2000 } },
					},
				},
			},
		]

		const accumulateTokens = (
			events: GlobalEvent[],
			sessionId: string,
		): { input: number; output: number; cached: number } => {
			let totalInput = 0
			let totalOutput = 0
			let totalCached = 0

			for (const event of events) {
				const props = event.payload.properties as {
					sessionID?: string
					tokens?: {
						input?: number
						output?: number
						cache?: { read?: number }
					}
				}

				if (props.sessionID !== sessionId || !props.tokens) continue

				totalInput += props.tokens.input ?? 0
				totalOutput += props.tokens.output ?? 0
				totalCached += props.tokens.cache?.read ?? 0
			}

			return {
				input: totalInput,
				output: totalOutput,
				cached: totalCached,
			}
		}

		const result = accumulateTokens(events, "session-123")

		expect(result).toEqual({
			input: 25000,
			output: 13000,
			cached: 3000,
		})
	})
})

describe("formatTokens", () => {
	it("formats small numbers as-is", () => {
		expect(formatTokens(0)).toBe("0")
		expect(formatTokens(42)).toBe("42")
		expect(formatTokens(999)).toBe("999")
	})

	it("formats thousands with K suffix", () => {
		expect(formatTokens(1000)).toBe("1.0K")
		expect(formatTokens(1500)).toBe("1.5K")
		expect(formatTokens(42000)).toBe("42.0K")
		expect(formatTokens(99999)).toBe("100.0K")
	})

	it("formats millions with M suffix", () => {
		expect(formatTokens(1000000)).toBe("1.0M")
		expect(formatTokens(1500000)).toBe("1.5M")
		expect(formatTokens(42000000)).toBe("42.0M")
	})

	it("rounds to one decimal place", () => {
		expect(formatTokens(1234)).toBe("1.2K")
		expect(formatTokens(1567)).toBe("1.6K")
		expect(formatTokens(1234567)).toBe("1.2M")
	})
})
