/**
 * Direct caller adapter for RSC
 * ADR 002 Layer 4 - Depends on router, executor, stream
 *
 * Provides:
 * - createCaller() - Direct route invocation without HTTP
 */
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Cause from "effect/Cause"
import type { Router } from "../router.js"
import type { OpencodeClient } from "../../client.js"
import { executeRoute } from "../executor.js"
import { executeStreamHandler, streamToAsyncIterable } from "../stream.js"

/**
 * Context for direct caller
 */
export interface CallerContext {
	sdk: OpencodeClient
}

/**
 * Caller function type
 * Invokes routes by path with input, returns result
 */
export type Caller = <TOutput = unknown>(path: string, input: unknown) => Promise<TOutput>

/**
 * Create a direct caller for RSC route invocation
 *
 * Unlike HTTP handlers, this executes routes directly without
 * serialization overhead. Perfect for Server Components.
 *
 * @example
 * ```typescript
 * // In a Server Component
 * import { createCaller } from "@/core/router/adapters/direct"
 * import { router } from "@/core/router/routes"
 * import { createClient } from "@/core/client"
 *
 * export default async function SessionPage({ params }) {
 *   const caller = createCaller(router, {
 *     sdk: createClient(directory)
 *   })
 *
 *   const session = await caller("session.get", { id: params.id })
 *
 *   return <SessionView session={session} />
 * }
 * ```
 */
export function createCaller(router: Router, ctx: CallerContext): Caller {
	return async <TOutput = unknown>(path: string, input: unknown): Promise<TOutput> => {
		const controller = new AbortController()

		// Resolve route (throws RouteNotFoundError if not found)
		const route = router.resolve(path)

		// Execute route
		if (route._config.stream) {
			// Streaming route - return async iterable
			const streamEffect = executeStreamHandler(route, {
				input,
				sdk: ctx.sdk,
				signal: controller.signal,
				ctx: {},
			})

			const stream = await Effect.runPromise(streamEffect)
			return streamToAsyncIterable(stream) as TOutput
		}

		// Request-response route
		const exit = await Effect.runPromiseExit(executeRoute(route, input, ctx.sdk, controller.signal))

		if (Exit.isSuccess(exit)) {
			return exit.value as TOutput
		}

		// Extract and throw the actual error
		const error = Cause.failureOption(exit.cause)
		if (error._tag === "Some") {
			throw error.value
		}

		// Defect or interruption
		throw new Error("Route execution failed")
	}
}
