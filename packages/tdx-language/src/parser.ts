import { isDrawProperty } from "./catalog/index.js";
import { rangeFromOffsets, zeroRange } from "./position.js";
import { tokenizeTdx } from "./tokenizer.js";
import type { ParsedDocument, Statement, TdxSymbol, Token } from "./types.js";

function isSemicolon(token: Token): boolean {
  return token.value === ";";
}

function tokenEnd(token: Token): number {
  return token.offset + token.length;
}

function buildStatement(source: string, tokens: Token[]): Statement | undefined {
  const meaningful = tokens.filter((token) => token.kind !== "comment");
  if (!meaningful.length) return undefined;

  const start = meaningful[0].offset;
  const end = tokenEnd(meaningful[meaningful.length - 1]);
  const range = rangeFromOffsets(source, start, end);
  const firstOperator = meaningful.findIndex((token) => token.value === ":=" || token.value === ":");
  const commaIndex = meaningful.findIndex((token) => token.value === ",");

  if (firstOperator > 0) {
    const operator = meaningful[firstOperator];
    const nameTokens = meaningful.slice(0, firstOperator).filter((token) => token.kind !== "punctuation");
    const nameToken = nameTokens[nameTokens.length - 1];
    if (!nameToken) return undefined;
    const attributes = meaningful
      .slice(firstOperator + 1)
      .filter((token) => isDrawProperty(token.value));
    return {
      kind: operator.value === ":=" ? "assignment" : "output",
      name: nameToken.value,
      nameRange: nameToken.range,
      range,
      tokens: meaningful,
      expressionTokens: meaningful.slice(firstOperator + 1),
      attributes
    };
  }

  const attributes = commaIndex >= 0
    ? meaningful.slice(commaIndex + 1).filter((token) => isDrawProperty(token.value))
    : [];
  return {
    kind: "bare",
    range,
    tokens: meaningful,
    expressionTokens: meaningful,
    attributes
  };
}

function classifyNames(statements: Statement[]): void {
  for (const statement of statements) {
    if (!statement.name) continue;
    const token = statement.tokens.find((candidate) => candidate.offset === statement.nameRange?.start.offset);
    if (token) token.kind = statement.kind === "assignment" ? "assignmentName" : "outputName";
  }
}

function buildSymbols(statements: Statement[]): TdxSymbol[] {
  return statements.map((statement, index) => {
    if (statement.kind === "assignment") {
      return {
        name: statement.name ?? `assignment-${index + 1}`,
        kind: "assignment",
        range: statement.nameRange ?? statement.range,
        detail: ":="
      };
    }
    if (statement.kind === "output") {
      return {
        name: statement.name ?? `output-${index + 1}`,
        kind: "output",
        range: statement.nameRange ?? statement.range,
        detail: ":"
      };
    }
    const first = statement.tokens.find((token) => token.kind !== "comment");
    return {
      name: first?.value ?? `draw-${index + 1}`,
      kind: "drawing",
      range: first?.range ?? statement.range,
      detail: "bare"
    };
  });
}

export function parseTdx(source: string): ParsedDocument {
  const tokens = tokenizeTdx(source);
  const statements: Statement[] = [];
  let current: Token[] = [];

  for (const token of tokens) {
    current.push(token);
    if (isSemicolon(token)) {
      const statement = buildStatement(source, current);
      if (statement) statements.push(statement);
      current = [];
    }
  }

  if (current.length) {
    const statement = buildStatement(source, current);
    if (statement) statements.push(statement);
  }

  classifyNames(statements);

  return {
    source,
    tokens,
    statements,
    symbols: statements.length ? buildSymbols(statements) : [{
      name: "TDX",
      kind: "drawing",
      range: zeroRange(source)
    }]
  };
}
