/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'standalone',
	reactCompiler: true,
	// Keep firebase-admin as external — Turbopack on Cloud Run cannot resolve
	// the hashed external chunk (firebase-admin-{hash}). See Cloud Run log:
	// "Error: Cannot find module 'firebase-admin-{hash}'"
	serverExternalPackages: ['firebase-admin'],
	images: {
		formats: ['image/avif', 'image/webp'],
		deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'firebasestorage.googleapis.com',
			},
			{
				protocol: 'https',
				hostname: '**.firebasestorage.googleapis.com',
			},
			{
				protocol: 'https',
				hostname: '**.googleapis.com',
			},
			{
				protocol: 'https',
				hostname: 'images.unsplash.com',
			},
		],
	},
};

export default nextConfig;
