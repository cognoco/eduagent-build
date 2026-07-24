BEGIN;

DO $$
DECLARE
  expected uuid[] := ARRAY[
    '019f1349-8e7d-736e-bfb1-f5e7458530d1',
    '019f1349-8e7e-7176-9f5b-3929832ec9d3',
    '019f1349-8fea-7713-acf5-79abd7291606',
    '019f1349-9214-704c-ba8b-d8a392a3541d',
    '019f1349-9243-73c1-ac0d-b769666774f1'
  ]::uuid[];
  actual uuid[];
  candidate_count integer;
  deleted_count integer;
BEGIN
  SELECT array_agg(sm.id ORDER BY sm.id)
    INTO actual
  FROM support_messages sm
  LEFT JOIN person p ON p.id = sm.profile_id
  WHERE p.id IS NULL;

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION
      'WI-2487 orphan set changed: expected %, found %',
      expected, actual;
  END IF;

  SELECT count(*)
    INTO candidate_count
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid = 'profiles'::regclass
    AND c.conrelid NOT IN (
      'profiles'::regclass,
      'accounts'::regclass,
      'family_links'::regclass,
      'consent_states'::regclass
    );

  IF candidate_count <> 51 THEN
    RAISE EXCEPTION
      'WI-2487 candidate FK count changed: expected 51, found %',
      candidate_count;
  END IF;

  DELETE FROM support_messages
  WHERE id = ANY(expected);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  IF deleted_count <> 5 THEN
    RAISE EXCEPTION
      'WI-2487 delete count changed: expected 5, deleted %',
      deleted_count;
  END IF;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      c.conrelid::regclass::text AS child,
      c.conname AS old_name,
      regexp_replace(
        c.conname,
        '_profiles_id_fk$',
        '_person_id_fk'
      ) AS new_name,
      replace(
        pg_get_constraintdef(c.oid),
        'REFERENCES profiles(',
        'REFERENCES person('
      ) AS new_def
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'profiles'::regclass
      AND c.conrelid NOT IN (
        'profiles'::regclass,
        'accounts'::regclass,
        'family_links'::regclass,
        'consent_states'::regclass
      )
    ORDER BY 1, 2
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
      r.child,
      r.old_name,
      r.new_name,
      r.new_def
    );
  END LOOP;
END $$;

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(
    format('%s.%s', c.conrelid::regclass, c.conname),
    '; '
  )
  INTO offending
  FROM pg_constraint c
  WHERE c.contype = 'f'
    AND c.confrelid = 'profiles'::regclass
    AND c.conrelid NOT IN (
      'profiles'::regclass,
      'accounts'::regclass,
      'family_links'::regclass,
      'consent_states'::regclass
    );

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'WI-2487 surviving profiles FK(s): %',
      offending;
  END IF;
END $$;

COMMIT;
