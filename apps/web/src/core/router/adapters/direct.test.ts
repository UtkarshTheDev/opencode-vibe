/**
 * Direct caller adapter tests - TDD RED phase
 * Tests createCaller for RSC direct route invocation
 */
import { describe, test, expect, mock } from "bun:test"
import { createOpencodeRoute } from "../builder.js"
import { createRouter } from "../router.js"
import { createCaller } from "./direct.js"
import { Schema } from "effect"

// Mock SDK client for testing
const createMockSdk = () => ({
	session: {
		get: mock(async (id: any) => ({ id: String(id), title: "Test Session" })),
		list: mock(async () => [{ id: "1", title: "Session 1" }]),
	},
	global: {
		event: mock(async function* () {
			yield { type: "message", data: "hello" }
			yield { type: "message", data: "world" }
		}),
	},
})

describe("createCaller", () => {
	const o = createOpencodeRoute()

	test("creates a caller that can invoke routes directly", async () => {
		const routes = {
			session: {
				get: o({ timeout: "30s" }).handler(async () => ({
					id: "123",
					title: "Test",
				})),
				list: o({ timeout: "30s" }).handler(async () => [{ id: "1" }, { id: "2" }]),
			},
		}

		const router = createRouter(routes)
		const mockSdk = createMockSdk()

		const caller = createCaller(router, {
			sdk: mockSdk as any,
		})

		const result = await caller("session.get", {})

		expect(result).toEqual({ id: "123", title: "Test" })
	})

	test("passes input to handler", async () => {
		const inputSchema = Schema.Struct({ id: Schema.String }) as any

		const routes = {
			session: {
				get: o({ timeout: "30s" })
					.input(inputSchema)
					.handler(async ({ input }) => ({
						id: (input as { id: string }).id,
						found: true,
					})),
			},
		}

		const router = createRouter(routes)
		const caller = createCaller(router, {
			sdk: createMockSdk() as any,
		})

		const result = await caller("session.get", { id: "test-456" })

		expect(result).toEqual({ id: "test-456", found: true })
	})

	test("provides SDK to handler", async () => {
		const routes = {
			session: {
				get: o({ timeout: "30s" }).handler(async ({ sdk }) => {
					return (sdk as any).session.get("abc")
				}),
			},
		}

		const router = createRouter(routes)
		const mockSdk = createMockSdk()
		const caller = createCaller(router, {
			sdk: mockSdk as any,
		})

		const result = await caller("session.get", {})

		expect(result).toEqual({ id: "abc", title: "Test Session" })
		expect(mockSdk.session.get).toHaveBeenCalledWith("abc")
	})

	test("throws for unknown route", async () => {
		const routes = {
			session: {
				get: o({ timeout: "30s" }).handler(async () => ({})),
			},
		}

		const router = createRouter(routes)
		const caller = createCaller(router, {
			sdk: createMockSdk() as any,
		})

		await expect(caller("unknown.route", {})).rejects.toThrow()
	})

	test("throws validation error for invalid input", async () => {
		const inputSchema = Schema.Struct({ id: Schema.String }) as any

		const routes = {
			session: {
				get: o({ timeout: "30s" })
					.input(inputSchema)
					.handler(async ({ input }) => ({ id: (input as { id: string }).id })),
			},
		}

		const router = createRouter(routes)
		const caller = createCaller(router, {
			sdk: createMockSdk() as any,
		})

		// Missing required 'id' field
		await expect(caller("session.get", {})).rejects.toThrow()
	})

	test("respects timeout configuration", async () => {
		const routes = {
			session: {
				slow: o({ timeout: "50ms" }).handler(async () => {
					await new Promise((r) => setTimeout(r, 200))
					return { done: true }
				}),
			},
		}

		const router = createRouter(routes)
		const caller = createCaller(router, {
			sdk: createMockSdk() as any,
		})

		await expect(caller("session.slow", {})).rejects.toThrow()
	})

	test("handles streaming routes", async () => {
		const routes = {
			subscribe: {
				events: o({ stream: true }).handler(async function* () {
					yield { n: 1 }
					yield { n: 2 }
					yield { n: 3 }
				}),
			},
		}

		const router = createRouter(routes)
		const caller = createCaller(router, {
			sdk: createMockSdk() as any,
		})

		const result = (await caller("subscribe.events", {})) as AsyncIterable<{
			n: number
		}>
		const items: Array<{ n: number }> = []

		for await (const item of result) {
			items.push(item)
		}

		expect(items).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
	})

	test("supports nested route paths", async () => {
		const routes = {
			api: {
				v1: {
					users: {
						list: o({ timeout: "30s" }).handler(async () => [{ name: "Alice" }]),
					},
				},
			},
		}

		const router = createRouter(routes)
		const caller = createCaller(router, {
			sdk: createMockSdk() as any,
		})

		const result = await caller("api.v1.users.list", {})

		expect(result).toEqual([{ name: "Alice" }])
	})
})
