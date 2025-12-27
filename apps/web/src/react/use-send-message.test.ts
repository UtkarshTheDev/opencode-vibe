// Set up DOM environment for React Testing Library
import { Window } from "happy-dom"
const window = new Window()
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.document = window.document
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.window = window

import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, test, mock, beforeEach } from "bun:test"
import { useSendMessage } from "./use-send-message"
import { createClient } from "@/core/client"
import type { Prompt } from "@/types/prompt"

// Mock the client module
mock.module("@/core/client", () => ({
	createClient: mock(() => ({
		session: {
			prompt: mock(async () => ({ data: {}, error: undefined })),
		},
	})),
}))

describe("useSendMessage", () => {
	beforeEach(() => {
		mock.restore()
	})

	test("returns sendMessage function, isLoading, and error state", () => {
		const { result } = renderHook(() =>
			useSendMessage({ sessionId: "ses_test", directory: "/test" }),
		)

		expect(result.current.sendMessage).toBeFunction()
		expect(result.current.isLoading).toBe(false)
		expect(result.current.error).toBeUndefined()
	})

	test("converts prompt parts to API format and sends", async () => {
		const mockPrompt = mock(async () => ({ data: {}, error: undefined }))
		const mockClient = {
			session: { prompt: mockPrompt },
		}
		mock.module("@/core/client", () => ({
			createClient: mock(() => mockClient),
		}))

		const { result } = renderHook(() =>
			useSendMessage({ sessionId: "ses_123", directory: "/test" }),
		)

		const parts: Prompt = [
			{ type: "text", content: "Fix bug in ", start: 0, end: 11 },
			{
				type: "file",
				path: "src/auth.ts",
				content: "@src/auth.ts",
				start: 11,
				end: 23,
			},
		]
		await result.current.sendMessage(parts)

		expect(mockPrompt).toHaveBeenCalledTimes(1)
		// Verify API format conversion
		expect(mockPrompt).toHaveBeenCalledWith(
			expect.objectContaining({
				path: { id: "ses_123" },
				body: expect.objectContaining({
					parts: expect.arrayContaining([
						expect.objectContaining({
							type: "text",
							text: "Fix bug in ",
							id: expect.any(String),
						}),
						expect.objectContaining({
							type: "file",
							mime: "text/plain",
							url: "file:///test/src/auth.ts",
							filename: "auth.ts",
						}),
					]),
				}),
			}),
		)
	})

	test("sets isLoading to true during send, false after", async () => {
		const mockPrompt = mock(
			async () =>
				new Promise((resolve) => setTimeout(() => resolve({ data: {}, error: undefined }), 100)),
		)
		const mockClient = {
			session: { prompt: mockPrompt },
		}
		mock.module("@/core/client", () => ({
			createClient: mock(() => mockClient),
		}))

		const { result } = renderHook(() => useSendMessage({ sessionId: "ses_123" }))

		expect(result.current.isLoading).toBe(false)

		const parts: Prompt = [{ type: "text", content: "Test", start: 0, end: 4 }]
		const sendPromise = result.current.sendMessage(parts)

		// Should be loading immediately
		await waitFor(() => {
			expect(result.current.isLoading).toBe(true)
		})

		await sendPromise

		// Should not be loading after completion
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})
	})

	test("sets error state when API call fails", async () => {
		const mockError = new Error("Network error")
		const mockPrompt = mock(async () => {
			throw mockError
		})
		const mockClient = {
			session: { prompt: mockPrompt },
		}
		mock.module("@/core/client", () => ({
			createClient: mock(() => mockClient),
		}))

		const { result } = renderHook(() => useSendMessage({ sessionId: "ses_123" }))

		const parts: Prompt = [{ type: "text", content: "Test", start: 0, end: 4 }]
		// Catch the error since sendMessage re-throws it
		try {
			await result.current.sendMessage(parts)
		} catch (err) {
			// Expected to throw
		}

		await waitFor(() => {
			expect(result.current.error).toBe(mockError)
		})
	})

	test("handles empty prompt array", async () => {
		const mockPrompt = mock(async () => ({ data: {}, error: undefined }))
		const mockClient = {
			session: { prompt: mockPrompt },
		}
		mock.module("@/core/client", () => ({
			createClient: mock(() => mockClient),
		}))

		const { result } = renderHook(() => useSendMessage({ sessionId: "ses_123" }))

		const emptyParts: Prompt = []
		await result.current.sendMessage(emptyParts)

		expect(mockPrompt).toHaveBeenCalledTimes(0)
	})

	test("creates new client when directory changes", async () => {
		const createClientMock = mock((dir?: string) => ({
			session: {
				prompt: mock(async () => ({ data: {}, error: undefined })),
			},
		}))

		mock.module("@/core/client", () => ({
			createClient: createClientMock,
		}))

		const { result, rerender } = renderHook(
			({ directory }) => useSendMessage({ sessionId: "ses_123", directory }),
			{ initialProps: { directory: "/dir1" } },
		)

		const parts: Prompt = [{ type: "text", content: "Test", start: 0, end: 4 }]
		await result.current.sendMessage(parts)
		expect(createClientMock).toHaveBeenCalledWith("/dir1")

		// Change directory
		rerender({ directory: "/dir2" })

		await result.current.sendMessage(parts)
		expect(createClientMock).toHaveBeenCalledWith("/dir2")
	})
})
