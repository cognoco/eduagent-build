# Staging Deployment Validation Checklist

Use this checklist to validate staging deployments after code merges or infrastructure changes.

## Quick Validation

Run these commands for automated health checks:

```bash
# Production API
curl -s https://nx-monoreposerver-production.up.railway.app/api/health | jq .

# Staging API
curl -s https://nx-monoreposerver-staging.up.railway.app/api/health | jq .

# Production Web (check HTTP status)
curl -sI https://nx-monorepo-web-zwizzly.vercel.app | head -5
```

---

## Full Validation Checklist

### 1. Deployment Status

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| GitHub Actions CI | ✅ Green | | ⬜ |
| Railway staging deployment | ✅ Success | | ⬜ |
| Railway production deployment | ✅ Success | | ⬜ |
| Vercel production deployment | ✅ Success | | ⬜ |
| Deployment time < 10 minutes | ✅ Yes | | ⬜ |

### 2. Web Application

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| Production URL accessible | 200 OK | | ⬜ |
| Health page loads (`/health`) | Page renders | | ⬜ |
| Health check list displays | Records visible | | ⬜ |
| "Ping" button works | Creates new record | | ⬜ |
| Data persists after refresh | Same records | | ⬜ |
| No console errors | Clean console | | ⬜ |

**URLs:**
- Production: https://nx-monorepo-web-zwizzly.vercel.app/health
- Sentry Test: https://nx-monorepo-web-zwizzly.vercel.app/sentry-test

### 3. API Server

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| Staging API health | `status: healthy` | | ⬜ |
| Production API health | `status: healthy` | | ⬜ |
| POST creates record | Returns new record | | ⬜ |
| Database connectivity | Connected | | ⬜ |
| Response time < 500ms | Fast | | ⬜ |

**URLs:**
- Staging: https://nx-monoreposerver-staging.up.railway.app/api/health
- Production: https://nx-monoreposerver-production.up.railway.app/api/health

### 4. Database Connectivity

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| Read operations work | Records returned | | ⬜ |
| Write operations work | Record created | | ⬜ |
| Data visible in Supabase | Records in table | | ⬜ |
| Using STAGING Supabase | `uvhnqtzufwvaqvbdgcnn` | | ⬜ |

### 5. Configuration

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| API calls use `/api/*` | Relative URLs | | ⬜ |
| No CORS errors | Clean network tab | | ⬜ |
| No hardcoded localhost | All external URLs | | ⬜ |
| BACKEND_URL set correctly | Points to Railway | | ⬜ |

### 6. Observability (Optional - Epic 3)

| Check | Expected | Actual | Pass |
|-------|----------|--------|------|
| Sentry receives errors | Error in dashboard | | ⬜ |
| Environment tag correct | `production` or `staging` | | ⬜ |
| Source maps resolve | Readable stack traces | | ⬜ |

**To test Sentry:**
1. Navigate to `/sentry-test`
2. Click "Test Sentry Error" button
3. Check Sentry dashboard for the error

---

## Smoke Test Script

Copy and run this script to perform automated validation:

```bash
#!/bin/bash
# staging-smoke-test.sh

STAGING_API="https://nx-monoreposerver-staging.up.railway.app"
PROD_API="https://nx-monoreposerver-production.up.railway.app"
PROD_WEB="https://nx-monorepo-web-zwizzly.vercel.app"

echo "=== Staging Deployment Smoke Test ==="
echo ""

# Test staging API
echo "1. Checking staging API health..."
STAGING_RESPONSE=$(curl -s "$STAGING_API/api/health")
if echo "$STAGING_RESPONSE" | grep -q "healthy"; then
  echo "   ✅ Staging API: OK"
else
  echo "   ❌ Staging API: FAILED"
  echo "   Response: $STAGING_RESPONSE"
fi

# Test production API
echo "2. Checking production API health..."
PROD_RESPONSE=$(curl -s "$PROD_API/api/health")
if echo "$PROD_RESPONSE" | grep -q "healthy"; then
  echo "   ✅ Production API: OK"
else
  echo "   ❌ Production API: FAILED"
  echo "   Response: $PROD_RESPONSE"
fi

# Test production web
echo "3. Checking production web..."
WEB_STATUS=$(curl -sI "$PROD_WEB" | head -1)
if echo "$WEB_STATUS" | grep -q "200"; then
  echo "   ✅ Production Web: OK"
else
  echo "   ❌ Production Web: FAILED"
  echo "   Response: $WEB_STATUS"
fi

# Test health page
echo "4. Checking health page..."
HEALTH_STATUS=$(curl -sI "$PROD_WEB/health" | head -1)
if echo "$HEALTH_STATUS" | grep -q "200"; then
  echo "   ✅ Health Page: OK"
else
  echo "   ❌ Health Page: FAILED"
  echo "   Response: $HEALTH_STATUS"
fi

# Create test record
echo "5. Creating test health check..."
CREATE_RESPONSE=$(curl -s -X POST "$PROD_API/api/health")
if echo "$CREATE_RESPONSE" | grep -q "id"; then
  echo "   ✅ Database Write: OK"
else
  echo "   ❌ Database Write: FAILED"
  echo "   Response: $CREATE_RESPONSE"
fi

echo ""
echo "=== Smoke Test Complete ==="
```

---

## Troubleshooting

### CORS Errors

**Symptom:** Browser console shows CORS blocked errors, API calls fail

**Solution:**
1. Ensure `NEXT_PUBLIC_API_URL=/api` (not the full Railway URL)
2. The Next.js proxy (via `BACKEND_URL`) handles the actual routing
3. Never expose Railway URL directly to client-side code

### "Loading health checks..." Forever

**Symptom:** Health page shows loading state indefinitely

**Solution:**
1. Check browser Network tab for failed requests
2. Verify `NEXT_PUBLIC_API_URL=/api` in Vercel environment
3. Verify `BACKEND_URL` points to correct Railway environment

### Database Connection Errors

**Symptom:** API returns 500 errors

**Solution:**
1. Check Railway logs for connection errors
2. Verify `DATABASE_URL` and `DIRECT_URL` in Railway dashboard
3. Ensure Supabase STAGING project is active (not paused)

### Vercel 401/403 Errors

**Symptom:** Vercel deployment returns authentication errors

**Solution:**
1. Check Vercel Deployment Protection settings
2. Disable SSO protection if public access is needed
3. Or use `get_access_to_vercel_url` MCP tool for authenticated access

---

## Related Documentation

- [Environment Strategy](../docs/environment-strategy.md) - Full environment architecture
- [Environment Variables Matrix](../docs/environment-variables-matrix.md) - Variable traceability
- [Environment Setup Guide](../docs/guides/environment-setup.md) - Detailed setup instructions

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2025-12-09 | Dev Agent (Mort) | Initial checklist created during Story 5.6 |

