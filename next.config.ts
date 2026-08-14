import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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
  // Tree-shake Sentry's tracing code out of the browser bundle. We only want
  // error reports client-side, and the tracing integration is most of the
  // SDK's weight. Server-side tracing is unaffected.
  webpack: (config, { webpack, isServer }) => {
    if (!isServer) {
      config.plugins.push(
        new webpack.DefinePlugin({
          __SENTRY_TRACING__: false,
          __SENTRY_DEBUG__: false,
        }),
      );
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Source-map upload is skipped when SENTRY_AUTH_TOKEN is unset, so builds
  // still succeed before Sentry is configured — stack traces are just minified.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Strip uploaded maps from the deployed bundle so the client can't read them.
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Proxies browser events through our own domain so ad blockers don't eat them.
  tunnelRoute: '/monitoring',
  disableLogger: true,
});
