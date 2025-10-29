---
Created: 2025-10-27
Modified: 2025-10-28T20:30
---

# Supabase Integration Guide

## Related Documentation

- **Environment Setup**: [environment-setup.md](./environment-setup.md) - DATABASE_URL, DIRECT_URL, and Supabase credentials
- **Tech Stack**: [../tech-stack.md](../tech-stack.md) - Current @supabase/ssr version and upgrade policy
- **Agent Rules**: [../.ruler/AGENTS.md](../.ruler/AGENTS.md) - Supabase client usage patterns for AI agents

## Implementation Status

✅ **Currently Implemented**:
- Server-side client with admin privileges (`packages/supabase-client`)
- Browser client factory for Next.js 15 App Router (`createSupabaseBrowserClient`)
- Server client factory with async cookies support (`createSupabaseServerClient`)

⏳ **Planned (Phase 2+)**:
- Authentication flows (sign-up, sign-in, password reset)
- Session refresh middleware
- Row-level security (RLS) policies
- Real-time subscriptions

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
