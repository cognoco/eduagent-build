# WI-2547 — Build the mobile adult self-consent re-consent screen

**Claimant:** `claude:builder:WI-2547` (Claude-for-Codex substitution, orchestrator ruling
**33225** — supersedes the brief's original `builder:codex:WI-2547` identity only; scope
unchanged).
**Branch/worktree:** `WI-2547` @ `.worktrees/WI-2547`, cut from `origin/main` @ `13c35837e`
(the landed WI-2386 squash — *granular consent purposes*).
**Type:** Feature. **Not** a `Type=Bug`, so the review gate requires no
red-green-revert regression guard.

> **Honest record of how this was actually built (corrected post-hoc).** This plan
> was written before implementation, but the code was **not** produced test-first:
> for each layer the implementation and its tests were written together and run
> together. Do not read the step headings below as a claim of a strict red→green
> TDD cycle. What *was* genuinely exercised are five **durable negative
> controls** — each an intentional mutation of shipped code, observed failing,
> then reverted and observed passing again:
>
> 1. **Purpose-blind gating substitution.** Replacing the per-purpose idempotency
>    check with `repairOrSignalAdultSelfConsentV2`'s any-purpose `already_present`
>    gate failed 6 of the then-12 integration cases, including the
>    repaired-into-`platform_use`-only regression test.
> 2. **Caller-binding break test.** Binding the route to `profileId` instead of
>    `callerPersonId` failed the spoofed-`X-Profile-Id` case.
> 3. **Presented-profile guard removal.** Deleting the `X-Profile-Id` ≠
>    `callerPersonId` check failed the same-org spoof case. (The cross-org case
>    still passed without it — that one is already caught by the eligibility
>    gate, so the same-org spoof is what this guard uniquely catches.)
> 4. **Owner-header override removal.** Dropping the mutation's explicit
>    `X-Profile-Id` preset — letting the shared client inject the active profile
>    as it normally does — failed the production-shaped mobile case with
>    `Expected "adult-owner-profile" / Received "managed-child-profile"`, which
>    is exactly the end-to-end lockout an independent reviewer proved.
> 5. **Reverting acceptance to its own advisory-lock namespace.** With the two
>    art6_1_a writers back on separate keys, the mixed-writer regression failed
>    3/3 runs with two LIVE `platform_use` grants for one person — one stamped
>    `adult_self_consent_repair`, one `adult_self_acceptance`. Restoring the
>    shared key returned it to green 2/2.
>
> A further control is structural rather than mutational: the pre-service guard
> tests run against a tripwire `db` whose every property access throws, so any
> path reaching the service surfaces as a 500. Its negative control (a fully
> satisfied request *does* reach the service and *does* 500) pins that the 503s
> come from the policy-version guard and not an earlier short-circuit.

---

## GATE-0 — premise verified on current `origin/main`

The WI premise ("no authenticated acceptance route or mobile surface") **reproduces**:

- `apps/api/src/routes/consent.ts` exposes only `GET /consent/my-status`,
  `GET /consent/:childProfileId/status`, `PUT /consent/:childProfileId/revoke`,
  `PUT /consent/self/withdraw`, `GET /consent/self/accountability`,
  `PUT /consent/:childProfileId/restore`. **No accept route.**
- `needsAdultConsent` is emitted by `apps/api/src/routes/profiles.ts:171-201` via
  `repairOrSignalAdultSelfConsentV2`, and has **zero** consumers under `apps/mobile/src`
  (`rg needsAdultConsent apps/mobile/src` → empty). WI-2411 owns that wiring.
- The internal writer `recordAdultSelfConsentV2` exists but is called **only** inside the
  identity-graph bootstrap transaction — unreachable for an existing adult.

Build proceeds.

---

## The one correctness trap (drives the whole design)

`repairOrSignalAdultSelfConsentV2` early-outs on **any** `art6_1_a` grant existing
(`consent-v2.ts:492-499` filters on `chargePersonId` + `lawfulBasis` — **no purpose
predicate**) yet inserts **only** `CONSENT_PURPOSES[0]` (`:547`, platform_use).

