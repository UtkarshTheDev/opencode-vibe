/**
 * Factory Tests - Provider-free hooks generation
 *
 * Tests the generateOpencodeHelpers factory function that creates hooks
 * which read config from globalThis.__OPENCODE (injected by SSR plugin).
 *
 * Pattern: Test pure logic without DOM rendering (TDD doctrine)
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { getOpencodeConfig } from "./factory"
import type { OpencodeConfig } from "./next-ssr-plugin"

// Mock window for node environment
const mockWindow = {
	__OPENCODE: undefined as OpencodeConfig | undefined,
}

vi.stubGlobal("window", mockWindow)

describe("generateOpencodeHelpers", () => {
	beforeEach(() => {
		// Reset window.__OPENCODE between tests
		mockWindow.__OPENCODE = undefined
	})

	describe("getOpencodeConfig", () => {
		it("reads from globalThis when available", () => {
			mockWindow.__OPENCODE = {
				baseUrl: "/api/opencode/4056",
				directory: "/path",
			}

			const config = getOpencodeConfig()

			expect(config.baseUrl).toBe("/api/opencode/4056")
			expect(config.directory).toBe("/path")
		})

		it("uses fallback config when globalThis empty", () => {
			const fallback: OpencodeConfig = {
				baseUrl: "/fallback",
				directory: "/fallback-path",
			}

			const config = getOpencodeConfig(fallback)

			expect(config.baseUrl).toBe("/fallback")
			expect(config.directory).toBe("/fallback-path")
		})

		it("prefers globalThis over fallback", () => {
			mockWindow.__OPENCODE = {
				baseUrl: "/global",
				directory: "/global-path",
			}

			const fallback: OpencodeConfig = {
				baseUrl: "/fallback",
				directory: "/fallback-path",
			}

			const config = getOpencodeConfig(fallback)

			expect(config.baseUrl).toBe("/global")
			expect(config.directory).toBe("/global-path")
		})

		it("throws when no config available", () => {
			expect(() => {
				getOpencodeConfig()
			}).toThrow(/No configuration found/)
		})

		it("throws with helpful error message mentioning SSR plugin", () => {
			expect(() => {
				getOpencodeConfig()
			}).toThrow(/Did you forget to add <OpencodeSSRPlugin>/)
		})

		it("rejects fallback without baseUrl", () => {
			const invalidFallback = {
				baseUrl: "",
				directory: "/path",
			}

			expect(() => {
				getOpencodeConfig(invalidFallback)
			}).toThrow(/No configuration found/)
		})
	})

	describe("config serialization", () => {
		it("config is JSON-serializable", () => {
			const config: OpencodeConfig = {
				baseUrl: "/api",
				directory: "/path",
			}

			expect(() => JSON.stringify(config)).not.toThrow()
			const serialized = JSON.stringify(config)
			const deserialized = JSON.parse(serialized)

			expect(deserialized).toEqual(config)
		})
	})

	describe("type safety", () => {
		it("OpencodeConfig has required fields", () => {
			const config: OpencodeConfig = {
				baseUrl: "/api",
				directory: "/path",
			}

			expect(config).toHaveProperty("baseUrl")
			expect(config).toHaveProperty("directory")
		})
	})
})
