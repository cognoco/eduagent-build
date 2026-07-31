-- WI-2484 audit-only rollback recipe.
-- DO NOT EXECUTE during normal operation: this deliberately restores the
-- legacy profiles(id) targets. It is pinned to the exact MentoMate dev branch.

BEGIN;

DO $$
DECLARE
  learning_profiles_def text;
  notification_preferences_def text;
  expected_def CONSTANT text :=
    'FOREIGN KEY (profile_id) REFERENCES person(id) ON DELETE CASCADE';
BEGIN
  IF current_setting('neon.project_id', true)
       IS DISTINCT FROM 'lingering-violet-30592106'
     OR current_setting('neon.branch_id', true)
       IS DISTINCT FROM 'br-weathered-silence-agw4on4x'
  THEN
    RAISE EXCEPTION 'WI-2484 rollback target is not the pinned dev branch';
  END IF;

  SELECT pg_get_constraintdef(c.oid)
    INTO learning_profiles_def
  FROM pg_constraint c
  WHERE c.conname = 'learning_profiles_profile_id_person_id_fk'
    AND c.conrelid = 'learning_profiles'::regclass
    AND c.confrelid = 'person'::regclass;

  SELECT pg_get_constraintdef(c.oid)
    INTO notification_preferences_def
  FROM pg_constraint c
  WHERE c.conname = 'notification_preferences_profile_id_person_id_fk'
    AND c.conrelid = 'notification_preferences'::regclass
    AND c.confrelid = 'person'::regclass;

  IF learning_profiles_def IS DISTINCT FROM expected_def THEN
    RAISE EXCEPTION
      'WI-2484 rollback pre-state does not match: learning_profiles_profile_id_person_id_fk is % (expected %)',
      learning_profiles_def, expected_def;
  END IF;

  IF notification_preferences_def IS DISTINCT FROM expected_def THEN
    RAISE EXCEPTION
      'WI-2484 rollback pre-state does not match: notification_preferences_profile_id_person_id_fk is % (expected %)',
      notification_preferences_def, expected_def;
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
