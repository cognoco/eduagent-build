const {
  applyDeletionPlan,
  buildReconciliationPlan,
  expectedApprovalPhrase,
  formatDryRun,
  validateOwnershipManifest,
} = require('./reconcile-worker-secrets.js') as {
  applyDeletionPlan: (options: {
    plan: {
      deleteCandidates: string[];
      preserveKeys: string[];
      requiredPresentKeys?: string[];
    };
    approval: string;
    expectedApproval: string;
    deleteSecret: (key: string) => { success: boolean; error?: string };
    listDopplerKeyNames: () => string[];
    listWorkerSecretNames: () => string[];
  }) => void;
  buildReconciliationPlan: (options: {
    dopplerKeys: string[];
    workerKeys: string[];
    manifest: OwnershipManifest;
  }) => {
    deleteCandidates: string[];
    preserveKeys: string[];
    requiredPresentKeys: string[];
  };
  expectedApprovalPhrase: (
    manifest: OwnershipManifest,
    deleteCandidates: string[],
  ) => string;
  formatDryRun: (deleteCandidates: string[]) => string;
  validateOwnershipManifest: (
    manifest: unknown,
    expectedTarget: OwnershipManifest['target'],
    now: Date,
  ) => OwnershipManifest;
};

type OwnershipManifest = {
  schemaVersion: 1;
  reviewedAt: string;
  validUntil: string;
  target: {
    dopplerProject: string;
    dopplerConfig: string;
    workerName: string;
    wranglerEnvironment: string;
  };
  ownedKeys: string[];
};

const target = {
  dopplerProject: 'mentomate',
  dopplerConfig: 'prd',
  workerName: 'mentomate-api-prd',
  wranglerEnvironment: 'production',
};

function manifest(
  overrides: Partial<OwnershipManifest> = {},
): OwnershipManifest {
  return {
    schemaVersion: 1,
    reviewedAt: '2026-07-30T00:00:00.000Z',
    validUntil: '2026-10-28T00:00:00.000Z',
    target,
    ownedKeys: ['PRESENT_OWNED', 'REMOVED_OWNED'],
    ...overrides,
  };
}

describe('[WI-1837] Worker secret ownership manifest', () => {
  it('accepts a current manifest for the exact production target', () => {
    expect(
      validateOwnershipManifest(
        manifest(),
        target,
        new Date('2026-08-01T00:00:00.000Z'),
      ),
    ).toEqual(manifest());
  });

  it.each([
    ['stale', manifest({ validUntil: '2026-07-31T00:00:00.000Z' })],
    ['duplicate', manifest({ ownedKeys: ['PRESENT_OWNED', 'PRESENT_OWNED'] })],
    [
      'target-mismatched',
      manifest({
        target: { ...target, workerName: 'mentomate-api-stg' },
      }),
    ],
    ['malformed', { ...manifest(), unexpected: true }],
  ])('fails closed for a %s manifest', (_label, candidate) => {
    expect(() =>
      validateOwnershipManifest(
        candidate,
        target,
        new Date('2026-08-01T00:00:00.000Z'),
      ),
    ).toThrow();
  });
});

