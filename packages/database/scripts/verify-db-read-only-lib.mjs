const CAPABILITY_FAILURES = [
  ['is_superuser', 'role is a superuser'],
  ['can_create_database', 'role has database CREATE capability'],
  ['can_create_schema', 'role has schema CREATE capability'],
  ['owns_application_objects', 'role owns application objects'],
  ['has_table_writes', 'role has table write privileges'],
  ['has_sequence_writes', 'role has sequence write privileges'],
];

export function assertReadOnlyCapabilities(capabilities) {
  const violations = CAPABILITY_FAILURES.filter(
    ([property]) => capabilities[property],
  ).map(([, message]) => message);

  if (violations.length > 0) {
    throw new Error(`DATABASE_URL is not read-only: ${violations.join('; ')}`);
  }
}
