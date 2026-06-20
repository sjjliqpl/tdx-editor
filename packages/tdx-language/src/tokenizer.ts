import {
  getCatalogItem,
  isBuiltinField,
  isColorConstant,
  isDrawFunction,
  isDrawProperty,
  isFinanceFunction,
  isLevel2Function
} from "./catalog/index.js";
import { logicKeywords, periods } from "./catalog/static.js";
import { createLineIndex, rangeFromOffsets } from "./position.js";
import type { Token, TokenKind } from "./types.js";

const twoCharOperators = new Set([":=", ">=", "<=", "!=", "==", "<>", "&&", "||"]);
const singleCharOperators = new Set(["+", "-", "*", "/", ">", "<", "=", "%"]);
const punctuation = new Set(["(", ")", ",", ";", ":", "."]);

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_\u4e00-\u9fff]/u.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_%\u4e00-\u9fff]/u.test(ch);
}

function isDigit(ch: string): boolean {
  return /[0-9]/.test(ch);
}

function makeToken(source: string, kind: TokenKind, start: number, end: number, lineStarts: number[]): Token {
  return {
    kind,
    value: source.slice(start, end),
    range: rangeFromOffsets(source, start, end, lineStarts),
    offset: start,
    length: end - start
  };
}

function classifyIdentifier(source: string, start: number, end: number, word: string): TokenKind {
  const upper = word.toUpperCase();
  if (logicKeywords.has(upper)) return "keyword";
  if (upper.startsWith("COLOR") && (isColorConstant(upper) || /^COLOR[0-9A-F]{6}$/i.test(upper))) return "colorConstant";
  if (isDrawProperty(upper)) return "drawProperty";
  if (isBuiltinField(upper)) return "builtinField";
  if (periods.has(upper) && source[start - 1] === "#") return "periodReference";

  let i = end;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] === "(") {
    if (isDrawFunction(upper)) return "drawFunction";
    if (isFinanceFunction(upper)) return "financeFunction";
    if (isLevel2Function(upper)) return "level2Function";
    if (getCatalogItem(upper)) return "builtinFunction";
  }

  return "identifier";
}

export function tokenizeTdx(source: string): Token[] {
  const tokens: Token[] = [];
  const lineStarts = createLineIndex(source);
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "{") {
      const start = i;
      i += 1;
      while (i < source.length && source[i] !== "}") i += 1;
      if (i < source.length) i += 1;
      tokens.push(makeToken(source, "comment", start, i, lineStarts));
      continue;
    }

    if (ch === "'" || ch === "\"") {
      const quote = ch;
      const start = i;
      i += 1;
      while (i < source.length) {
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      const value = source.slice(start, i);
      const kind = /^"[^"]+\$[^"]+"$/.test(value) ? "marketReference" : "string";
      tokens.push(makeToken(source, kind, start, i, lineStarts));
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      if (ch === ".") i += 1;
      while (i < source.length && isDigit(source[i])) i += 1;
      if (source[i] === ".") {
        i += 1;
        while (i < source.length && isDigit(source[i])) i += 1;
      }
      tokens.push(makeToken(source, "number", start, i, lineStarts));
      continue;
    }

    const two = source.slice(i, i + 2);
    if (twoCharOperators.has(two)) {
      tokens.push(makeToken(source, "operator", i, i + 2, lineStarts));
      i += 2;
      continue;
    }

    if (ch === "#") {
      const start = i;
      i += 1;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i += 1;
      tokens.push(makeToken(source, "periodReference", start, i, lineStarts));
      continue;
    }

    if (singleCharOperators.has(ch)) {
      tokens.push(makeToken(source, "operator", i, i + 1, lineStarts));
      i += 1;
      continue;
    }

    if (punctuation.has(ch)) {
      tokens.push(makeToken(source, "punctuation", i, i + 1, lineStarts));
      i += 1;
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && isIdentifierPart(source[i])) i += 1;
      const word = source.slice(start, i);
      tokens.push(makeToken(source, classifyIdentifier(source, start, i, word), start, i, lineStarts));
      continue;
    }

    tokens.push(makeToken(source, "error", i, i + 1, lineStarts));
    i += 1;
  }

  return tokens;
}
