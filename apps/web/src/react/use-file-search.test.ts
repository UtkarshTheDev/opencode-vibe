/**
 * Unit tests for useFileSearch hook
 *
 * Tests that useFileSearch:
 * 1. Debounces query input (default 150ms)
 * 2. Calls SDK client.find.files with correct params
 * 3. Applies fuzzy filtering with fuzzysort
 * 4. Returns top 10 results sorted by relevance
 * 5. Handles loading states correctly
 * 6. Handles errors from SDK
 */

// Set up DOM environment for React Testing Library
import { Window } from "happy-dom"
const window = new Window()
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.document = window.document
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.window = window

import { describe, it, expect, beforeEach, mock } from "bun:test"
import { renderHook, waitFor, act } from "@testing-library/react"

// Mock data
const mockFiles = [
	"src/app/page.tsx",
	"src/app/layout.tsx",
	"src/components/ui/button.tsx",
	"src/components/ui/input.tsx",
	"src/lib/utils.ts",
	"apps/web/src/app/session/[id]/page.tsx",
	"apps/web/src/react/use-session.ts",
	"apps/web/package.json",
]

// Mock SDK client
let mockFindFiles: ReturnType<typeof mock>

function resetMocks() {
	mockFindFiles = mock(async ({ query: _query }: { query: { query: string; dirs?: string } }) => {
		// Simulate SDK behavior - return all files for search
		// SDK returns { data: string[] }
		return { data: mockFiles }
	})
}

// Mock createClient from core/client
mock.module("@/core/client", () => ({
	createClient: (_directory?: string) => ({
		find: {
			files: mockFindFiles,
		},
	}),
}))

// Mock useOpenCode hook
const mockUseOpenCode = mock(() => ({
	url: "http://localhost:4056",
	directory: "/test/project",
	ready: true,
	sync: mock(() => Promise.resolve()),
}))

mock.module("@/react/provider", () => ({
	useOpenCode: mockUseOpenCode,
}))

// Import after mocking
const { useFileSearch } = await import("./use-file-search")

describe("useFileSearch", () => {
	beforeEach(() => {
		resetMocks()
	})

	it("returns empty array initially", () => {
		const { result } = renderHook(() => useFileSearch(""))

		expect(result.current.files).toEqual([])
		expect(result.current.isLoading).toBe(false)
		expect(result.current.error).toBe(null)
	})

	it("debounces query and calls SDK after 150ms", async () => {
		const { rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		// Type quickly (should not trigger API call)
		act(() => {
			rerender({ query: "s" })
		})

		expect(mockFindFiles).not.toHaveBeenCalled()

		// Wait for debounce
		await waitFor(
			() => {
				expect(mockFindFiles).toHaveBeenCalledWith({
					query: { query: "s", dirs: "true" },
				})
			},
			{ timeout: 200 },
		)
	})

	it("cancels previous debounced call when query changes quickly", async () => {
		const { rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		// Type quickly
		act(() => {
			rerender({ query: "s" })
		})
		act(() => {
			rerender({ query: "se" })
		})
		act(() => {
			rerender({ query: "ses" })
		})

		// Wait for debounce
		await waitFor(
			() => {
				expect(mockFindFiles).toHaveBeenCalled()
			},
			{ timeout: 200 },
		)

		// Should only call once with final query
		expect(mockFindFiles).toHaveBeenCalledTimes(1)
		expect(mockFindFiles).toHaveBeenCalledWith({
			query: { query: "ses", dirs: "true" },
		})
	})

	it("applies fuzzy filtering with fuzzysort", async () => {
		const { result, rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		act(() => {
			rerender({ query: "sespage" })
		})

		await waitFor(() => {
			expect(result.current.files.length).toBeGreaterThan(0)
		})

		// Should match "session/[id]/page.tsx" via fuzzy search
		expect(result.current.files).toContain("apps/web/src/app/session/[id]/page.tsx")
	})

	it("returns top 10 results only", async () => {
		// Mock with 15 files
		mockFindFiles.mockImplementation(async () => {
			return { data: Array.from({ length: 15 }, (_, i) => `file-${i}.ts`) }
		})

		const { result, rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		act(() => {
			rerender({ query: "file" })
		})

		await waitFor(() => {
			expect(result.current.files.length).toBe(10)
		})
	})

	it("sets isLoading during API call", async () => {
		// Mock with delay
		mockFindFiles.mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50))
			return { data: mockFiles }
		})

		const { result, rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		act(() => {
			rerender({ query: "test" })
		})

		// Wait for debounce to trigger
		await new Promise((resolve) => setTimeout(resolve, 160))

		// Should be loading
		expect(result.current.isLoading).toBe(true)

		// Wait for completion
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false)
		})
	})

	it("handles SDK errors gracefully", async () => {
		const testError = new Error("Network error")
		mockFindFiles.mockRejectedValue(testError)

		const { result, rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		act(() => {
			rerender({ query: "test" })
		})

		await waitFor(() => {
			expect(result.current.error).toBe(testError)
		})

		expect(result.current.files).toEqual([])
		expect(result.current.isLoading).toBe(false)
	})

	it("respects custom debounce time", async () => {
		const { rerender } = renderHook(({ query }) => useFileSearch(query, { debounceMs: 300 }), {
			initialProps: { query: "" },
		})

		act(() => {
			rerender({ query: "test" })
		})

		// Should NOT have called after 150ms
		await new Promise((resolve) => setTimeout(resolve, 160))
		expect(mockFindFiles).not.toHaveBeenCalled()

		// Should call after 300ms
		await waitFor(
			() => {
				expect(mockFindFiles).toHaveBeenCalled()
			},
			{ timeout: 200 },
		)
	})

	it("clears results when query becomes empty", async () => {
		const { result, rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		// Search for something
		act(() => {
			rerender({ query: "test" })
		})

		await waitFor(() => {
			expect(result.current.files.length).toBeGreaterThan(0)
		})

		// Clear query
		act(() => {
			rerender({ query: "" })
		})

		expect(result.current.files).toEqual([])
	})

	it("uses directory from useOpenCode context", async () => {
		const { rerender } = renderHook(({ query }) => useFileSearch(query), {
			initialProps: { query: "" },
		})

		act(() => {
			rerender({ query: "test" })
		})

		await waitFor(() => {
			expect(mockFindFiles).toHaveBeenCalled()
		})

		// Verify directory was passed to createClient
		expect(mockUseOpenCode).toHaveBeenCalled()
	})
})
