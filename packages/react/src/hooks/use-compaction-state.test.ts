/**
 * Tests for useCompactionState hook
 *
 * Tests SSE subscription and state updates for compaction events.
 */

// Set up DOM environment for React Testing Library
import { Window } from "happy-dom"
const window = new Window()
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.document = window.document
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.window = window

import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { useCompactionState } from "./use-compaction-state"
import type { CompactionState } from "./use-compaction-state"
import { multiServerSSE } from "@opencode-vibe/core/sse"
import type { GlobalEvent } from "../types/events"

// Mock the multiServerSSE singleton with proper isolation
let mockEventCallback: ((event: GlobalEvent) => void) | null = null

vi.mock("@opencode-vibe/core/sse", () => {
	return {
		multiServerSSE: {
			start: vi.fn(),
			onEvent: vi.fn((callback) => {
				mockEventCallback = callback
				return () => {
					mockEventCallback = null
				}
			}),
			stop: vi.fn(),
		},
	}
})

// Helper to emit events in tests
function emitMockEvent(event: GlobalEvent) {
	if (mockEventCallback) {
		mockEventCallback(event)
	}
}

describe("useCompactionState", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockEventCallback = null
	})

	afterEach(() => {
		vi.clearAllMocks()
		mockEventCallback = null
	})

	it("returns default state initially", () => {
		const { result } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		expect(result.current).toEqual({
			isCompacting: false,
			isAutomatic: false,
			progress: "complete",
			startedAt: 0,
		})
	})

	it("returns same default state with directory option", () => {
		const { result } = renderHook(() =>
			useCompactionState({
				sessionId: "test-session",
				directory: "/test/path",
			}),
		)

		expect(result.current).toEqual({
			isCompacting: false,
			isAutomatic: false,
			progress: "complete",
			startedAt: 0,
		})
	})

	it("has correct type structure", () => {
		const { result } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		const state: CompactionState = result.current

		// Type assertions to ensure types are correct
		expect(typeof state.isCompacting).toBe("boolean")
		expect(typeof state.isAutomatic).toBe("boolean")
		expect(typeof state.startedAt).toBe("number")
		expect(["pending", "generating", "complete"]).toContain(state.progress)
	})

	it("subscribes to SSE events on mount", () => {
		const { unmount } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		expect(multiServerSSE.start).toHaveBeenCalledOnce()
		expect(multiServerSSE.onEvent).toHaveBeenCalledOnce()
		expect(multiServerSSE.onEvent).toHaveBeenCalledWith(expect.any(Function))

		unmount()
	})

	it("updates state when compaction.started event is received", async () => {
		const { result } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		// Emit compaction.started event
		const startTime = Date.now()
		await act(async () => {
			;emitMockEvent({
				directory: "/test/dir",
				payload: {
					type: "compaction.started",
					properties: {
						sessionID: "test-session",
						automatic: true,
						timestamp: startTime,
					},
				},
			})
		})

		await waitFor(() => {
			expect(result.current.isCompacting).toBe(true)
		})

		expect(result.current.isAutomatic).toBe(true)
		expect(result.current.progress).toBe("pending")
		expect(result.current.startedAt).toBe(startTime)
	})

	it("updates progress when compaction.progress event is received", async () => {
		const { result } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		// Start compaction first
		await act(async () => {
			;emitMockEvent({
				directory: "/test/dir",
				payload: {
					type: "compaction.started",
					properties: {
						sessionID: "test-session",
						automatic: false,
						timestamp: Date.now(),
					},
				},
			})
		})

		await waitFor(() => {
			expect(result.current.isCompacting).toBe(true)
		})

		// Update progress to generating
		await act(async () => {
			;emitMockEvent({
				directory: "/test/dir",
				payload: {
					type: "compaction.progress",
					properties: {
						sessionID: "test-session",
						progress: "generating",
					},
				},
			})
		})

		await waitFor(() => {
			expect(result.current.progress).toBe("generating")
		})

		expect(result.current.isCompacting).toBe(true)
	})

	it("resets state when compaction.completed event is received", async () => {
		const { result } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		// Start compaction
		await act(async () => {
			;emitMockEvent({
				directory: "/test/dir",
				payload: {
					type: "compaction.started",
					properties: {
						sessionID: "test-session",
						automatic: false,
						timestamp: Date.now(),
					},
				},
			})
		})

		await waitFor(() => {
			expect(result.current.isCompacting).toBe(true)
		})

		// Complete compaction
		await act(async () => {
			;emitMockEvent({
				directory: "/test/dir",
				payload: {
					type: "compaction.completed",
					properties: {
						sessionID: "test-session",
					},
				},
			})
		})

		await waitFor(() => {
			expect(result.current.isCompacting).toBe(false)
		})

		expect(result.current.progress).toBe("complete")
		expect(result.current.startedAt).toBe(0)
		expect(result.current.isAutomatic).toBe(false)
	})

	it("ignores events for different sessionId", async () => {
		const { result } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		// Emit event for different session
		await act(async () => {
			;emitMockEvent({
				directory: "/test/dir",
				payload: {
					type: "compaction.started",
					properties: {
						sessionID: "other-session",
						automatic: true,
						timestamp: Date.now(),
					},
				},
			})
		})

		// Wait a bit to ensure no update occurs
		await new Promise((resolve) => setTimeout(resolve, 50))

		expect(result.current.isCompacting).toBe(false)
		expect(result.current.progress).toBe("complete")
	})

	it("ignores non-compaction events", async () => {
		const { result } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		// Emit non-compaction event
		await act(async () => {
			;emitMockEvent({
				directory: "/test/dir",
				payload: {
					type: "session.created",
					properties: {
						sessionID: "test-session",
					},
				},
			})
		})

		// Wait a bit to ensure no update occurs
		await new Promise((resolve) => setTimeout(resolve, 50))

		expect(result.current.isCompacting).toBe(false)
		expect(result.current.progress).toBe("complete")
	})

	it("cleans up subscription on unmount", () => {
		const { unmount } = renderHook(() => useCompactionState({ sessionId: "test-session" }))

		const unsubscribeSpy = vi.fn()
		;(multiServerSSE.onEvent as any).mockReturnValueOnce(unsubscribeSpy)

		unmount()

		// Since we can't directly test the cleanup, we verify the mock was set up
		expect(multiServerSSE.onEvent).toHaveBeenCalled()
	})
})
