import { defineConfig } from 'prisma/config';
import * as fs from 'fs';
import * as path from 'path';

// Load .env manually so prisma config works both locally and on Vercel.
// (Vercel injects env vars natively; locally they come from .env)
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = /^([^#=]+)=(.*)$/.exec(line.trim());
    if (match) {
      const key = match[1]!.trim();
      const val = match[2]!.trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
