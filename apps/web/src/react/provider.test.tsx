/**
 * Tests for OpenCodeProvider
 *
 * Unit tests covering:
 * - Context provision (url, directory, ready, sync)
 * - Event handling to store updates
 * - Directory filtering
 *
 * These tests mock useSSE to directly test event handling logic
 * without needing real SSE connections.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useOpencodeStore } from "./store"
import type { ReactNode } from "react"

// Setup DOM environment with happy-dom
import { Window } from "happy-dom"
const window = new Window()
global.document = window.document as any
global.window = window as any

// Capture subscribe callbacks for testing
type SubscribeCallback = (event: any) => void
let subscribeCallbacks: Map<string, Set<SubscribeCallback>>
let mockSubscribe: ReturnType<typeof mock>

function resetMocks() {
	subscribeCallbacks = new Map()
	mockSubscribe = mock((eventType: string, callback: SubscribeCallback) => {
		if (!subscribeCallbacks.has(eventType)) {
			subscribeCallbacks.set(eventType, new Set())
		}
		subscribeCallbacks.get(eventType)!.add(callback)
		return () => {
			subscribeCallbacks.get(eventType)?.delete(callback)
		}
	})
}

// Mock the module before importing provider
mock.module("./use-sse", () => ({
	useSSE: () => ({
		subscribe: (...args: any[]) => mockSubscribe(...args),
		connected: true,
		reconnect: () => {},
	}),
	SSEProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	useSSEDirect: () => ({ reconnect: () => {} }),
}))

// Import after mocking
const { OpenCodeProvider, useOpenCode } = await import("./provider")

// Helper to emit events to subscribed callbacks
function emitEvent(eventType: string, event: any) {
	const callbacks = subscribeCallbacks.get(eventType)
	if (callbacks) {
		for (const callback of callbacks) {
			callback(event)
		}
	}
}

describe("OpenCodeProvider", () => {
	beforeEach(() => {
		// Reset store before each test
		useOpencodeStore.setState({
			sessions: [],
			messages: {},
		})
		// Reset mocks
		resetMocks()
	})

	test("provides context with url, directory, ready, sync", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		const { result } = renderHook(() => useOpenCode(), { wrapper })

		expect(result.current.url).toBe("http://localhost:3000")
		expect(result.current.directory).toBe("/test/dir")
		expect(typeof result.current.sync).toBe("function")
		expect(typeof result.current.ready).toBe("boolean")
	})

	test("throws error when useOpenCode is used outside provider", () => {
		expect(() => {
			renderHook(() => useOpenCode())
		}).toThrow("useOpenCode must be used within OpenCodeProvider")
	})

	test("subscribes to all required event types", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		expect(mockSubscribe).toHaveBeenCalledWith("session.created", expect.any(Function))
		expect(mockSubscribe).toHaveBeenCalledWith("session.updated", expect.any(Function))
		expect(mockSubscribe).toHaveBeenCalledWith("session.deleted", expect.any(Function))
		expect(mockSubscribe).toHaveBeenCalledWith("message.updated", expect.any(Function))
		expect(mockSubscribe).toHaveBeenCalledWith("message.removed", expect.any(Function))
	})

	test("routes session.created events to store", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit session.created event
		act(() => {
			emitEvent("session.created", {
				directory: "/test/dir",
				payload: {
					type: "session.created",
					properties: {
						info: {
							id: "session-123",
							title: "Test Session",
							directory: "/test/dir",
							time: { created: Date.now(), updated: Date.now() },
						},
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		expect(store.sessions).toHaveLength(1)
		expect(store.sessions[0].id).toBe("session-123")
		expect(store.sessions[0].title).toBe("Test Session")
	})

	test("routes session.updated events to store", () => {
		// Pre-populate store with a session
		useOpencodeStore.getState().addSession({
			id: "session-123",
			title: "Original Title",
			directory: "/test/dir",
			time: { created: Date.now(), updated: Date.now() },
		})

		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit session.updated event
		act(() => {
			emitEvent("session.updated", {
				directory: "/test/dir",
				payload: {
					type: "session.updated",
					properties: {
						info: {
							id: "session-123",
							title: "Updated Title",
							directory: "/test/dir",
							time: { created: Date.now(), updated: Date.now() },
						},
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		const session = store.getSession("session-123")
		expect(session?.title).toBe("Updated Title")
	})

	test("routes message.updated events to store (new message)", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit message.updated event for new message
		act(() => {
			emitEvent("message.updated", {
				directory: "/test/dir",
				payload: {
					type: "message.updated",
					properties: {
						info: {
							id: "msg-456",
							sessionID: "session-123",
							role: "user",
							time: { created: Date.now() },
						},
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		const messages = store.getMessages("session-123")
		expect(messages).toHaveLength(1)
		expect(messages[0].id).toBe("msg-456")
	})

	test("routes message.updated events to store (existing message)", () => {
		// Pre-populate store
		useOpencodeStore.getState().addMessage({
			id: "msg-456",
			sessionID: "session-123",
			role: "user",
		})

		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit message.updated event
		act(() => {
			emitEvent("message.updated", {
				directory: "/test/dir",
				payload: {
					type: "message.updated",
					properties: {
						info: {
							id: "msg-456",
							sessionID: "session-123",
							role: "assistant",
							time: { created: Date.now(), completed: Date.now() },
						},
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		const messages = store.getMessages("session-123")
		expect(messages[0].role).toBe("assistant")
	})

	test("ignores events from other directories", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit event from different directory
		act(() => {
			emitEvent("session.created", {
				directory: "/other/dir",
				payload: {
					type: "session.created",
					properties: {
						info: {
							id: "session-999",
							title: "Other Session",
							directory: "/other/dir",
							time: { created: Date.now(), updated: Date.now() },
						},
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		expect(store.sessions).toHaveLength(0)
	})

	test("handles session.deleted events", () => {
		// Pre-populate store
		useOpencodeStore.getState().addSession({
			id: "session-123",
			title: "To Delete",
			directory: "/test/dir",
			time: { created: Date.now(), updated: Date.now() },
		})

		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit session.deleted event
		act(() => {
			emitEvent("session.deleted", {
				directory: "/test/dir",
				payload: {
					type: "session.deleted",
					properties: {
						sessionID: "session-123",
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		expect(store.sessions).toHaveLength(0)
	})

	test("handles message.removed events", () => {
		// Pre-populate store
		useOpencodeStore.getState().addMessage({
			id: "msg-456",
			sessionID: "session-123",
			role: "user",
		})

		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit message.removed event
		act(() => {
			emitEvent("message.removed", {
				directory: "/test/dir",
				payload: {
					type: "message.removed",
					properties: {
						sessionID: "session-123",
						messageID: "msg-456",
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		const messages = store.getMessages("session-123")
		expect(messages).toHaveLength(0)
	})

	test("accepts global directory events", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<OpenCodeProvider url="http://localhost:3000" directory="/test/dir">
				{children}
			</OpenCodeProvider>
		)

		renderHook(() => useOpenCode(), { wrapper })

		// Emit event with "global" directory
		act(() => {
			emitEvent("session.created", {
				directory: "global",
				payload: {
					type: "session.created",
					properties: {
						info: {
							id: "session-global",
							title: "Global Session",
							directory: "/test/dir",
							time: { created: Date.now(), updated: Date.now() },
						},
					},
				},
			})
		})

		const store = useOpencodeStore.getState()
		expect(store.sessions).toHaveLength(1)
		expect(store.sessions[0].id).toBe("session-global")
	})
})
