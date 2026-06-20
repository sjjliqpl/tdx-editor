import { getCatalogItem, isDrawProperty } from "./catalog/index.js";
import { rangeFromOffsets } from "./position.js";
import { parseTdx } from "./parser.js";
import type { LintOptions, ParsedDocument, TdxDiagnostic, Token } from "./types.js";

const builtinNonVariable = new Set(["AND", "OR", "NOT"]);
const denominatorNames = new Set(["V", "VOL", "AMO", "AMOUNT", "NP", "NPM", "NP%", "DIN", "DON"]);
const chinesePunctuation: Record<string, string> = {
  "，": "comma",
  "；": "semicolon",
  "：": "colon",
  "（": "leftParen",
  "）": "rightParen"
};

function diagnostic(code: string, severity: TdxDiagnostic["severity"], message: string, token: Token, hint?: string): TdxDiagnostic {
  return { code, severity, message, range: token.range, hint };
}

function scanUnclosed(source: string): TdxDiagnostic[] {
  const diagnostics: TdxDiagnostic[] = [];
  let commentStart = -1;
  let stringStart = -1;
  let quote = "";

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (commentStart >= 0) {
      if (ch === "}") commentStart = -1;
      continue;
    }
    if (stringStart >= 0) {
      if (ch === quote) {
        stringStart = -1;
        quote = "";
      }
      continue;
    }
    if (ch === "{") commentStart = i;
    else if (ch === "'" || ch === "\"") {
      stringStart = i;
      quote = ch;
    }
  }

  if (commentStart >= 0) {
    diagnostics.push({
      code: "unclosed-comment",
      severity: "error",
      message: "注释缺少结束符 }。",
      range: rangeFromOffsets(source, commentStart, Math.min(source.length, commentStart + 1))
    });
  }
  if (stringStart >= 0) {
    diagnostics.push({
      code: "unclosed-string",
      severity: "error",
      message: "字符串缺少结束引号。",
      range: rangeFromOffsets(source, stringStart, Math.min(source.length, stringStart + 1))
    });
  }
  return diagnostics;
}

function scanChinesePunctuation(parsed: ParsedDocument): TdxDiagnostic[] {
  const diagnostics: TdxDiagnostic[] = [];
  for (const token of parsed.tokens) {
    if (token.kind === "comment" || token.kind === "string" || token.kind === "marketReference") continue;
    for (let i = token.offset; i < token.offset + token.length; i += 1) {
      const ch = parsed.source[i];
      if (!(ch in chinesePunctuation)) continue;
      diagnostics.push({
        code: "chinese-punctuation",
        severity: "warning",
        message: `TDX 公式中建议使用英文标点，当前是中文标点 ${ch}。`,
        range: rangeFromOffsets(parsed.source, i, i + 1),
        hint: "替换为英文半角标点。"
      });
    }
  }
  return diagnostics;
}

function scanParens(parsed: ParsedDocument): TdxDiagnostic[] {
  const diagnostics: TdxDiagnostic[] = [];
  const stack: Token[] = [];
  for (const token of parsed.tokens) {
    if (token.kind === "comment" || token.kind === "string" || token.kind === "marketReference") continue;
    if (token.value === "(") stack.push(token);
    else if (token.value === ")") {
      const open = stack.pop();
      if (!open) diagnostics.push(diagnostic("unmatched-paren", "error", "右括号没有匹配的左括号。", token));
    }
  }
  for (const token of stack) {
    diagnostics.push(diagnostic("unmatched-paren", "error", "左括号没有匹配的右括号。", token));
  }
  return diagnostics;
}

function isFunctionCall(tokens: Token[], index: number): boolean {
  let next = index + 1;
  while (next < tokens.length && tokens[next].kind === "comment") next += 1;
  return tokens[next]?.value === "(";
}

function countCallArguments(tokens: Token[], index: number): number | undefined {
  let openIndex = index + 1;
  while (openIndex < tokens.length && tokens[openIndex].kind === "comment") openIndex += 1;
  if (tokens[openIndex]?.value !== "(") return undefined;
  let depth = 0;
  let args = 0;
  let sawContent = false;
  for (let i = openIndex; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.value === "(") {
      depth += 1;
      if (depth > 1) sawContent = true;
    } else if (token.value === ")") {
      depth -= 1;
      if (depth === 0) return sawContent ? args + 1 : 0;
    } else if (token.value === "," && depth === 1) {
      args += 1;
      sawContent = false;
    } else if (depth >= 1 && token.kind !== "comment") {
      sawContent = true;
    }
  }
  return undefined;
}

