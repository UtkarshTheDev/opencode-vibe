/**
 * Message types for OpenCode React package
 */

import type { Message, Part } from "@opencode-vibe/core/types"

/**
 * OpenCodeMessage combines message info with its parts
 * Used throughout the React package for message display
 */
export type OpenCodeMessage = {
	info: Message
	parts: Part[]
}
