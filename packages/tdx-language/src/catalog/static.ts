import type { CatalogItem } from "../types.js";

export const namedColors: Record<string, string> = {
  COLORBLACK: "#000000",
  COLORBLUE: "#0000ff",
  COLORGREEN: "#00ff00",
  COLORCYAN: "#00ffff",
  COLORRED: "#ff0000",
  COLORMAGENTA: "#ff00ff",
  COLORBROWN: "#996633",
  COLORLIGRAY: "#cccccc",
  COLORGRAY: "#666666",
  COLORLIBLUE: "#3366ff",
  COLORLIGREEN: "#99ff99",
  COLORLICYAN: "#99ffff",
  COLORLIRED: "#ff9999",
  COLORLIMAGENTA: "#ff99ff",
  COLORYELLOW: "#ffff00",
  COLORWHITE: "#ffffff"
};

export const coreDrawProperties = new Set([
  "NODRAW",
  "DOTLINE",
  "STICK",
  "COLORSTICK",
  "VOLSTICK",
  "LINESTICK",
  "CROSSDOT",
  "CIRCLEDOT",
  "POINTDOT"
]);

export const logicKeywords = new Set(["AND", "OR", "NOT"]);

export const periods = new Set([
  "DAY",
  "WEEK",
  "MONTH",
  "SEASON",
  "YEAR",
  "MIN",
  "MIN1",
  "MIN5",
  "MIN15",
  "MIN30",
  "MIN60"
]);

export const manualCatalog: CatalogItem[] = [
  {
    name: "NODRAW",
    category: "drawProperty",
    displayName: "不绘图",
    description: "只显示数值，不绘制曲线或柱。",
    usage: "NODRAW",
    params: [],
    examples: [],
    aliases: [],
    source: "manual",
    confidence: "manual"
  }
];
