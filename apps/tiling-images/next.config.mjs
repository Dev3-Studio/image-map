/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		remotePatterns: [
			new URL('https://cdn.pixabay.com/**'),
			new URL('https://picsum.photos/**'),
		],
	}
};

export default nextConfig;
