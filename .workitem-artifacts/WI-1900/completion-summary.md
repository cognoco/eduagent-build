# What was done

Extended the H5 output-moderation gate from minors-only to adult traffic, per the operator ruling of 2026-08-04 (async + sampled, config-valued rate, existing escalation events reused, minor path untouched).

The item's stated premise turned out to be wrong and the scope shrank accordingly. WI-1900 asserted that adults get no output check at all. That is true only of the ENFORCING rail. A second rail already existed and was already live in production: the post-display suitability judge samples adult replies, dispatches through Inngest with PII-safe event-id references, and is gated by the judge-framework flag, which Doppler confirms is on in production. So four of the ruling's six requirements already shipped.

The two genuine gaps were: the adult sampling rate was a hard-coded module constant rather than a config value, and the adult rail raised no alarm at all — an adult reply could be judged a violation in production and escalate to nobody, which is silent recovery on a safety path.

AC-4 ran first, as the ruling instructed, because an off-in-production result for the minor gate would have outranked this entire scope. It came back enforcing, so the adult work proceeded.

# What changed

- New configuration key for adult post-display coverage, coerced from the Workers string binding, defaulting to the shipped launch rate so landing it changes no production behaviour. Threaded through the resolver, the sampling profile, the dispatch resolver, both exchange call sites, the route boundary, and the Hono bindings type.
- The resolver fails safe toward the launch default rather than toward zero. An empty-string binding parses as zero and is finite, so without an explicit guard a blank secret would have silently disabled adult coverage while looking like a healthy configured value — the same present-but-blank shape as the SENTRY_DSN secret-sync item in this batch.
- The async judge handler now raises the existing structured alarms for adults: the judge-unavailable event on a degraded judge, and the suitability-blocked event carrying a new observed mode on a blocking-grade verdict.
- That observed mode keeps the operator digest honest. Observed detections are excluded from the blocked counter, because nothing was blocked and no learner was protected. An absent mode means enforced, so no historical event is reclassified.
- Both new alarms are adult-scoped. Minors are covered by the synchronous enforcing gate, which raises these same events itself, so firing here as well would double-alarm and would change the path the ruling holds fixed.
- Each dispatch is memoized in its own Inngest step. The function runs with retries, and the emitters mint a fresh identifier per call, so an unmemoized dispatch would raise a second distinct alarm for one verdict on any retry.
- The block predicate was narrowed so the async rail can reuse it without an unsafe cast, since raw text and rationale deliberately stay inside the step closure.
- Added the first test file for the async judge handler, using the dependency-injection pattern the sibling digest function already uses rather than mocking anything internal.
- Added adult coverage to the eval harness, which previously had none: the shared profile fixtures are all minors, so the adult branch of the rubric was unreachable there.
- Closed the H5 register row with mechanism, date, the real Doppler values for all three environments, and links to the adult acceptance evidence.

# Verification

- Full API unit target: green, no failing suites.
- Project typecheck for both the API and mobile targets via the nx path: no errors.
- Lint across every changed file: no errors.
- Repo guards: the Inngest admin-annotation guard, the excluded-vendor runtime ratchet, and the prompt-marker guard all pass. The vendor ratchet caught an excluded-vendor string I had copied into a new test fixture; the fixture was changed to an approved vendor rather than accepting a wider baseline.
- Tier-1 eval for the suitability flow writes both scenarios and exits clean.
- The change-class router does not require the eval harness for this change, since no prompt file was touched; the eval scenario was added because the acceptance criteria ask for it, not because the router did.

# Caveats / Follow-ups

Adult coverage is detect-and-escalate, not block: fail-closed is unavailable on a post-display path because the reply is already displayed. This is the operator-ruled design, and the register row states it rather than implying adults are blocked. At the default rate most adult replies remain unjudged; raising coverage is now a configuration change rather than a code change, which was the point of making the rate config-valued. Neither judge flag exists in the staging configuration, so no pre-production environment can exercise this gate at all — staging runs the disabled path in both cases. That is recorded on the register row and is worth its own item; it is a deploy-configuration and compliance question rather than an engineering gap in this change. More broadly, adult-path safety has been structurally unobservable: staging carries neither flag, the eval harness had no adult profile, and until this change an adult violation produced no queryable signal. This item closes the third of those three; the first two remain open.
