export type Position = {
  line: number;
  character: number;
  offset: number;
};

export type Range = {
  start: Position;
  end: Position;
};

export type TokenKind =
  | "comment"
  | "string"
  | "marketReference"
  | "periodReference"
  | "number"
  | "identifier"
  | "assignmentName"
  | "outputName"
  | "builtinField"
  | "builtinFunction"
  | "drawFunction"
  | "financeFunction"
  | "level2Function"
  | "keyword"
  | "operator"
  | "punctuation"
  | "drawProperty"
  | "colorConstant"
  | "error";

export type Token = {
  kind: TokenKind;
  value: string;
  range: Range;
  offset: number;
  length: number;
};

export type StatementKind = "assignment" | "output" | "bare";

export type Statement = {
  kind: StatementKind;
  name?: string;
  nameRange?: Range;
  range: Range;
  tokens: Token[];
  expressionTokens: Token[];
  attributes: Token[];
};

export type ParsedDocument = {
  source: string;
  tokens: Token[];
  statements: Statement[];
  symbols: TdxSymbol[];
};

export type TdxSymbolKind = "assignment" | "output" | "drawing";

export type TdxSymbol = {
  name: string;
  kind: TdxSymbolKind;
  range: Range;
  detail?: string;
};

export type DiagnosticSeverity = "error" | "warning" | "info";

export type TdxDiagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  range: Range;
  hint?: string;
};

export type CompletionKind =
  | "field"
  | "function"
  | "drawFunction"
  | "property"
  | "color"
  | "variable";

export type TdxCompletion = {
  label: string;
  kind: CompletionKind;
  detail?: string;
  documentation?: string;
  insertText?: string;
};

export type CatalogCategory =
  | "market"
  | "time"
  | "reference"
  | "logic"
  | "arithmetic"
  | "math"
  | "statistics"
  | "string"
  | "crossSection"
  | "pattern"
  | "index"
  | "drawing"
  | "finance"
  | "dynamicQuote"
  | "level2"
  | "drawProperty"
  | "color"
  | "colorFunction"
  | "unknown";

export type CatalogItem = {
  name: string;
  category: CatalogCategory | string;
  displayName: string;
  description: string;
  usage: string;
  params: string[];
  examples: string[];
  aliases: string[];
  source: string;
  confidence: "high" | "manual" | "low";
};

export type TdxColor = {
  source: string;
  css: string;
  range: Range;
  kind: "tdxHex" | "named" | "rgbFunction";
};

export type LintOptions = {
  unknownFunctions?: boolean;
};
