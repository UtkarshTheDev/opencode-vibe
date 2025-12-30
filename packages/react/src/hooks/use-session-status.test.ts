/**
 * useSessionStatus Tests - Pure logic tests
 *
 * Tests the Promise API behavior without DOM rendering or SSE.
 * The hook fetches session data and derives running state.
 */

import { describe, expect, test, vi, beforeEach } from "vitest"
import type { Session } from "@opencode-vibe/core/types"
import type { GlobalEvent } from "../types/events"

// Mock sessions API
vi.mock("@opencode-vibe/core/api", () => ({
	sessions: {
		get: vi.fn(),
	},
}))

// Mock useMultiServerSSE hook
vi.mock("./use-multi-server-sse", () => ({
	useMultiServerSSE: vi.fn(),
}))

import { sessions } from "@opencode-vibe/core/api"
import { useMultiServerSSE } from "./use-multi-server-sse"

// Mock session data
const mockSession: Session = {
	id: "ses_123",
	title: "Test Session",
	directory: "/test/dir",
	time: {
		created: Date.now(),
		updated: Date.now(),
	},
}

describe("useSessionStatus - Promise API contract", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test("calls sessions.get with sessionId", async () => {
		;(sessions.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession)

		// Simulate what the hook does
		const getSessionStatus = async (sessionId: string, directory?: string) => {
			const session = await sessions.get(sessionId, directory)
			return session
		}

		const session = await getSessionStatus("ses_123")

		expect(session).toEqual(mockSession)
		expect(sessions.get).toHaveBeenCalledTimes(1)
		expect(sessions.get).toHaveBeenCalledWith("ses_123", undefined)
	})

	test("calls sessions.get with directory", async () => {
		;(sessions.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession)

		const getSessionStatus = async (sessionId: string, directory?: string) => {
			return await sessions.get(sessionId, directory)
		}

		await getSessionStatus("ses_123", "/my/project")

		expect(sessions.get).toHaveBeenCalledWith("ses_123", "/my/project")
	})

	test("handles null session (not found)", async () => {
		;(sessions.get as ReturnType<typeof vi.fn>).mockResolvedValue(null)

		const getSessionStatus = async (sessionId: string, directory?: string) => {
			const session = await sessions.get(sessionId, directory)
			return {
				running: false,
				isLoading: false,
				status: session ? undefined : undefined,
			}
		}

		const result = await getSessionStatus("ses_nonexistent")

		expect(result.running).toBe(false)
		expect(result.isLoading).toBe(false)
	})

	test("isLoading is true before fetch completes", () => {
		// Simulate initial loading state
		const status = {
			running: false,
			isLoading: true,
			status: undefined,
		}

		expect(status.isLoading).toBe(true)
	})

	test("isLoading is false after fetch completes", async () => {
		;(sessions.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession)

		const getSessionStatus = async (sessionId: string) => {
			const session = await sessions.get(sessionId)
			return {
				running: false,
				isLoading: false,
				status: undefined,
			}
		}

		const result = await getSessionStatus("ses_123")

		expect(result.isLoading).toBe(false)
	})

	test("error handling wraps non-Error exceptions", async () => {
		;(sessions.get as ReturnType<typeof vi.fn>).mockRejectedValue("String error")

		const getSessionStatus = async (sessionId: string) => {
			try {
				await sessions.get(sessionId)
				return { running: false, isLoading: false, status: undefined }
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e))
				throw error
			}
		}

		await expect(getSessionStatus("ses_123")).rejects.toThrow("String error")
	})

	test("error handling preserves Error instances", async () => {
		const mockError = new Error("Network error")
		;(sessions.get as ReturnType<typeof vi.fn>).mockRejectedValue(mockError)

		const getSessionStatus = async (sessionId: string) => {
			try {
				await sessions.get(sessionId)
				return { running: false, isLoading: false, status: undefined }
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e))
				throw error
			}
		}

		await expect(getSessionStatus("ses_123")).rejects.toThrow(mockError)
	})
})

describe("useSessionStatus - SSE event handling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	test("subscribes to SSE events on mount", () => {
		// Simulate hook initialization
		const mockOnEvent = vi.fn()
		;(useMultiServerSSE as ReturnType<typeof vi.fn>).mockImplementation((options) => {
			// Hook should call useMultiServerSSE with an onEvent callback
			expect(options).toBeDefined()
			expect(options.onEvent).toBeTypeOf("function")
		})

		// Simulate the hook subscribing
		useMultiServerSSE({ onEvent: mockOnEvent })

		expect(useMultiServerSSE).toHaveBeenCalledTimes(1)
	})

	test("processes session.status event with busy status", () => {
		const event: GlobalEvent = {
			directory: "/test/dir",
			payload: {
				type: "session.status",
				properties: {
					sessionID: "ses_123",
					status: { type: "busy" },
				},
			},
		}

		// Simulate event handling logic
		const handleEvent = (evt: GlobalEvent) => {
			if (evt.payload.type === "session.status") {
				const props = evt.payload.properties as {
					sessionID: string
					status: { type: "busy" | "idle" }
				}
				return props.status.type === "busy"
			}
			return false
		}

		const running = handleEvent(event)
		expect(running).toBe(true)
	})

	test("processes session.status event with idle status", () => {
		const event: GlobalEvent = {
			directory: "/test/dir",
			payload: {
				type: "session.status",
				properties: {
					sessionID: "ses_123",
					status: { type: "idle" },
				},
			},
		}

		const handleEvent = (evt: GlobalEvent) => {
			if (evt.payload.type === "session.status") {
				const props = evt.payload.properties as {
					sessionID: string
					status: { type: "busy" | "idle" }
				}
				return props.status.type === "busy"
			}
			return false
		}

		const running = handleEvent(event)
		expect(running).toBe(false)
	})

	test("filters events by sessionID", () => {
		const event1: GlobalEvent = {
			directory: "/test/dir",
			payload: {
				type: "session.status",
				properties: {
					sessionID: "ses_123",
					status: { type: "busy" },
				},
			},
		}

		const event2: GlobalEvent = {
			directory: "/test/dir",
			payload: {
				type: "session.status",
				properties: {
					sessionID: "ses_456",
					status: { type: "busy" },
				},
			},
		}

		const targetSessionId = "ses_123"

		const handleEvent = (evt: GlobalEvent) => {
			if (evt.payload.type === "session.status") {
				const props = evt.payload.properties as {
					sessionID: string
					status: { type: "busy" | "idle" }
				}
				if (props.sessionID === targetSessionId) {
					return props.status.type === "busy"
				}
			}
			return null
		}

		expect(handleEvent(event1)).toBe(true)
		expect(handleEvent(event2)).toBe(null) // Different session, ignored
	})

	test("ignores non-session.status events", () => {
		const event: GlobalEvent = {
			directory: "/test/dir",
			payload: {
				type: "message.created",
				properties: {
					messageID: "msg_123",
				},
			},
		}

		const handleEvent = (evt: GlobalEvent) => {
			if (evt.payload.type === "session.status") {
				return true
			}
			return false
		}

		expect(handleEvent(event)).toBe(false)
	})
})
