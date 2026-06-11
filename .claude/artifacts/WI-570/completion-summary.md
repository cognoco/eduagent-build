## Completion Summary

**What was done:**
Built the Drizzle TS schema for all 17 identity-foundation tables and updated the
AgeBracket type to a 3-way union with a 13+ age floor across the codebase, as
specified in WI-570 (WP-W1-schema).

**What changed:**
- packages/database/src/schema/identity.ts (new): 17-table Drizzle TS schema
  matching 0108_identity_foundation_baseline.sql exactly. 2 enums (policy_kind,
  model_tier); core identity tables (person, login, organization, membership,
  subscription, guardianship, supportership); consent/audit tables (consent_grant,
  consent_receipt, deletion_audit, financial_record); policy engine (regimes,
  policy_cells, policy_rules); knowledge/routing (knowledge_assertions, allowed_models,
  subscription_payers). All FKs, CHECK constraints, unique indexes, and partial
  indexes match the SQL baseline.
- packages/database/src/schema/identity.test.ts (new): 19 tests — 14 smoke + 5
  break tests (no-self-guardian, no-self-support, roles non-empty, roles closed-set,
  payer NOT NULL). Source-file analysis pattern per cascade-fk-guard.test.ts.
- packages/schemas/src/age.ts: AgeBracket 3-way union + computeAgeBracket updated
  (< 13 = child, 13–17 = adolescent, 18+ = adult).
- packages/schemas/src/profiles.ts: birthYearSchema floor 11 → 13.
- apps/api/src/services/consent.ts: MINIMUM_AGE 11 → 13 (lockstep).
- apps/api/src/services/profile.ts: service error message updated for 13+ floor.
- apps/api/src/services/quiz/config.ts: describeAgeBracket() adds child; label 11-17 → 13-17.
- apps/api/src/services/llm/router.ts: getSafetyPreamble() handles child bracket.
- 8 test files updated for new bracket labels and 13-floor boundaries.

**Verification:**
- db:push:dev: [✓] Changes applied — zero changes (TS schema matches SQL baseline exactly; HARD STOP not triggered)
- api:typecheck: clean
- api:lint + database:lint: clean
- api:test: 317 suites, 6477 tests passing
- pnpm eval:llm: 23 flows, 366 snapshots, zero snapshot drift
- Identity schema tests: 19/19 pass
- PR #855 CI: all 6 checks green
- Codex review P2 finding addressed (person.loginId circular FK documented)

**Caveats / Follow-ups:**
- person.loginId FK constraint exists at DB layer but not in Drizzle TS schema due to circular TypeScript type reference (TS7022/TS7024). Documented in column JSDoc. Revisit if Drizzle resolves circular-FK type issue.
- The child bracket (sub-13) is currently unreachable via the product UI (birthYearSchema 13+ floor) but is wired for planned v1.1 sub-13 ungating.
