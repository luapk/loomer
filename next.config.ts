import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // ESLint runs in CI/pre-commit via `npm run lint`; skip it during next build
  // to avoid flat-config vs. eslint-config-next compatibility issues.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Prevent webpack from bundling Prisma — let Node.js resolve it at runtime.
  // Without this, Prisma's PrismaClient initialises at build time (no DATABASE_URL)
  // and throws PrismaClientInitializationError during `next build`.
  serverExternalPackages: ['@prisma/client', 'prisma'],
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
};

export default nextConfig;
