import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@smsgecko/shared'],
  async rewrites() {
    // Proxy API calls in dev so the browser stays same-origin and cookies "just work".
    const apiBase = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