describe('[WI-1837] deletion-safe reconciliation', () => {
  const validManifest = manifest();

  it('dry-runs only manifest-owned Worker keys absent from Doppler', () => {
    const plan = buildReconciliationPlan({
      dopplerKeys: ['PRESENT_OWNED'],
      workerKeys: ['PRESENT_OWNED', 'REMOVED_OWNED', 'WORKER_ONLY'],
      manifest: validManifest,
    });

    expect(plan.deleteCandidates).toEqual(['REMOVED_OWNED']);
    expect(plan.preserveKeys).toEqual(['PRESENT_OWNED', 'WORKER_ONLY']);
    expect(plan.requiredPresentKeys).toEqual(['PRESENT_OWNED']);
    expect(formatDryRun(plan.deleteCandidates)).toBe('REMOVED_OWNED\n');
  });

  it('fails closed without the exact production approval', () => {
    const deleteSecret = jest.fn(() => ({ success: true }));

    expect(() =>
      applyDeletionPlan({
        plan: {
          deleteCandidates: ['REMOVED_OWNED'],
          preserveKeys: ['PRESENT_OWNED', 'WORKER_ONLY'],
        },
        approval: '',
        expectedApproval: expectedApprovalPhrase(validManifest, [
          'REMOVED_OWNED',
        ]),
        deleteSecret,
        listDopplerKeyNames: () => ['PRESENT_OWNED'],
        listWorkerSecretNames: () => ['PRESENT_OWNED', 'WORKER_ONLY'],
      }),
    ).toThrow('approval');
    expect(deleteSecret).not.toHaveBeenCalled();
  });

  it('deletes one removed owned key while retaining an unowned key', () => {
    const deleteSecret = jest.fn(() => ({ success: true }));

    applyDeletionPlan({
      plan: {
        deleteCandidates: ['REMOVED_OWNED'],
        preserveKeys: ['PRESENT_OWNED', 'WORKER_ONLY'],
      },
      approval: expectedApprovalPhrase(validManifest, ['REMOVED_OWNED']),
      expectedApproval: expectedApprovalPhrase(validManifest, [
        'REMOVED_OWNED',
      ]),
      deleteSecret,
      listDopplerKeyNames: () => ['PRESENT_OWNED'],
      listWorkerSecretNames: () => ['PRESENT_OWNED', 'WORKER_ONLY'],
    });

    expect(deleteSecret).toHaveBeenCalledTimes(1);
    expect(deleteSecret).toHaveBeenCalledWith('REMOVED_OWNED');
  });

  it('fails when deletion is unsupported or post-delete state is unsafe', () => {
    expect(() =>
      applyDeletionPlan({
        plan: {
          deleteCandidates: ['REMOVED_OWNED'],
          preserveKeys: ['WORKER_ONLY'],
        },
        approval: expectedApprovalPhrase(validManifest, ['REMOVED_OWNED']),
        expectedApproval: expectedApprovalPhrase(validManifest, [
          'REMOVED_OWNED',
        ]),
        deleteSecret: () => ({
          success: false,
          error: 'unsupported deletion',
        }),
        listDopplerKeyNames: () => [],
        listWorkerSecretNames: () => ['REMOVED_OWNED', 'WORKER_ONLY'],
      }),
    ).toThrow('unsupported deletion');

    expect(() =>
      applyDeletionPlan({
        plan: {
          deleteCandidates: ['REMOVED_OWNED'],
          preserveKeys: ['WORKER_ONLY'],
        },
        approval: expectedApprovalPhrase(validManifest, ['REMOVED_OWNED']),
        expectedApproval: expectedApprovalPhrase(validManifest, [
          'REMOVED_OWNED',
        ]),
        deleteSecret: () => ({ success: true }),
        listDopplerKeyNames: () => [],
        listWorkerSecretNames: jest
          .fn()
          .mockReturnValueOnce(['REMOVED_OWNED', 'WORKER_ONLY'])
          .mockReturnValueOnce(['REMOVED_OWNED']),
      }),
    ).toThrow('Post-delete verification failed');
  });

  it('rechecks Doppler immediately before apply and refuses a stale deletion plan', () => {
    const deleteSecret = jest.fn(() => ({ success: true }));

    expect(() =>
      applyDeletionPlan({
        plan: {
          deleteCandidates: ['REMOVED_OWNED'],
          preserveKeys: ['PRESENT_OWNED', 'WORKER_ONLY'],
        },
        approval: expectedApprovalPhrase(validManifest, ['REMOVED_OWNED']),
        expectedApproval: expectedApprovalPhrase(validManifest, [
          'REMOVED_OWNED',
        ]),
        deleteSecret,
        listDopplerKeyNames: () => ['PRESENT_OWNED', 'REMOVED_OWNED'],
        listWorkerSecretNames: () => [
          'PRESENT_OWNED',
          'REMOVED_OWNED',
          'WORKER_ONLY',
        ],
      }),
    ).toThrow('Doppler state changed');
    expect(deleteSecret).not.toHaveBeenCalled();
  });

  it('refuses deletion when a Doppler-present managed key is missing from the Worker', () => {
    const deleteSecret = jest.fn(() => ({ success: true }));

    expect(() =>
      applyDeletionPlan({
        plan: {
          deleteCandidates: ['REMOVED_OWNED'],
          preserveKeys: ['WORKER_ONLY'],
          requiredPresentKeys: ['PRESENT_OWNED'],
        },
        approval: expectedApprovalPhrase(validManifest, ['REMOVED_OWNED']),
        expectedApproval: expectedApprovalPhrase(validManifest, [
          'REMOVED_OWNED',
        ]),
        deleteSecret,
        listDopplerKeyNames: () => ['PRESENT_OWNED'],
        listWorkerSecretNames: () => ['REMOVED_OWNED', 'WORKER_ONLY'],
      }),
    ).toThrow('missing required managed');
    expect(deleteSecret).not.toHaveBeenCalled();
  });

  it('binds approval to the exact sorted deletion candidate set', () => {
    expect(
      expectedApprovalPhrase(validManifest, [
        'REMOVED_OWNED',
        'ANOTHER_REMOVED_OWNED',
      ]),
    ).toBe(
      'WI-1837:DELETE:mentomate-api-prd:prd:v1:ANOTHER_REMOVED_OWNED,REMOVED_OWNED',
    );
    expect(expectedApprovalPhrase(validManifest, ['REMOVED_OWNED'])).not.toBe(
      expectedApprovalPhrase(validManifest, ['ANOTHER_REMOVED_OWNED']),
    );
  });

  it('supports rollback by restoring the key in Doppler before the normal bulk sync', () => {
    const restoredPlan = buildReconciliationPlan({
      dopplerKeys: ['PRESENT_OWNED', 'REMOVED_OWNED'],
      workerKeys: ['PRESENT_OWNED', 'REMOVED_OWNED', 'WORKER_ONLY'],
      manifest: validManifest,
    });

    expect(restoredPlan.deleteCandidates).toEqual([]);
    expect(restoredPlan.preserveKeys).toEqual([
      'PRESENT_OWNED',
      'REMOVED_OWNED',
      'WORKER_ONLY',
    ]);
  });
});
