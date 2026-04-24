// Deletes all Clerk seed users (external_id prefix `clerk_seed_`) and their DB rows.
//
// Architecture: this script deletes users from Clerk DIRECTLY (local Node has no
// Cloudflare Worker 50-subrequest limit), then calls POST /v1/__test/reset
// with the list of deleted IDs to let the server clean up DB rows in a single
// transaction. For ~49 users this would otherwise exceed CF's subrequest cap.
//
// Safety: only users whose external_id starts with `clerk_seed_` are touched.
// Real users (jjoerg@gmail.com, key_to@yahoo.com, zuzana.kopecna@zwizzly.com,
// etc.) have no such tag and are preserved.
//
// DEFAULTS TO DRY-RUN. Pass `--execute` to actually delete.
//
// Run via (staging — dry-run, lists what WOULD be deleted):
//   doppler.exe run -c stg -- node scripts/clean-clerk-test-users.mjs
//
// Run via (staging — actually delete):
//   doppler.exe run -c stg -- node scripts/clean-clerk-test-users.mjs --execute
//
// Env:
//   API_URL           — Base URL for the API (default: https://api-stg.mentomate.com)
//   TEST_SEED_SECRET  — Required for non-dev environments (supplied by Doppler)
//   CLERK_SECRET_KEY  — Required (supplied by Doppler)

const EXECUTE = process.argv.includes('--execute');
const SEED_CLERK_PREFIX = 'clerk_seed_';
const CLERK_API_BASE = 'https://api.clerk.com/v1';

const apiUrl = (process.env.API_URL ?? 'https://api-stg.mentomate.com').replace(
  /\/+$/,
  ''
);
const testSecret = process.env.TEST_SEED_SECRET ?? '';
const clerkSecret = process.env.CLERK_SECRET_KEY ?? '';

