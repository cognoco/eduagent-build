# Rollback: 0084 — Add `source` column to `topic_notes`

Migration adds a `source text NOT NULL DEFAULT 'user'` column to `topic_notes`
to record note provenance (`'user'` vs `'challenge_round'`).

## Rollback

- **(a) Rollback possible?** Yes.

- **(b) Data lost?** Source-attribution on all existing notes. The column value
  for any note that was created by a challenge-round (i.e. `source =
  'challenge_round'`) is permanently lost on rollback. Pre-launch the table
  has no notes of consequence, so data loss is negligible in practice. Post-
  launch: all notes revert to indistinguishable provenance — they would all be
  treated as `'user'`-authored.

- **(c) Recovery procedure?**
  1. Apply the following SQL against the target database:
     ```sql
     ALTER TABLE topic_notes DROP COLUMN IF EXISTS source;
     ```
  2. Revert the schema commit that added `source` to
     `packages/database/src/schema/notes.ts`.
  3. Revert the service commit that passes `source` in `insertNoteWithCap` /
     `createNote` / `createNoteForSession`.
  4. Revert the schemas package commit that added `noteSourceSchema` and the
     `source` fields to the five note schemas in
     `packages/schemas/src/notes.ts` (`noteResponseSchema`, `topicNoteSchema`
     via `.extend()`, `_noteDbRowSchema`, `_noteGetRowSchema`, `allNoteSchema`).
  5. Rebuild and redeploy the API Worker.
