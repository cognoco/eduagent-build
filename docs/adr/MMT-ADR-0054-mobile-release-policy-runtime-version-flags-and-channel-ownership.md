# MMT-ADR-0054 — Mobile release policy: exact-version OTA targeting, sanctioned flag tuples, and channel ownership

**Status:** Accepted · 2026-08-04 · **Scope:** Mobile release engineering — runtime-version policy, the OTA/native boundary, build-time navigation flags, EAS Update channel ownership, and the pre-production rollback gate · **Deciders:** drafted by Hex (Claude); decision points walked per-item in an operator sitting; **Architecture sign-off: Accepted by operator Jorn 2026-08-04 (decision sitting, draft read in full)**

## Context

The mobile app has two delivery paths of very different cost and blast radius. A **native build** goes through EAS Build and the store: slow (tens of minutes to build, store review on top), but it can change anything, including native modules and permissions. An **over-the-air (OTA) update** via EAS Update replaces only the JavaScript bundle on installed apps: minutes to publish, but a bundle that assumes native capability the installed binary lacks crashes on launch for every recipient, and there is no per-device recall.

Whether an install accepts an OTA bundle is decided by its **runtime version**. The app uses the `appVersion` policy: the runtime version is the app version alone — the `version` field in the committed app config (e.g. `"1.0.1"`), nothing else. Store build numbers (`android.versionCode` / `ios.buildNumber`, managed remotely by EAS under `appVersionSource: "remote"`) are **not** part of the key; incrementing a build number changes nothing about update targeting. Matching is an exact-match wall — installs on one version string never receive bundles published for another. This is crude but fail-safe: the failure mode of a forgotten link is "old installs stop receiving updates", not "old installs receive an incompatible bundle".

Navigation behaviour is controlled by three build-time flags (`EXPO_PUBLIC_ENABLE_MODE_NAV`, `…_V1`, `…_V2` — V0/V1/V2), inlined into each bundle at build or publish time. An earlier convergence audit sanctioned exactly three tuples and banned the rest (notably V2-on/V1-off, which renders navigation backed by a subscription hook that never activates); `scripts/check-mode-nav-flag-combo.ts` enforces this as a forward-only ratchet with a grandfathering baseline for pre-existing non-sanctioned sites.

Delivery is organised into EAS Update channels: `production` (store installs), `preview` (internal testing, CI-published), `development` (dev clients), and `fallback` — a parked side-track holding a pre-built rollback bundle with the redesigned navigation off, so a broken production navigation can be retreated from in minutes by repointing installs at it, instead of through a multi-day store release.

These mechanisms all exist and are individually guarded, but the policy they implement had never been recorded as a decision. At the first production release that gap becomes a one-way door: an incompatible runtime-version or flag choice can strand installed clients, and shipping without a proven fallback removes the only cheap rollback path at the exact moment real users first depend on it.

## Decision

### 1. Runtime-version policy: `appVersion`, exact match

The `runtimeVersion` policy is **`appVersion`**. The compatibility key is the app `version` string alone; there is no wildcard or range matching — a bump from `1.0.1` to `1.0.2` creates a new, disjoint update audience.

Consequences made normative:

- **A version bump is a release act, never cosmetic.** The app version moves only as part of a deliberate store release. Bumping it cuts all prior-version installs off from future OTA updates (they keep working but are frozen until they upgrade through the store).
- **Every native-surface change requires bumping the `version` field itself, plus a native build.** Incrementing only the store build number (`versionCode`/`buildNumber`) does **not** create a new runtime version — installs sharing the old `version` would still accept an OTA built against the new native code. The `version` bump is what walls incompatible bundles off; forgetting it is the one failure this policy cannot catch mechanically.
- The committed `version` field is the source of truth for the compatibility key; EAS's remote app-version source manages only store build numbers, which are irrelevant to update targeting. Release verification reads the committed `version` and confirms the built artifact's runtime version equals it.

### 2. The OTA/native boundary

A change is **native-affecting** — and therefore requires a native build, never OTA alone — when it touches any of: `apps/mobile/app.json`, `apps/mobile/package.json`, `apps/mobile/eas.json`, anything under `apps/mobile/plugins/`, `apps/mobile/android/`, `apps/mobile/ios/`, **or any file the app config consumes at prebuild** — `apps/mobile/google-services.json` and the icon/splash/adaptive-icon image assets referenced from the app config are the current members of that class. Everything else in the mobile app is JavaScript-only and OTA-eligible within its runtime version.

CI implements this boundary (native-change detection in the mobile workflows gates native builds; the OTA job publishes only when no native change is detected). The file classes above are the normative rule; the workflow patterns are its implementation and must match the full rule, including the prebuild-consumed inputs — a detection pattern narrower than this rule is a defect in the pattern, not a narrowing of the rule. Where a change's classification is genuinely unclear, it is treated as native-affecting — the slow path is the safe path.

### 3. Build-time navigation flags: three sanctioned tuples, ratchet-enforced

