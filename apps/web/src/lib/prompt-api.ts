/**
 * API conversion utilities for prompt parts.
 *
 * Converts client-side prompt parts (TextPart, FileAttachmentPart) to API format
 * for submission to the OpenCode backend.
 */

import type { Prompt, FileAttachmentPart } from "@/types/prompt"

export interface TextPartInput {
	id: string
	type: "text"
	text: string
}

export interface FilePartInput {
	id: string
	type: "file"
	mime: string
	url: string // file:///absolute/path
	filename?: string
	source?: {
		type: "file"
		path: string
		text: {
			value: string
			start: number
			end: number
		}
	}
}

/**
 * Convert prompt parts to API format.
 *
 * - Combines all text parts into single TextPartInput
 * - Converts FileAttachmentPart to FilePartInput with file:// URLs
 * - Handles line selections with query params (?start=N&end=M)
 * - Generates unique IDs for each part
 *
 * @param prompt - Array of prompt parts from PromptInput
 * @param directory - Project directory for resolving relative paths
 * @returns Array of API-ready parts
 */
export function convertToApiParts(
	prompt: Prompt,
	directory: string,
): (TextPartInput | FilePartInput)[] {
	// Helper: Convert relative path to absolute
	const toAbsolutePath = (path: string) => (path.startsWith("/") ? path : `${directory}/${path}`)

	// Helper: Extract filename from path
	const getFilename = (path: string) => {
		const parts = path.split("/")
		return parts[parts.length - 1]
	}

	// Combine all text parts into single text string
	const textContent = prompt
		.filter((p) => p.type === "text")
		.map((p) => p.content)
		.join("")

	// Create text part (always present, even if empty)
	const textPart: TextPartInput = {
		id: crypto.randomUUID(),
		type: "text",
		text: textContent,
	}

	// Convert file attachments to FilePartInput
	const fileParts: FilePartInput[] = prompt
		.filter((p): p is FileAttachmentPart => p.type === "file")
		.map((attachment) => {
			const absolute = toAbsolutePath(attachment.path)
			const query = attachment.selection
				? `?start=${attachment.selection.startLine}&end=${attachment.selection.endLine}`
				: ""

			return {
				id: crypto.randomUUID(),
				type: "file",
				mime: "text/plain",
				url: `file://${absolute}${query}`,
				filename: getFilename(attachment.path),
				source: {
					type: "file",
					path: absolute,
					text: {
						value: attachment.content,
						start: attachment.start,
						end: attachment.end,
					},
				},
			}
		})

	return [textPart, ...fileParts]
}
