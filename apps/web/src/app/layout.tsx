import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
})

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
})

export const metadata: Metadata = {
	title: "OpenCode",
	description: "AI-powered coding assistant",
}

/**
 * Root layout with Catppuccin theming
 *
 * Uses Latte (light) and Mocha (dark) variants.
 * Dark mode is controlled via the `dark` class on <html>.
 */
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
			>
				{children}
			</body>
		</html>
	)
}
