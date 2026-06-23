const API_UNIT_IDENTITY_V2_DEFAULT = 'false';

function resetApiUnitEnv(): void {
  // Unit tests must not inherit local/staging cutover flags from the shell.
  process.env['IDENTITY_V2_ENABLED'] = API_UNIT_IDENTITY_V2_DEFAULT;
}

resetApiUnitEnv();

beforeEach(() => {
  resetApiUnitEnv();
});
