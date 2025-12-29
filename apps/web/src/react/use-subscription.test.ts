/**
 * useSubscription hook tests - TDD
 * Tests streaming subscription with visibility API and batching
 */

// Set up DOM environment for React Testing Library
import { Window } from "happy-dom"
const window = new Window()
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.document = window.document as unknown as Document
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.window = window as unknown as Window & typeof globalThis

import { describe, test, expect, beforeEach } from "bun:test"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useSubscription } from "./use-subscription"

// Mock document.visibilityState
let mockVisibilityState: DocumentVisibilityState = "visible"
const visibilityListeners: Array<() => void> = []

beforeEach(() => {
	mockVisibilityState = "visible"
	visibilityListeners.length = 0

	// Mock document.visibilityState
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: () => mockVisibilityState,
	})

	// Mock addEventListener/removeEventListener for visibilitychange
	const originalAddEventListener = document.addEventListener.bind(document)
	const originalRemoveEventListener = document.removeEventListener.bind(document)

	document.addEventListener = ((type: string, listener: EventListener) => {
		if (type === "visibilitychange") {
			visibilityListeners.push(listener as () => void)
		} else {
			originalAddEventListener(type, listener)
		}
	}) as typeof document.addEventListener

	document.removeEventListener = ((type: string, listener: EventListener) => {
		if (type === "visibilitychange") {
			const idx = visibilityListeners.indexOf(listener as () => void)
			if (idx >= 0) visibilityListeners.splice(idx, 1)
		} else {
			originalRemoveEventListener(type, listener)
		}
	}) as typeof document.removeEventListener
})

function triggerVisibilityChange(state: DocumentVisibilityState) {
	mockVisibilityState = state
	for (const fn of visibilityListeners) {
		fn()
	}
}

describe("useSubscription", () => {
	test("returns initial state", () => {
		async function* generator() {
			// Never yields
		}

		const { result } = renderHook(() => useSubscription(() => generator(), []))

		// Should have initial state
		expect(result.current.events).toEqual([])
		expect(result.current.error).toBeNull()
	})

	test("collects events from async iterable", async () => {
		const events = [{ n: 1 }, { n: 2 }, { n: 3 }]
		let index = 0

		async function* generator() {
			while (index < events.length) {
				yield events[index++]
				await new Promise((r) => setTimeout(r, 5))
			}
		}

		const { result } = renderHook(() => useSubscription(() => generator(), [], { batchMs: 0 }))

		// Wait for all events
		await act(async () => {
			await new Promise((r) => setTimeout(r, 100))
		})

		expect(result.current.events).toEqual(events)
	})

	test("handles errors", async () => {
		async function* generator() {
			yield { n: 1 }
			await new Promise((r) => setTimeout(r, 5))
			throw new Error("Test error")
		}

		const { result } = renderHook(() => useSubscription(() => generator(), [], { batchMs: 0 }))

		await act(async () => {
			await new Promise((r) => setTimeout(r, 100))
		})

		expect(result.current.status).toBe("error")
		expect(result.current.error?.message).toBe("Test error")
	})

	test("pauses on visibility hidden", async () => {
		let yieldCount = 0

		async function* generator() {
			while (yieldCount < 10) {
				yield { n: yieldCount++ }
				await new Promise((r) => setTimeout(r, 20))
			}
		}

		const { result } = renderHook(() =>
			useSubscription(() => generator(), [], {
				pauseOnHidden: true,
				batchMs: 0,
			}),
		)

		// Let some events come through
		await act(async () => {
			await new Promise((r) => setTimeout(r, 50))
		})

		// Hide tab
		act(() => {
			triggerVisibilityChange("hidden")
		})

		expect(result.current.status).toBe("paused")

		// Show tab
		act(() => {
			triggerVisibilityChange("visible")
		})

		expect(result.current.status).toBe("connected")
	})

	test("resubscribes on dependency change", async () => {
		let subscribeCount = 0

		async function* generator(id: string) {
			subscribeCount++
			yield { id }
		}

		const { result, rerender } = renderHook(
			({ id }) => useSubscription(() => generator(id), [id], { batchMs: 0 }),
			{ initialProps: { id: "first" } },
		)

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50))
		})

		expect(subscribeCount).toBe(1)

		// Change dependency
		rerender({ id: "second" })

		await act(async () => {
			await new Promise((r) => setTimeout(r, 50))
		})

		expect(subscribeCount).toBe(2)
	})
})
