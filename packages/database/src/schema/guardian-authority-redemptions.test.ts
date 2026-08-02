import { getTableConfig } from 'drizzle-orm/pg-core';
import { guardianAuthorityRedemptions } from './guardian-authority-redemptions.js';

describe('guardianAuthorityRedemptions schema', () => {
  it('[WI-2986] stores only digests and bounded assertion metadata', () => {
    const columns = getTableConfig(guardianAuthorityRedemptions).columns.map(
      (column) => column.name,
    );
    expect(columns).toEqual(
      expect.arrayContaining([
        'verifier_handle_digest',
        'command_binding_digest',
        'authority_token_digest',
        'evidence_id',
        'expires_at',
      ]),
    );
    expect(columns).not.toEqual(
      expect.arrayContaining([
        'verification_handle',
        'authority_token',
        'raw_evidence',
        'provider_secret',
      ]),
    );
  });

  it('[WI-2986] has unique local arbiters for handle and evidence redemption', () => {
    const indexes = getTableConfig(guardianAuthorityRedemptions).indexes.map(
      (index) => ({ name: index.config.name, unique: index.config.unique }),
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        {
          name: 'guardian_authority_redemptions_handle_unique',
          unique: true,
        },
        {
          name: 'guardian_authority_redemptions_evidence_unique',
          unique: true,
        },
      ]),
    );
  });
});
