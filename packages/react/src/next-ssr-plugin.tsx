/**
 * OpencodeSSRPlugin - Inject OpenCode configuration before React hydrates
 *
 * Pattern: uploadthing's useServerInsertedHTML approach
 *
 * Usage:
 * ```tsx
 * // app/layout.tsx
 * <OpencodeSSRPlugin config={{ baseUrl: "/api/opencode/4056", directory: "/path" }} />
 * ```
 */
"use client"

import { useServerInsertedHTML } from "next/navigation"

export interface OpencodeConfig {
	baseUrl: string
	directory: string
}

export interface OpencodeSSRPluginProps {
	config: OpencodeConfig
}

/**
 * Injects OpenCode configuration into globalThis before React hydration
 *
 * This eliminates the need for a React provider wrapper by making config
 * available synchronously during client-side rendering.
 */
export function OpencodeSSRPlugin({ config }: OpencodeSSRPluginProps) {
	useServerInsertedHTML(() => {
		return (
			<script
				dangerouslySetInnerHTML={{
					__html: `window.__OPENCODE = ${JSON.stringify(config)};`,
				}}
			/>
		)
	})

	return null
}
