/**
 * useProjects - Bridge Promise API to React state
 *
 * Wraps projects.list and projects.current from @opencode-vibe/core/api.
 * Provides two separate hooks for list and current project.
 *
 * @example
 * ```tsx
 * function ProjectList() {
 *   const { projects, loading, error, refetch } = useProjects()
 *
 *   if (loading) return <div>Loading projects...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *
 *   return (
 *     <ul>
 *       {projects.map(p => <li key={p.worktree}>{p.name || p.worktree}</li>)}
 *     </ul>
 *   )
 * }
 *
 * function CurrentProject() {
 *   const { project, loading, error } = useCurrentProject()
 *
 *   if (loading) return <div>Loading...</div>
 *   if (!project) return <div>No project selected</div>
 *
 *   return <div>Current: {project.name || project.worktree}</div>
 * }
 * ```
 */

"use client"

import { useState, useEffect, useCallback } from "react"
import { projects } from "@opencode-vibe/core/api"
import type { Project } from "@opencode-vibe/core/atoms"

export interface UseProjectsReturn {
	/** Array of projects */
	projects: Project[]
	/** Loading state */
	loading: boolean
	/** Error if fetch failed */
	error: Error | null
	/** Refetch projects */
	refetch: () => void
}

export interface UseCurrentProjectReturn {
	/** Current project or null */
	project: Project | null
	/** Loading state */
	loading: boolean
	/** Error if fetch failed */
	error: Error | null
	/** Refetch current project */
	refetch: () => void
}

/**
 * Hook to fetch project list using Promise API from core
 *
 * @returns Object with projects, loading, error, and refetch
 */
export function useProjects(): UseProjectsReturn {
	const [projectList, setProjectList] = useState<Project[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	const fetch = useCallback(() => {
		setLoading(true)
		setError(null)

		projects
			.list()
			.then((data: Project[]) => {
				setProjectList(data)
				setError(null)
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				setProjectList([])
			})
			.finally(() => {
				setLoading(false)
			})
	}, [])

	useEffect(() => {
		fetch()
	}, [fetch])

	return {
		projects: projectList,
		loading,
		error,
		refetch: fetch,
	}
}

/**
 * Hook to fetch current project using Promise API from core
 *
 * @returns Object with project, loading, error, and refetch
 */
export function useCurrentProject(): UseCurrentProjectReturn {
	const [project, setProject] = useState<Project | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	const fetch = useCallback(() => {
		setLoading(true)
		setError(null)

		projects
			.current()
			.then((data: Project | null) => {
				setProject(data)
				setError(null)
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				setProject(null)
			})
			.finally(() => {
				setLoading(false)
			})
	}, [])

	useEffect(() => {
		fetch()
	}, [fetch])

	return {
		project,
		loading,
		error,
		refetch: fetch,
	}
}

// Re-export type for convenience
export type { Project }
