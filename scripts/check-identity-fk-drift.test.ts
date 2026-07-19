import {
  LEGACY_PROFILE_FK_QUERY,
  legacyProfileFkDrift,
  type ForeignKeyRow,
} from './check-identity-fk-drift';

describe('legacyProfileFkDrift', () => {
  it('reports every non-legacy child still targeting profiles.id in stable order', () => {
    const rows: ForeignKeyRow[] = [
      {
        constraintName: 'notification_preferences_profile_id_profiles_id_fk',
        childTable: 'notification_preferences',
        childColumns: ['profile_id'],
        parentTable: 'profiles',
        parentColumns: ['id'],
      },
      {
        constraintName: 'learning_profiles_profile_id_profiles_id_fk',
        childTable: 'learning_profiles',
        childColumns: ['profile_id'],
        parentTable: 'profiles',
        parentColumns: ['id'],
      },
    ];

    expect(legacyProfileFkDrift(rows)).toEqual([
      'learning_profiles.learning_profiles_profile_id_profiles_id_fk: (profile_id) -> profiles(id)',
      'notification_preferences.notification_preferences_profile_id_profiles_id_fk: (profile_id) -> profiles(id)',
    ]);
  });

  it('passes when the legacy relation is absent or no live child points at it', () => {
    expect(legacyProfileFkDrift([])).toEqual([]);
  });

  it('uses a relation-safe catalog query and excludes only migration 0129 legacy children', () => {
    expect(LEGACY_PROFILE_FK_QUERY).toContain("to_regclass('public.profiles')");
    expect(LEGACY_PROFILE_FK_QUERY).toContain("'public.profiles'");
    expect(LEGACY_PROFILE_FK_QUERY).toContain("'public.accounts'");
    expect(LEGACY_PROFILE_FK_QUERY).toContain("'public.family_links'");
    expect(LEGACY_PROFILE_FK_QUERY).toContain("'public.consent_states'");
  });
});