Reusing that gate as accept's idempotency check would **silently never write
`llm_disclosure`** for exactly the repaired-legacy population this feature targets — a bug
that passes typecheck and any per-purpose-blind test.

**Rule:** accept decides **per purpose**, inside the advisory lock. For each purpose in
`CONSENT_PURPOSES`: read the latest `(chargePersonId, purpose, organizationId, 'art6_1_a')`
grant; if it is **live** (`granted === true && withdrawnAt === null`) → skip (never
duplicate, never weaken); else (absent *or* withdrawn) → insert a fresh granted row. This
single rule satisfies every enumerated AC6 case: fresh → both written; already-consented →
no write; withdrawn → re-granted (the re-consent semantic); concurrent → the lock serialises,
loser observes the winner's rows and skips.

**No schema mutation.** There is deliberately no unique index on
`(charge_person_id, purpose, organization_id, lawful_basis)` — the purpose split means one
person legitimately holds several `art6_1_a` rows — so idempotency comes from
`pg_advisory_xact_lock`, the idiom already used by the repair path. Adding a constraint would
be a shared-dev schema mutation, which this brief does **not** authorize.

### The lock must be SHARED across writers (correction, second review round)

Two functions can create an `art6_1_a` grant: `repairOrSignalAdultSelfConsentV2` (first-use
repair) and `acceptAdultSelfConsentV2`. They originally took **different** advisory-lock
namespaces, which left a real duplicate-write race.

`POST /consent/self/accept` is an **authenticated public API contract**; the mobile gate is a
UI affordance, **not** an authorization precondition on the route. An eligible adult can call
the endpoint directly while a concurrent `GET /profiles` bootstrap runs repair case (a). With
separate keys both transactions observe no live `platform_use` grant and each insert one —
duplicating a canonical compliance row and breaking this item's own "existing valid grants are
never duplicated" invariant. Their write cases are **not** mutually exclusive, and no property
of the product flow may be relied on to keep them apart.

Both writers therefore take one canonical key from `adultSelfConsentLockKey(chargePersonId)`,
keyed on the **person alone**. The rows guarded are person-charged
(`consent_grant.charge_person_id`), so a person-scoped key is the one that covers the
invariant; it also serialises the rare same-person cross-organization case, which is strictly
safer and costs nothing real. The key is deliberately distinct from `consentPersonLockKey`
(the deletion/revocation flow) so these small writes never queue behind a heavy multi-table
teardown. Accept-vs-withdraw is a **separate** question, analysed below and unchanged.

**Literal continuity is load-bearing (rolling deploys).** The helper returns exactly
`adult-consent-repair:<person>` — the key the repair writer *already takes on `origin/main`* —
and that value must not be "tidied" into a nicer namespace. Advisory locks only exclude
processes that hash the same string, so minting a fresh literal would leave an old repair
worker and a new repair worker on different keys for the length of a rollout, able to bypass
each other and duplicate the very repair row the lock protects. Acceptance is new in this WI
and has no deployed predecessor, so acceptance is the writer that moves onto the established
key. The helper's *name* generalised; its *value* did not.

---

## CI contract already in force (read before writing)

`scripts/check-consent-purpose-contract.ts` (landed by WI-2386, wired in `ci.yml`) rejects,
in **non-test** `apps/*/src` + `packages/*/src` sources:

| rule | forbids |
|---|---|
| `literal-purpose-write` | `purpose: 'platform_use'` property assignment |
| `literal-purpose-selector` | `eq(x.purpose, 'llm_disclosure')`, `inArray(...)`, `sql` template |
| `implicit-database-purpose-default` | `.default('platform_use')` |
| `defaulted-purpose-parameter` | a `purpose` parameter with an initializer |
| `default-purpose-identifier` | any `DEFAULT_CONSENT_PURPOSE` identifier |

⇒ The service **must** iterate `CONSENT_PURPOSES` from `@eduagent/schemas` and use the loop
variable in both the selector and the write. Test files are exempt (`isTestFile`).

---

## File map

