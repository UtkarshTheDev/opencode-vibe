/**
 * Unit tests for useSession hook
 *
 * Tests that useSession:
 * 1. Returns session from store
 * 2. Subscribes to session.updated events
 * 3. Updates when SSE fires session events
 * 4. Unsubscribes on unmount
 */

// Set up DOM environment for React Testing Library
import { Window } from "happy-dom"
const window = new Window()
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.document = window.document
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.window = window

import { describe, it, expect, beforeEach, mock } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useOpencodeStore } from "./store"
import type { Session } from "./store"

// Capture subscribe callbacks for testing
type SubscribeCallback = (event: any) => void
let subscribeCallbacks: Map<string, Set<SubscribeCallback>>
let mockUnsubscribeFn: ReturnType<typeof mock>
let mockSubscribe: ReturnType<typeof mock>

// Reset mocks before each test
function resetMocks() {
	subscribeCallbacks = new Map()

	mockUnsubscribeFn = mock(() => {})

	mockSubscribe = mock((eventType: string, callback: SubscribeCallback) => {
		if (!subscribeCallbacks.has(eventType)) {
			subscribeCallbacks.set(eventType, new Set())
		}
		subscribeCallbacks.get(eventType)!.add(callback)
		return mockUnsubscribeFn
	})
}

// Mock useSSE - must include all exports to avoid conflicts with other test files
mock.module("./use-sse", () => ({
	useSSE: () => ({
		subscribe: (...args: any[]) => mockSubscribe(...args),
		connected: true,
		reconnect: () => {},
	}),
	SSEProvider: ({ children }: { children: any }) => children,
	useSSEDirect: () => ({ reconnect: () => {} }),
}))

// Import after mocking
const { useSession } = await import("./use-session")

// Helper to emit events to subscribed callbacks
function emitEvent(eventType: string, event: any) {
	const callbacks = subscribeCallbacks.get(eventType)
	if (callbacks) {
		for (const callback of callbacks) {
			callback(event)
		}
	}
}

describe("useSession", () => {
	const testSession: Session = {
		id: "session-123",
		title: "Test Session",
		directory: "/test",
		time: {
			created: Date.now(),
			updated: Date.now(),
		},
	}

	beforeEach(() => {
		// Reset store
		useOpencodeStore.setState({
			sessions: [],
			messages: {},
		})
		// Reset mocks
		resetMocks()
	})

	it("returns undefined when session not in store", () => {
		const { result } = renderHook(() => useSession("nonexistent"))
		expect(result.current).toBeUndefined()
	})

	it("returns session from store", () => {
		// Add session to store
		act(() => {
			useOpencodeStore.getState().addSession(testSession)
		})

		const { result } = renderHook(() => useSession("session-123"))
		expect(result.current).toEqual(testSession)
	})

	it("subscribes to session.updated events on mount", () => {
		renderHook(() => useSession("session-123"))

		expect(mockSubscribe).toHaveBeenCalledWith("session.updated", expect.any(Function))
	})

	it("updates when session.updated event fires", () => {
		// Add initial session
		act(() => {
			useOpencodeStore.getState().addSession(testSession)
		})

		const { result } = renderHook(() => useSession("session-123"))

		// Simulate SSE event with updated session
		const updatedSession = {
			...testSession,
			title: "Updated Title",
			time: { ...testSession.time, updated: Date.now() + 1000 },
		}

		act(() => {
			emitEvent("session.updated", {
				payload: {
					type: "session.updated",
					properties: { info: updatedSession },
				},
			})
		})

		// Session should be updated
		expect(result.current?.title).toBe("Updated Title")
	})

	it("ignores session.updated events for different sessions", () => {
		act(() => {
			useOpencodeStore.getState().addSession(testSession)
		})

		const { result } = renderHook(() => useSession("session-123"))
		const initialTitle = result.current?.title

		// Event for different session
		act(() => {
			emitEvent("session.updated", {
				payload: {
					type: "session.updated",
					properties: {
						info: {
							id: "different-session",
							title: "Different",
							directory: "/test",
							time: { created: Date.now(), updated: Date.now() },
						},
					},
				},
			})
		})

		// Original session unchanged
		expect(result.current?.title).toBe(initialTitle)
	})

	it("unsubscribes on unmount", () => {
		const { unmount } = renderHook(() => useSession("session-123"))

		unmount()

		expect(mockUnsubscribeFn).toHaveBeenCalled()
	})

	it("re-subscribes when sessionId changes", () => {
		const { rerender } = renderHook(({ id }: { id: string }) => useSession(id), {
			initialProps: { id: "session-1" },
		})

		expect(mockSubscribe).toHaveBeenCalledTimes(1)

		// Change sessionId
		rerender({ id: "session-2" })

		// Should subscribe again
		expect(mockSubscribe).toHaveBeenCalledTimes(2)
	})

	it("returns updated session from store after manual update", () => {
		act(() => {
			useOpencodeStore.getState().addSession(testSession)
		})

		const { result } = renderHook(() => useSession("session-123"))

		// Manually update store
		act(() => {
			useOpencodeStore.getState().updateSession("session-123", (draft) => {
				draft.title = "Manually Updated"
			})
		})

		expect(result.current?.title).toBe("Manually Updated")
	})
})
