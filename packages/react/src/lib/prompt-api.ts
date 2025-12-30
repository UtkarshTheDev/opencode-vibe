/**
 * Prompt API utilities for OpenCode React package
 * Converts client-side prompt parts to API format
 */

import type { Prompt } from "../types/prompt"

/**
 * API part format expected by OpenCode server
 */
export type ApiPart = ApiTextPart | ApiFilePart | ApiImagePart

export interface ApiTextPart {
	type: "text"
	text: string
	id: string
}

export interface ApiFilePart {
	type: "file"
	mime: string
	url: string
	filename: string
}

export interface ApiImagePart {
	type: "image"
	mime: string
	url: string
	filename: string
}

/**
 * Generate a unique ID for a part (simple counter-based for now)
 */
let partIdCounter = 0
function generatePartId(): string {
	return `part-${Date.now()}-${partIdCounter++}`
}

/**
 * Convert client-side prompt parts to API format
 *
 * @param parts - Client-side prompt parts with start/end positions
 * @param directory - Base directory for resolving relative file paths
 * @returns Array of API parts ready to send to server
 */
export function convertToApiParts(parts: Prompt, directory: string): ApiPart[] {
	return parts.map((part) => {
		if (part.type === "text") {
			return {
				type: "text",
				text: part.content,
				id: generatePartId(),
			}
		}

		if (part.type === "file") {
			// Convert relative path to absolute file:// URL
			const absolutePath = part.path.startsWith("/") ? part.path : `${directory}/${part.path}`

			// Extract filename from path
			const filename = part.path.split("/").pop() || "file"

			// Determine mime type from extension (simple heuristic)
			const ext = filename.split(".").pop()?.toLowerCase()
			const mime = getMimeType(ext || "")

			return {
				type: "file",
				mime,
				url: `file://${absolutePath}`,
				filename,
			}
		}

		// image part - uses dataUrl from ImageAttachmentPart
		return {
			type: "image",
			mime: part.mime,
			url: part.dataUrl,
			filename: part.filename,
		}
	})
}

/**
 * Get MIME type from file extension
 */
function getMimeType(ext: string): string {
	const mimeTypes: Record<string, string> = {
		// Text files
		txt: "text/plain",
		md: "text/markdown",
		json: "application/json",
		js: "text/javascript",
		ts: "text/plain",
		tsx: "text/plain",
		jsx: "text/plain",
		css: "text/css",
		html: "text/html",
		xml: "text/xml",
		yaml: "text/yaml",
		yml: "text/yaml",

		// Images
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		svg: "image/svg+xml",
		webp: "image/webp",
	}

	return mimeTypes[ext] || "text/plain"
}
