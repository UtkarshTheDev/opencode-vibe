/**
 * Merged Stream Tests
 *
 * Tests for createMergedWorldStream - combining multiple event sources
 * into a single merged stream.
 */

import { describe, it, expect } from "vitest"
import { Effect, Stream } from "effect"
import { createMergedWorldStream } from "./merged-stream.js"
import type { EventSource, SourceEvent } from "./event-source.js"

/**
 * Create a mock EventSource that emits test events
 */
function createMockSource(
	name: string,
	events: Array<Omit<SourceEvent, "source">>,
	isAvailable = true,
): EventSource {
	return {
		name,
		available: () => Effect.succeed(isAvailable),
		stream: () =>
			Stream.fromIterable(
				events.map((e) => ({
					...e,
					source: name,
				})),
			),
	}
}

describe("createMergedWorldStream", () => {
	describe("basic merging", () => {
		it("merges events from multiple sources", async () => {
			const source1 = createMockSource("source1", [
				{ type: "test1", data: "a", timestamp: 100 },
				{ type: "test1", data: "b", timestamp: 200 },
			])

			const source2 = createMockSource("source2", [
				{ type: "test2", data: "x", timestamp: 150 },
				{ type: "test2", data: "y", timestamp: 250 },
			])

			const stream = createMergedWorldStream({
				sources: [source1, source2],
			})

			// Collect all events
			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			// Should have events from both sources
			expect(events).toHaveLength(4)

			const source1Events = events.filter((e) => e.source === "source1")
			const source2Events = events.filter((e) => e.source === "source2")

			expect(source1Events).toHaveLength(2)
			expect(source2Events).toHaveLength(2)

			// Verify event content
			expect(source1Events[0]).toMatchObject({
				source: "source1",
				type: "test1",
				data: "a",
				timestamp: 100,
			})

			expect(source2Events[0]).toMatchObject({
				source: "source2",
				type: "test2",
				data: "x",
				timestamp: 150,
			})

			await stream.dispose()
		})

		it("handles empty sources array", async () => {
			const stream = createMergedWorldStream({
				sources: [],
			})

			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			expect(events).toHaveLength(0)

			await stream.dispose()
		})

		it("handles undefined sources (no additional sources)", async () => {
			// Should work with just SSE (no additional sources)
			const stream = createMergedWorldStream({})

			// This test just verifies it doesn't crash
			// Actual SSE connection is tested in stream.test.ts
			expect(stream).toBeDefined()
			expect(stream.stream).toBeDefined()

			await stream.dispose()
		})
	})

	describe("source availability filtering", () => {
		it("excludes unavailable sources", async () => {
			const availableSource = createMockSource(
				"available",
				[{ type: "test", data: "ok", timestamp: 100 }],
				true,
			)

			const unavailableSource = createMockSource(
				"unavailable",
				[{ type: "test", data: "should-not-appear", timestamp: 200 }],
				false, // NOT available
			)

			const stream = createMergedWorldStream({
				sources: [availableSource, unavailableSource],
			})

			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			// Should only have events from available source
			expect(events).toHaveLength(1)
			expect(events[0].source).toBe("available")
			expect(events[0].data).toBe("ok")

			await stream.dispose()
		})

		it("handles all sources unavailable gracefully", async () => {
			const source1 = createMockSource(
				"source1",
				[{ type: "test", data: "x", timestamp: 100 }],
				false,
			)
			const source2 = createMockSource(
				"source2",
				[{ type: "test", data: "y", timestamp: 200 }],
				false,
			)

			const stream = createMergedWorldStream({
				sources: [source1, source2],
			})

			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			// No events from unavailable sources
			expect(events).toHaveLength(0)

			await stream.dispose()
		})

		it("includes only available sources in mixed scenario", async () => {
			const sources = [
				createMockSource("available1", [{ type: "a", data: 1, timestamp: 100 }], true),
				createMockSource("unavailable1", [{ type: "b", data: 2, timestamp: 200 }], false),
				createMockSource("available2", [{ type: "c", data: 3, timestamp: 300 }], true),
				createMockSource("unavailable2", [{ type: "d", data: 4, timestamp: 400 }], false),
			]

			const stream = createMergedWorldStream({ sources })

			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			expect(events).toHaveLength(2)
			expect(events.map((e) => e.source).sort()).toEqual(["available1", "available2"])

			await stream.dispose()
		})
	})

	describe("event ordering", () => {
		it("preserves sequence numbers from sources", async () => {
			const source = createMockSource("sequenced", [
				{ type: "event", data: "first", timestamp: 100, sequence: 1 },
				{ type: "event", data: "second", timestamp: 200, sequence: 2 },
				{ type: "event", data: "third", timestamp: 300, sequence: 3 },
			])

			const stream = createMergedWorldStream({ sources: [source] })

			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			expect(events[0].sequence).toBe(1)
			expect(events[1].sequence).toBe(2)
			expect(events[2].sequence).toBe(3)

			await stream.dispose()
		})

		it("handles mixed sequenced and non-sequenced events", async () => {
			const sequenced = createMockSource("sequenced", [
				{ type: "s1", data: "seq", timestamp: 100, sequence: 10 },
			])

			const nonSequenced = createMockSource("non-sequenced", [
				{ type: "n1", data: "no-seq", timestamp: 200 },
			])

			const stream = createMergedWorldStream({
				sources: [sequenced, nonSequenced],
			})

			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			expect(events).toHaveLength(2)

			const seqEvent = events.find((e) => e.source === "sequenced")
			const nonSeqEvent = events.find((e) => e.source === "non-sequenced")

			expect(seqEvent?.sequence).toBe(10)
			expect(nonSeqEvent?.sequence).toBeUndefined()

			await stream.dispose()
		})
	})

	describe("error handling", () => {
		it("propagates errors from source streams", async () => {
			const errorSource: EventSource = {
				name: "error-source",
				available: () => Effect.succeed(true),
				stream: () => Stream.fail(new Error("Source stream error")),
			}

			const stream = createMergedWorldStream({
				sources: [errorSource],
			})

			// Should propagate the error
			await expect(Effect.runPromise(Stream.runCollect(stream.stream()))).rejects.toThrow(
				"Source stream error",
			)

			await stream.dispose()
		})

		it("handles availability check errors gracefully", async () => {
			const failingAvailabilitySource: EventSource = {
				name: "failing-check",
				available: () =>
					Effect.sync(() => {
						throw new Error("Availability check failed")
					}),
				stream: () =>
					Stream.fromIterable([
						{ source: "failing-check", type: "test", data: "x", timestamp: 100 },
					]),
			}

			const goodSource = createMockSource("good", [{ type: "test", data: "ok", timestamp: 200 }])

			const stream = createMergedWorldStream({
				sources: [failingAvailabilitySource, goodSource],
			})

			// Should treat failed availability check as unavailable
			const events = await Effect.runPromise(
				Stream.runCollect(stream.stream()).pipe(Effect.map((chunk) => Array.from(chunk))),
			)

			// Only good source should emit
			expect(events).toHaveLength(1)
			expect(events[0].source).toBe("good")

			await stream.dispose()
		})
	})
})
