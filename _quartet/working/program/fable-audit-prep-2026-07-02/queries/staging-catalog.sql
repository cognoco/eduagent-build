SELECT
  name,
  to_regclass(name) AS regclass
FROM (VALUES
  ('public.subscriptions'),
  ('public.accounts'),
  ('public.profiles'),
  ('public.family_links'),
  ('public.consent_states'),
  ('public.subscription'),
  ('public.person'),
  ('public.organization')
) AS t(name)
ORDER BY name;
