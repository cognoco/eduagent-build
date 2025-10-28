---
Created: 2025-10-27
Modified: 2025-10-27T15:20
---

# Supabase Integration Guide

## Architecture Boundaries
- Prisma (DATABASE_URL) for data access from API server
- supabase-js via `@supabase/ssr` for auth/realtime (Phase 2+)
- Never mix: do not use supabase-js for CRUD in this template

## Factories
- Browser: `createSupabaseBrowserClient()` – requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server: `createSupabaseServerClient()` – async; awaits Next.js `cookies()` once and passes `getAll`/`setAll`

## Next.js 15 Cookies
- `cookies()` is async. Await once, adapter methods remain synchronous using captured `cookieStore`.
- Server Components may not be allowed to write cookies → handle session refresh in Route Handlers/Middleware.

## Examples
```ts
// Server Component / Server Action / Route Handler
import { createSupabaseServerClient } from '@nx-monorepo/supabase-client';

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <div>User: {user?.email}</div>;
}
```

## Security
- Public keys only in browser (`NEXT_PUBLIC_*`)
- Never expose service role

## Troubleshooting
- Missing envs → set in `.env.local`
- Invalid URL → must look like `https://YOUR-PROJECT.supabase.co`
- Cookie write blocked → use Route Handler/Middleware for session refresh

## Roadmap (Phase 2+)
- Auth flows, session refresh middleware, realtime channels

