/**
 * useProviders - Bridge Promise API to React state
 *
 * Wraps providers.list from @opencode-vibe/core/api and manages React state.
 * Provides loading, error, and data states for provider list.
 *
 * @example
 * ```tsx
 * function ProviderList() {
 *   const { providers, loading, error, refetch } = useProviders()
 *
 *   if (loading) return <div>Loading providers...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *
 *   return (
 *     <select>
 *       {providers.map(provider =>
 *         provider.models.map(model => (
 *           <option key={`${provider.id}-${model.id}`}>
 *             {provider.name} - {model.name}
 *           </option>
 *         ))
 *       )}
 *     </select>
 *   )
 * }
 * ```
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { providers } from "@opencode-vibe/core/api"
import type { Provider, Model } from "@opencode-vibe/core/atoms"

export interface UseProvidersReturn {
	/** Array of providers with their models */
	providers: Provider[]
	/** Loading state */
	loading: boolean
	/** Error if fetch failed */
	error: Error | null
	/** Refetch providers */
	refetch: () => void
}

/**
 * Hook to fetch provider list using Promise API from core
 *
 * @returns Object with providers, loading, error, and refetch
 */
export function useProviders(): UseProvidersReturn {
	const [providerList, setProviderList] = useState<Provider[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	const fetch = useCallback(() => {
		setLoading(true)
		setError(null)

		providers
			.list()
			.then((data: Provider[]) => {
				setProviderList(data)
				setError(null)
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				setProviderList([])
			})
			.finally(() => {
				setLoading(false)
			})
	}, [])

	useEffect(() => {
		fetch()
	}, [fetch])

	return {
		providers: providerList,
		loading,
		error,
		refetch: fetch,
	}
}

// Re-export types for convenience
export type { Provider, Model }
