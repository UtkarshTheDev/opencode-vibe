// Set up DOM environment for React Testing Library
import { Window } from "happy-dom"
const window = new Window()
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.document = window.document
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.window = window

import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, test, mock, beforeEach } from "bun:test"
import { useProviders } from "./use-providers"
import { createClient } from "@/core/client"

// Mock providers in SDK format (models as dictionary)
const mockProvidersSDK = [
	{
		id: "anthropic",
		name: "Anthropic",
		models: {
			"claude-sonnet-4-20250514": { name: "Claude Sonnet 4" },
			"claude-opus-4-20250514": { name: "Claude Opus 4" },
		},
	},
	{
		id: "openai",
		name: "OpenAI",
		models: {
			"gpt-4": { name: "GPT-4" },
			"gpt-3.5-turbo": { name: "GPT-3.5 Turbo" },
		},
	},
]

// Expected providers after transformation (models as array)
const mockProviders = [
	{
		id: "anthropic",
		name: "Anthropic",
		models: [
			{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
			{ id: "claude-opus-4-20250514", name: "Claude Opus 4" },
		],
	},
	{
		id: "openai",
		name: "OpenAI",
		models: [
			{ id: "gpt-4", name: "GPT-4" },
			{ id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
		],
	},
]

// Mock the client module
const mockListFn = mock(async () => ({
	data: { all: mockProvidersSDK, default: mockProvidersSDK[0], connected: [] },
	error: undefined,
}))
mock.module("@/core/client", () => ({
	createClient: mock(() => ({
		provider: {
			list: mockListFn,
		},
	})),
}))

describe("useProviders", () => {
	beforeEach(() => {
		mock.restore()
	})

	test("should fetch providers on mount", async () => {
		const { result } = renderHook(() => useProviders())

		// Initially loading
		expect(result.current.isLoading).toBe(true)
		expect(result.current.providers).toEqual([])
		expect(result.current.error).toBeUndefined()

		// Wait for data to load
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})

		expect(result.current.providers).toEqual(mockProviders)
		expect(result.current.error).toBeUndefined()
	})

	test("should handle errors", async () => {
		const mockError = new Error("Failed to fetch providers")

		// Override mock to reject
		mock.module("@/core/client", () => ({
			createClient: mock(() => ({
				provider: {
					list: mock(async () => {
						throw mockError
					}),
				},
			})),
		}))

		const { result } = renderHook(() => useProviders())

		// Wait for error
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})

		expect(result.current.providers).toEqual([])
		expect(result.current.error).toBe(mockError)
	})

	test("should use directory scoping when provided", async () => {
		const directory = "/path/to/project"
		const listFn = mock(async () => ({
			data: { all: mockProviders, default: mockProviders[0], connected: [] },
			error: undefined,
		}))
		const mockCreateClient = mock(() => ({
			provider: {
				list: listFn,
			},
		}))

		mock.module("@/core/client", () => ({
			createClient: mockCreateClient,
		}))

		renderHook(() => useProviders({ directory }))

		await waitFor(() => {
			expect(mockCreateClient).toHaveBeenCalledWith(directory)
		})
	})

	test("should create client without directory when not provided", async () => {
		const listFn = mock(async () => ({
			data: { all: mockProviders, default: mockProviders[0], connected: [] },
			error: undefined,
		}))
		const mockCreateClient = mock(() => ({
			provider: {
				list: listFn,
			},
		}))

		mock.module("@/core/client", () => ({
			createClient: mockCreateClient,
		}))

		renderHook(() => useProviders())

		await waitFor(() => {
			expect(mockCreateClient).toHaveBeenCalledWith(undefined)
		})
	})

	test("should not refetch when directory stays the same", async () => {
		const listMock = mock(async () => ({
			data: { all: mockProviders, default: mockProviders[0], connected: [] },
			error: undefined,
		}))

		mock.module("@/core/client", () => ({
			createClient: mock(() => ({
				provider: {
					list: listMock,
				},
			})),
		}))

		const { rerender } = renderHook(({ dir }) => useProviders({ directory: dir }), {
			initialProps: { dir: "/path/to/project" },
		})

		await waitFor(() => {
			expect(listMock).toHaveBeenCalledTimes(1)
		})

		// Rerender with same directory
		rerender({ dir: "/path/to/project" })

		// Should not fetch again (give it a moment to potentially trigger)
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(listMock).toHaveBeenCalledTimes(1)
	})

	test("should refetch when directory changes", async () => {
		const listMock = mock(async () => ({
			data: { all: mockProviders, default: mockProviders[0], connected: [] },
			error: undefined,
		}))
		const mockCreateClient = mock(() => ({
			provider: {
				list: listMock,
			},
		}))

		mock.module("@/core/client", () => ({
			createClient: mockCreateClient,
		}))

		const { rerender } = renderHook(({ dir }) => useProviders({ directory: dir }), {
			initialProps: { dir: "/path/to/project" },
		})

		await waitFor(() => {
			expect(listMock).toHaveBeenCalledTimes(1)
		})

		// Change directory
		rerender({ dir: "/different/path" })

		await waitFor(() => {
			expect(listMock).toHaveBeenCalledTimes(2)
		})
		expect(mockCreateClient).toHaveBeenLastCalledWith("/different/path")
	})
})