The MODE_NAV flags are **build-time only** — inlined into each bundle when it is built or published; there are no runtime toggles. Exactly three tuples are sanctioned:

- **Config T** (V0 off / V1 on / V2 on) — the production target.
- **Config F** (V0 off / V1 on / V2 off) — the fallback/rollback configuration.
- **Legacy** (V0 on / V1 off / V2 off) — transitional, sanctioned only until the migration that retires V0 completes.

Every publish carries its channel's designated tuple: production builds carry Config T; the fallback channel carries Config F. The flag-combo checker ratchet is the enforcement mechanism; any tuple outside the sanctioned set fails CI unless grandfathered. The checker's scan surface must cover **every site where a channel's tuple is declared** — build profiles and each workflow that publishes a bundle, the fallback publish workflow included; a declaration site outside the scan surface is guarded only by the manual verification in the recipe below, and bringing it under the scanner is owed, not optional.

The grandfathered non-sanctioned sites (internal-facing build profiles and the preview OTA publish, all V0-on) are **explicitly outside this decision**. Their target disposition — migrate to a sanctioned tuple or receive a bounded temporary sanction — belongs to the navigation owner as a separate recorded ruling; this ADR neither legitimises the grandfathered tuples nor schedules their migration. One consequence is acknowledged rather than resolved here: until that ruling lands, the fallback *build profile* (V0 on, grandfathered) and the fallback *OTA publish* (Config F, V0 off) disagree on V0, so a fallback native build and the fallback OTA bundle are not flag-identical.

### 4. Channel ownership

| Channel | Publisher | Gate |
|---|---|---|
| `production` | Gated deploy pipeline only | GitHub `production` environment approval (human) |
| `fallback` | Manual rollback workflow only | Typed confirmation **and** `production` environment approval (human, twice) |
| `preview` | CI, automatically on merge to main | Green CI + a live-main-tip guard against stale publishes |
| `development` | Developer builds | None (no OTA path) |

Two standing rules:

