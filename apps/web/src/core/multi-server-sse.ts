/**
 * Multi-Server SSE Manager
 *
 * Discovers all running opencode servers on the local machine and subscribes
 * to their SSE event streams. Aggregates session.status events from all servers
 * into a unified stream.
 *
 * Architecture:
 * - Polls /api/opencode-servers to discover running servers
 * - Maintains SSE connections to each discovered server
 * - Reconnects automatically on disconnect
 * - Cleans up connections when servers die
 *
 * @example
 * ```tsx
 * const manager = new MultiServerSSE()
 * manager.start()
 * manager.onStatus((update) => {
 *   store.handleEvent(update.directory, {
 *     type: "session.status",
 *     properties: { sessionID: update.sessionID, status: update.status },
 *   })
 * })
 * // Later:
 * manager.stop()
 * ```
 */

import { EventSourceParserStream } from "eventsource-parser/stream"

interface DiscoveredServer {
	port: number
	pid: number
	directory: string
}

interface StatusUpdate {
	directory: string
	sessionID: string
	status: { type: string; [key: string]: unknown }
}

type StatusCallback = (update: StatusUpdate) => void

/**
 * Full SSE event from a server
 */
interface SSEEvent {
	directory: string
	payload: { type: string; properties: Record<string, unknown> }
}

type EventCallback = (event: SSEEvent) => void

export class MultiServerSSE {
	private connections = new Map<number, AbortController>()
	private statusCallbacks: StatusCallback[] = []
	private eventCallbacks: EventCallback[] = []
	private discoveryInterval?: ReturnType<typeof setInterval>
	private started = false
	private paused = false
	private visibilityHandler?: () => void

	// Directory -> Ports mapping (multiple servers can run for same directory)
	private directoryToPorts = new Map<string, number[]>()

	// Session -> Port cache (tracks which server sent events for which session)
	private sessionToPort = new Map<string, number>()

	constructor(private discoveryIntervalMs = 5000) {} // 5s - need fast discovery for good UX

	/**
	 * Get all ports for a directory
	 */
	getPortsForDirectory(directory: string): number[] {
		return this.directoryToPorts.get(directory) ?? []
	}

	/**
	 * Get the port for a specific session (if we've seen events from it)
	 */
	getPortForSession(sessionId: string): number | undefined {
		return this.sessionToPort.get(sessionId)
	}

	/**
	 * Get the base URL for a session's server (preferred) or directory's server (fallback)
	 */
	getBaseUrlForSession(sessionId: string, directory: string): string | undefined {
		// First, check if we know which server owns this session
		const sessionPort = this.sessionToPort.get(sessionId)
		if (sessionPort) {
			return `http://127.0.0.1:${sessionPort}`
		}

		// Fallback to first port for directory
		const ports = this.directoryToPorts.get(directory)
		return ports?.[0] ? `http://127.0.0.1:${ports[0]}` : undefined
	}

	/**
	 * Get the base URL for a directory's server (first one if multiple)
	 * Returns undefined if no server found for this directory
	 */
	getBaseUrlForDirectory(directory: string): string | undefined {
		const ports = this.directoryToPorts.get(directory)
		return ports?.[0] ? `http://127.0.0.1:${ports[0]}` : undefined
	}

	/**
	 * Start discovering servers and subscribing to their events
	 */
	start() {
		if (this.started) return
		this.started = true

		// Discover immediately on start
		this.discover()
		this.discoveryInterval = setInterval(() => {
			if (!this.paused) this.discover()
		}, this.discoveryIntervalMs)

		// Pause polling when tab is hidden, resume when visible
		if (typeof document !== "undefined") {
			this.visibilityHandler = () => {
				this.paused = document.hidden
				// Discover immediately when tab becomes visible again
				if (!document.hidden && this.started) {
					this.discover()
				}
			}
			document.addEventListener("visibilitychange", this.visibilityHandler)
		}
	}

	/**
	 * Stop all connections and discovery
	 */
	stop() {
		this.started = false

		if (this.discoveryInterval) {
			clearInterval(this.discoveryInterval)
			this.discoveryInterval = undefined
		}

		if (this.visibilityHandler && typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", this.visibilityHandler)
			this.visibilityHandler = undefined
		}

		for (const [, controller] of this.connections) {
			controller.abort()
		}
		this.connections.clear()
	}

	/**
	 * Subscribe to status updates from all servers
	 * @returns Unsubscribe function
	 */
	onStatus(callback: StatusCallback): () => void {
		this.statusCallbacks.push(callback)
		return () => {
			this.statusCallbacks = this.statusCallbacks.filter((cb) => cb !== callback)
		}
	}

