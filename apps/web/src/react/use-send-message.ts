import { useCallback, useState, useMemo } from "react"
import { createClient } from "@/core/client"
import type { Prompt } from "@/types/prompt"
import { convertToApiParts } from "@/lib/prompt-api"

export interface ModelSelection {
	providerID: string
	modelID: string
}

export interface UseSendMessageOptions {
	sessionId: string
	directory?: string
}

export interface UseSendMessageReturn {
	sendMessage: (parts: Prompt, model?: ModelSelection) => Promise<void>
	isLoading: boolean
	error?: Error
}

/**
 * Hook for sending messages to an OpenCode session.
 *
 * Accepts rich prompt parts (text, file attachments) and converts them
 * to API format before sending.
 *
 * @example
 * ```tsx
 * const { sendMessage, isLoading, error } = useSendMessage({
 *   sessionId: "ses_123",
 *   directory: "/path/to/project"
 * })
 *
 * const parts: Prompt = [
 *   { type: "text", content: "Fix bug in ", start: 0, end: 11 },
 *   { type: "file", path: "src/auth.ts", content: "@src/auth.ts", start: 11, end: 23 }
 * ]
 * await sendMessage(parts)
 * ```
 */
export function useSendMessage({
	sessionId,
	directory,
}: UseSendMessageOptions): UseSendMessageReturn {
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<Error | undefined>(undefined)

	// Create client with directory scoping
	const client = useMemo(() => createClient(directory), [directory])

	const sendMessage = useCallback(
		async (parts: Prompt, model?: ModelSelection) => {
			// Don't send empty messages
			if (parts.length === 0) {
				return
			}

			setIsLoading(true)
			setError(undefined)

			try {
				// Convert client parts to API format
				const apiParts = convertToApiParts(parts, directory || "")

				await client.session.prompt({
					path: { id: sessionId },
					body: {
						parts: apiParts,
						model: model
							? {
									providerID: model.providerID,
									modelID: model.modelID,
								}
							: undefined,
					},
				})
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				throw error
			} finally {
				setIsLoading(false)
			}
		},
		[client, sessionId, directory],
	)

	return {
		sendMessage,
		isLoading,
		error,
	}
}
