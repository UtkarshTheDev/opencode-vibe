/**
 * POC: Verify OpenCode server connection
 *
 * Usage:
 *   bun apps/web/src/core/poc.ts <port>
 *   OPENCODE_PORT=12345 bun apps/web/src/core/poc.ts
 */

import { createOpencodeClient } from "@opencode-ai/sdk/client"

const port = process.argv[2] ?? process.env.OPENCODE_PORT

if (!port) {
	console.log(`
Usage: bun apps/web/src/core/poc.ts <port>

Find your OpenCode server port and pass it in.
  `)
	process.exit(1)
}

const url = `http://localhost:${port}`

async function main() {
	console.log(`\n🔌 Connecting to ${url}...\n`)

	const client = createOpencodeClient({ baseUrl: url })

	try {
		// List sessions
		const sessions = await client.session.list()
		console.log(`✅ Connected!`)
		console.log(`\n📋 Sessions: ${sessions.data?.length ?? 0} found`)

		if (sessions.data?.length) {
			sessions.data.slice(0, 5).forEach((s) => {
				console.log(`   - "${s.title ?? "Untitled"}" (${s.id})`)
			})
		}

		// List providers
		const providers = await client.provider.list()
		const allProviders = providers.data?.all ?? []
		const connectedIds = providers.data?.connected ?? []
		const defaultModels = providers.data?.default ?? {}

		// Filter to only connected providers
		const connectedProviders = allProviders.filter((p: any) => connectedIds.includes(p.id))

		console.log(`\n🤖 Providers: ${connectedProviders.length} configured`)
		connectedProviders.forEach((p: any) => {
			const defaultModel = defaultModels[p.id] ?? "none"
			console.log(`   - ${p.id}: ${p.name} (default: ${defaultModel})`)
		})

		// Current project
		const project = await client.project.current()
		console.log(`\n📁 Current project: ${project.data?.worktree ?? "none"}`)

		// Config
		const config = await client.config.get()
		const modelConfig = config.data?.model as { default?: string } | undefined
		console.log(`\n⚙️  Default model: ${modelConfig?.default ?? "not set"}`)

		console.log("\n✅ SDK connection works!\n")
	} catch (err) {
		console.error("\n❌ Connection failed:", err)
		process.exit(1)
	}
}

main()