- **No agent-initiated OTA publish, ever, without explicit operator instruction.** This restates an existing project rule as policy: automation may build and verify, but publishing a bundle to any channel that reaches a person is a human act on the gated paths above (CI's preview publish is the sanctioned, bounded exception).
- **The fallback channel is a rollback path in the sense of MMT-ADR-0049.** Deleting the channel, disabling updates in the app config, or removing the flag off-states that make Config F expressible destroys the last cheap rollback path and requires the explicit, loss-naming human confirmation that ADR ratifies. Green readiness gates do not substitute.

### 5. The fallback must be proven before the first production rollout — hard gate

Before the first production store rollout, a **Config F bundle must have been published to the fallback channel through the gated workflow and verified** — credentials present, publish succeeded, bundle carries Config F at the production runtime version. A rehearsal publish reaches zero users (no production install listens to the fallback channel until deliberately repointed), so this gate is cheap; a fallback that has never been exercised is a drawing of a safety net, and the moment its defects surface is by definition the worst one. Ruled hard (not advisory) in the 2026-08-04 sitting: the missing-credential state of the rollback workflow at ruling time was judged exactly the kind of latent defect this gate exists to flush out.

### 6. One-way doors named

- **First store submission** permanently fixes the package identity (`com.mentomate.app` / bundle identifier); it can never change without becoming a different app.
- **Each version bump** permanently freezes the OTA audience of all prior versions.
- **Removing the fallback machinery** (channel, updates flag, or flag off-states) is governed by MMT-ADR-0049 — explicit human confirmation naming the loss.
- Switching the `runtimeVersion` policy itself after installs exist re-partitions update targeting for the installed base and is treated as native-affecting **and** ADR-worthy.

## Verification recipe (pre-production evidence)

Before a production rollout, the release owner produces evidence that:

1. **Version and channel identity:** the committed app `version` is read and recorded; the production build profile maps to the `production` channel and the built artifact's runtime version equals the recorded version.
2. **Flag conformance:** the flag-combo checker passes; the production build environment classifies as Config T and the fallback publish environment as Config F — the fallback publish tuple verified directly at its declaration site if the checker does not yet scan it.
3. **API compatibility:** the contract-drift check is **demonstrably active** for the artifact being shipped — the bundle's commit identity (`EXPO_PUBLIC_GIT_SHA`) is present in the built bundle's environment and the check compares it against the deployed API. A drift check that exits early because the variable is absent is not evidence; the wiring must exist on the production build path itself, not only on the OTA publish paths.
4. **Fallback proven (per §5):** the rollback workflow's required credentials are present (its preflight passes), a rehearsal publish to the fallback channel has succeeded, and the published bundle is verified to carry Config F at the production runtime version.
5. **Store path intact:** the store-submission pipeline's own checks (internal-track delivery before public release) are green — owned by the store-submission work, verified here only as present.

Evidence items 1–4 are re-established for every release that bumps the version; item 4's rehearsal is re-run whenever the fallback workflow, its credentials, or the flag scheme change.

## Monitoring and rollback limits

**Monitoring.** After any production rollout — store build or OTA — release health is watched through the crash/error pipeline (Sentry post-release triage, per the deployment guide) and the EAS Update dashboard for the affected channel. Where uncertainty about an update is real, it is rolled out gradually (EAS staged rollout) and watched before full exposure, rather than published to everyone at once. `expo-updates`' built-in error recovery is a backstop, not a strategy: a bundle that fails on launch falls back to the previously cached bundle on the device, which masks the defect for that user while the error stream reports it.

**Rollback limits — what each retreat path can and cannot do.**

- An OTA rollback (`eas update:rollback`, or publishing a fixed bundle) operates **only within a runtime version**: it can replace bad JavaScript with good JavaScript, never repair a bad native build.
- The fallback channel retreat (§5) is scoped to the navigation redesign: it swaps production installs to the Config F bundle in minutes, provided the §5 rehearsal evidence exists and someone deliberately repoints the channel.
- A native regression has **no fast retreat**: recovery is a corrected store release plus store review time; installed bad builds remain bad until users upgrade.
- There is **no per-device recall** on any path — every retreat is a forward publish that devices pick up on their next update check; a device that never comes online again keeps what it has.

## Consequences

- The exact-match runtime version makes update targeting fail-safe at the cost of discipline: the one unguarded failure (native change without a version bump) is mitigated by the boundary rule in §2 and the native-change detection in CI, but a change that evades both file-pattern detection and review would still ship an incompatible bundle. The recipe's flag and drift checks narrow, not eliminate, this window.
- Old-version installs go stale rather than broken. This is accepted: the store upgrade path is the recovery, and no OTA machinery attempts to bridge runtime versions.
- The fallback rehearsal adds a small, bounded step to launch preparation and requires production credentials to be provisioned earlier than strictly needed for the store build alone.
- The grandfathered flag sites remain a recorded inconsistency (fallback build vs. fallback bundle, §3) until the navigation owner's ruling lands. Anyone building from the fallback *profile* rather than consuming the fallback *bundle* must check that ruling's status first.
- Channel ownership concentrates publish authority in two human gates plus one bounded CI path, which is deliberate friction: a mistaken publish is minutes to make and potentially days to fully recall.

## Alternatives considered

- **`fingerprint` runtime-version policy** (auto-detects native compatibility by hashing native project state). Originally specified, rejected on evidence: in this pnpm monorepo the fingerprint hashes virtual-store paths that differ between local (Windows) and EAS (Linux) machines even for identical packages, producing spurious runtime-version divergence and build failures; the ignore mechanism cannot exclude the directory-type autolinking sources (upstream limitation, `@expo/fingerprint` ≤ 0.15.4, evaluated 2026). Re-evaluate if the upstream limitation is lifted; the deployment guide records the re-evaluation conditions.
- **Runtime (server-toggled) navigation flags** instead of build-time inlining. Rejected: the `EXPO_PUBLIC_*` mechanism inlines values at bundle time by design, a runtime flag service is new infrastructure the MVP does not carry, and the sanctioned-tuple ratchet depends on flags being fixed per artifact — a runtime toggle would reintroduce the banned combinations as reachable states.
- **Treating the fallback bundle as optional at launch** (provision-on-demand). Rejected in the 2026-08-04 sitting: the saving is roughly an hour of launch preparation, moved to the middle of a production incident; and an unexercised rollback path fails exactly when needed (the rollback workflow was discovered non-functional — missing credential — at ruling time, proving the point).
- **A "semi-hard" fallback gate** (credentials provisioned and preflight green, rehearsal deferred). Considered viable but rejected: the rehearsal is the only step that proves the chain end-to-end, costs ~half an hour, and reaches zero users.
- **Range- or wildcard-based update targeting** (e.g. treating 1.0.x as one audience). Not available under EAS Update's runtime-version model and undesirable anyway: exact match is what makes a version bump a reliable compatibility wall.

## Links

- Living operating rules: `docs/deployment-and-secrets.md` (§ Mobile Builds, § EAS Update) — updated in lockstep with this ADR.
- Launch gate: `docs/pre-launch-checklist.md` (§ Verification Before Go-Live) carries the §5 rehearsal item.
- Enforcement: `scripts/check-mode-nav-flag-combo.ts` + its baseline (flag tuples); native-change detection and channel gates in `.github/workflows/mobile-ci.yml`, `.github/workflows/ci.yml` (OTA job), `.github/workflows/deploy.yml` (gated production build), `.github/workflows/mobile-fallback-ota.yml` (gated fallback publish).
- Related decisions: MMT-ADR-0049 (destroying the last cheap rollback path requires explicit human confirmation); MMT-ADR-0024 (navigation contract supersession that produced the V0/V1/V2 migration).
- Historical attribution: decision points D1–D4 walked and ruled in an operator sitting, 2026-08-04; drain finding that motivated the ADR recorded by the one-way-door documentation audit, 2026-07.
