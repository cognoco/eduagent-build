# Dependencies & supply chain — Bug Review

**Scope:** `package.json` (root + apps + packages), `pnpm-lock.yaml`
**Date:** 2026-06-09
**Branch reviewed:** new-llm

---

## Critical

_(No Critical findings: no publicly exploited zero-days in production-runtime code were confirmed. Highest real-world risk is High.)_

---

## High

### [High] Deprecated `@clerk/clerk-expo` package — upstream replacement required

- **File:** `apps/mobile/package.json:32`
- **What:** The app declares `"@clerk/clerk-expo": "^2.19.23"`. The lockfile at line 1279 records the npm registry deprecation notice: `"This package is no longer supported. Please use @clerk/expo instead."` The new package name is `@clerk/expo` (without the `clerk-` prefix), which is the Clerk Core 3 expo SDK. The old package may receive no further security patches.
- **Impact:** Auth library — handles session tokens, JWT verification, and device-side credential storage. No security patches after EOL means any future Clerk auth vulnerability (SSRF, token-bypass, token-exposure) would go unpatched in this app. Additionally, the upgrade guide linked in the deprecation changes APIs, so a forced-migration scenario could be disruptive.
- **Fix direction:** Replace `@clerk/clerk-expo` with `@clerk/expo` following the Core 3 upgrade guide at `https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3`. Also update `@clerk/clerk-react` (deprecated, line 1313) → `@clerk/react`, and `@clerk/types` (deprecated, line 1361). All three are part of the same Core 3 migration.

---

### [High] `ws@6.2.3` present in lockfile — carries known DoS CVEs

- **File:** `pnpm-lock.yaml:13193`, `pnpm-lock.yaml:29736-29748`
- **What:** `ws` versions 6 and 7 each carried CVE-2024-37890 (DoS via specially crafted HTTP headers). The override `ws@^8.0.0: 8.20.0` (root `package.json:126`) correctly pins `ws@^8` consumers but does NOT cover consumers that pin `ws` at `~6` or `~7`. The lockfile shows two packages that still resolve `ws@6.2.3`: `@react-native-community/cli-server-api@18.0.1` (line 18415, 18433) and `@react-native/dev-middleware@0.81.5` (line 18641, 18659). Both are used in the Metro dev-server stack. Additionally `ws@7.5.10` remains for `jayson@4.3.0` (via `@solana/web3.js`) and other React-Native tooling paths (lines 21921, 25872-26013).
- **Impact:** The React Native Metro bundler and debug middleware run `ws@6` in dev mode. If a developer connects an external device or the bundler is exposed on the local network, a malicious peer can crash the server. This is a dev-only risk, not a production server risk, but teams working on shared networks (or CI) could be affected.
- **Fix direction:** Extend `pnpm.overrides` in `package.json` to also cover `ws@~6.0.0` and `ws@~7.0.0` ranges (e.g. `"ws@~6.0.0": "8.20.0"`, `"ws@~7.0.0": "8.20.0"`). Validate that React Native tooling still works with `ws@8` (it should, since both share the same API surface for these consumers).

---

### [High] `@xmldom/xmldom@0.8.11` deprecated with self-described "critical issues"

