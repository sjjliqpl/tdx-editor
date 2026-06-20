import { generatedCatalog } from "./generatedCatalog.js";
import { coreDrawProperties, manualCatalog, namedColors } from "./static.js";
import type { CatalogCategory, CatalogItem } from "../types.js";

const byName = new Map<string, CatalogItem>();

for (const item of [...generatedCatalog, ...manualCatalog]) {
  byName.set(item.name.toUpperCase(), item);
}

for (const [name, css] of Object.entries(namedColors)) {
  if (!byName.has(name)) {
    byName.set(name, {
      name,
      category: "color",
      displayName: name,
      description: `TDX named color ${css}.`,
      usage: name,
      params: [],
      examples: [],
      aliases: [],
      source: "manual",
      confidence: "manual"
    });
  }
}

for (const property of coreDrawProperties) {
  if (!byName.has(property)) {
    byName.set(property, {
      name: property,
      category: "drawProperty",
      displayName: property,
      description: "TDX drawing property.",
      usage: property,
      params: [],
      examples: [],
      aliases: [],
      source: "manual",
      confidence: "manual"
    });
  }
}

export function getCatalogItem(name: string): CatalogItem | undefined {
  return byName.get(name.toUpperCase());
}

export function hasCatalogItem(name: string): boolean {
  return byName.has(name.toUpperCase());
}

export function getCatalogItems(): CatalogItem[] {
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getCatalogItemsByCategory(category: CatalogCategory | string): CatalogItem[] {
  return getCatalogItems().filter((item) => item.category === category);
}

export function isBuiltinField(name: string): boolean {
  const item = getCatalogItem(name);
  return item?.category === "market" && (!item.usage || !item.usage.includes("("));
}

export function isDrawProperty(name: string): boolean {
  const upper = name.toUpperCase();
  return upper.startsWith("COLOR") || /^LINETHICK[1-9]$/.test(upper) || /^ALIGN[0-5]$/.test(upper) || getCatalogItem(upper)?.category === "drawProperty";
}

export function isColorConstant(name: string): boolean {
  const upper = name.toUpperCase();
  return upper in namedColors || /^COLOR[0-9A-F]{6}$/i.test(upper);
}

export function isDrawFunction(name: string): boolean {
  return getCatalogItem(name)?.category === "drawing";
}

export function isFinanceFunction(name: string): boolean {
  const category = getCatalogItem(name)?.category;
  return category === "finance" || category === "dynamicQuote";
}

export function isLevel2Function(name: string): boolean {
  return getCatalogItem(name)?.category === "level2";
}

export { namedColors };
