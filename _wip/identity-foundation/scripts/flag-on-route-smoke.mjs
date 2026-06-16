/**
 * WI-803 — Post-M-DROP flag-on ROUTE smoke (the real drop-safety net, AC#3).
 *
 * WHY THIS EXISTS
 * ---------------
 * The WI-802 in-CI guard is PATH-TAKEN-ONLY: M-DROP is never applied to the
 * committed-migration CI database, so CI can prove a v2 branch is *taken* but
 * can NEVER reproduce the real post-drop 500 (legacy table genuinely absent).
 * The only environment that produces the real failure is an M-DROP-applied DB —
 * i.e. the WI-586 staging rehearsal AFTER step 8 (DROP TABLE … family_links …).
 *
 * This script is that net: it boots nothing of its own — it fires flag-on
 * GET/PUT requests at EVERY parent/child endpoint against a live (post-drop)
 * target and asserts NONE returns 500. A single unbranched family_links reader
 * left in the cutover surfaces here as a 500 the moment the table is gone.
 *
 * It is COUPLED TO THE 586 REHEARSAL by design (see cutover-plan §4, step 8.5):
 * run it against the env that has just had M-DROP applied and the worker
 * deployed with IDENTITY_V2_ENABLED=true. Running it against a non-dropped DB
 * proves nothing (the legacy join still resolves) — that is expected.
 *
 * SCOPE (orchestrator-bounded): this is NOT a separate always-on M-DROP CI lane.
 * It is a runbook artifact invoked once per rehearsal, by the operator.
 *
 * USAGE
 * -----
 *   node _wip/identity-foundation/scripts/flag-on-route-smoke.mjs \
 *     --base-url https://<staging-worker-url> \
 *     --token    "<clerk-session-jwt>" \
 *     --owner    "<owner/guardian-profile-id>" \
 *     --child    "<linked-child-profile-id>" \
 *     [--subject <subjectId>] [--report <reportId>] [--session <sessionId>]
 *
 * Env-var equivalents (any flag may instead come from the environment):
 *   SMOKE_BASE_URL, SMOKE_TOKEN, SMOKE_OWNER_PROFILE_ID, SMOKE_CHILD_PROFILE_ID
 *
 * The token must carry profile scope for the OWNER profile (the guardian making
 * parent/child reads). Optional ids (subject/report/session) only widen
 * coverage to the deepest dashboard reads; omit them and those rows are skipped
 * (reported as SKIP, never as PASS).
 *
 * EXIT CODE: 0 = no 500 on any probed route; 1 = at least one 500 (or the
 * script could not run). A 401/403/404 is NOT a failure — those are valid
 * application responses; only a 5xx means an unbranched legacy reader 500'd
 * post-drop.
 */

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        out[key] = val;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const baseUrl = (args['base-url'] || process.env.SMOKE_BASE_URL || '').replace(
  /\/$/,
  '',
);
const token = args['token'] || process.env.SMOKE_TOKEN || '';
const ownerProfileId =
  args['owner'] || process.env.SMOKE_OWNER_PROFILE_ID || '';
const childProfileId =
  args['child'] || process.env.SMOKE_CHILD_PROFILE_ID || '';
const subjectId = args['subject'] || '';
const reportId = args['report'] || '';
const sessionId = args['session'] || '';

if (!baseUrl || !token || !ownerProfileId || !childProfileId) {
  console.error(
    '✗ Required: --base-url, --token, --owner, --child (or the SMOKE_* env equivalents).',
  );
  process.exit(1);
}

/**
 * The parent/child read/write surface. Each entry is a route that — pre-WI-803 —
 * either ran an unbranched family_links reader (nudges GET, profiles app-context
 * PUT) or fans through one of the v2-branched family services (dashboard,
 * progress, notifications, reports). All must answer non-5xx flag-on post-drop.
 *
 * `profile`: which profile id scope header to send (owner = guardian making the
 * read; child reads are still scoped to the owner, who has guardianship).
 */
