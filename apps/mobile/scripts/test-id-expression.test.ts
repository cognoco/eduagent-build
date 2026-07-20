import { extractValueProducingTestIds } from './test-id-expression';

describe('extractValueProducingTestIds', () => {
  it.each([
    {
      label: 'string literal',
      expression: "'static-id'",
      expected: { staticIds: ['static-id'], dynamicPrefixes: [] },
    },
    {
      label: 'no-substitution template',
      expression: '`template-static-id`',
      expected: { staticIds: ['template-static-id'], dynamicPrefixes: [] },
    },
    {
      label: 'dynamic template',
      expression: ['`row-$', '{index}`'].join(''),
      expected: { staticIds: [], dynamicPrefixes: ['row-'] },
    },
    {
      label: 'value-preserving wrappers',
      expression: "(('wrapped-id' as string) satisfies string)!",
      expected: { staticIds: ['wrapped-id'], dynamicPrefixes: [] },
    },
  ])('extracts a $label', ({ expression, expected }) => {
    expect(extractValueProducingTestIds(expression)).toEqual(expected);
  });

  it('collects only value-producing conditional and logical branches', () => {
    expect(
      extractValueProducingTestIds(
        [
          "condition ? 'primary-id' : (`secondary-$",
          "{index}` ?? 'fallback-id')",
        ].join(''),
      ),
    ).toEqual({
      staticIds: ['primary-id', 'fallback-id'],
      dynamicPrefixes: ['secondary-'],
    });
  });

  it('ignores values used only by predicates and helper calls', () => {
    expect(
      extractValueProducingTestIds(
        "shouldRender('predicate-decoy') ? 'actual-id' : formatTestId('call-decoy')",
      ),
    ).toEqual({ staticIds: ['actual-id'], dynamicPrefixes: [] });
  });
});
