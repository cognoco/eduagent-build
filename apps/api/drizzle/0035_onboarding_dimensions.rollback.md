# 0035 Rollback — Onboarding Dimensions

Per `~/.claude/CLAUDE.md` "Destructive Migrations Need a Rollback Section".

## Scope of rollback

This migration has two halves:

1. **profiles.conversation_language + profiles.pronouns columns** — reversible.
2. **learning_profiles.interests shape rewrite (string[] → InterestEntry[])** — **NOT reversible**. Original `string[]` entries cannot be reconstructed from `{label, context}` objects without losing the `context` tag. Forward-fix is the only option.

## Is rollback possible?

- **Half 1 (profiles columns):** YES, with data loss for any `conversation_language` and `pronouns` values captured during the transition window.
- **Half 2 (interests shape):** NO. Data is permanently reshaped.

## Data lost

- `profiles.conversation_language`: any non-default value written since the migration will be dropped when the column is dropped.
- `profiles.pronouns`: any value written since the migration will be dropped.
- `learning_profiles.interests`: **none on forward migration** — every legacy string becomes `{label: <string>, context: 'both'}`, preserving the label. Rollback is not applicable for this half.

## Recovery procedure

### Rolling back only Half 1 (if onboarding-UI regression found mid-rollout)

```sql
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_conversation_language_check";
ALTER TABLE "profiles" DROP COLUMN "conversation_language";
ALTER TABLE "profiles" DROP COLUMN "pronouns";
```

After rollback, the application must be redeployed with pre-0035 code so reads don't reference the dropped columns. The forward-compatible reader in `@eduagent/schemas` will still accept the legacy `string[]` or new `InterestEntry[]` shape for interests — so Half 2 does not force the app to be on post-0035 code.

### Rolling back Half 2 (if shape migration found buggy)

**Not possible.** Forward-fix with a follow-up migration that repairs the data (e.g., rewrites specific rows). The forward-compatible reader tolerates both shapes, so there is no urgency — fix can ship as a normal migration.

## Safe-rollback invariant

Before rolling back Half 1:
- Verify no code on the deploy target reads `profiles.conversation_language` or `profiles.pronouns`. If any route or service references them, the rollback will break the deploy.
- Check `apps/api/src/services/llm/router.ts` and the onboarding routes under `routes/onboarding/` for references.

## Linked tickets

- Finding IDs: `BKT-C.1` (conversation language + pronouns), `BKT-C.2` (interests shape).
- Spec: `docs/specs/2026-04-19-onboarding-new-dimensions.md`.