- **File:** `pnpm-lock.yaml:5827-5830`
- **What:** The registry deprecation message for this version reads: `"this version has critical issues, please update to the latest version"`. It is pulled in by `@expo/plist@0.3.5`, `@expo/plist@0.4.8` (lines 15584-15594), and `plist@3.1.0` (line 26825-26829). These `plist` libraries are used during build-time iOS provisioning/plist manipulation by Expo config plugins.
- **Impact:** Build-time XML parsing of iOS plist files. Malformed or adversarial plist data (e.g., in a dependency's `app.json` or native config) could trigger the known issue. The exact CVE is not disclosed in the npm message, but the maintainer's own deprecation suggests memory corruption or DoS-class risk.
- **Fix direction:** Upgrade `@expo/plist` and `plist` to their latest versions. If `@expo/config-plugins@54.0.4` locks an older `@expo/plist` version, consider a `pnpm.overrides` entry for `@xmldom/xmldom` to pin to `>=0.9.0`.

---

### [High] `@ungap/structured-clone@1.3.0` — self-annotated CVE-502 (prototype pollution)

- **File:** `pnpm-lock.yaml:5563-5565`
- **What:** The lockfile records `deprecated: Potential CWE-502 - Update to 1.3.1 or higher` for this version. It is consumed by `expo@54.0.29` (lines 23106, 23141) and `jest-worker@30.2.0` (line 24905).
- **Impact:** CWE-502 is unsafe deserialization / prototype pollution. The `expo` runtime uses structured-clone in its module resolver and dev-server communication. A malicious module or crafted response in the Expo dev environment could potentially corrupt the JS runtime's prototype chain. The `jest-worker` usage is test-only; the Expo runtime usage is more relevant.
- **Fix direction:** Add `pnpm.overrides` entry `"@ungap/structured-clone": ">=1.3.1"`. Verify that `expo@54` does not have a hard pin on 1.3.0.

---

### [High] `@sentry/react-native@8.1.0` — significantly outdated (current: 5.x)

- **File:** `apps/mobile/package.json:43`, `pnpm-lock.yaml:4868`
- **What:** `@sentry/react-native@8.1.0` is referenced in `package.json`. The Sentry React Native SDK is currently at v5.x (the v8.x series is a pre-release from 2024 that was later folded into v5 under a different API). It uses `@opentelemetry/api@1.9.0` (pnpm-lock.yaml:19161), one minor behind the `1.9.1` version used elsewhere in the monorepo, creating a two-version split (lines 3343, 3347, 19161). More critically, if this is a version that predates proper Expo SDK 54 support, source maps, error replay, and performance tracing may be broken.
- **Impact:** Missing or corrupted Sentry captures mean runtime errors in production go undetected. The stale OpenTelemetry peer creates a duplicate package split.
- **Fix direction:** Confirm the correct current stable version for Expo 54 + React Native 0.81 from `https://docs.sentry.io/platforms/react-native/` and update the specifier. Ensure only one `@opentelemetry/api` version resolves.

---

## Medium

### [Medium] Multiple `@tanstack/query-core` versions (4 copies: 5.87.4, 5.100.9, 5.100.10, 5.100.11)

- **File:** `pnpm-lock.yaml:5264-5274`, `apps/mobile/package.json:43-45`
- **What:** Four distinct `@tanstack/query-core` versions are installed simultaneously. The `apps/mobile/package.json` specifies `"@tanstack/react-query": "^5.100.10"`, `"@tanstack/query-async-storage-persister": "^5.100.10"`, and `"@tanstack/react-query-persist-client": "^5.100.10"`. Despite the aligned specifier, the lockfile resolves `@tanstack/react-query@5.100.11` (line 5285) with core 5.100.11, while the persist libraries resolve to core 5.100.10 and `@clerk/clerk-js@5.123.0` pulls `@tanstack/query-core@5.87.4` (line 14386). The old `@clerk/clerk-js` internal version (5.87.4) is the most likely root.
- **Impact:** Duplicate TanStack Query core instances can break cross-boundary cache sharing (a `QueryClient` created by one copy of the core is not compatible with another copy). In a mobile app where auth (Clerk) and app data (TanStack Query) need to share cache invalidation events, this can cause stale auth state or missed re-fetches. The `@tanstack/react-query-persist-client` version mismatch (5.100.10 core vs 5.100.11 react-query) is the most operationally risky.
- **Fix direction:** Add `pnpm.overrides` for `"@tanstack/query-core": "5.100.11"` to collapse all consumers to the latest version. Verify Clerk does not break with the overridden version.

---

### [Medium] Deprecated `@clerk/clerk-react` and `@clerk/types` (Core 3 EOL packages)

- **File:** `pnpm-lock.yaml:1310`, `pnpm-lock.yaml:1358`
- **What:** Both `@clerk/clerk-react@5.60.1` (deprecated, line 1313) and `@clerk/types@4.101.15` (deprecated, line 1361) appear in the lockfile. While neither is a direct app dependency, they are pulled in transitively by `@clerk/clerk-expo@2.19.23`. These packages are Core 3 EOL and will not receive security updates.
- **Impact:** If a vulnerability is found in Clerk's React bindings or shared types, a patch would only land in `@clerk/react` (not `@clerk/clerk-react`). Tracking the scope of this risk requires monitoring two package namespaces.
- **Fix direction:** Resolved when the High finding above (migrate to `@clerk/expo`) is addressed. Both packages are part of the same Core 3 split.

---

### [Medium] `keygrip@1.1.0` deprecated — used by `koa@3.0.3`

- **File:** `pnpm-lock.yaml:9513-9516`
- **What:** `keygrip@1.1.0` is explicitly deprecated: `"Package no longer supported."` It is a dependency of `cookies@0.9.1` which is a dependency of `koa@3.0.3` (line 21517-21520). Koa is an optional peer dependency of `inngest@3.54.2` but is installed as part of the Inngest test scaffolding (`@inngest/test@0.1.9`).
- **Impact:** `keygrip` is used for signed cookie verification in Koa. Since Koa here is a test-only dependency and the API runs on Hono (not Koa), this is not a production runtime risk. However the abandoned `keygrip` library can create confusion and represents untested security surface.
- **Fix direction:** The dependency can only be removed by upgrading `@inngest/test` if a newer version removes the Koa peer, or by switching to a test framework that does not need the Koa adapter. If `@inngest/test` adds a Koa-free test mode, use that.

---

### [Medium] `@esbuild-kit/core-utils@3.3.2` and `@esbuild-kit/esm-loader@2.6.5` — deprecated ("merged into tsx")

- **File:** `pnpm-lock.yaml:1583-1589`
- **What:** Both packages are deprecated with `"Merged into tsx: https://tsx.is"`. They are pulled in by `drizzle-kit@0.31.9` (lockfile line 22021). The packages use `esbuild@0.18.20` (line 14743), which is significantly behind the rest of the project's `esbuild@0.25.12`.
- **Impact:** `drizzle-kit` migration tooling runs via `@esbuild-kit/esm-loader`, which ships an unmaintained esbuild 0.18.20. Vulnerabilities or bugs in that older esbuild would only affect `drizzle-kit` CLI commands (`db:generate`, `db:migrate`, etc.), not the production Cloudflare Worker bundle. However, if a malicious migration file were loaded, the old esbuild's transform stage could be a vector.
- **Fix direction:** Upgrade `drizzle-kit` to the latest version (0.30+ series switched away from `@esbuild-kit` to tsx). Check if the newer drizzle-kit still requires a separate override.

---

### [Medium] `inflight@1.0.6` — deprecated with memory-leak warning, used by old glob versions

- **File:** `pnpm-lock.yaml:8787-8789`
- **What:** `inflight@1.0.6` is deprecated: `"This module is not supported, and leaks memory."` It is a transitive dependency of `glob@7.2.3` and `glob@8.1.0` (pulled in by `rimraf@3.0.2` via `chromium-edge-launcher@0.2.0`, and by React Native's codegen tooling). All of these are build/test-only tools.
- **Impact:** Memory leak in long-running build processes. No production runtime impact. Long CI jobs running React Native codegen or Playwright setup could gradually exhaust memory.
- **Fix direction:** Upgrade `rimraf` to v4+ (which uses `glob@10+` without `inflight`). For React Native's codegen usage, track upstream RN updates; `@react-native/codegen@0.81.5` currently pins `glob: 7.2.3` (line 18589).

---

### [Medium] `rimraf@2.4.5` and `rimraf@3.0.2` — deprecated in lockfile

- **File:** `pnpm-lock.yaml:11641-11648`, `pnpm-lock.yaml:27890-27898`
- **What:** The npm registry marks rimraf versions prior to v4 as no longer supported. `rimraf@2.4.5` is brought in by `mv@2.1.1` (optional dep, line 26141-26146). `rimraf@3.0.2` is brought in by `chromium-edge-launcher@0.2.0` (line 21270-21279), a Playwright/dev-tools transitive dependency.
- **Impact:** Build tooling only; no production runtime exposure.
- **Fix direction:** These versions come from third-party dev tooling. Track `chromium-edge-launcher` and `mv` for updates. For now, acceptable as-is given the build-only scope.

---

### [Medium] `glob@6.0.4`, `glob@7.2.3`, `glob@8.1.0` — deprecated versions carry security advisory

- **File:** `pnpm-lock.yaml:8468-8486`, `pnpm-lock.yaml:8475-8483`
- **What:** The npm registry deprecation for these versions reads: `"Old versions of glob are not supported, and contain widely publicized security vulnerabilities"`. `glob@6.0.4` is used by `rimraf@2.4.5` (line 27892). `glob@7.2.3` is used by `rimraf@3.0.2` (line 27897), `@react-native/codegen@0.81.5` (line 18589), and `@react-native-community/cli@18.0.1` (line 27590). `glob@8.1.0` is used by `detox@20.46.0` (line 21899) and `@react-native/community-cli-plugin@0.81.5` (line 18829).
- **Impact:** Glob's "security vulnerabilities" in old versions relate to ReDoS and path traversal. All usage is in build/test/dev tools, not production API code. Low production risk, but ReDoS in dev tooling can hang CI or developer machines.
- **Fix direction:** Add `pnpm.overrides` for `"glob@<9": "^10.0.0"` to force these consumers to glob 10. Validate that nothing uses the old glob callback API (v10 is promise-based).

---

### [Medium] `uuid@7.0.3` and `uuid@8.3.2` deprecated — used by build tools

- **File:** `pnpm-lock.yaml:12888-12896`
- **What:** Both `uuid@7.0.3` and `uuid@8.3.2` are deprecated by the maintainer ("uuid@10 and below is no longer supported"). `uuid@7.0.3` is pulled by `xcode@3.0.1` (pnpm-lock.yaml:29773), an EAS build tool. `uuid@8.3.2` is used by more packages (multiple paths). These are build-time only.
- **Impact:** No known CVE, only maintainer deprecation and future security gaps. The project already uses `uuidv7@1.1.0` for its own IDs (packages/database/package.json:34).
- **Fix direction:** Non-blocking. Track upstream packages (xcode, react-native) for updates. The project's own UUID generation (via uuidv7) is unaffected.

---

### [Medium] `@sentry/react-native@8.1.0` vs. `@sentry/cloudflare@10.39.0` — major version split across platforms

- **File:** `apps/mobile/package.json:43`, `apps/api/package.json:22`, `pnpm-lock.yaml:4868`, `pnpm-lock.yaml:4855`
- **What:** Mobile uses Sentry v8.1.0 while API uses Sentry v10.39.0. These are 2 major versions apart. The v8 line predates Sentry's React Native performance-tracing and session-replay features that landed in v5+.
- **Impact:** API errors are captured in v10's structured envelope format; mobile errors in v8's older format. Sentry dashboards may show inconsistent source maps, different issue fingerprinting logic, and missing replay sessions.
- **Fix direction:** Upgrade `@sentry/react-native` to the current stable (verify with Sentry docs for Expo 54 + RN 0.81 compatibility).

---

### [Medium] `next@14.2.35` pulled as a transitive peer dep via `@naxodev/nx-cloudflare@5.0.2`

- **File:** `pnpm-lock.yaml:10251-10266`, `pnpm-lock.yaml:16473-16484`
- **What:** Next.js 14.2.35 is installed as a transitive dependency of `@naxodev/nx-cloudflare@5.0.2`, which uses an older `@nx/node@21.6.10` that internally requires Next.js as a peer. The project does not use Next.js. The version 14.2.35 is near end-of-life as Next.js 15+ is current stable.
- **Impact:** Next.js 14.x has accumulated several CVEs since initial release (SSRF, server action path disclosure, etc.). Since it is only installed as an optional peer for build tooling and is never imported in worker or mobile code, the blast radius is limited. However a compromised Next.js module in `node_modules` could affect `pnpm exec nx` runs. The non-trivial install size (~23 MB) also bloats the monorepo.
- **Fix direction:** Upgrade `@naxodev/nx-cloudflare` to a version that depends on `@nx@22.x` (which no longer vendors Next.js as a peer dependency for non-Next projects). Or add `pnpm.overrides` for `next` to at least pin it to the latest 14.x patch.

---

### [Medium] `@clerk/shared` has two installed major versions (3.45.0 and 4.9.0)

- **File:** `pnpm-lock.yaml:1322-1346`
- **What:** `@clerk/shared@3.45.0` is used by `@clerk/clerk-expo@2.19.23` and `@clerk/clerk-js@5.123.0` (old Core 2 tree). `@clerk/shared@4.9.0` is used by `@clerk/backend@3.4.4` (Core 3 tree). Having two major versions means two copies of Clerk's utility logic (token parsing, type helpers, etc.) at runtime.
- **Impact:** If both packages are imported in the same JS bundle (Expo Metro), the resulting bundle contains duplicate Clerk internals. Type-narrowing between the two major versions cannot be guaranteed. Session token validation in one copy may use different logic than the other.
- **Fix direction:** Resolved when the `@clerk/clerk-expo` → `@clerk/expo` migration (High finding #1) is completed, which would eliminate the Core 2 shared dependency.

---

### [Medium] Expo SDK 54 project installs SDK 55 packages (`expo-haptics@55`, `expo-localization@55`, `expo-sensors@55`, `expo-speech@55`)

- **File:** `apps/mobile/package.json:55,59,66,67`, `pnpm-lock.yaml:7878,7919,7991,8008`
- **What:** The Expo SDK version is pinned to 54 (`"expo": "~54.0.29"`), but four packages use `^55.x` specifiers: `expo-haptics@^55.0.11`, `expo-localization@^55.0.13`, `expo-sensors@^55.0.13`, `expo-speech@^55.0.8`. Expo's compatibility matrix requires all `expo-*` packages to be on the same SDK major for native layer compatibility.
- **Impact:** SDK 55 modules link against Expo SDK 55 native APIs. When built with the SDK 54 native binary (EAS build profile targets SDK 54), the JS-side SDK 55 API calls may reference non-existent native module methods, producing runtime crashes (`Module not found`, `Unimplemented method`) or silent no-ops. This is particularly risky for `expo-sensors` (accelerometer/gyroscope) and `expo-speech` (TTS).
- **Fix direction:** Downgrade the four packages to their SDK 54-compatible versions (e.g., `expo-haptics@~0.9.0` for SDK 54, etc.), or complete an explicit SDK 55 upgrade for the whole project. Check the Expo SDK changelog for the correct version pins.

---

### [Medium] No automated vulnerability scanning in CI

- **File:** `.github/workflows/ci.yml` (all workflow files checked)
- **What:** None of the CI workflows (`ci.yml`, `api-quality-gate.yml`, `docs-checks.yml`, etc.) run `pnpm audit`, `npm audit`, or any Snyk/Dependabot/OSV scan step. The only dependency-related check in CI is `pnpm run check:root-deps` (line 138), which guards against the NativeWind root-package split but does not scan for known CVEs.
- **Impact:** Known vulnerabilities in transitive dependencies (like the deprecated `ws@6`, `@xmldom/xmldom`, `@ungap/structured-clone` issues above) are not surfaced automatically. Fixes will only happen when someone runs `pnpm audit` manually.
- **Fix direction:** Add a `pnpm audit --audit-level=high` step to `ci.yml`. Consider enabling GitHub Dependabot alerts for the repository. At minimum, add a weekly scheduled job that runs `pnpm audit` and posts to Slack/email on new highs.

---

### [Medium] `@anthropic-ai/sdk@0.92.0` is a devDependency at root but only used by scripts

- **File:** `package.json:60`, `pnpm-lock.yaml:513`
- **What:** `@anthropic-ai/sdk@0.92.0` is declared in root `devDependencies`. It is a heavyweight SDK (~600 kB installed) used by translate scripts (`scripts/translate-gemini.ts` and similar). The current version (0.92.0) is 0.1.0 behind the specifier `^0.92.0` maximum, so upgrades happen freely.
- **Impact:** Minor. The Anthropic SDK in devDependencies does not ship to production. However, if a version with a breaking change is auto-upgraded by pnpm (within the `^0.92.0` range), translation scripts could silently fail. Additionally, the SDK name `translate-gemini.ts` (file name) uses the Gemini name yet imports Anthropic — potential confusion for future developers.
- **Fix direction:** Low priority. Pin to an exact version if script stability is a concern. Rename the file or add a comment if it genuinely calls Anthropic (not Gemini).

---

## Low

### [Low] `node-ipc@9.2.1` present in lockfile — historically supply-chain-attacked package

- **File:** `pnpm-lock.yaml:10315-10317`, `pnpm-lock.yaml:21906`, `pnpm-lock.yaml:24466`
- **What:** `node-ipc` was the subject of a high-profile supply chain attack in versions 10.1.1 and 10.1.2 (March 2022) that wiped files on Russian/Belarusian developer machines. Version 9.2.1 predates the attack and is not compromised, but the package itself is poorly maintained and only used by `detox@20.46.0` and `jest-environment-emit@1.2.0` (test tooling only).
- **Impact:** Test-only scope. No production risk from v9.2.1 specifically. The historical compromise risk is zero for 9.2.1. However, the package's continued presence draws audit attention and CI false-positive risk.
- **Fix direction:** Acceptable as-is for v9.2.1. No action required unless detox or jest-environment-emit releases a version that removes this dependency.

### [Low] `lodash@4.18.1` (optional) installed alongside `lodash@4.17.21`

- **File:** `pnpm-lock.yaml:9801-9804`, `pnpm-lock.yaml:21903`
- **What:** Two lodash versions coexist: `4.17.21` (standard) and `4.18.1` (optional, used by `detox@20.46.0`). Lodash 4.18.x is not a published public version (the public lodash series ends at 4.17.21). A `4.18.1` in the registry appears to be an internal/experimental release.
- **Impact:** Unexpected lodash version. If detox exercises lodash 4.18 code paths that differ from 4.17.21, test reliability could be affected. No security concern identified.
- **Fix direction:** Investigate whether detox's `lodash@4.18.1` is intentional. Add `pnpm.overrides` `"lodash": "4.17.21"` if it causes test instability.

### [Low] `nx@21.6.10` pulled by `@naxodev/nx-cloudflare@5.0.2` — minor version misalign with project's nx@22.2.0

- **File:** `pnpm-lock.yaml:10373`, `pnpm-lock.yaml:16473-16479`
- **What:** The project uses `nx@22.2.0` (root devDependencies), but `@naxodev/nx-cloudflare@5.0.2` internally pulls its own `nx@21.6.10` as a non-optional peer. Both versions coexist in `node_modules/.pnpm/`.
- **Impact:** Two copies of the NX runtime increase `pnpm install` time and disk footprint. If any NX plugin code crosses the version boundary (e.g., a 22.x executor using a 21.x devkit API), plugin behavior could be undefined.
- **Fix direction:** Upgrade `@naxodev/nx-cloudflare` to a version that supports `nx@22.x`. If not available, raise an issue with the plugin author.

### [Low] `esbuild@0.18.20` dragged in by `@esbuild-kit/core-utils@3.3.2` (drizzle-kit transitive)

- **File:** `pnpm-lock.yaml:7555-7558`, `pnpm-lock.yaml:14741-14743`
- **What:** Four esbuild versions are installed: 0.18.20, 0.25.5, 0.25.12, 0.27.3. The `0.18.20` version is only used by the deprecated `@esbuild-kit/core-utils` package (which is a drizzle-kit transitive dep). The rest are used by NX and wrangler tooling.
- **Impact:** Bloated node_modules (~30 MB overhead for extra esbuild binaries on Windows). No production impact.
- **Fix direction:** Upgrading drizzle-kit (Medium finding above) resolves the 0.18.20 entry. The other three versions (0.25.5 for `@expo/metro`, 0.25.12 for NX, 0.27.3 for wrangler) are all current within their respective toolchain constraints.

### [Low] `@types/node` has 4 concurrent versions (12.20.55, 22.19.1, 22.19.17, 25.6.0)

- **File:** `pnpm-lock.yaml:5433-5443`
- **What:** `@types/node@12.20.55` is pulled by `jayson@4.3.0` (via `@solana/web3.js`, a `@clerk/clerk-js` transitive dep, line 24333). `@types/node@22.19.1` is the project's primary version. `22.19.17` is pulled by some NX packages. `@types/node@25.6.0` is pulled by `stripe@20.3.1` as an optional types peer (line 28669).
- **Impact:** Multiple `@types/node` versions can cause TypeScript inference gaps if Node API types differ across versions. The `12.x` version is significantly outdated (Node 12 is EOL since 2022). This is purely a devDependency; no runtime impact.
- **Fix direction:** Add `pnpm.overrides` for `"@types/node@^12": "^22.0.0"` to consolidate the v12 version. The `v25` entry from Stripe is in an optional slot and is not harmful.

### [Low] `@solana/web3.js` and associated Solana packages — unexpected in non-blockchain app

- **File:** `pnpm-lock.yaml:4928-5046`, `pnpm-lock.yaml:14342`
- **What:** ~15 `@solana/*` packages are installed (web3.js, mobile-wallet-adapter, codecs, etc.) as deep transitive dependencies of `@clerk/clerk-js@5.123.0` via `@base-org/account@2.0.1` → `viem@2.46.1` → Solana wallet adapters. These are significant in install size (~8 MB) and entirely unused by the EduAgent app.
- **Impact:** Supply chain attack surface inflation: more packages = more packages that could be compromised. Solana SDK packages are not security-critical here (dev build tools only, bundled away from production by Metro), but they represent unnecessary risk surface and bloat.
- **Fix direction:** The root cause is `@clerk/clerk-js@5.123.0` bundling Solana features. Migrating to `@clerk/expo` (the Core 3 package) should drop these transitive dependencies. File an issue with Clerk if the Core 3 package still brings them.

### [Low] `react-native-markdown-display@7.0.2` — no maintenance since 2022

- **File:** `apps/mobile/package.json:79`, `pnpm-lock.yaml:11360`
- **What:** The last release of `react-native-markdown-display` on npm was v7.0.2 in late 2021/early 2022. The package has no Expo SDK 54 or React Native 0.81 peer declaration (its `react-native: '>=0.50.4'` is too loose to detect compatibility drift). There is no `deprecated` flag yet in the registry but the GitHub repository shows low recent activity.
- **Impact:** Markdown rendering bugs in the tutor chat interface will not be upstream-fixed. The `react-native: '*'` peer in pnpm-lock line 11364 means RN API changes could silently break rendering.
- **Fix direction:** Evaluate a maintained alternative (e.g., `react-native-marked` or `@nozbe/watermelondb`'s text renderer). If staying with this package, add a custom fork or patch.

### [Low] `check:root-deps` guard does not run in pre-commit hook

- **File:** `.husky/pre-commit` (all lines), `scripts/check-no-mobile-deps-at-root.cjs`
- **What:** The `check:root-deps` script (`scripts/check-no-mobile-deps-at-root.cjs`) prevents the NativeWind double-copy bug (mobile deps placed at root `package.json`). It runs in CI (`ci.yml:138`) but NOT in the pre-commit hook (`.husky/pre-commit` — checked all 119 lines). A developer could commit a `package.json` change that adds a mobile dep to root and the error would only surface in CI.
- **Impact:** Fast feedback gap. The NativeWind styling breakage (documented in `.claude/memory/feedback_nativewind_root_pkg_split.md`) would be introduced and pushed to the remote branch before the guard fires.
- **Fix direction:** Add `pnpm run check:root-deps` to `.husky/pre-commit`, before the `pnpm exec tsc --build` step, since it is instantaneous.

### [Low] `verify:postinstall-safety` script exists but runs nowhere in CI or hooks

- **File:** `package.json:46`, `scripts/verify-no-secret-postinstall.cjs`
- **What:** The root `package.json` defines a `"verify:postinstall-safety"` script, but it is not invoked in any `.husky/` hook or `.github/workflows/` step (checked all 10 workflow files).
- **Impact:** The postinstall-safety check — presumably verifying that no dependency's `postinstall` script can exfiltrate secrets — is dead. If a malicious package is added with a `postinstall` that reads `process.env`, no automated gate catches it.
- **Fix direction:** Add `pnpm run verify:postinstall-safety` to the `pnpm install` step in CI (or as a separate CI step after install). This guards the supply chain attack vector of malicious `postinstall` hooks.

---

## Cross-lens findings

- **Security/AuthZ lens:** The Clerk Core 2 → Core 3 migration affects auth session handling. The `@clerk/shared` version split (v3 vs v4) may affect token parsing logic across the auth boundary. Relevant to the auth/authz review.
- **Architecture lens:** `next@14.2.35` pulled transitively by `@naxodev/nx-cloudflare` represents a phantom framework dependency — this project is Hono + Expo, not Next.js. The installed Next.js creates a fake `pages/` module that could confuse NX's dependency-graph inference.
- **Performance lens:** The 4 copies of `@tanstack/query-core` (5.87.4 + 5.100.9 + 5.100.10 + 5.100.11) inflate the JS bundle. Metro's tree-shaking won't deduplicate different-versioned package copies, so all four are bundled.
- **Mobile/native lens:** The Expo SDK 54 project declaring SDK 55 packages (`expo-haptics`, `expo-localization`, `expo-sensors`, `expo-speech`) is a build-time compatibility risk. The native layer mismatch will only surface on device, not in unit tests.
- **Config/secrets lens:** The `verify:postinstall-safety` script being unwired from CI is a supply chain / secrets hygiene gap directly relevant to how secrets are handled in the build environment.
