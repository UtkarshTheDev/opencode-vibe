/**
 * useMultiDirectorySessions - Get sessions from multiple directories
 *
 * Returns sessions from the Zustand store for multiple project directories.
 * Merges store sessions with optional initial data. Subscribes to real-time updates via SSE.
 *
 * @example
 * ```tsx
 * const sessions = useMultiDirectorySessions(["/project1", "/project2"])
 * // Returns: { "/project1": [Session...], "/project2": [Session...] }
 * ```
 */

"use client"

import { useEffect, useState, useMemo } from "react"
import { useOpencodeStore } from "../store"
import type { Session } from "../store/types"

/**
 * Session in display format (for UI)
 */
export interface SessionDisplay {
	id: string
	title: string
	directory: string
	formattedTime: string
	timestamp: number
}

/**
 * Hook to get sessions from multiple directories
 *
 * Subscribes to store updates for all provided directories.
 * Returns sessions mapped by directory path.
 *
 * @param directories - Array of directory paths to get sessions for
 * @returns Record of directory -> SessionDisplay[]
 */
export function useMultiDirectorySessions(directories: string[]): Record<string, SessionDisplay[]> {
	const [liveSessions, setLiveSessions] = useState<Record<string, SessionDisplay[]>>({})

	/**
	 * Format relative time (e.g., "2 hours ago", "yesterday")
	 */
	const formatRelativeTime = (timestamp: number): string => {
		const now = Date.now()
		const diff = now - timestamp
		const minutes = Math.floor(diff / 60000)
		const hours = Math.floor(diff / 3600000)
		const days = Math.floor(diff / 86400000)

		if (minutes < 1) return "just now"
		if (minutes < 60) return `${minutes}m ago`
		if (hours < 24) return `${hours}h ago`
		if (days === 1) return "yesterday"
		if (days < 7) return `${days}d ago`
		return new Date(timestamp).toLocaleDateString()
	}

	/**
	 * Subscribe to store updates for all directories
	 *
	 * Converts store Session objects to SessionDisplay format.
	 * Updates when sessions array changes for any tracked directory.
	 */
	useEffect(() => {
		const directorySet = new Set(directories)

		const unsubscribe = useOpencodeStore.subscribe((state) => {
			const newSessions: Record<string, SessionDisplay[]> = {}

			for (const directory of directorySet) {
				const dirState = state.directories[directory]
				if (!dirState) continue

				// Convert store sessions to SessionDisplay format
				const storeSessions: SessionDisplay[] = dirState.sessions.map((session) => ({
					id: session.id,
					title: session.title || "Untitled Session",
					directory,
					formattedTime: formatRelativeTime(session.time.updated || session.time.created),
					timestamp: session.time.updated || session.time.created,
				}))

				newSessions[directory] = storeSessions
			}

			setLiveSessions(newSessions)
		})

		return unsubscribe
	}, [directories])

	return liveSessions
}
