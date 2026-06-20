import assert from "node:assert/strict";
import test from "node:test";
import {
  collectColors,
  getCatalogItem,
  lintTdx,
  makeColorSwatchSvg,
  parseTdx,
  tdxHexToCss,
  tokenizeTdx
} from "../index.js";

test("tokenizes chinese identifiers, percent variables, assignment, output, and bare drawing", () => {
  const source = "换%:ZHSL%,NODRAW,COLOR00D7FF;\n主Z:=ZLMRZ%,COLORMAGENTA,NODRAW;\nSTICKLINE(集>0,0,MIN(集,18),2.6,0),COLORCCBBAA;";
  const parsed = parseTdx(source);

  assert.equal(parsed.statements.length, 3);
  assert.equal(parsed.statements[0]?.kind, "output");
  assert.equal(parsed.statements[1]?.kind, "assignment");
  assert.equal(parsed.statements[2]?.kind, "bare");
  assert.ok(parsed.tokens.some((token) => token.kind === "outputName" && token.value === "换%"));
  assert.ok(parsed.tokens.some((token) => token.kind === "assignmentName" && token.value === "主Z"));
  assert.ok(parsed.tokens.some((token) => token.kind === "drawFunction" && token.value === "STICKLINE"));
});

test("parses TDX BBGGRR color constants and line swatch svg", () => {
  assert.equal(tdxHexToCss("COLOR00D7FF"), "#FFD700");
  assert.equal(tdxHexToCss("COLORFF0000"), "#0000FF");

  const parsed = parseTdx("A:C,COLOR00D7FF,COLORRED;");
  const colors = collectColors(parsed);
  assert.deepEqual(colors.map((color) => color.css), ["#FFD700", "#ff0000"]);
  const svg = makeColorSwatchSvg(colors.map((color) => color.css));
  assert.match(svg, /<rect/);
  assert.match(svg, /#FFD700/);
});

test("recognizes common named colors used by demo drawing statements", () => {
  const parsed = parseTdx([
    "STICKLINE(HVA<0 AND HVP%>3,0,HVP%,3,0),COLORBLUE;",
    "STICKLINE(DVA<0 AND DVP%>3,0,DVP%,1,1),COLORLIGREEN;",
    "STICKLINE(HVA>0 AND HVP%>3,0,HVP%,3,0),COLORMAGENTA;",
    "STICKLINE(DVA>0 AND DVP%>3,0,DVP%,1,1),COLORLIRED;"
  ].join("\n"));
  const colors = collectColors(parsed);

  assert.deepEqual(colors.map((color) => color.source), [
    "COLORBLUE",
    "COLORLIGREEN",
    "COLORMAGENTA",
    "COLORLIRED"
  ]);
  assert.deepEqual(colors.map((color) => color.kind), ["named", "named", "named", "named"]);
});

test("recognizes market and period references", () => {
  const tokens = tokenizeTdx("QADQ_V:=\"880008$V\";\nTMP:=CLOSE#WEEK;");
  assert.ok(tokens.some((token) => token.kind === "marketReference" && token.value === "\"880008$V\""));
  assert.ok(tokens.some((token) => token.kind === "periodReference" && token.value === "#WEEK"));
});

test("catalog includes extracted and manual functions", () => {
  assert.equal(getCatalogItem("IF")?.category, "arithmetic");
  assert.equal(getCatalogItem("STICKLINE")?.category, "drawing");
  assert.equal(getCatalogItem("L2_AMO")?.category, "level2");
  assert.equal(getCatalogItem("COLORRED")?.category, "color");
});

test("diagnostics ignore assignment draw attributes and comment contents", () => {
  const diagnostics = lintTdx([
    "A:=C,COLORRED,NODRAW;",
    "{用途概述：中文，符号；UNKNOWN_FN(；)}"
  ].join("\n"));
  const codes = diagnostics.map((item) => item.code);

  assert.ok(!codes.includes("assignment-draw-attributes"));
  assert.ok(!codes.includes("chinese-punctuation"));
  assert.ok(!codes.includes("invalid-token"));
  assert.ok(!codes.includes("unknown-function"));
  assert.ok(!codes.includes("undefined-variable"));
});

test("diagnostics catch common formula issues without crashing", () => {
  const undefinedVariableDiagnostics = lintTdx("A:ZSTJJ + CLOSE;");
  const impossibleConditionDiagnostics = lintTdx("A:HVP%<-1;");

  assert.ok(undefinedVariableDiagnostics.some((item) => item.code === "undefined-variable" && /ZSTJJ/.test(item.message)));
  assert.ok(impossibleConditionDiagnostics.some((item) => item.code === "possibly-impossible-condition"));
});
