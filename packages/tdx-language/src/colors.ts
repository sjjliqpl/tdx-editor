import { namedColors } from "./catalog/index.js";
import type { ParsedDocument, TdxColor, Token } from "./types.js";

export function tdxHexToCss(value: string): string | undefined {
  const match = value.match(/^COLOR([0-9A-F]{6})$/i);
  if (!match) return undefined;
  const raw = match[1].toUpperCase();
  const bb = raw.slice(0, 2);
  const gg = raw.slice(2, 4);
  const rr = raw.slice(4, 6);
  return `#${rr}${gg}${bb}`;
}

export function colorTokenToCss(token: Token, followingTokens: Token[] = []): string | undefined {
  const upper = token.value.toUpperCase();
  if (upper in namedColors) return namedColors[upper];
  const hex = tdxHexToCss(upper);
  if (hex) return hex;

  if (upper === "RGB" || upper === "COLORRGB") {
    const open = followingTokens[0];
    const r = followingTokens[1];
    const comma1 = followingTokens[2];
    const g = followingTokens[3];
    const comma2 = followingTokens[4];
    const b = followingTokens[5];
    if (open?.value === "(" && comma1?.value === "," && comma2?.value === "," && r?.kind === "number" && g?.kind === "number" && b?.kind === "number") {
      const nums = [r, g, b].map((item) => Math.max(0, Math.min(255, Number(item.value))));
      if (nums.every(Number.isFinite)) return `rgb(${nums.join(", ")})`;
    }
  }

  return undefined;
}

export function collectColors(parsed: ParsedDocument): TdxColor[] {
  const colors: TdxColor[] = [];
  for (let i = 0; i < parsed.tokens.length; i += 1) {
    const token = parsed.tokens[i];
    if (token.kind !== "colorConstant" && !(token.value.toUpperCase() === "RGB" || token.value.toUpperCase() === "COLORRGB")) continue;
    const css = colorTokenToCss(token, parsed.tokens.slice(i + 1, i + 8));
    if (!css) continue;
    colors.push({
      source: token.value,
      css,
      range: token.range,
      kind: token.value.toUpperCase().startsWith("COLOR") && /^COLOR[0-9A-F]{6}$/i.test(token.value) ? "tdxHex" : token.value.toUpperCase() in namedColors ? "named" : "rgbFunction"
    });
  }
  return colors;
}

export function makeColorSwatchSvg(colors: string[]): string {
  const box = 8;
  const gap = 2;
  const width = Math.max(box, colors.length * box + Math.max(0, colors.length - 1) * gap);
  const rects = colors.map((color, index) => {
    const x = index * (box + gap);
    return `<rect x="${x}" y="1" width="${box}" height="${box}" rx="1.5" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10">${rects}</svg>`;
}
