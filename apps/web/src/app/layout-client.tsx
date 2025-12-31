"use client"

import type { ReactNode } from "react"
import { Suspense } from "react"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { OpencodeSSRPlugin } from "@opencode-vibe/react"

interface LayoutClientProps {
	children: ReactNode
}

/**
 * Client-side layout wrapper
 *
 * Includes:
 * - OpencodeSSRPlugin for config injection
 * - ThemeProvider for dark mode
 * - Toaster for notifications
 */
export function LayoutClient({ children }: LayoutClientProps) {
	return (
		<>
			<OpencodeSSRPlugin
				config={{
					baseUrl: "/api/opencode",
					directory: process.cwd(),
				}}
			/>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
				<Suspense
					fallback={
						<div className="h-dvh flex items-center justify-center">
							<div className="text-muted-foreground">Loading...</div>
						</div>
					}
				>
					{children}
				</Suspense>
				<Toaster
					position="top-right"
					richColors
					closeButton
					toastOptions={{
						classNames: {
							toast: "font-sans",
						},
					}}
				/>
			</ThemeProvider>
		</>
	)
}
