"use client"

import { useMemo } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { OpenCodeMessage } from "@/lib/transform-messages"

/**
 * Token breakdown from assistant messages
 */
interface TokenBreakdown {
	input: number
	output: number
	reasoning: number
	cacheRead: number
	cacheWrite: number
}

/**
 * Usage statistics for context monitoring
 */
interface UsageStats {
	totalTokens: number
	totalCost: number
	tokenBreakdown: TokenBreakdown
}

interface ContextUsageProps {
	messages: OpenCodeMessage[]
}

/**
 * Calculate cumulative token usage and cost from assistant messages
 */
function calculateUsage(messages: OpenCodeMessage[]): UsageStats {
	const breakdown: TokenBreakdown = {
		input: 0,
		output: 0,
		reasoning: 0,
		cacheRead: 0,
		cacheWrite: 0,
	}
	let totalCost = 0

	for (const message of messages) {
		// Only assistant messages have token/cost data
		if (message.info.role !== "assistant") continue

		// Type assertion for assistant message with tokens/cost
		const assistantInfo = message.info as {
			tokens?: {
				input?: number
				output?: number
				reasoning?: number
				cache?: {
					read?: number
					write?: number
				}
			}
			cost?: number
		}

		const tokens = assistantInfo.tokens
		if (tokens) {
			breakdown.input += tokens.input ?? 0
			breakdown.output += tokens.output ?? 0
			breakdown.reasoning += tokens.reasoning ?? 0
			breakdown.cacheRead += tokens.cache?.read ?? 0
			breakdown.cacheWrite += tokens.cache?.write ?? 0
		}

		totalCost += assistantInfo.cost ?? 0
	}

	const totalTokens =
		breakdown.input +
		breakdown.output +
		breakdown.reasoning +
		breakdown.cacheRead +
		breakdown.cacheWrite

	return { totalTokens, totalCost, tokenBreakdown: breakdown }
}

/**
 * Format large numbers with k/m suffix
 */
function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(1)}m`
	}
	if (tokens >= 1_000) {
		return `${(tokens / 1_000).toFixed(1)}k`
	}
	return tokens.toString()
}

/**
 * Display context window usage in session header
 *
 * Shows cumulative tokens and cost across all assistant messages.
 * Compact display with tooltip breakdown.
 *
 * @example
 * ```tsx
 * <ContextUsage messages={rawMessages} />
 * // Displays: "$0.42 | 12.5k tokens"
 * ```
 */
export function ContextUsage({ messages }: ContextUsageProps) {
	const stats = useMemo(() => calculateUsage(messages), [messages])

	// Don't render if no usage data
	if (stats.totalTokens === 0) {
		return null
	}

	const breakdown = stats.tokenBreakdown

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<div className="text-xs text-muted-foreground cursor-help">
						${stats.totalCost.toFixed(2)} | {formatTokens(stats.totalTokens)} tokens
					</div>
				</TooltipTrigger>
				<TooltipContent side="bottom" className="text-xs">
					<div className="space-y-1">
						<div className="font-semibold">Token Breakdown</div>
						{breakdown.input > 0 && (
							<div className="flex justify-between gap-4">
								<span>Input:</span>
								<span className="font-mono">{formatTokens(breakdown.input)}</span>
							</div>
						)}
						{breakdown.output > 0 && (
							<div className="flex justify-between gap-4">
								<span>Output:</span>
								<span className="font-mono">{formatTokens(breakdown.output)}</span>
							</div>
						)}
						{breakdown.reasoning > 0 && (
							<div className="flex justify-between gap-4">
								<span>Reasoning:</span>
								<span className="font-mono">{formatTokens(breakdown.reasoning)}</span>
							</div>
						)}
						{breakdown.cacheRead > 0 && (
							<div className="flex justify-between gap-4">
								<span>Cache Read:</span>
								<span className="font-mono">{formatTokens(breakdown.cacheRead)}</span>
							</div>
						)}
						{breakdown.cacheWrite > 0 && (
							<div className="flex justify-between gap-4">
								<span>Cache Write:</span>
								<span className="font-mono">{formatTokens(breakdown.cacheWrite)}</span>
							</div>
						)}
						<div className="border-t border-border/50 pt-1 mt-1 flex justify-between gap-4 font-semibold">
							<span>Total:</span>
							<span className="font-mono">{formatTokens(stats.totalTokens)}</span>
						</div>
						<div className="flex justify-between gap-4 font-semibold">
							<span>Cost:</span>
							<span className="font-mono">${stats.totalCost.toFixed(4)}</span>
						</div>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	)
}
