const x: number = 'deliberate type error';

describe('WI-2578 protected-main mutant proof', () => {
  it('is executable if semantic type-checking is absent', () => {
    expect(x).toBe('deliberate type error');
  });
});
