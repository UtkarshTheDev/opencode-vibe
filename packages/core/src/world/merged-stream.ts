/**
 * Merged Stream - Combines multiple event sources into unified World Stream
 *
 * Extends the base World Stream to support pluggable event sources (SwarmDb, Git, etc.)
 * in addition to SSE. Uses Effect Stream.mergeAll to combine sources efficiently.
 *
 * Architecture:
 * - Checks source.available() before including in merge
 * - Filters out unavailable sources gracefully
 * - Uses Stream.mergeAll for concurrent event emission
 * - Maintains existing World Stream API (subscribe, getSnapshot, async iterator)
 *
 * Pattern from Hivemind (mem-dba88064f38c20fc):
 * - Stream.mergeAll for combining multiple streams
 * - Effect.all for parallel availability checks
 * - Graceful degradation when sources unavailable
 */

import { Effect, Stream } from "effect"
import type { EventSource, SourceEvent } from "./event-source.js"
import type { WorldStreamConfig, WorldStreamHandle, WorldState } from "./types.js"
import { WorldStore } from "./atoms.js"
import { WorldSSE } from "./sse.js"
import { discoverServers } from "../discovery/server-discovery.js"

/**
 * Extended config for merged streams
 */
export interface MergedStreamConfig extends WorldStreamConfig {
	/**
	 * Additional event sources to merge with SSE
	 * Each source is checked for availability before inclusion
	 */
	sources?: EventSource[]
}

/**
 * Extended handle with stream() method for testing
 * Not part of public WorldStreamHandle API
 */
export interface MergedStreamHandle extends WorldStreamHandle {
	/**
	 * Get merged event stream (for testing)
	 * Internal use only - not part of public API
	 */
	stream(): Stream.Stream<SourceEvent, Error>
}

/**
 * Create a merged world stream that combines SSE with additional event sources
 *
 * Checks each source's availability and merges all available streams using
 * Stream.mergeAll. Unavailable sources are filtered out gracefully.
 *
 * @param config - Configuration including optional additional sources
 *
 * @example
 * ```typescript
 * import { createMergedWorldStream, createSwarmDbSource } from "@opencode-vibe/core/world"
 *
 * const swarmDb = createSwarmDbSource("~/.config/swarm-tools/swarm.db")
 *
 * const stream = createMergedWorldStream({
 *   baseUrl: "http://localhost:1999",
 *   sources: [swarmDb]
 * })
 *
 * // All events (SSE + SwarmDb) flow through unified stream
 * for await (const world of stream) {
 *   console.log(world.sessions)
 * }
 * ```
 */
export function createMergedWorldStream(config: MergedStreamConfig = {}): MergedStreamHandle {
	const { baseUrl, autoReconnect = true, onEvent, sources = [] } = config

	const store = new WorldStore()

	// Create SSE instance (will be started after discovery completes)
	let sse: WorldSSE | null = null

	// If baseUrl provided, start immediately
	if (baseUrl) {
		sse = new WorldSSE(store, {
			serverUrl: baseUrl,
			autoReconnect,
			onEvent,
		})
		sse.start()
	} else {
		// No baseUrl - run discovery first
		store.setConnectionStatus("connecting")
		discoverServers()
			.then((servers) => {
				if (servers.length === 0) {
					// No servers found
					store.setConnectionStatus("error")
					return
				}
				// Use first server (sorted by port in discovery)
				const firstServer = servers[0]
				const discoveredUrl = `http://127.0.0.1:${firstServer.port}`

				// Create and start SSE with discovered URL
				sse = new WorldSSE(store, {
					serverUrl: discoveredUrl,
					autoReconnect,
					onEvent,
				})
				sse.start()
			})
			.catch(() => {
				// Discovery failed
				store.setConnectionStatus("error")
			})
	}

	/**
	 * Create merged event stream from all available sources
	 *
	 * Checks availability and merges streams using Stream.mergeAll.
	 * Internal method for testing - not part of public WorldStreamHandle API.
	 */
	function stream(): Stream.Stream<SourceEvent, Error> {
		// Check availability for all sources in parallel
		// Catch both typed errors and defects (thrown exceptions)
		const availabilityChecks = sources.map((source) =>
			source.available().pipe(
				Effect.map((isAvailable) => ({ source, isAvailable })),
				// Catch defects first (thrown errors)
				Effect.catchAllDefect(() => Effect.succeed({ source, isAvailable: false })),
				// Then catch typed errors
				Effect.catchAll(() => Effect.succeed({ source, isAvailable: false })),
			),
		)

		return Stream.unwrap(
			Effect.gen(function* () {
				// Wait for all availability checks
				const results = yield* Effect.all(availabilityChecks, { concurrency: "unbounded" })

				// Filter to only available sources
				const availableSources = results.filter((r) => r.isAvailable).map((r) => r.source)

				// If no available sources, return empty stream
				if (availableSources.length === 0) {
					return Stream.empty
				}

				// Create streams from all available sources
				const streams = availableSources.map((source) => source.stream())

				// Merge all streams
				return Stream.mergeAll(streams, { concurrency: "unbounded" })
			}),
		)
	}

	/**
	 * Subscribe to world state changes
	 */
	function subscribe(callback: (state: WorldState) => void): () => void {
		return store.subscribe(callback)
	}

	/**
	 * Get current world state snapshot
	 */
	async function getSnapshot(): Promise<WorldState> {
		return store.getState()
	}

	/**
	 * Async iterator for world state changes
	 */
	async function* asyncIterator(): AsyncIterableIterator<WorldState> {
		// Yield current state immediately
		yield store.getState()

		// Then yield on every change
		const queue: WorldState[] = []
		let resolveNext: ((state: WorldState) => void) | null = null

		const unsubscribe = store.subscribe((state) => {
			if (resolveNext) {
				resolveNext(state)
				resolveNext = null
			} else {
				queue.push(state)
			}
		})

		try {
			while (true) {
				if (queue.length > 0) {
					yield queue.shift()!
				} else {
					// Wait for next state
					const state = await new Promise<WorldState>((resolve) => {
						resolveNext = resolve
					})
					yield state
				}
			}
		} finally {
			unsubscribe()
		}
	}

	/**
	 * Clean up resources
	 */
	async function dispose(): Promise<void> {
		sse?.stop()
	}

	return {
		subscribe,
		getSnapshot,
		stream,
		[Symbol.asyncIterator]: asyncIterator,
		dispose,
	}
}
