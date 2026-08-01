const sharedSchemas = jest.requireActual('@eduagent/schemas') as Record<
  string,
  unknown
>;
const tokenModule = jest.requireActual('./guardian-attachment-token') as Record<
  string,
  unknown
>;

const VALID_QUALIFICATIONS = [
  'biological_parent',
  'adoptive_parent',
  'stepparent',
  'grandparent',
  'court_appointed_guardian',
  'foster_parent',
  'kinship_caregiver',
  'sibling_with_custody',
  'other',
] as const;

describe('guardian qualification contract ownership', () => {
  it('owns the qualification schema only in the shared contract package', () => {
    expect(sharedSchemas.guardianQualificationSchema).toBeDefined();
    expect(tokenModule.guardianQualificationSchema).toBeUndefined();

    const schema = sharedSchemas.guardianQualificationSchema as {
      parse(value: unknown): unknown;
      safeParse(value: unknown): { success: boolean };
    };
    expect(VALID_QUALIFICATIONS.map((value) => schema.parse(value))).toEqual([
      ...VALID_QUALIFICATIONS,
    ]);
    expect(schema.safeParse('unrecognized_guardian').success).toBe(false);
  });
});
