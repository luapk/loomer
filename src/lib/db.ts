import { PrismaClient } from '@prisma/client';

// Lazy singleton — PrismaClient is constructed only on the first call to getDb(),
// which happens at request time (never at build time). This avoids the
// PrismaClientInitializationError that Prisma 7 throws when no DATABASE_URL is
// set in the build environment.
let _client: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (_client) return _client;
  _client = new PrismaClient();
  // Reuse across hot-reloads in development
  if (process.env.NODE_ENV !== 'production') {
    (globalThis as Record<string, unknown>)['__loomer_prisma'] = _client;
  }
  return _client;
}
