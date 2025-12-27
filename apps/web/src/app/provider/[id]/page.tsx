"use client"

import { use } from "react"
import Link from "next/link"
import { useProvider } from "@/react"

/**
 * Provider detail page - shows provider configuration and available models
 *
 * @param params - Next.js 16 async params containing provider ID
 */
export default function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params)
	const { data, loading, error } = useProvider()

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 p-8">
				<div className="max-w-4xl mx-auto">
					<p className="text-gray-600">Loading provider...</p>
				</div>
			</div>
		)
	}

	if (error) {
		return (
			<div className="min-h-screen bg-gray-50 p-8">
				<div className="max-w-4xl mx-auto">
					<p className="text-red-600">Error loading provider: {error.message}</p>
					<Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
						← Back to home
					</Link>
				</div>
			</div>
		)
	}

	const provider = data?.all.find((p) => p.id === id)

	if (!provider) {
		return (
			<div className="min-h-screen bg-gray-50 p-8">
				<div className="max-w-4xl mx-auto">
					<p className="text-gray-600">Provider not found</p>
					<Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
						← Back to home
					</Link>
				</div>
			</div>
		)
	}

	const isConnected = data?.connected.includes(provider.id) ?? false
	const defaultModel = data?.defaults[provider.id]

	return (
		<div className="min-h-screen bg-gray-50 p-8">
			<div className="max-w-4xl mx-auto">
				<Link href="/" className="text-blue-600 hover:underline mb-6 inline-block">
					← Back to home
				</Link>

				<div className="bg-white rounded-lg shadow p-6 mb-6">
					<div className="flex items-center justify-between mb-4">
						<h1 className="text-3xl font-bold">{provider.name}</h1>
						{isConnected ? (
							<span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
								Connected
							</span>
						) : (
							<span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
								Not Connected
							</span>
						)}
					</div>

					<div className="space-y-4">
						<div>
							<h2 className="text-sm font-semibold text-gray-600 uppercase">Provider ID</h2>
							<p className="text-gray-900 font-mono">{provider.id}</p>
						</div>

						<div>
							<h2 className="text-sm font-semibold text-gray-600 uppercase">Source</h2>
							<p className="text-gray-900">{provider.source}</p>
						</div>

						{provider.env && provider.env.length > 0 && (
							<div>
								<h2 className="text-sm font-semibold text-gray-600 uppercase">
									Environment Variables Required
								</h2>
								<ul className="list-disc list-inside space-y-1">
									{provider.env.map((envVar) => (
										<li key={envVar} className="text-gray-900 font-mono text-sm">
											{envVar}
										</li>
									))}
								</ul>
							</div>
						)}

						{defaultModel && (
							<div>
								<h2 className="text-sm font-semibold text-gray-600 uppercase">Default Model</h2>
								<p className="text-gray-900 font-mono">{defaultModel}</p>
							</div>
						)}
					</div>
				</div>

				<div className="bg-white rounded-lg shadow p-6">
					<h2 className="text-2xl font-bold mb-4">Available Models</h2>
					{provider.models && provider.models.length > 0 ? (
						<div className="space-y-3">
							{provider.models.map((model) => (
								<div
									key={model.id}
									className="border border-gray-200 rounded p-4 hover:bg-gray-50 transition-colors"
								>
									<div className="flex items-center justify-between">
										<div>
											<h3 className="font-semibold text-gray-900">{model.name}</h3>
											<p className="text-sm text-gray-600 font-mono">{model.id}</p>
										</div>
										{defaultModel === model.id && (
											<span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
												Default
											</span>
										)}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-gray-600">No models available</p>
					)}
				</div>
			</div>
		</div>
	)
}
