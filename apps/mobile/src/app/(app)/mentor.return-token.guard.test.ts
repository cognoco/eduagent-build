import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

function invalidMentorReturnTokenLines(source: string): number[] {
  const sourceFile = ts.createSourceFile(
    'mentor.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const lines: number[] = [];

  function staticallyNamesReturnTo(property: ts.ObjectLiteralElementLike): {
    matches: boolean;
    computed: boolean;
  } {
    if (ts.isSpreadAssignment(property)) {
      return { matches: false, computed: false };
    }

    const { name } = property;
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
      return { matches: name.text === 'returnTo', computed: false };
    }
    if (
      ts.isComputedPropertyName(name) &&
      ts.isStringLiteralLike(name.expression)
    ) {
      return {
        matches: name.expression.text === 'returnTo',
        computed: true,
      };
    }

    return { matches: false, computed: false };
  }

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        const name = staticallyNamesReturnTo(property);
        if (
          name.matches &&
          (name.computed ||
            !ts.isPropertyAssignment(property) ||
            !ts.isIdentifier(property.initializer) ||
            property.initializer.text !== 'MENTOR_RETURN_TO')
        ) {
          lines.push(
            sourceFile.getLineAndCharacterOfPosition(property.getStart()).line +
              1,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return lines;
}

describe('[WI-2234] Mentor return-token drift guard', () => {
  it.each([
    {
      bypass: 'a raw Mentor return token',
      source: "const fixture = { returnTo: 'mentor' };",
      line: 1,
    },
    {
      bypass: 'an alias of the shared return token',
      source: [
        'const alias = MENTOR_RETURN_TO;',
        'const fixture = { returnTo: alias };',
      ].join('\n'),
      line: 2,
    },
    {
      bypass: 'a shorthand returnTo property',
      source: [
        'const returnTo = MENTOR_RETURN_TO;',
        'const fixture = { returnTo };',
      ].join('\n'),
      line: 2,
    },
    {
      bypass: 'a computed literal returnTo key',
      source: "const fixture = { ['returnTo']: MENTOR_RETURN_TO };",
      line: 1,
    },
    {
      bypass: 'a conditional return-token alias',
      source: [
        'const alias = MENTOR_RETURN_TO;',
        'const fixture = {',
        '  returnTo: enabled ? MENTOR_RETURN_TO : alias,',
        '};',
      ].join('\n'),
      line: 3,
    },
  ])('mutation-rejects $bypass', ({ source, line }) => {
    expect(invalidMentorReturnTokenLines(source)).toEqual([line]);
  });

  it('accepts only the exact shared token without flagging adjacent Mentor source values', () => {
    expect(
      invalidMentorReturnTokenLines(`
        const safe = {
          entrySource: 'mentor',
          returnTo: MENTOR_RETURN_TO,
        };
      `),
    ).toEqual([]);
  });

  it('keeps the governed Mentor screen on the shared return token', () => {
    const mentorSource = readFileSync(resolve(__dirname, 'mentor.tsx'), 'utf8');

    expect(invalidMentorReturnTokenLines(mentorSource)).toEqual([]);
  });
});