	/**
	 * Subscribe to ALL events from all servers (messages, parts, etc.)
	 * @returns Unsubscribe function
	 */
	onEvent(callback: EventCallback): () => void {
		this.eventCallbacks.push(callback)
		return () => {
			this.eventCallbacks = this.eventCallbacks.filter((cb) => cb !== callback)
		}
	}

	private emitStatus(update: StatusUpdate) {
		for (const cb of this.statusCallbacks) {
			try {
				cb(update)
			} catch (e) {
				console.error("[MultiServerSSE] Status callback error:", e)
			}
		}
	}

	private emitEvent(event: SSEEvent) {
		for (const cb of this.eventCallbacks) {
			try {
				cb(event)
			} catch (e) {
				console.error("[MultiServerSSE] Event callback error:", e)
			}
		}
	}

	private async discover() {
		try {
			const response = await fetch("/api/opencode-servers")
			if (!response.ok) {
				console.warn("[MultiServerSSE] Discovery failed:", response.status)
				return
			}

			const servers: DiscoveredServer[] = await response.json()
			const activePorts = new Set(servers.map((s) => s.port))

			// Update directory -> ports mapping (multiple servers per directory)
			this.directoryToPorts.clear()
			for (const server of servers) {
				const existing = this.directoryToPorts.get(server.directory) ?? []
				existing.push(server.port)
				this.directoryToPorts.set(server.directory, existing)
			}

			// Clean up sessionToPort cache - remove entries for dead servers
			for (const [sessionId, port] of this.sessionToPort) {
				if (!activePorts.has(port)) {
					this.sessionToPort.delete(sessionId)
				}
			}

			// Remove connections to dead servers
			for (const [port, controller] of this.connections) {
				if (!activePorts.has(port)) {
					controller.abort()
					this.connections.delete(port)
				}
			}

			// Connect to new servers
			for (const server of servers) {
				if (!this.connections.has(server.port)) {
					this.connectToServer(server.port)
				}
			}
		} catch {
			// Discovery failed silently - will retry on next interval
		}
	}

	private async connectToServer(port: number) {
		const controller = new AbortController()
		this.connections.set(port, controller)

		while (!controller.signal.aborted && this.started) {
			try {
				const response = await fetch(`http://127.0.0.1:${port}/global/event`, {
					signal: controller.signal,
					headers: {
						Accept: "text/event-stream",
						"Cache-Control": "no-cache",
					},
				})

				if (!response.ok || !response.body) {
					throw new Error(`Failed to connect: ${response.status}`)
				}

				// Use EventSourceParserStream for proper SSE parsing
				const stream = response.body
					.pipeThrough(new TextDecoderStream())
					.pipeThrough(new EventSourceParserStream())

				const reader = stream.getReader()

				while (!controller.signal.aborted) {
					const { done, value } = await reader.read()
					if (done) break

					try {
						const event = JSON.parse(value.data)
						this.handleEvent(port, event)
					} catch {
						// Parse error - skip malformed event
					}
				}
			} catch {
				if (controller.signal.aborted) break
				// Wait before reconnecting
				await new Promise((r) => setTimeout(r, 2000))
			}
		}

		this.connections.delete(port)
	}

	private handleEvent(
		port: number,
		event: {
			directory?: string
			payload?: { type?: string; properties?: Record<string, unknown> }
		},
	) {
		const directory = event.directory
		const payload = event.payload

		if (!directory || directory === "global") return
		if (!payload?.type || !payload.properties) return

		// Track which port owns which session based on events we receive
		const props = payload.properties
		const sessionID =
			(props.sessionID as string) ??
			(props.info as { sessionID?: string })?.sessionID ??
			(props.part as { sessionID?: string })?.sessionID

		if (sessionID) {
			this.sessionToPort.set(sessionID, port)
		}

		// Emit ALL events to subscribers (messages, parts, status, etc.)
		this.emitEvent({
			directory,
			payload: payload as SSEEvent["payload"],
		})

		// Also emit status updates to legacy status-only subscribers
		if (payload.type === "session.status") {
			const { sessionID, status } = payload.properties as {
				sessionID: string
				status: { type: string }
			}
			if (sessionID && status) {
				this.emitStatus({ directory, sessionID, status })
			}
		}
	}
}

/**
 * Singleton instance for app-wide use
 */
export const multiServerSSE = new MultiServerSSE()
