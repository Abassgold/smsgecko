import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@smsgecko/shared'],
  async redirects() {
    // The SMS-Activate docs live at /docs now.
    return [{ source: '/api-docs', destination: '/docs', permanent: true }];
  },
  async rewrites() {
    // Proxy API calls in dev so the browser stays same-origin and cookies "just work".
    const apiBase = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      // SMS-Activate-style tools call <host>/stubs/handler_api.php
      { source: '/stubs/:path*', destination: `${apiBase}/stubs/:path*` },
    ];
  },
};

export default nextConfig;
