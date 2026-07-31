## What was done

Added a durable Me-or-someone-else fork after an adult completes family-intent
profile creation.

## What changed

- The adult profile is created without an automatic family-context write or
  child-profile redirect.
- Me continues ordinary learner onboarding.
- Someone else opens an own-login question; credentialed learners reach the
  existing family-join invitation form, while the unavailable managed path is
  explicit.
- The unfinished fork is stored per profile and restored after remount or
  relaunch. Me durably clears it before synchronous `onComplete`
  mounts/reveals the learner shell; the existing-account destination clears
  only after its real route mounts, whether that route shows the V2 invitation
  form or the older-shell unavailable gate. Sign-out also clears it.
- Storage failures fail closed with retry; a failed handoff after profile
  creation retries only the durable marker and never repeats the profile POST.
- Successful initial and retry persistence complete through the current shell:
  V2 lands at Mentor and older shells retain Home. Cancel, pending-consent, and
  ordinary add-child exits retain their existing close behavior.
- Dedicated translated copy, focused mobile coverage, and a preview browser
  journey were added.

## Verification

The focused merge-forward union completed successfully across durable state,
both branches, profile creation, app-layout restoration, invitation routing,
sign-out cleanup, session routing, consent routing, link resubmit-generation
guards, and first-Mentor language confirmation. The durable family-intent probe
now resolves before the first-Mentor language gate can render. A restored
invitation mounts Tabs before replay, keeps its handoff pending until the
terminal route is observed, and suppresses the language gate on that route
through destination mount and marker consumption.
The union includes the landed test-seed helper. On the exact code candidate
immediately preceding the evidence-only commit, the full mobile unit stage
completed successfully as producer-local historical evidence. Its log is
untracked and ephemeral, so exact-head hosted and landed verification must
re-establish the applicable mobile gates. The full API unit stage under the
sanctioned development database boundary, TypeScript build, i18n ratchets,
teen-consent claims ratchet, test-only export guard, GC1 mock-governance
ratchet, warning-free touched-file lint, exact-file Prettier, and whitespace
check also completed successfully.
After the latest API-only authoritative-main merge, the mobile semantic union
and affected API unit set completed successfully under Doppler `dev`. The
main-identical metering integration suite is explicitly red on Orion's
pre-repoint development database because `quota_pools` still targets legacy
`subscriptions`; that known M-REPOINT baseline predates WI-2653, is
canonically deduplicated to WI-2633 (pre-repoint metering integration
baseline), and is not represented as a green gate here. The earlier pre-push
shared-staging marker rejection is canonically recorded on WI-2806 (env-sync
staging markers); it made no network update.
The later zero-overlap workflow/provider/integration-typecheck merge completed
its applicable provider, change-class, integration-typecheck, Tier-1 eval,
TypeScript, lint, formatting, and whitespace gates successfully. Two
main-identical Windows harness findings were captured for independent delivery:
WI-2950 (deploy-smoke fake-curl Bash PATH on Windows) and WI-2951
(integration-typecheck checker pnpm.cmd resolution). Both are mechanically
DoR-green Ready/Active and formally admitted to BID-49. Neither is patched on
this branch.
The following zero-overlap compliance/latest-curriculum/multilingual-safety
merge completed its affected API unit, integration-typecheck, full TypeScript,
and Tier-1 zero-drift eval gates successfully.
Review-bounce coverage also verifies stale-read rejection, recovery-primary
repair, all-mode terminal destination consumption, and a
mounted-but-inaccessible blocked navigator. A pre-WI-1556 preview journey
historically reached the invitation form without a supportership write; it is
diagnostic history, not attributable final-head E2E evidence.

## Caveats / Follow-ups

The managed learner without an independent login remains intentionally
unavailable and is presented as such. This change does not activate or authorize
that path. The branch was merge-forwarded through current authoritative main,
preserving landed WI-2231 routing, WI-2399 resubmit-generation guards, WI-1556
first-Mentor language confirmation, WI-2820/WI-2944 test-seed batching, and
WI-2653 profile-authority behavior. The later learner-egress filter merge was
also zero-overlap and its focused API unit set completed successfully. The
subsequent staging-smoke, Mistral endpoint, and integration-typecheck merge was
zero-overlap as well. The following production-purge evidence,
latest-curriculum, and multilingual-safety merge was also zero-overlap; no
history was rewritten.
The Work Item remains Executing until its PR lands; lifecycle completion must
not run while the PR is open. Final attributable E2E evidence must come from
the published exact head.
