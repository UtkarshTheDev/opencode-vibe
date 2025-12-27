import type { NextConfig } from "next"

const nextConfig: NextConfig = {
	cacheComponents: true,
	reactStrictMode: false, // Disable for SSE debugging - StrictMode double-mounts can abort connections
}

export default nextConfig
