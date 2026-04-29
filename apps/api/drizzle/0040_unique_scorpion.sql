ALTER TABLE "quiz_rounds" ADD COLUMN "language_code" text;
-- [BUG-926] No automatic backfill is possible for historical quiz_rounds rows:
-- quiz_rounds does not store a subject_id foreign key, so there is no reliable
-- join path to subjects.language_code for existing vocabulary rounds.
-- Historical vocabulary rounds will remain NULL in language_code and will group
-- under a (vocabulary, NULL) bucket in aggregateCompletedStats — they will NOT
-- be attributed to any specific language card.  All new vocabulary rounds
-- created after this migration will have language_code set by generate-round.ts.
-- The per-language stats cards will show neutral fallback text until the user
-- plays at least one round per language after the migration is applied.