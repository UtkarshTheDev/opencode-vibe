import { notFound } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/core/client"
import { transformMessages, type OpenCodeMessage } from "@/lib/transform-messages"
import type { Session } from "@opencode-ai/sdk/client"
import { SessionLayout } from "./session-layout"
import { Loader } from "@/components/ai-elements/loader"

// SDK Message type is a union - we need the assistant/user message shape
type SDKMessage = {
	id: string
	role: string
	createdAt: string
	parts?: unknown[]
}

interface Props {
	params: Promise<{ id: string }>
	searchParams: Promise<{ dir?: string }>
}

/**
 * Fetch session data from the API (cached)
 */
async function getSession(id: string, directory?: string): Promise<Session | null> {
	"use cache"

	try {
		const client = createClient(directory)
		const result = await client.session.get({ path: { id } })
		return result.data || null
	} catch {
		return null
	}
}

/**
 * Fetch messages for a session (cached)
 */
async function getMessages(id: string, directory?: string) {
	"use cache"

	try {
		const client = createClient(directory)
		const result = await client.session.messages({ path: { id } })

		if (!result.data) return []

		// Convert to OpenCodeMessage format for transform
		// SDK returns union type, cast to our expected shape
		const opencodeMessages: OpenCodeMessage[] = (result.data as unknown as SDKMessage[]).map(
			(msg) => ({
				info: msg as unknown as OpenCodeMessage["info"],
				parts: (msg.parts || []) as OpenCodeMessage["parts"],
			}),
		)

		return transformMessages(opencodeMessages)
	} catch {
		return []
	}
}

/**
 * Session content - fetches session AND messages
 * All data fetching happens here inside Suspense
 */
async function SessionContent({
	paramsPromise,
	searchParamsPromise,
}: {
	paramsPromise: Promise<{ id: string }>
	searchParamsPromise: Promise<{ dir?: string }>
}) {
	// Await params inside Suspense boundary
	const { id: sessionId } = await paramsPromise
	const { dir: directory } = await searchParamsPromise

	// Fetch both in parallel
	const [session, initialMessages] = await Promise.all([
		getSession(sessionId, directory),
		getMessages(sessionId, directory),
	])

	// Handle not found inside the async component
	if (!session) {
		notFound()
	}

	return (
		<SessionLayout
			session={session}
			sessionId={sessionId}
			directory={directory}
			initialMessages={initialMessages}
		/>
	)
}

/**
 * Loading fallback for session content
 */
function SessionLoading() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<Loader />
		</div>
	)
}

/**
 * Session detail page - Server Component
 *
 * Passes params/searchParams promises to child component
 * so they can be awaited inside Suspense boundary.
 */
export default function SessionPage({ params, searchParams }: Props) {
	return (
		<div className="h-dvh flex flex-col bg-background">
			<Suspense fallback={<SessionLoading />}>
				<SessionContent paramsPromise={params} searchParamsPromise={searchParams} />
			</Suspense>
		</div>
	)
}
