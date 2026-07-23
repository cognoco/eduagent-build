import * as ts from 'typescript';

export interface ExtractedTestIds {
  staticIds: string[];
  dynamicPrefixes: string[];
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
    return { staticIds: [], dynamicPrefixes: [] };
  }

  const initializer = statement.declarationList.declarations[0]?.initializer;
  if (!initializer) return { staticIds: [], dynamicPrefixes: [] };

  const staticIds: string[] = [];
  const dynamicPrefixes: string[] = [];
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
      if (node.head.text) dynamicPrefixes.push(node.head.text);
    } else if (ts.isConditionalExpression(node)) {
      collectValue(node.whenTrue);
      collectValue(node.whenFalse);
    } else if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
      ].includes(node.operatorToken.kind)
    ) {
      collectValue(node.left);
      collectValue(node.right);
    }
  }

  collectValue(initializer);
  return { staticIds, dynamicPrefixes };
}
