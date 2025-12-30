/**
 * OpenCodeProvider stub for packages/react
 * Minimal implementation - full version is app-specific
 */

"use client"

import { createContext, useContext, type ReactNode } from "react"

export interface OpenCodeContextValue {
	url: string
	directory: string
	ready: boolean
	sync: (sessionID: string) => Promise<void>
}

const OpenCodeContext = createContext<OpenCodeContextValue | null>(null)

export interface OpenCodeProviderProps {
	url: string
	directory: string
	children: ReactNode
}

export function OpenCodeProvider({ url, directory, children }: OpenCodeProviderProps) {
	const value: OpenCodeContextValue = {
		url,
		directory,
		ready: true,
		sync: async () => {},
	}

	return <OpenCodeContext.Provider value={value}>{children}</OpenCodeContext.Provider>
}

export function useOpenCode() {
	const context = useContext(OpenCodeContext)
	if (!context) {
		throw new Error("useOpenCode must be used within OpenCodeProvider")
	}
	return context
}