function buildProbes() {
  const probes = [
    // --- WI-803's two twins (the residual unbranched family_links readers) ---
    {
      name: 'nudges:list (listUnreadNudges v2)',
      method: 'GET',
      path: '/v1/nudges',
      profile: childProfileId, // the recipient reads their own unread nudges
    },
    {
      name: 'profiles:app-context PUT (loadProfileFamilyMeta v2)',
      method: 'PATCH',
      path: `/v1/profiles/${ownerProfileId}/app-context`,
      profile: ownerProfileId,
      body: { defaultAppContext: 'study' },
    },
    // --- WI-802 / sibling family surface (must stay green post-drop) ---
    {
      name: 'dashboard:list (getChildrenForParent v2)',
      method: 'GET',
      path: '/v1/dashboard',
      profile: ownerProfileId,
    },
    {
      name: 'dashboard:child detail',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}`,
      profile: ownerProfileId,
    },
    {
      name: 'dashboard:child inventory',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/inventory`,
      profile: ownerProfileId,
    },
    {
      name: 'dashboard:child progress-summary',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/progress-summary`,
      profile: ownerProfileId,
    },
    {
      name: 'dashboard:child sessions',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/sessions`,
      profile: ownerProfileId,
    },
    {
      name: 'dashboard:child reports',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/reports`,
      profile: ownerProfileId,
    },
    {
      name: 'dashboard:child weekly-reports',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/weekly-reports`,
      profile: ownerProfileId,
    },
    {
      name: 'dashboard:child memory',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/memory`,
      profile: ownerProfileId,
    },
    // --- learner-self progress/report surface (child scope) ---
    {
      name: 'progress:overview',
      method: 'GET',
      path: '/v1/progress/overview',
      profile: childProfileId,
    },
    {
      name: 'progress:review-summary',
      method: 'GET',
      path: '/v1/progress/review-summary',
      profile: childProfileId,
    },
    {
      name: 'progress:reports',
      method: 'GET',
      path: '/v1/progress/reports',
      profile: childProfileId,
    },
    {
      name: 'progress:weekly-reports',
      method: 'GET',
      path: '/v1/progress/weekly-reports',
      profile: childProfileId,
    },
    // --- notifications (owner scope; child-cap targeting reads family edges) ---
    {
      name: 'notifications:child-cap',
      method: 'GET',
      path: '/v1/notifications/child-cap',
      profile: ownerProfileId,
    },
  ];

  // Optional deeper reads — only when the ids are supplied.
  if (subjectId) {
    probes.push({
      name: 'dashboard:child subject detail',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/subjects/${subjectId}`,
      profile: ownerProfileId,
    });
  }
  if (reportId) {
    probes.push({
      name: 'dashboard:child report detail',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/reports/${reportId}`,
      profile: ownerProfileId,
    });
  }
  if (sessionId) {
    probes.push({
      name: 'dashboard:child session detail',
      method: 'GET',
      path: `/v1/dashboard/children/${childProfileId}/sessions/${sessionId}`,
      profile: ownerProfileId,
    });
  }

  return probes;
}

async function runProbe(probe) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Profile-Id': probe.profile,
  };
  let body;
  if (probe.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(probe.body);
  }
  try {
    const res = await fetch(`${baseUrl}${probe.path}`, {
      method: probe.method,
      headers,
      body,
    });
    return { status: res.status };
  } catch (err) {
    // A network/transport failure is a hard error for the smoke (the worker
    // is supposed to be up during the rehearsal soak).
    return { status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const probes = buildProbes();
  console.log(
    `\nWI-803 flag-on route smoke — ${probes.length} probes against ${baseUrl}\n`,
  );

  let failures = 0;
  for (const probe of probes) {
    const { status, error } = await runProbe(probe);
    const is500 = status >= 500;
    const isTransport = status === 0;
    const mark = is500 || isTransport ? '✗ FAIL' : '✓ OK   ';
    const detail = error ? ` (${error})` : '';
    console.log(
      `${mark}  ${String(status).padStart(3)}  ${probe.method.padEnd(5)} ${probe.path}  [${probe.name}]${detail}`,
    );
    if (is500 || isTransport) failures++;
  }

  console.log('');
  if (failures > 0) {
    console.error(
      `✗ ${failures}/${probes.length} probe(s) returned 5xx/transport-error — an unbranched legacy family_links reader is 500-ing post-drop.`,
    );
    process.exit(1);
  }
  console.log(
    `✓ All ${probes.length} probes returned non-5xx — no unbranched family_links reader 500'd post-drop.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ Smoke script crashed:', err);
  process.exit(1);
});
