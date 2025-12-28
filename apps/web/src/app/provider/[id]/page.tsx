import { Suspense } from "react"
import { ProviderDetail } from "./provider-detail"

/**
 * Provider detail page - shows provider configuration and available models
 * Wrapped in Suspense for Cache Components compatibility
 *
 * @param params - Next.js 16 async params containing provider ID
 */
export default async function ProviderPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params

	return (
		<Suspense
			fallback={
				<div className="min-h-screen bg-base p-8">
					<div className="max-w-4xl mx-auto">
						<div className="animate-pulse">
							<div className="h-4 bg-surface0 rounded w-24 mb-6" />
							<div className="bg-surface0 rounded-lg h-64 mb-6" />
							<div className="bg-surface0 rounded-lg h-48" />
						</div>
					</div>
				</div>
			}
		>
			<ProviderDetail id={id} />
		</Suspense>
	)
}
