/**
 * Server Discovery API Route
 *
 * Discovers running opencode servers by scanning processes.
 * Uses lsof to find processes listening on ports with "bun" or "opencode" in the command.
 * Verifies each candidate by hitting /project endpoint and captures the directory.
 *
 * Returns: Array<{ port: number; pid: number; directory: string }>
 *
 * This enables routing messages to the correct server based on directory!
 */

import { exec } from "child_process"
import { promisify } from "util"
import { NextResponse } from "next/server"

const execAsync = promisify(exec)

interface DiscoveredServer {
	port: number
	pid: number
	directory: string
}

/**
 * Verify a port is actually an opencode server and get its directory
 */
async function verifyOpencodeServer(port: number): Promise<{ ok: boolean; directory?: string }> {
	try {
		// Use /project/current to get the current project for this server instance
		const res = await fetch(`http://127.0.0.1:${port}/project/current`, {
			signal: AbortSignal.timeout(500),
		})
		if (!res.ok) return { ok: false }

		const project = await res.json()
		// Project response has { id, worktree } - worktree is the directory
		return { ok: true, directory: project.worktree }
	} catch {
		return { ok: false }
	}
}

export async function GET() {
	try {
		// Find all listening TCP ports for bun/opencode processes
		const { stdout } = await execAsync(
			`lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -E 'bun|opencode' | awk '{print $2, $9}'`,
		)

		const servers: DiscoveredServer[] = []
		const seen = new Set<number>()

		for (const line of stdout.trim().split("\n")) {
			if (!line) continue
			const [pid, address] = line.split(" ")
			// address format: *:4096 or 127.0.0.1:4096
			const portMatch = address?.match(/:(\d+)$/)
			if (!portMatch) continue

			const port = parseInt(portMatch[1], 10)
			if (seen.has(port)) continue
			seen.add(port)

			// Verify it's actually an opencode server and get directory
			const result = await verifyOpencodeServer(port)
			// Filter out invalid directories (root "/" or empty)
			if (
				result.ok &&
				result.directory &&
				result.directory !== "/" &&
				result.directory.length > 1
			) {
				servers.push({
					port,
					pid: parseInt(pid, 10),
					directory: result.directory,
				})
			}
		}

		return NextResponse.json(servers)
	} catch {
		return NextResponse.json([])
	}
}
