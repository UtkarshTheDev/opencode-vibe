/**
 * Transform layer: OpenCode SDK types → ai-elements UIMessage types
 *
 * This module handles the conversion between OpenCode's {info, parts} message structure
 * and the ai-elements library's UIMessage format used for rendering.
 */

import type {
	Message,
	Part,
	TextPart,
	ReasoningPart,
	FilePart,
	ToolPart,
	ToolState,
	StepStartPart,
} from "@opencode-ai/sdk/client"
import type { UIMessage, UIMessagePart } from "ai"

/**
 * OpenCode API returns messages as {info: Message, parts: Part[]}
 * This type represents that envelope structure
 */
export type OpenCodeMessage = {
	info: Message
	parts: Part[]
}

/**
 * Tool state mapping: OpenCode → ai-elements
 *
 * OpenCode states: pending | running | completed | error
 * ai-elements states: input-streaming | input-available | output-available | output-error | etc.
 */
function transformToolState(
	state: ToolState,
): "input-streaming" | "input-available" | "output-available" | "output-error" {
	switch (state.status) {
		case "pending":
			return "input-streaming"
		case "running":
			return "input-available"
		case "completed":
			return "output-available"
		case "error":
			return "output-error"
	}
}

/**
 * Transform individual part from OpenCode SDK to ai-elements UIPart
 *
 * Handles:
 * - TextPart → TextUIPart (direct)
 * - ReasoningPart → ReasoningUIPart (direct)
 * - FilePart → FileUIPart (mime → mediaType)
 * - ToolPart → ToolUIPart (state machine translation)
 * - StepStartPart → StepStartUIPart (direct)
 *
 * Ignored (return null):
 * - StepFinishPart, SnapshotPart, PatchPart, AgentPart, RetryPart, CompactionPart
 * These will need custom components later
 */
export function transformPart(part: Part): UIMessagePart | null {
	switch (part.type) {
		case "text": {
			const textPart = part as TextPart
			return {
				type: "text",
				text: textPart.text,
			}
		}

		case "reasoning": {
			const reasoningPart = part as ReasoningPart
			return {
				type: "reasoning",
				text: reasoningPart.text,
			}
		}

		case "file": {
			const filePart = part as FilePart
			return {
				type: "file",
				filename: filePart.filename,
				mediaType: filePart.mime,
				url: filePart.url,
			}
		}

		case "tool": {
			const toolPart = part as ToolPart
			const state = transformToolState(toolPart.state)

			// Base tool UIPart structure
			const baseTool = {
				type: `tool-${toolPart.tool}` as const,
				toolCallId: toolPart.callID,
				title: "title" in toolPart.state ? toolPart.state.title : toolPart.tool,
			}

			// Map state-specific fields
			switch (state) {
				case "input-streaming":
					return {
						...baseTool,
						state: "input-streaming" as const,
						input: "input" in toolPart.state ? toolPart.state.input : undefined,
					}

				case "input-available":
					return {
						...baseTool,
						state: "input-available" as const,
						input: "input" in toolPart.state ? toolPart.state.input : {},
					}

				case "output-available":
					return {
						...baseTool,
						state: "output-available" as const,
						input: "input" in toolPart.state ? toolPart.state.input : {},
						output: "output" in toolPart.state ? toolPart.state.output : undefined,
					}

				case "output-error":
					return {
						...baseTool,
						state: "output-error" as const,
						input: "input" in toolPart.state ? toolPart.state.input : {},
						errorText: "error" in toolPart.state ? toolPart.state.error : "Unknown error",
					}
			}
			break
		}

		case "step-start": {
			const stepPart = part as StepStartPart
			return {
				type: "step-start",
				snapshot: stepPart.snapshot,
			}
		}

		// OpenCode-specific parts that need custom components
		// For now, return null to filter them out
		case "step-finish":
		case "snapshot":
		case "patch":
		case "agent":
		case "retry":
		case "compaction":
			return null

		default:
			// Unknown part type - return null to filter out
			return null
	}
}

/**
 * Transform OpenCode message envelope to ai-elements UIMessage
 *
 * Unwraps {info, parts} structure and maps to flat UIMessage format:
 * - info.id → id
 * - info.role → role
 * - parts[] → parts[] (filtered and transformed)
 */
export function transformMessage(opencodeMsg: OpenCodeMessage): UIMessage {
	// Transform and filter parts (remove nulls from unsupported types)
	const transformedParts = opencodeMsg.parts
		.map(transformPart)
		.filter((part): part is UIMessagePart => part !== null)

	return {
		id: opencodeMsg.info.id,
		role: opencodeMsg.info.role,
		parts: transformedParts,
	}
}

/**
 * Batch transform multiple OpenCode messages
 */
export function transformMessages(opencodeMessages: OpenCodeMessage[]): UIMessage[] {
	return opencodeMessages.map(transformMessage)
}
