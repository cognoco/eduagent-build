import * as ts from 'typescript';

export interface ExtractedTestIds {
  staticIds: string[];
  dynamicPrefixes: string[];
  dynamicWitnesses: string[];
}

export function extractValueProducingTestIds(
  expression: string,
): ExtractedTestIds {
  const sourceFile = ts.createSourceFile(
    'test-id-expression.tsx',
    `const value = (${expression});`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const statement = sourceFile.statements[0];
  if (!statement || !ts.isVariableStatement(statement)) {
    return { staticIds: [], dynamicPrefixes: [], dynamicWitnesses: [] };
  }

  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer) {
    return { staticIds: [], dynamicPrefixes: [], dynamicWitnesses: [] };
  }

  const staticIds: string[] = [];
  const dynamicPrefixes: string[] = [];
  const dynamicWitnesses: string[] = [];
  function collectValue(node: ts.Expression): void {
    if (ts.isParenthesizedExpression(node)) {
      collectValue(node.expression);
    } else if (
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      collectValue(node.expression);
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      if (node.text) staticIds.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      if (node.head.text) {
        dynamicPrefixes.push(node.head.text);
        dynamicWitnesses.push(
          `${node.head.text}${node.templateSpans
            .map((span) => `DYNAMIC${span.literal.text}`)
            .join('')}`,
        );
      }
    } else if (ts.isConditionalExpression(node)) {
      collectValue(node.whenTrue);
      collectValue(node.whenFalse);
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      collectValue(node.right);
    } else if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        node.operatorToken.kind,
      )
    ) {
      collectValue(node.left);
      collectValue(node.right);
    }
  }

  collectValue(initializer);
  return { staticIds, dynamicPrefixes, dynamicWitnesses };
}
