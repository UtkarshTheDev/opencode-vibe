import Link from "next/link"
import { createClient, globalClient } from "@/core/client"
import { NewSessionButton } from "./session/[id]/new-session-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { OpenCodeLogo } from "@/components/opencode-logo"

interface Session {
	id: string
	title: string
	directory: string
	parentID?: string // If set, this is a subagent session
	time: {
		created: number
		updated: number
	}
}

interface Project {
	id: string
	worktree: string
	time: {
		created: number
		updated?: number
	}
}

interface SessionDisplay {
	id: string
	title: string
	directory: string
	formattedTime: string
}

interface ProjectWithSessions {
	project: Project
	sessions: SessionDisplay[]
	name: string
	latestUpdated: number // For sorting projects by most recent activity
}

/**
 * Extract project name from directory path
 * /Users/joel/Code/vercel/academy-ai-sdk-content → academy-ai-sdk-content
 */
function getProjectName(directory: string): string {
	return directory.split("/").pop() || directory
}

/**
 * Format relative time (e.g., "2 hours ago", "yesterday")
 * @param timestamp - Unix timestamp in milliseconds
 * @param now - Current time (passed in to avoid Date.now() during render)
 */
function formatRelativeTime(timestamp: number, now: number): string {
	const diff = now - timestamp
	const minutes = Math.floor(diff / 60000)
	const hours = Math.floor(diff / 3600000)
	const days = Math.floor(diff / 86400000)

	if (minutes < 1) return "just now"
	if (minutes < 60) return `${minutes}m ago`
	if (hours < 24) return `${hours}h ago`
	if (days === 1) return "yesterday"
	if (days < 7) return `${days}d ago`
	return new Date(timestamp).toLocaleDateString()
}

/**
 * Check if a project is a real project (not a temp directory)
 */
function isRealProject(project: Project): boolean {
	if (project.id === "global") return false
	if (project.worktree.includes("/T/opencode-test-")) return false
	if (project.worktree === "/") return false
	return true
}

/**
 * Fetch all projects with their sessions (cached server function)
 * Short cache life - data is fresh enough for dashboard display
 */
async function getProjectsWithSessions(): Promise<ProjectWithSessions[]> {
	"use cache"

	const now = Date.now()

	// 1. Get all projects
	const projectsResponse = await globalClient.project.list()
	const allProjects = (projectsResponse.data || []) as Project[]

	// 2. Filter to real projects only
	const realProjects = allProjects.filter(isRealProject)

	// 3. Fetch sessions for each project (in parallel, with timeout)
	const projectsWithSessionsData = await Promise.all(
		realProjects.map(async (project) => {
			try {
				const client = createClient(project.worktree)
				const sessionsResponse = await Promise.race([
					client.session.list(),
					new Promise<{ data: Session[] }>((_, reject) =>
						setTimeout(() => reject(new Error("timeout")), 5000),
					),
				])
				const allSessions = (sessionsResponse.data || []) as Session[]

				// Filter out subagent sessions and sort by updated
				const filteredSessions = allSessions
					.filter((s) => !s.parentID)
					.sort((a, b) => b.time.updated - a.time.updated)

				// Format for display
				const sessions: SessionDisplay[] = filteredSessions.map((s) => ({
					id: s.id,
					title: s.title,
					directory: s.directory,
					formattedTime: formatRelativeTime(s.time.updated, now),
				}))

				return {
					project,
					sessions,
					name: getProjectName(project.worktree),
					latestUpdated: filteredSessions[0]?.time.updated ?? 0,
				}
			} catch {
				return {
					project,
					sessions: [] as SessionDisplay[],
					name: getProjectName(project.worktree),
					latestUpdated: 0,
				}
			}
		}),
	)

	// 4. Filter to projects with sessions and sort by most recent session
	return projectsWithSessionsData
		.filter((p) => p.sessions.length > 0)
		.sort((a, b) => b.latestUpdated - a.latestUpdated)
}

/**
 * Dashboard - Async Server Component
 *
 * Data fetches on the server before streaming to client.
 * No loading spinners - user sees fully rendered content on first paint.
 */
export default async function Dashboard() {
	const projectsWithSessions = await getProjectsWithSessions()

	return (
		<div className="min-h-screen bg-background flex flex-col">
			{/* Header - consistent with session page */}
			<header className="shrink-0 z-10 backdrop-blur-sm bg-background/80 border-b border-border/50">
				<div className="max-w-4xl mx-auto px-4 py-3">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<OpenCodeLogo width={100} height={18} className="text-foreground" />
							<span className="text-foreground/60 text-xs font-medium">|</span>
							<span className="text-foreground font-semibold text-sm tracking-wide">VIBE</span>
						</div>
						<ThemeToggle />
					</div>
				</div>
			</header>

			<div className="flex-1 p-8">
				<div className="max-w-4xl mx-auto">
					{/* Section Header */}
					<div className="flex items-center justify-between mb-6">
						<h1 className="text-xl font-semibold text-foreground">Projects</h1>
					</div>

					{/* Projects with Sessions */}
					<div className="space-y-8">
						{projectsWithSessions.length === 0 ? (
							<div className="text-muted-foreground text-center py-12">
								No projects with sessions yet
							</div>
						) : (
							projectsWithSessions.map(({ project, sessions, name }) => (
								<div key={project.id} className="space-y-2">
									{/* Project Header */}
									<div className="flex items-center gap-3 mb-3">
										<h2 className="text-lg font-semibold text-foreground">{name}</h2>
										<span className="text-xs text-muted-foreground">
											{sessions.length} session
											{sessions.length !== 1 ? "s" : ""}
										</span>
										<div className="ml-auto">
											<NewSessionButton directory={project.worktree} />
										</div>
									</div>

									{/* Sessions List (show top 5) */}
									<ul className="space-y-1">
										{sessions.slice(0, 5).map((session) => (
											<li key={session.id}>
												<Link
													href={`/session/${session.id}?dir=${encodeURIComponent(project.worktree)}`}
													className="block p-3 rounded-lg border border-border bg-card hover:bg-secondary hover:border-accent transition-colors"
												>
													{/* Title */}
													<div className="font-medium text-foreground text-sm line-clamp-1">
														{session.title || "Untitled Session"}
													</div>

													{/* Time */}
													<div className="text-xs text-muted-foreground mt-1">
														{session.formattedTime}
													</div>
												</Link>
											</li>
										))}
									</ul>

									{/* Show more link if there are more sessions */}
									{sessions.length > 5 && (
										<div className="text-sm text-muted-foreground pl-3">
											+{sessions.length - 5} more sessions
										</div>
									)}
								</div>
							))
						)}
					</div>
				</div>
			</div>
		</div>
	)
}
