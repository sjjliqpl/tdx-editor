import { getCatalogItem, getCatalogItems, getCatalogItemsByCategory } from "./catalog/index.js";
import { parseTdx } from "./parser.js";
import type { TdxCompletion } from "./types.js";

function itemDocumentation(name: string): string | undefined {
  const item = getCatalogItem(name);
  if (!item) return undefined;
  const parts = [
    item.description,
    item.usage ? `用法：${item.usage}` : "",
    item.examples.length ? `示例：${item.examples[0]}` : ""
  ].filter(Boolean);
  return parts.join("\n\n");
}

export function getCompletions(source: string): TdxCompletion[] {
  const parsed = parseTdx(source);
  const variableCompletions: TdxCompletion[] = parsed.symbols
    .filter((symbol) => symbol.kind === "assignment" || symbol.kind === "output")
    .map((symbol) => ({
      label: symbol.name,
      kind: "variable",
      detail: symbol.kind === "assignment" ? "TDX variable" : "TDX output"
    }));

  const catalogCompletions: TdxCompletion[] = getCatalogItems().map((item) => {
    const isDrawing = item.category === "drawing";
    const isProperty = item.category === "drawProperty";
    const isColor = item.category === "color";
    const usage = item.usage || item.name;
    return {
      label: item.name,
      kind: isColor ? "color" : isProperty ? "property" : isDrawing ? "drawFunction" : item.category === "market" && !usage.includes("(") ? "field" : "function",
      detail: `${item.displayName} · ${item.category}`,
      documentation: itemDocumentation(item.name),
      insertText: usage.includes("(") ? usage.replace(/\((.*)\)/, "(") : item.name
    };
  });

  return [...catalogCompletions, ...variableCompletions];
}

export function getHover(name: string): string | undefined {
  const item = getCatalogItem(name);
  if (!item) return undefined;
  return [
    `**${item.name}** ${item.displayName}`,
    item.description,
    item.usage ? `\`${item.usage}\`` : "",
    item.examples.length ? `示例：\`${item.examples[0]}\`` : "",
    `分类：${item.category}；来源：${item.source}`
  ].filter(Boolean).join("\n\n");
}

export function getColorCompletions(): TdxCompletion[] {
  return getCatalogItemsByCategory("color").map((item) => ({
    label: item.name,
    kind: "color",
    detail: item.displayName,
    documentation: item.description
  }));
}
