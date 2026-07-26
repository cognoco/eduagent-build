-- WI-2484 audit-only rollback recipe.
-- DO NOT EXECUTE during normal operation: this deliberately restores the
-- legacy profiles(id) targets. It is pinned to the exact MentoMate dev branch.

BEGIN;

DO $$
BEGIN
  IF current_setting('neon.project_id', true)
       IS DISTINCT FROM 'lingering-violet-30592106'
     OR current_setting('neon.branch_id', true)
       IS DISTINCT FROM 'br-weathered-silence-agw4on4x'
  THEN
    RAISE EXCEPTION 'WI-2484 rollback target is not the pinned dev branch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'learning_profiles_profile_id_person_id_fk'
      AND c.conrelid = 'learning_profiles'::regclass
      AND c.confrelid = 'person'::regclass
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'notification_preferences_profile_id_person_id_fk'
      AND c.conrelid = 'notification_preferences'::regclass
      AND c.confrelid = 'person'::regclass
  ) THEN
    RAISE EXCEPTION 'WI-2484 rollback pre-state does not match';
  END IF;
END $$;

ALTER TABLE "learning_profiles"
  DROP CONSTRAINT "learning_profiles_profile_id_person_id_fk",
  ADD CONSTRAINT "learning_profiles_profile_id_profiles_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "notification_preferences"
  DROP CONSTRAINT "notification_preferences_profile_id_person_id_fk",
  ADD CONSTRAINT "notification_preferences_profile_id_profiles_id_fk"
    FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT;
