/**
 * Canonical SSE event types for the opencode system.
 * All other packages should re-export from here.
 *
 * These types define the event structures used across the real-time
 * event streaming system. Originally duplicated across react/types,
 * react/store, and imported from SDK - now consolidated here.
 */

/**
 * Global SSE event structure from OpenCode backend
 *
 * @example
 * ```typescript
 * {
 *   directory: "/Users/joel/Code/my-project",
 *   payload: {
 *     type: "session.status",
 *     properties: { sessionID: "abc123", status: "running" }
 *   }
 * }
 * ```
 */
export interface GlobalEvent {
	directory: string
	payload: {
		type: string
		properties: Record<string, unknown>
	}
}

/**
 * Session execution status
 */
export type SessionStatus = "pending" | "running" | "completed" | "error"

/**
 * Discovered OpenCode server instance
 */
export interface DiscoveredServer {
	port: number
	pid: number
	directory: string
	sessions?: string[] // Session IDs hosted by this server
}

/**
 * SSE connection state for observability
 */
export type ConnectionState = "connecting" | "connected" | "disconnected"

/**
 * Extended connection state with timing metadata
 */
export interface ConnectionStateExtended {
	state: ConnectionState
	lastEventTime?: number
	backoffAttempt?: number
}

/**
 * Aggregated SSE state across all discovered servers
 */
export interface SSEState {
	servers: DiscoveredServer[]
	connections: [number, ConnectionStateExtended][] // [port, state] tuples
	discovering: boolean
	connected: boolean // True if any connection is active
}
