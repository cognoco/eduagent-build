## [Database Configuration] - IPv6 Requirement and Free Tier Workaround - 2025-11-04

**Finding:** Supabase direct database connections require IPv6 support. Free tier provides IPv4-compatible pooler (Supavisor) as workaround.

**Context:** After fixing pooler hostname, investigated why direct connection (port 5432 to `db.{project-ref}.supabase.co`) was unreachable on WSL2/Windows development environment. Network diagnostics revealed IPv6-only connectivity for direct connections.

**Technical Discovery:**

**Direct connection behavior:**
```bash
# Direct database hostname (port 5432)
nc -zv db.pjbnwtsufqpgsdlxydbo.supabase.co 5432
# Result: Network is unreachable (2a05:d016:...)
# Resolves to IPv6 address only

# Force IPv4 resolution
nc -4 -zv db.pjbnwtsufqpgsdlxydbo.supabase.co 5432
# Result: No address associated with hostname
# No IPv4 address available

# Pooler hostname (ports 5432 and 6543)
nc -zv aws-1-eu-north-1.pooler.supabase.com 5432
# Result: Connection succeeded! (13.48.169.15)
# Resolves to IPv4 address

nc -zv aws-1-eu-north-1.pooler.supabase.com 6543
# Result: Connection succeeded! (16.16.102.12)
# Resolves to IPv4 address
```

**Root Cause:**
- Supabase direct connections (`db.{project-ref}.supabase.co`) use IPv6 addresses only
- Many development environments lack IPv6 support:
  - WSL2 on Windows (common configuration issue)
  - Some corporate networks
  - Certain cloud platforms
  - Docker default networking
- Supabase pooler provides IPv4 compatibility layer

**Tier Comparison:**

**Free Tier:**
- ✅ Connection pooler (Supavisor) with IPv4 support (ports 5432 and 6543)
- ❌ No IPv4 add-on available
- ✅ Workaround: Use pooler for both DATABASE_URL and DIRECT_URL
- Cost: $0

**Paid Tier (Pro+):**
- ✅ Connection pooler (Supavisor) with IPv4 support
- ✅ IPv4 add-on available (~$4/month)
- ✅ Can enable dedicated IPv4 address for direct connection
- Cost: $25/month (Pro) + $4/month (IPv4 add-on)

**Chosen Approach:** Use pooler for both connections (works on free tier)

**Technical Rationale:**

**Why pooler works:**
- Supavisor connection pooler resolves to IPv4 addresses
- Supports two modes on different ports:
  - Port 6543: Transaction mode (for queries, limited prepared statements)
  - Port 5432: Session mode (for migrations, full PostgreSQL feature support)
- Official Prisma/Supabase integration docs recommend this pattern

**Configuration pattern:**
```env
# Transaction mode for queries (DATABASE_URL)
DATABASE_URL="postgresql://postgres.{project-ref}:{password}@aws-X-{region}.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Session mode for migrations (DIRECT_URL)
DIRECT_URL="postgresql://postgres.{project-ref}:{password}@aws-X-{region}.pooler.supabase.com:5432/postgres"
```

**Why two ports on pooler:**
- **Port 6543 (Transaction mode)**:
  - Optimized for short-lived queries
  - Multiplexes connections at transaction boundary
  - Best for application runtime (DATABASE_URL)
  - `?pgbouncer=true` parameter indicates transaction mode

- **Port 5432 (Session mode)**:
  - Full PostgreSQL protocol support
  - Prepared statements, advisory locks, LISTEN/NOTIFY
  - Required for schema operations (migrations, db push)
  - Best for Prisma CLI commands (DIRECT_URL)

**Verification:**
```bash
# Both should work with pooler hostname
pnpm run db:push:dev         # Uses DIRECT_URL (port 5432)
NODE_ENV=development pnpm exec nx run server:serve  # Uses DATABASE_URL (port 6543)
curl http://localhost:4000/api/health              # Should query database successfully
```

**Implementation Details:**
- **Location**: `.env.development.local`, `.env.test.local`
- **Pattern**: Both DATABASE_URL and DIRECT_URL use pooler hostname, different ports
- **Official source**: Prisma/Supabase integration guide
- **Validation**: Prisma CLI commands work, application queries work

**Alternative Solutions (if IPv6 support needed):**

**Enable IPv6 in WSL2:**
```bash
# Edit /etc/resolv.conf in WSL2
sudo vi /etc/resolv.conf
# Add nameserver that supports IPv6
nameserver 2001:4860:4860::8888  # Google DNS IPv6

# Or enable IPv6 in Windows networking + WSL2 configuration
```

**Use paid tier IPv4 add-on:**
- Cost: ~$4/month
- Provides dedicated IPv4 address for direct connection
- Navigate to: Project Settings → Add-ons → IPv4

**Warning Signs (for AI agents):**

❌ **Do not suggest** using direct connection on free tier without IPv6 support
- **Why**: `db.{project-ref}.supabase.co` resolves IPv6-only
- **Result**: "Network is unreachable" or "Cannot resolve hostname"

❌ **Do not suggest** IPv6 is only required on free tier
- **Why**: All tiers use IPv6 for direct connections by default
- **Difference**: Paid tier can purchase IPv4 add-on

✅ **Do use** pooler for both DATABASE_URL and DIRECT_URL
- Official Prisma/Supabase integration pattern
- Works on all tiers, no IPv6 required
- Full functionality (queries + migrations)

✅ **Do recognize** this is a network capability issue, not a configuration error
- Many environments lack IPv6 support
- Pooler provides IPv4 compatibility layer
- This is expected behavior, not a bug

**Symptom Patterns:**
- "Can't reach database server" with direct connection → Check IPv6 support
- Pooler connection works but direct connection fails → Expected on IPv4-only network
- "Network is unreachable" with IPv6 address shown → Use pooler instead

**Applies To:**
- All Supabase tiers (free, pro, enterprise)
- Development environments without IPv6 support
- WSL2 on Windows, Docker, some corporate networks
- Any scenario requiring IPv4-only connectivity

**References:**
- Supabase Docs: https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP
- Prisma/Supabase Integration: https://supabase.com/partners/integrations/prisma
- Supabase Pricing (IPv4 add-on): https://supabase.com/pricing
- Investigation: 2025-11-04 (Phase 4 network connectivity diagnostics)
- Web search: "Supabase IPv6 requirement free tier paid tier 2025"

**Cross-References:**
- Related to: adopted-patterns.md Pattern 13 (Database Environment Management)
- Related to: Previous finding (Supabase Pooler Hostname Discovery)
- Complements: Prisma multi-environment configuration strategy

---