| # | File | Action |
|---|---|---|
| 1 | `packages/schemas/src/consent.ts` | add `selfConsentAcceptResultSchema` + type |
| 2 | `packages/schemas/src/consent.test.ts` | schema unit tests |
| 3 | `apps/api/src/services/identity-v2/consent-v2.ts` | add `acceptAdultSelfConsentV2` + extract shared `isAdultAccountOwnerV2` |
| 4 | `apps/api/src/routes/consent.ts` | add `POST /consent/self/accept` |
| 5 | `apps/api/src/routes/consent-self-accept.test.ts` | **new** — pre-service guard tests (tripwire `db`) |
| 6 | `tests/integration/consent-self-accept.integration.test.ts` | **new** — real-DB AC6 matrix, incl. the service-level shapes that hold no Login |
| 7 | `apps/mobile/src/hooks/use-adult-self-consent.ts` | **new** — mutation hook |
| 8 | `apps/mobile/src/hooks/use-adult-self-consent.test.ts` | **new** |
| 9 | `apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx` | **new** — the gate |
| 10 | `apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.test.tsx` | **new** |
| 11 | `apps/mobile/src/i18n/locales/en.json` | new `tabs.adultSelfConsent.*` copy |

**Explicitly NOT touched:** `apps/mobile/src/app/(app)/_layout.tsx` (WI-2411's boundary),
`ConsentPendingGate.tsx`, `ConsentWithdrawnGate.tsx`, `memory-consent-prompt.tsx`,
`/learner-profile/consent`, and any migration / schema DDL.

---

## Step 1 — schemas

`packages/schemas/src/consent.ts`. The request body is **empty by construction** — the route
accepts *no* caller-supplied identifiers — so only a response schema is added.

```ts
// [WI-2547] Result of the authenticated adult self-consent acceptance route
// (POST /consent/self/accept). `purposesGranted` lists the purposes this call
// actually wrote, so a replay legitimately reports [] while still returning 200.
export const selfConsentAcceptResultSchema = z.object({
  message: z.string(),
  purposesGranted: z.array(consentPurposeSchema),
  termsVersion: z.string().min(1),
});
export type SelfConsentAcceptResult = z.infer<typeof selfConsentAcceptResultSchema>;
```

**Verify:** `pnpm exec nx run schemas:test` green; `purposesGranted: []` parses.

## Step 2 — service `acceptAdultSelfConsentV2`

`apps/api/src/services/identity-v2/consent-v2.ts`.

First extract the eligibility gate that `repairOrSignalAdultSelfConsentV2` inlines at
`:455-488` into a shared helper — **same** `computeAgeBracketFromDate` (AGENTS.md bans
`computeAgeBracket` for gating), same fail-closed on missing membership / missing person /
non-adult / unparseable `birthDate`:

```ts
/** [WI-2547] Shared adult-account-owner gate. Fail-closed on every unknown. */
export async function isAdultAccountOwnerV2(
  db: Database,
  personId: string,
  organizationId: string,
): Promise<boolean> {
  const membershipRow = await db.query.membership.findFirst({
    where: and(
      eq(membership.personId, personId),
      eq(membership.organizationId, organizationId),
    ),
    columns: { roles: true },
  });
  if (!membershipRow?.roles.includes('admin')) return false;

  const personRow = await db.query.person.findFirst({
    where: eq(person.id, personId),
    columns: { birthDate: true },
  });
  if (!personRow) return false;

  const birthDate = String(personRow.birthDate);
  const birthYear = Number(birthDate.slice(0, 4));
  const birthMonth = Number(birthDate.slice(5, 7));
  const birthDay = Number(birthDate.slice(8, 10));
  if (!Number.isFinite(birthYear)) return false;
  return (
    computeAgeBracketFromDate(
      birthYear,
      Number.isFinite(birthMonth) ? birthMonth : undefined,
      Number.isFinite(birthDay) ? birthDay : undefined,
    ) === 'adult'
  );
}
```

`repairOrSignalAdultSelfConsentV2` then calls it and keeps returning `'not_applicable'` on
false — behaviour preserved (proved by re-running its existing tests unchanged).

Then the writer. Note `AdultSelfConsentNotEligibleError` is a **new** error class so the route
can map non-eligibility to a fail-closed 403 — unlike repair, where non-eligibility is benign
silence:

```ts
/**
 * [WI-2547] Authenticated adult self-consent ACCEPTANCE — the user-reachable
 * writer behind POST /consent/self/accept, for an adult owner whose bootstrap
 * signalled `needsAdultConsent`.
 *
 * Per-purpose and idempotent: a purpose holding a LIVE grant is left untouched
 * (never duplicated, never weakened); an absent OR withdrawn purpose is granted
 * afresh. Deliberately NOT reusing repairOrSignalAdultSelfConsentV2's
 * any-purpose `already_present` gate, which would silently skip llm_disclosure
 * for a person repaired into platform_use only.
 *
 * `termsVersion` is the server's CONSENT_POLICY_VERSION — never caller-supplied.
 * Callers pass their OWN server-derived personId (callerPersonId), so this is
 * self-scoped and carries no cross-profile hazard.
 */
export async function acceptAdultSelfConsentV2(
  db: Database,
  chargePersonId: string,
  organizationId: string,
  termsVersion: string,
): Promise<ConsentPurpose[]> {
  if (!(await isAdultAccountOwnerV2(db, chargePersonId, organizationId))) {
    throw new AdultSelfConsentNotEligibleError();
  }

  // Serialise per person+org so two concurrent accepts cannot both observe an
  // absent grant and write duplicate rows. Same idiom as the repair path; there
  // is no unique constraint to lean on (a person holds one art6_1_a row per
  // purpose by design).
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${adultSelfConsentLockKey(
        chargePersonId,
      )}, 0))`,
    );

    const now = new Date();
    const granted: ConsentPurpose[] = [];

    for (const purpose of CONSENT_PURPOSES) {
      const current = await tx.query.consentGrant.findFirst({
        where: and(
          eq(consentGrant.chargePersonId, chargePersonId),
          eq(consentGrant.purpose, purpose),
          eq(consentGrant.organizationId, organizationId),
          eq(consentGrant.lawfulBasis, 'art6_1_a'),
        ),
        orderBy: (g, { desc }) => [desc(g.grantedAt), desc(g.id)],
        columns: { id: true, granted: true, withdrawnAt: true },
      });

      // Live grant → leave exactly as-is (AC2 "not duplicated or weakened").
      if (current?.granted && !current.withdrawnAt) continue;

      await tx.insert(consentGrant).values({
        chargePersonId,
        organizationId,
        purpose,
        lawfulBasis: 'art6_1_a' as const,
        granted: true,
        grantedAt: now,
        // Versioned acceptance audit fact, kept separate from the lawful basis
        // (MMT-ADR-0011). Distinct `source` so getConsentAccountabilityV2 can
        // tell a re-consent acceptance from signup / repair provenance.
        auditFact: {
          source: 'adult_self_acceptance',
          termsAcceptedAt: now.toISOString(),
          termsVersion,
        },
      });
      granted.push(purpose);
    }

    return granted;
  });
}
```

**Verify:** service integration cases — fresh adult owner → both purposes, `auditFact.source
=== 'adult_self_acceptance'`, `termsVersion` exact; replay → `[]` and still exactly one live
row per purpose; withdrawn purpose → re-granted while the sibling live purpose is untouched;
minor / non-owner / unknown person → `AdultSelfConsentNotEligibleError`, **zero** rows
written; two concurrent accepts on a fresh person → exactly one granted row per purpose.

## Step 3 — route `POST /consent/self/accept`

`apps/api/src/routes/consent.ts`, mirroring `PUT /consent/self/withdraw` exactly. **No
`zValidator`** — the contract takes no body:

```ts
  // [WI-2547] Authenticated adult self-consent ACCEPTANCE. Takes NO
  // caller-supplied identifiers: `callerPersonId` is the login→person binding
  // accountMiddleware resolves from the Clerk JWT (never withProfile(c).profileId,
  // which is the X-Profile-Id-selectable active profile — binding there would let
  // an account member write ANOTHER profile's adult consent, the WI-1193 IDOR),
  // the organization is the authenticated account, the lawful basis is fixed at
  // art6_1_a inside the service, and termsVersion comes from the server's
  // CONSENT_POLICY_VERSION binding. A spoofed X-Profile-Id therefore has no
  // effect on what is written, and a cross-org caller fails the membership gate.
  .post('/consent/self/accept', async (c) => {
    const db = c.get('db');
    const chargePersonId = c.get('callerPersonId');
    if (!chargePersonId) {
      return unauthorized(c, 'No identity is provisioned for this login.');
    }
    // Presented-profile guard: the header is optional, but when present it must
    // name the caller. Fails closed BEFORE any service call.
    const presentedProfileId = c.req.header('X-Profile-Id');
    if (presentedProfileId && presentedProfileId !== chargePersonId) {
      return forbidden(c, 'This account is not eligible for self-consent.');
    }

    const account = requireAccount(c.get('account'));

    // Policy-version guard: a blank version would mint an UNVERSIONED
    // acceptance fact. Refused up front so no transaction is opened.
    const termsVersion = c.env.CONSENT_POLICY_VERSION?.trim();
    if (!termsVersion) {
      return apiError(
        c,
        503,
        ERROR_CODES.SERVICE_UNAVAILABLE,
        'Consent policy version is not configured.',
      );
    }

    try {
      const purposesGranted = await acceptAdultSelfConsentV2(
        db,
        chargePersonId,
        account.id,
        termsVersion,
      );
      return c.json(
        selfConsentAcceptResultSchema.parse({
          message: 'Consent recorded.',
          purposesGranted,
          termsVersion,
        }),
      );
    } catch (error) {
      // Uniform fail-closed response — deliberately does NOT distinguish minor
      // from non-owner from unknown-person, so the route cannot be used to
      // enumerate account membership or ages.
      if (error instanceof AdultSelfConsentNotEligibleError) {
        return forbidden(c, 'This account is not eligible for self-consent.');
      }
      throw error;
    }
  })