if (!clerkSecret) {
  console.error(
    '[clean-clerk] CLERK_SECRET_KEY is required.\n' +
      '  Run with Doppler: doppler.exe run -c stg -- node scripts/clean-clerk-test-users.mjs'
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// List all Clerk users, bucket into seed vs. non-seed by external_id prefix
// ---------------------------------------------------------------------------
async function listAllUsers() {
  const seedUsers = [];
  const otherUsers = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const res = await fetch(
      `${CLERK_API_BASE}/users?limit=${pageSize}&offset=${offset}&order_by=-created_at`,
      { headers: { Authorization: `Bearer ${clerkSecret}` } }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[clean-clerk] Clerk list failed (${res.status}): ${body}`);
      process.exit(1);
    }

    const users = await res.json();
    if (!Array.isArray(users) || users.length === 0) break;

    for (const user of users) {
      const email = user.email_addresses?.[0]?.email_address ?? '(no email)';
      const externalId = user.external_id ?? null;
      const entry = { id: user.id, email, externalId };
      if (externalId && externalId.startsWith(SEED_CLERK_PREFIX)) {
        seedUsers.push(entry);
      } else {
        otherUsers.push(entry);
      }
    }

    if (users.length < pageSize) break;
    offset += pageSize;
  }

  return { seedUsers, otherUsers };
}

// ---------------------------------------------------------------------------
// Delete a single Clerk user: revert bypass_client_trust then DELETE.
// (Mirrors server-side deleteClerkTestUsers for behavior parity.)
// ---------------------------------------------------------------------------
async function deleteClerkUser(userId) {
  // Best-effort PATCH to revert elevated CAPTCHA bypass — don't block on failure.
  try {
    await fetch(`${CLERK_API_BASE}/users/${userId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${clerkSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bypass_client_trust: false }),
    });
  } catch {
    // ignore
  }

  const res = await fetch(`${CLERK_API_BASE}/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Call server to clean up DB rows for the given Clerk user IDs
// ---------------------------------------------------------------------------
async function cleanupDbRows(clerkUserIds) {
  const headers = { 'Content-Type': 'application/json' };
  if (testSecret) headers['X-Test-Secret'] = testSecret;

  console.log(
    `[clean-clerk] POST ${apiUrl}/v1/__test/reset  (DB cleanup for ${clerkUserIds.length} IDs)`
  );
  const res = await fetch(`${apiUrl}/v1/__test/reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ clerkUserIds }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`[clean-clerk] DB cleanup FAILED (${res.status}): ${body}`);
    process.exit(1);
  }

  try {
    return JSON.parse(body);
  } catch {
    return { deletedCount: null };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const { seedUsers, otherUsers } = await listAllUsers();

if (!EXECUTE) {
  console.log('[clean-clerk] DRY-RUN — no users will be deleted.');
  console.log(
    '[clean-clerk] Pass --execute to actually delete the seed users below.\n'
  );

  console.log(
    `=== WILL DELETE — ${seedUsers.length} seed users (external_id: clerk_seed_*) ===`
  );
  for (const u of seedUsers) {
    console.log(`  - ${u.email}  (external_id: ${u.externalId})`);
  }

  console.log(
    `\n=== WILL PRESERVE — ${otherUsers.length} real/other users (no clerk_seed_ tag) ===`
  );
  for (const u of otherUsers) {
    const tag = u.externalId ? `external_id: ${u.externalId}` : 'no external_id';
    console.log(`  - ${u.email}  (${tag})`);
  }

  const preserved = otherUsers.map((u) => u.email.toLowerCase());
  const jorgWillSurvive = preserved.includes('jjoerg@gmail.com');
  const keyToWillSurvive = preserved.some((e) => e.startsWith('key_to@yahoo'));

  console.log(
    `\n[clean-clerk] Summary:  would delete=${seedUsers.length}  would preserve=${otherUsers.length}`
  );
  console.log(
    `[clean-clerk]   jjoerg@gmail.com preserved:   ${jorgWillSurvive ? 'YES ✓' : 'NOT FOUND — investigate'}`
  );
  console.log(
    `[clean-clerk]   key_to@yahoo.com preserved:   ${keyToWillSurvive ? 'YES ✓' : 'NOT FOUND — investigate'}`
  );
  console.log(
    `\n[clean-clerk] If the list looks right, re-run with --execute to actually delete.`
  );
  process.exit(0);
}

// --execute path
console.log(
  `[clean-clerk] EXECUTE — deleting ${seedUsers.length} Clerk seed users (local HTTP, no CF Worker limit)...\n`
);

const deletedIds = [];
let failed = 0;
let processed = 0;
for (const user of seedUsers) {
  const ok = await deleteClerkUser(user.id);
  processed++;
  if (ok) {
    deletedIds.push(user.id);
    // Progress every 10 users so long runs don't look hung.
    if (processed % 10 === 0 || processed === seedUsers.length) {
      console.log(
        `[clean-clerk]   progress: ${processed}/${seedUsers.length} (${deletedIds.length} deleted, ${failed} failed)`
      );
    }
  } else {
    failed++;
    console.warn(`[clean-clerk]   WARN: failed to delete ${user.email} (${user.id})`);
  }
}

console.log(
  `\n[clean-clerk] Clerk deletion: ${deletedIds.length} deleted, ${failed} failed.`
);

if (deletedIds.length === 0) {
  console.log('[clean-clerk] No Clerk users were deleted; skipping DB cleanup.');
  process.exit(failed > 0 ? 1 : 0);
}

const result = await cleanupDbRows(deletedIds);
console.log(`[clean-clerk] Done.`);
console.log(`[clean-clerk]   Clerk users deleted:    ${deletedIds.length}`);
console.log(`[clean-clerk]   DB rows deleted:        ${result.deletedCount ?? 0}`);
console.log(
  `[clean-clerk] Note: this does not refund the Clerk monthly email-send quota.`
);

if (failed > 0) process.exit(1);
