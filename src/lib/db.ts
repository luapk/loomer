import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Lazy singleton — constructed on the first call to getDb() at request time.
// Prisma 7 requires a driver adapter when prisma.config.ts is present; the
// url field in schema.prisma is no longer allowed in that configuration.
let _client: PrismaClient | undefined;

export function getDb(): PrismaClient {
  if (_client) return _client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  _client = new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== 'production') {
    (globalThis as Record<string, unknown>)['__loomer_prisma'] = _client;
  }
  return _client;
}