```

`CONSENT_POLICY_VERSION` is read via `c.env`, matching `profiles.ts` / `consent-web.ts`; it is
already declared in this router's `Bindings`, as is `callerPersonId` in its `Variables`.

**Verify:** `tests/integration/consent-self-accept.integration.test.ts` covering the real-DB
AC6 matrix — success, exact audit version, idempotent replay, concurrent submit,
already-consented adult, re-consent after withdrawal, repaired-into-`platform_use`-only,
minor, adult non-owner, unknown person, cross-org, and **both** spoof shapes (same-org and
cross-org) asserting `403` with **zero** grants for caller *and* target, plus the no-header
happy path. `apps/api/src/routes/consent-self-accept.test.ts` covers the three pre-service
guards (401 missing identity, 403 presented-profile mismatch, 503 blank policy version)
against a tripwire `db`, proving no write transaction is opened.

## Step 4 — mobile mutation hook

`apps/mobile/src/hooks/use-adult-self-consent.ts`, following `use-restore-consent.ts`
(Hono RPC + `assertOk` + `parseJson`). It calls **only** the new contract, and on success
invalidates the **user-scoped profiles** query so `needsAdultConsent` can flip false.

**The mutation takes no variables and chooses no caller-supplied identifier** — its public
variable type is `void`. The server derives the write subject from `callerPersonId` and
treats `X-Profile-Id` only as an anti-spoof consistency check.

**Why it pins `X-Profile-Id` anyway (correction, post-review).** The shared API client
normally carries profile context: it injects the persisted **active** profile as
`X-Profile-Id` on any request that did not preset one
(`apps/mobile/src/lib/api-client.ts`, the `!headers.has('X-Profile-Id')` branch). A guardian
can legitimately have a managed child restored as their active profile, so that ambient
context would put the **child's** id on this request, the server's anti-spoof check would
reject it, and an otherwise eligible adult owner would be locked out of the gate — a 403 that
never resolves, because the gate keeps re-presenting. The mutation therefore presets the
header to the already-loaded **owner** identity from `ProfileProvider`. That is not the client
choosing a subject; it is this call refusing to let a restored child selection poison an
owner-scoped request. If no owner can be derived it fails locally through the normal mutation
error path and sends **no** request — it never falls back to the active child.

```ts
export function useAdultSelfConsent(): UseMutationResult<SelfConsentAcceptResult, Error, void> {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const { profiles } = useProfile();
  return useMutation({
    mutationFn: async (): Promise<SelfConsentAcceptResult> => {
      const ownerProfileId = profiles.find((p) => p.isOwner)?.id;
      if (!ownerProfileId) throw new AdultSelfConsentOwnerUnresolvedError();
      const res = await client.consent.self.accept.$post(undefined, {
        headers: { 'X-Profile-Id': ownerProfileId },
      });
      await assertOk(res);
      return await parseJson(res, selfConsentAcceptResultSchema);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}
```

**Verify:** hook tests — posts to the right path, parses, invalidates `['profiles']`, and
surfaces a server failure as an error (no swallow). Plus the production-shaped case: with a
managed child published as the active profile (via `setActiveProfileId`, driving the **real**
injection path with no internal module mock) and the owner present in the loaded profile set,
the outgoing `X-Profile-Id` must be the **owner's** id and the body must carry no identifiers.
Module-level active-profile state is reset between tests so the suite is order-independent.

## Step 5 — `AdultSelfConsentGate`

`apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx` — exported, **not** mounted.
Structural reuse of `ConsentWithdrawnGate`'s shell (`GateContent`, `useSafeAreaInsets`,
`signOutWithCleanup`, `useThemeColors`, `testID`, `accessibilityRole`) with entirely **new**
adult-owner copy — it does not import or re-render `getConsentWithdrawnCopy` /
`ConsentPendingGate` / mentor-memory consent.

- `testID="adult-self-consent-gate"`, accept `testID="adult-self-consent-accept"`.
- Explicit accept `Pressable` → `mutate()`; **double-submit suppressed** via
  `disabled={isPending}` *and* an early return guard in the handler (a disabled prop alone
  loses a same-tick double tap).
- Terms + privacy reachable via accessible `Pressable`s with `accessibilityRole="link"`
  → `Linking.openURL` (match however the repo already surfaces terms/privacy; reuse that
  helper if one exists rather than hardcoding a URL).
- Failure → inline accessible error text + retry, gate **stays mounted**.
- Sign-out row via `signOutWithCleanup`; no path into normal app use while mounted.
- All copy through `t('tabs.adultSelfConsent.*')` with keys added to `en.json` in the same
  change (the JSX-literal ratchet + orphan-key checker both police this).

**Verify:** component tests — renders adult-owner copy and no minor/guardian copy; header +
button accessibility; accept calls the mutation once under a double tap; server failure keeps
the gate mounted and shows retry; sign-out invokes cleanup; and an explicit assertion that the
module does not reference the minor-consent or mentor-memory surfaces.

---

## Gates (AC6 "relevant … gates pass")

```bash
pnpm exec nx run schemas:test
pnpm exec nx run api:typecheck && pnpm exec nx run api:lint
pnpm exec nx run api:test -- consent
bun scripts/check-consent-purpose-contract.ts          # WI-2386 CI guard
cd apps/mobile && pnpm exec tsc --noEmit
pnpm exec nx lint mobile
cd apps/mobile && pnpm exec jest --findRelatedTests \
  src/hooks/use-adult-self-consent.ts \
  src/app/\(app\)/_components/AdultSelfConsentGate.tsx --no-coverage
pnpm check:i18n:jsx-literals && pnpm exec tsx scripts/check-i18n-orphan-keys.ts
bash scripts/check-change-class.sh --branch
```

Cross-package integration (`pnpm exec nx run api:test:integration`) needs a live stg DB; run
locally if reachable, otherwise CI is the authoritative gate (AGENTS.md: local integration
runs are advisory).

## Rollback

No migration, no DDL, no dropped column → no `## Rollback` obligation under the repo's
schema-safety rule. The change is additive (one route, one service function, one component,
new i18n keys) and reverts cleanly with the commit.

## Shared-environment stop

The brief does **not** authorize shared-dev schema mutation. If any step appears to require
`db:push`, a migration, or an interactive/shared-environment confirmation → **stop and
escalate to the shepherd**; do not proceed.