function collectDefined(parsed: ParsedDocument): Map<string, Token> {
  const defined = new Map<string, Token>();
  for (const statement of parsed.statements) {
    if (!statement.name || !statement.nameRange) continue;
    const token = statement.tokens.find((candidate) => candidate.offset === statement.nameRange?.start.offset);
    if (token) defined.set(statement.name.toUpperCase(), token);
  }
  return defined;
}

function scanSemantics(parsed: ParsedDocument, options: { unknownFunctions: boolean }): TdxDiagnostic[] {
  const diagnostics: TdxDiagnostic[] = [];
  const defined = collectDefined(parsed);
  const reportedUndefined = new Set<string>();

  for (const statement of parsed.statements) {
    if (!statement.tokens.some((token) => token.value === ";")) {
      diagnostics.push({
        code: "missing-semicolon",
        severity: "warning",
        message: "语句建议以分号结束。",
        range: statement.range
      });
    }
  }

  for (let i = 0; i < parsed.tokens.length; i += 1) {
    const token = parsed.tokens[i];
    if (token.kind === "comment") continue;
    const upper = token.value.toUpperCase();

    if (token.kind === "error") {
      diagnostics.push(diagnostic("invalid-token", "error", `无法识别的字符 ${token.value}。`, token));
      continue;
    }

    if (token.kind === "identifier" && isFunctionCall(parsed.tokens, i)) {
      if (options.unknownFunctions && !getCatalogItem(upper)) {
        diagnostics.push(diagnostic("unknown-function", "warning", `未知 TDX 函数 ${token.value}。`, token, "如这是自定义函数，可忽略或后续加入函数库。"));
      }
      continue;
    }

    if (token.kind === "identifier" && !builtinNonVariable.has(upper)) {
      const previous = parsed.tokens[i - 1]?.value;
      const next = parsed.tokens[i + 1]?.value;
      if (previous === "." || next === "." || previous === "#") continue;
      if (defined.has(upper)) continue;
      if (getCatalogItem(upper)) continue;
      if (isDrawProperty(upper)) continue;
      if (reportedUndefined.has(upper)) continue;
      reportedUndefined.add(upper);
      diagnostics.push(diagnostic("undefined-variable", "warning", `变量 ${token.value} 未在当前文件中定义。`, token));
    }

    const item = getCatalogItem(upper);
    if (item?.params.length && isFunctionCall(parsed.tokens, i) && item.confidence !== "low") {
      const actual = countCallArguments(parsed.tokens, i);
      if (typeof actual === "number" && actual !== item.params.length) {
        diagnostics.push(diagnostic("argument-count", "info", `${token.value} 通常需要 ${item.params.length} 个参数，当前为 ${actual} 个。`, token));
      }
    }
  }

  for (let i = 0; i < parsed.tokens.length - 2; i += 1) {
    const a = parsed.tokens[i];
    const op = parsed.tokens[i + 1];
    const b = parsed.tokens[i + 2];
    if (a.kind === "comment" || op.kind === "comment" || b.kind === "comment") continue;
    if (op.value === "/" && b.kind === "identifier" && denominatorNames.has(b.value.toUpperCase())) {
      diagnostics.push(diagnostic("possible-zero-division", "info", `分母 ${b.value} 可能为 0。`, b, "必要时用 IF 分支保护。"));
    }
    if (a.value.toUpperCase().endsWith("VP%") && op.value === "<" && b.value.startsWith("-")) {
      diagnostics.push(diagnostic("possibly-impossible-condition", "warning", `${a.value} 常见写法来自 ABS(...)，与负数比较可能恒假。`, a));
    }
  }

  return diagnostics;
}

export function lintTdx(source: string, options: LintOptions = {}): TdxDiagnostic[] {
  const parsed = parseTdx(source);
  const merged = {
    unknownFunctions: options.unknownFunctions ?? true
  };
  return [
    ...scanUnclosed(source),
    ...scanChinesePunctuation(parsed),
    ...scanParens(parsed),
    ...scanSemantics(parsed, merged)
  ];
}
