# Tests

Two layers.

## Unit checks — `npm run test:unit`

Plain `tsx` scripts, no infrastructure. Schema validation, the voice-only
character filter, and dialogue → speakable-line extraction.

## End-to-end — `npm run test:e2e`

Playwright against a real Next.js server, real browser, real database.

### What they cover

| File | What it protects |
|---|---|
| `auth.spec.ts` | Signup, login, logout, protected-route redirects |
| `ownership.spec.ts` | A member can only touch their own boards — privacy *and* the API bill |
| `credits.spec.ts` | The spending gate: welcome credits, 402 at zero, admin routes closed to members |
| `styles.spec.ts` | Style validation, the per-user cap, privacy, and that appends don't wipe |

### What they deliberately don't cover

**Nothing here generates an image or parses a script.** Both cost real money,
and a suite that bills Gemini on every run is a suite people switch off.
Storyboards are seeded straight into the database instead (`seedStoryboard`),
which also keeps the tests focused on authorization rather than the parser.

Image upload paths that need Vercel Blob are covered only up to the point
where validation resolves — the cap, the name check, ownership — since those
all decide before any blob write.

### Running them

You need a Postgres database. Anything works; a throwaway local cluster:

```bash
# Start a cluster (as a non-root user — initdb refuses to run as root)
initdb -D /tmp/pgdata -U postgres --auth=trust
pg_ctl -D /tmp/pgdata -o "-p 5433 -k /tmp" -l /tmp/pgdata/log start
psql -h /tmp -p 5433 -U postgres -c "CREATE DATABASE loomer_test;"

export DATABASE_URL="postgresql://postgres@localhost:5433/loomer_test?host=/tmp"
npx prisma db push
npm run test:e2e
```

Playwright starts the dev server itself on port 3100 and sets the env it needs
(`SESSION_SECRET`, an empty `ADMIN_EMAILS`, a deliberately invalid
`GOOGLE_AI_API_KEY`). To run against an already-running server instead, set
`E2E_BASE_URL`.

**`ADMIN_EMAILS` must stay empty.** `paulknott@gmail.com` is a hardcoded admin
default, and admins are exempt from credit debits — a test user who became an
admin would make the credit-gate tests pass for the wrong reason.

### If the browser won't launch

Some environments ship a preinstalled Chromium whose build number doesn't match
the installed Playwright. Point at it rather than downloading a second copy:

```bash
export PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

Unset, Playwright resolves its own browser as usual (`npx playwright install`).
