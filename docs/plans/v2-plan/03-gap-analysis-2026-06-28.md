---
title: V2-Plan Gap Analysis — code-vs-plan audit (S0…S6)
date: 2026-06-28
profile: orientation
status: snapshot
method: 8 parallel subagents, one per phase plan; deliverable-level audit + 2-3 sub-task spot-checks each; reconciled against 00-STATE-OF-PLAY.md
related:
  - docs/plans/v2-plan/00-STATE-OF-PLAY.md
  - docs/plans/v2-plan/00-README.md
---

# V2-Plan Gap Analysis — what each phase plan actually shipped vs what it claims

**What this is.** A point-in-time code audit of the eight V2 phase plans (`S0`…`S6`) in this folder. Each plan was audited by an independent subagent at **deliverable level** (the 5-8 headline deliverables, not every `T<n>`), with **2-3 sub-task spot-checks per deliverable** to challenge the "done" claims. Findings were reconciled against [`00-STATE-OF-PLAY.md`](00-STATE-OF-PLAY.md). **Code is ground truth** — every status carries a `file:line`.

> Snapshot 2026-06-28. Re-verify before acting. This supplements, does not replace, STATE-OF-PLAY (the living orientation map).
>
> **Work items captured 2026-06-28:** every gap below is now a Cosmo Work Item, **`WI-1118`…`WI-1137`** (all `Stage=Captured`). The mapping is in [§6](#6-work-item-map). Reference WIs as ID + name.

> ### ⚠️ The identity migration is DONE on the live DBs — `S4`/`S5` are "unbuilt", not "identity-blocked" (corrected 2026-06-28 by live DB query)
>
> The plans and the first cut of this audit said `S4`/`S5` are *"BLOCKED on the identity-foundation (IF) flip."* **Querying the actual databases shows that framing is stale.** Earlier drafts of this doc (including a "two switches, Switch B pending" box) were **wrong** — they reasoned from schema *code* + memory, not the live DB. Verified state (`doppler run -c <cfg> -- node` over `DATABASE_URL`, 2026-06-28):
>
> | DB | reads it at runtime | `accounts`/`profiles`/`family_links` | `login` | `person` | `supportership` | `subjects`→FK |
> |---|---|---|---|---|---|---|
> | **stg `ep-fancy-cherry`** | **the live app** (phone + emulator + local all resolve to `api-stg`) | **DROPPED** | 125 | **229** | 0 | **→ `person`**, 151/151 match |
> | dev `ep-muddy-sunset` | orphan — nothing at runtime | present (legacy) | 1128 | 1350 | 0 | (legacy) |
> | prd `ep-holy-leaf` | prod build | **DROPPED** | 0 | 0 | 0 | — |
>
> So on the DBs that actually serve the app (stg + prd): **both the reader flag *and* the physical table swap are DONE.** Legacy `profiles`/`accounts`/`family_links` are dropped; `person` is the live, populated identity table; `subjects.profile_id`'s FK was repointed to `person` (all 151 rows match). The only DB that still has legacy tables is the **orphan `dev`/muddy-sunset**, which nothing reads.
>
> **Code-vs-DB drift caveat:** the Drizzle schema *code* still defines `profiles` (`packages/database/src/schema/profiles.ts:63`) and `subjects.ts:54` still declares `.references(profiles.id)` — stale vs the physical FK (`→ person`). Any live code path that queries `profiles` would fail on stg/prd (table absent) — worth a sweep, separate from this audit.
>
> **Consequence for the table below:** `S4`/`S5` are **not blocked on any identity migration** — identity is fully live. They are simply **unbuilt** (missing mobile screens, routes, tests). `supportership` is empty only because no linking UI exists yet to create supporter relationships. Read every `S4`/`S5` "BLOCKED" below as **"unbuilt — buildable now."** And recall the app is **pre-launch, zero users, all DB rows are disposable test data** ([[project_pre_launch_no_users]]) — never reason about protecting real data.

---

## 1. The table

Legend — **Priority:** P1 = do-now, cheap, high felt-value · P2 = do-now, larger · P3 = quality debt · **BLOCKED** = *(stale label — see box above; identity is fully live, so these are actually "**unbuilt, buildable now**", not blocked)* · **DEFERRED** = irreversible code/table deletion, human-gated (no user data at stake).
**Parallelizable:** can it run concurrently with its sibling phases without a barrier? **Category:** dominant of {database, architecture, UI/UX} (latent **bugs** called out in §4).

| Plan | Priority | Depends on | Parallel? | Category | Delivers (one line) | Net status |
|---|---|---|---|---|---|---|
| **S0** backend primitives | P2 | — (foundation, built) | done | database + architecture | `mentor_activity_ledger` + `writeActivityMoment()` + deterministic `GET /now` feed + ranker | **Built**, but 5/7 ledger kinds unproduced + S4 code leaked in (§4) |
| **S0-R** retention gate | P3 | — (parallel; must NOT block S1/S2) | **Y** | architecture | `applyRetentionUpdate()` SRS write chokepoint over ~11 writers; behavior-preserving | **Built**, missing T10 lifecycle test + internal-mock debt |
| **S1** mentor home | P1 | S0 | **Y** (with S2) | UI/UX | ≤3-card Now feed + ever-present bar + camera/homework + wrap-up | **Built except animation** (the one real gap) |
| **S2** subject hub | P1 | S0 | **Y** (with S1) | UI/UX | shelf+progress→one Subject hub; Next-up, chapters, topic sheet, notes | **Skeleton built; notes read-only, no add/manage subject** |
| **S3** journal + avatar | P2 | S0 (S2→S3 cohort gate removed 2026-06-14) | **Y** (after S0) | UI/UX | Journal tab (recaps + cross-subject archive + memory) + avatar sheet + P3 evals | **Built with deviations** (missing `use-my-reports`, out-of-scope Practice section) |
| **S4** scope chip / support hub | P2 (~~BLOCKED~~ → **unbuilt, buildable now**; identity is live) | S5 depends on it | **N** (S5 depends) | architecture + database | scope chip, support hub variants, person scopes, server mask | **Backend live**; 4 mobile/route gaps (§4); person-ID "bug" invalid (repoint done) |
| **S5** visibility contract | P2 (~~BLOCKED~~ → **unbuilt, buildable now**) | S4 | **N** (after S4) | architecture + database | linking ceremony, non-reportable class, render-equivalence, graduation | **Backend pre-built**; mobile link screens + 5 break-tests missing |
| **S6** cutover + deletions | **DEFERRED** (irreversible) | S3 evals ✓ + S4/S5 heirs + §13.1 ruling + human confirm | **N** (last) | architecture | delete V0/V1 shells, retire old tabs, ~25-screen end state | **Not started (correct)**; nothing deleted prematurely |

---

## 2. Per-plan deliverable findings (deliverable-level + spot-checks)

### S0 — Backend primitives · *Built, with scope leakage + unproduced kinds*
- ✅ `mentor_activity_ledger` table + RLS migrations (`packages/database/src/schema/activity-ledger.ts:21-50`; `apps/api/drizzle/0111_*`, `0112_rls_*`).
- ✅ `writeActivityMoment()` / `markMomentSurfaced()` (`apps/api/src/services/activity-ledger.ts:17-59`). Minor: input can't express non-`self` visibility (field dropped).
- ✅ `GET /now` + `/now/overflow` routes, schemas, `buildNowFeed()` + pure `rankCandidates()` with `PARKED_AGING_WINDOW_DAYS=7` / `DEEPENING_SURFACE_LEAD_DAYS=2`.
- ⚠️ **5 of 7 ledger kinds have no producer** wired (`snapshot_ready`, `topic_mastered`, `retention_due`, `needs_deepening_added`, `recap_ready`) — only `session_filed` + `milestone_reached` fire. Those kinds can never surface in a real feed yet.
- ⚠️ **Extra `reward_receipt` kind** in `ledgerKindSchema` with no producer or spec citation (dangling).
- ⚠️ **T7a integration test thin** — covers only ledger-moment profile isolation; no multi-source ranking / `overflowCount` / catalog-validation assertions.

### S0-R — Retention gate · *Built, test-coverage debt*
- ✅ `applyRetentionUpdate()` chokepoint + guards (`apply-retention-update.ts:89/113/139`); ~11 writers all routed through it (sweep confirms only this file mutates `retention_cards`).
- ✅ T12 reward decoupling (`syncRewardStatusFromRetention`) — both former call sites converted; XP persistence preserved.
- ❌ **T10 cross-writer lifecycle integration test MISSING** — the file at that path is a source-sweep guard, not the real-DB seed→session→verify→mastery→evaluate regression test the plan requires.
- ⚠️ `retention-mastery.test.ts` uses an internal DB mock (`createUpdateDb()` `jest.fn()`); GC6 cleanup not applied; no second-stamp idempotency assertion (T8).

### S1 — Mentor home · *Built except animation*
- ✅ `mentor.tsx` screen, NowCard feed + overflow, 2s slow-fallback cache, ever-present bar, camera/homework round-trip (separate `entrySource`/`returnTo`), post-auth handoff, first-session wrap-up, cold-start + reward-receipt components.
- ❌ **Card + celebration animation MISSING** — `NowCard.tsx`/`NowCardStack.tsx`/`MentorCelebration.tsx` import no `Animated`/reanimated/`LayoutAnimation`/moti; celebration is a static `View` swap. Confirms STATE-OF-PLAY §3.
- ⚠️ `bar-intent-match.ts` only matches **literal IDs** typed by the user (`"session abc123"`); natural language ("resume my maths session") always returns `uncertain`. Low intent fidelity.
- ⚠️ `now-deep-link.ts:40-47` maps **both** `retention.review` and `challenge.start` to the same `/(app)/topic/[topicId]` with no differentiating param.

### S2 — Subject hub · *Skeleton built; the "life" deferred*
- ✅ Hub screen (mask-ready, no `isOwner` reads), shelf+progress merge with flag-gated entry, Next-up block, collapsible chapter sections + in-hub topic sheet, pure view-model, hub-scoped chapter/topic filter.
- ⚠️ **Notes read-only** — `onAddNote` deliberately not passed from `SubjectHub.tsx:115`; write infra exists but is disconnected (`SubjectHubNotesSection.tsx:30-35,65`). Confirms STATE-OF-PLAY.
- ⚠️ **No manage/archive entry** on the hub (plan said `subject/[subjectId].tsx` reachable from hub — no link exists).
- ⚠️ **Add-subject only in empty state** (`SubjectsBrowse.tsx:55-65`); populated path has none. No urgency sort/grouping; no animated skeleton.

### S3 — Journal + avatar · *Built, structural deviations*
- ✅ V2 flag + 3-tab branch, Journal tab + layout, moments strip, recaps, notes archive (browse-first, authorship markers, voice search), memory link-out, avatar admin sheet with owner gates, P3 eval runner + park-and-return ranking/reweave flows + fixtures + snapshots.
- ❌ **`use-my-reports.ts` MISSING** — amendment #9's dedicated self-scope hook absent; `useProfileReports` reused with a mode-dimension query key.
- ⚠️ **Out-of-scope `JournalPracticeSection`** added (references a `/(app)/practice` hub not in S3 scope).
- ⚠️ Sub-components collapsed inline into `JournalTabView.tsx` (no separate files); milestone moments use `milestoneCard.*` keys, not the specced `journal.moments.milestone.*` namespace; `AccountAvatar` in `components/account/` not `components/chrome/`.

### S4 — Scope chip + support hub · *Pre-built ahead of the flip; gaps + a latent bug*
- ✅ Scope contracts, `resolveScopesForPerson`, structural mask, S4 tables + migration `0120`, now-feed widening (`supporter-hub`/`person` scopes, `support_hub_pointer` card), `ScopeChip` + `scope-context` + V2 shell wiring (V0/V1 ModeSwitcher preserved), support-hub tab variants + person-scope structural views.
- ❌ **`SupporterColdStart.tsx` + `SupporterSelfLearningDoorway.tsx` MISSING** (T17) — primary gate before S5.
- ❌ **`supporter-co-learning` service + `CoLearningDoorway.tsx` MISSING** (T19).
- ❌ **`GET /scopes/coldstart` route MISSING** (T14 route half) — the `resolveSupporterColdStart` service exists but is unreachable over HTTP; blocks T16 kickstart + T17 fetch.
- 🐛 **Latent bug** (§4): `hasFirstRealLearningState` in `scope-resolution.ts` queries `subjects.profileId` with a `person.id` value — wrong results until M-REPOINT re-points the FKs.

### S5 — Visibility contract · *Backend pre-built; trust tests + mobile screens missing*
- ✅ Schemas + 3 S5-owned tables + migration `0121`, reportability gate, curated supporter report + render-equivalence projection, linking-ceremony service (both-sides accept), kid-initiated revocation service + Inngest fn, graduation-narration Inngest fn, `MANAGED_TIER_ACTIVE` flag, co-learning payoff guard, 5 mobile visibility components, ADRs 0027/0028. `graduation` correctly absent from `ledgerKindSchema`.
- ❌ **Linking-ceremony mobile screens MISSING** — `apps/mobile/src/app/(app)/link/*` does not exist; backend has no entrypoint, components unreachable.
- ❌ **5 mandatory trust/security break-tests MISSING**: `reportability.safety.test.ts` (T10a), `supportership-revocation.test.ts` (T7a), `graduation-narration.test.ts` (T8a), `visibility.integration.test.ts` (T5a + T9a). Per repo Fix Development Rules these need red-green proof.
- ⚠️ Plan's `buildCuratedRead()` is `buildCuratedSupporterReport()` in code (stale plan name).

### S6 — Cutover + deletions · *Not started (correct); gates open*
- ✅ **Nothing deleted prematurely** — `legacy-navigation-contract.ts`, V0/V1 flags (`feature-flags.ts:30-31`), `eas.json` V0/V1 env lines, all deletion-target screens confirmed present.
- ✅ Gate (a) P3 evals **MET** (park-and-return ranking + reweave registered). `APP_HELP_MAP_V2` pre-S6 enabler already authored (`app-help-map.ts:65`).
- ❌ Gate (b) **§13.1 V0-retirement ruling NOT MET** — recorded "Defer" in `v2-dossier/03-decision-ledger.md:24`; no V2 prod build has shipped, so even the placeholder threshold ("two cycles of V2 default-on in prod") can't start accruing.
- ❌ Gate (c) **heir parity NOT MET** — blocked by S4 (cold-start/co-learning) and S5 (link screens) being unbuilt.

---

## 3. Reconciliation with `00-STATE-OF-PLAY.md`

| STATE-OF-PLAY claim | Audit finding | Verdict |
|---|---|---|
| S0 "Done in code", clean, no person/edge reads | `now-feed.ts` reads `person` + `supportership`; `nowScopeSchema` widened to 3 scopes | **Disagrees** — S4 code leaked into S0 |
| S1 NowCard "built without animation" | Confirmed — zero motion libs imported | **Agrees** |
| S2 notes read-only; add/manage absent; no skeleton | Confirmed at `SubjectHub.tsx:115`, `SubjectsBrowse.tsx:55-65` | **Agrees** |
| S3 "IMPLEMENTED" | Functionally yes, but `use-my-reports` missing + out-of-scope Practice section + structural drift | **Agrees with caveats** |
| S4 / S5 "BLOCKED" on identity flip | **Identity is fully live** (live DB: `profiles` dropped, `person` populated, `subjects` FK repointed). Not blocked at all — just **unbuilt** (missing screens/routes/tests). `supportership` empty only because no linking UI exists yet | **Wrong — not blocked, unbuilt** |
| S6 "DEFERRED + IRREVERSIBLE" | Confirmed not started; gate (a) now met | **Agrees** |

---

## 4. Cross-cutting findings (act on these)

1. ✅ **S4 person-ID/profile-ID bug** (`WI-1128`) — **LIKELY INVALID; verify-and-close.** The premise (query `subjects.profileId` with a `person.id` value → wrong results) assumed the FK repoint hadn't happened. Live DB proves it has: `subjects.profile_id` FK → `person`, all 151/151 rows match a `person.id`, so querying with `person.id` is *correct*. The only remaining issue is **code-vs-DB drift** — `subjects.ts:54` still declares `.references(profiles.id)` (stale). Re-point `WI-1128` at "sync schema code (`profiles.id`→`person.id`) + sweep for live `profiles` reads," or close it.
2. ⚠️ **S0 ↔ S4 tier leak** (`WI-1123`) — S4-scope reads (`person` + `supportership`) shipped inside S0's `/now` service (`now-feed.ts:22,25,~337-361,~414-426`), violating the plan's Tier-1 "no person/edge reads" contract. **Live, not dormant** — `person` has 229 rows on stg, so the person-scope reads execute against real data; the supporter-hub joins return nothing only because `supportership` is empty (no linking UI yet). Functionally benign today, but it *is* an active contract violation. Action: re-classify the tier contract (the "S0 = no person reads" rule is obsolete now identity is live) or fence the reads (P3).
3. ⚠️ **ADR number collisions** (`WI-1125`) — (a) two files claim `MMT-ADR-0027` (supporter-visibility-contract vs bearer-token-consent, the latter filed 2026-06-26 — renumber to 0029+); (b) S4 ADR filed as `MMT-ADR-0024` while the S4 plan/README still reference `0023`. The `decision-adr-link` CI guard may misbehave.
4. ❌ **5 missing S5 trust/security break-tests** (`WI-1126`) — these guard non-reportable/safety invariants; repo rules require negative-path red-green proof before "done."
5. ❌ **5 unproduced S0 ledger kinds** (`WI-1121`) — the `/now` consumer is ready but those moment kinds can't appear until producers are wired.
6. ⚠️ **S0-R T10 lifecycle test missing** + internal-mock debt (GC6) (`WI-1124`).

---

## 5. Recommended next actions (do-now, identity-independent)

These are the cheap, high-value, flip-independent items — the §6 "make the built V2 surface not barren" punch-list, now with audit evidence:

1. **S2 — wire `onAddNote`** at `SubjectHub.tsx:115` (API already complete) → notes become writable. *(felt-knowing loop Flow 1)* — `WI-1118`
2. **S2 — restore add-subject on the populated path** + a manage/archive entry on the hub. — `WI-1119`
3. **S1 — add the missing card/celebration animation** (`NowCard`, `MentorCelebration`) — the one real S1 gap. — `WI-1120`
4. **S0 — wire the 5 unproduced ledger kinds** (or descope `reward_receipt`). — `WI-1121`
5. **S3 — add `use-my-reports.ts`** and resolve the out-of-scope `JournalPracticeSection`. — `WI-1122`
6. **S0-R — write the T10 cross-writer lifecycle test**; clear the internal mock (GC6). — `WI-1124`
7. **Cross-cutting — renumber the colliding ADRs** (`WI-1125`); decide on the S0/S4 tier leak — re-classify or fence (`WI-1123`, low-urgency).

S4/S5 build-track (identity is live — these are buildable now, not blocked): the mobile screens/routes/tests are the real work — `link/*` screens (`WI-1137`), `GET /scopes/coldstart` route (`WI-1127`), cold-start + co-learning surfaces (`WI-1135`/`WI-1136`), and the 5 S5 break-tests (`WI-1126`). Re-point or close `WI-1128` (person-ID "bug" is invalid; remaining task is schema-code↔DB drift sync).

---

## 6. Work-item map

All captured 2026-06-28 in Cosmo (`Stage=Captured`), Project = MentoMate. Caveat: the dedup judge was unavailable during capture (auth precedence), so these were created without automated duplicate-detection — verify no pre-existing sibling before promoting to Executing.

| WI | Name (short) | Pri | Category | Phase | §ref |
|---|---|---|---|---|---|
| `WI-1118` | S2 wire writable notes (`onAddNote`) | P1 | UI/UX | S2 | §5.1 |
| `WI-1119` | S2 add/manage-subject on populated path | P1 | UI/UX | S2 | §5.2 |
| `WI-1120` | S1 card + celebration animation | P1 | UI/UX | S1 | §5.3 |
| `WI-1121` | S0 wire 5 unproduced ledger kinds | P2 | architecture | S0 | §4.5 |
| `WI-1122` | S3 add `use-my-reports` + resolve Practice section | P2 | UI/UX | S3 | §5.5 |
| `WI-1123` | S0↔S4 tier-leak re-classify/fence (live, benign) | P3 | architecture | S0/S4 | §4.2 |
| `WI-1124` | S0-R T10 lifecycle test + GC6 mock | P3 | architecture | S0-R | §4.6 |
| `WI-1125` | ADR number-collision renumber | P3 | architecture | x-cut | §4.3 |
| `WI-1126` | S5 5 trust/security break-tests | P2 (security) | architecture | S5 | §4.4 |
| `WI-1127` | S4 `GET /scopes/coldstart` route | P2 | architecture | S4 | §5 (prep) |
| `WI-1128` | ~~S4 person-ID bug~~ → INVALID; re-point to schema-code↔DB drift sync | P3 | database | S4 | §4.1 |
| `WI-1129` | S0 `/now` T7a test coverage | P3 | architecture | S0 | §2 (S0) |
| `WI-1130` | S1 bar-intent NL fidelity | P3 | architecture | S1 | §2 (S1) |
| `WI-1131` | S1 deep-link review/challenge differentiation | P3 (bug) | UI/UX | S1 | §2 (S1) |
| `WI-1132` | S2 hub richness (sort/group/skeleton) | P2 | UI/UX | S2 | §2 (S2) |
| `WI-1133` | S2 cross-entity search | P2 | UI/UX | S2 | §2 (S2) |
| `WI-1134` | S3 structural deviations (files/namespaces) | P3 | UI/UX | S3 | §2 (S3) |
| `WI-1135` | S4 T17 cold-start surfaces | P2 (feature) | UI/UX | S4 | §2 (S4) |
| `WI-1136` | S4 T19 co-learning doorway | P2 (feature) | UI/UX | S4 | §2 (S4) |
| `WI-1137` | S5 `link/*` mobile screens | P2 (feature) | UI/UX | S5 | §2 (S5) |
