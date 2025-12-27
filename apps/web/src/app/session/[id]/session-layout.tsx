"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import type { UIMessage } from "ai"
import { useSSE } from "@/react"
import { transformMessages, type OpenCodeMessage } from "@/lib/transform-messages"
import { NewSessionButton } from "./new-session-button"
import { ContextUsage } from "./context-usage"
import { SessionMessages } from "./session-messages"
import type { Session } from "@opencode-ai/sdk/client"

/**
 * SSE event payload shapes (from OpenCode API)
 */
type MessageInfo = {
	id: string
	sessionID: string
	role: string
	createdAt?: string
	time?: { created: number; completed?: number }
}

interface SessionLayoutProps {
	session: Session
	sessionId: string
	directory?: string
	initialMessages: UIMessage[]
}

/**
 * Client component wrapper for session page
 *
 * Manages shared state between header (ContextUsage) and SessionMessages.
 * Subscribes to message.updated events to maintain rawMessages for context monitoring.
 */
export function SessionLayout({
	session,
	sessionId,
	directory,
	initialMessages,
}: SessionLayoutProps) {
	const [rawMessages, setRawMessages] = useState<OpenCodeMessage[]>([])
	const { subscribe } = useSSE()

	// Normalize directory for comparison (remove trailing slash)
	const normalizedDirectory = directory?.replace(/\/$/, "")

	// Subscribe to message.updated events to track rawMessages
	useEffect(() => {
		const unsubscribeMessageUpdated = subscribe("message.updated", (event) => {
			// Filter by directory if provided
			if (normalizedDirectory && event.directory?.replace(/\/$/, "") !== normalizedDirectory) {
				return
			}

			const props = event.payload?.properties as { info?: MessageInfo } | undefined
			const info = props?.info
			if (!info || info.sessionID !== sessionId) return

			// Build OpenCodeMessage from the info
			const opencodeMsg: OpenCodeMessage = {
				info: info as unknown as OpenCodeMessage["info"],
				parts: [],
			}

			// Add or update message
			setRawMessages((prev) => {
				const exists = prev.some((msg) => msg.info.id === info.id)
				if (exists) {
					return prev.map((msg) =>
						msg.info.id === info.id ? { ...msg, info: opencodeMsg.info } : msg,
					)
				}
				return [...prev, opencodeMsg].sort((a, b) => a.info.id.localeCompare(b.info.id))
			})
		})

		return () => {
			unsubscribeMessageUpdated()
		}
	}, [sessionId, normalizedDirectory, subscribe])

	return (
		<>
			{/* Header - fixed height, doesn't scroll */}
			<header className="shrink-0 z-10 backdrop-blur-sm bg-background/80 border-b border-border/50">
				<div className="max-w-4xl mx-auto px-4 py-3">
					<div className="flex items-center justify-between">
						<Link
							href="/"
							className="text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							← Back
						</Link>
						<div className="flex items-center gap-4">
							<ContextUsage messages={rawMessages} />
							<NewSessionButton directory={directory} />
						</div>
					</div>
					<h1 className="text-lg font-semibold text-foreground mt-1 line-clamp-1">
						{session.title || "Untitled Session"}
					</h1>
					<p className="text-xs text-muted-foreground">
						{new Date(session.time.updated).toLocaleString()}
					</p>
				</div>
			</header>

			{/* Messages container - full width for scroll, content centered */}
			<main className="flex-1 min-h-0">
				<SessionMessages
					sessionId={sessionId}
					directory={directory}
					initialMessages={initialMessages}
				/>
			</main>
		</>
	)
}
