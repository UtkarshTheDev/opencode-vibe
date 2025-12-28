"use client"

import { useEffect } from "react"
import Link from "next/link"
import type { UIMessage } from "ai"
import { OpenCodeProvider, useSession, useMessages, useSendMessage } from "@/react"
import { useOpencodeStore } from "@/react/store"
import { NewSessionButton } from "./new-session-button"
import { SessionMessages } from "./session-messages"
import { PromptInput } from "@/components/prompt"
import { OpenCodeLogo } from "@/components/opencode-logo"
import type { Session } from "@opencode-ai/sdk/client"
import type { Prompt } from "@/types/prompt"

interface SessionLayoutProps {
	session: Session
	sessionId: string
	directory?: string
	initialMessages: UIMessage[]
}

/**
 * Session content component - uses hooks to access reactive data
 *
 * Must be inside OpenCodeProvider to access useSession and useMessages.
 */
function SessionContent({
	sessionId,
	directory,
	initialMessages,
	initialSession,
}: {
	sessionId: string
	directory?: string
	initialMessages: UIMessage[]
	initialSession: Session
}) {
	const store = useOpencodeStore()

	// Hydrate store with initial session data on mount
	useEffect(() => {
		// Add session to store if not already present
		const existing = store.getSession(sessionId)
		if (!existing) {
			store.addSession(initialSession)
		}
	}, [sessionId, initialSession, store])

	// Get reactive session data from store (updated via SSE)
	const session = useSession(sessionId) ?? initialSession

	// Get reactive messages from store
	const storeMessages = useMessages(sessionId)

	// Send message hook
	const { sendMessage, isLoading } = useSendMessage({ sessionId, directory })

	// Handle prompt submission
	const handleSubmit = async (parts: Prompt) => {
		await sendMessage(parts)
	}

	return (
		<>
			{/* Header - fixed height, doesn't scroll */}
			<header className="shrink-0 z-10 backdrop-blur-sm bg-background/80 border-b border-border/50">
				<div className="max-w-4xl mx-auto px-4 py-3">
					<div className="flex items-center justify-between">
						<Link
							href="/"
							className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
						>
							<OpenCodeLogo width={100} height={18} className="text-foreground" />
							<span className="text-foreground/60 text-xs font-medium">|</span>
							<span className="text-foreground font-semibold text-sm tracking-wide">VIBE</span>
						</Link>
						<div className="flex items-center gap-4">
							{/* Show message count from useMessages hook */}
							<div className="text-xs text-muted-foreground">{storeMessages.length} messages</div>
							<NewSessionButton directory={directory} />
						</div>
					</div>
					{/* Session title from useSession hook */}
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
					status={isLoading ? "submitted" : undefined}
				/>
			</main>

			{/* Prompt input - fixed at bottom */}
			<footer className="shrink-0 bg-background">
				<div className="max-w-4xl mx-auto px-4 py-3">
					<PromptInput
						sessionId={sessionId}
						onSubmit={handleSubmit}
						disabled={isLoading}
						placeholder="Type a message... Use @ for files, / for commands"
					/>
				</div>
			</footer>
		</>
	)
}

/**
 * Client component wrapper for session page
 *
 * Wraps content with OpenCodeProvider to enable reactive hooks.
 * Server-provided initial data is used as fallback until SSE updates arrive.
 */
export function SessionLayout({
	session,
	sessionId,
	directory,
	initialMessages,
}: SessionLayoutProps) {
	// Default URL to localhost:4056 (OpenCode server)
	const url = process.env.NEXT_PUBLIC_OPENCODE_URL || "http://localhost:4056"

	return (
		<OpenCodeProvider url={url} directory={directory || session.directory}>
			<SessionContent
				sessionId={sessionId}
				directory={directory}
				initialMessages={initialMessages}
				initialSession={session}
			/>
		</OpenCodeProvider>
	)
}
