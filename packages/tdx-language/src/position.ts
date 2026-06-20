import type { Position, Range } from "./types.js";

export function createLineIndex(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

export function offsetToPosition(source: string, offset: number, lineStarts = createLineIndex(source)): Position {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const line = Math.max(0, low - 1);
  return {
    line,
    character: offset - lineStarts[line],
    offset
  };
}

export function rangeFromOffsets(source: string, start: number, end: number, lineStarts = createLineIndex(source)): Range {
  return {
    start: offsetToPosition(source, start, lineStarts),
    end: offsetToPosition(source, end, lineStarts)
  };
}

export function zeroRange(source: string): Range {
  return rangeFromOffsets(source, 0, 0);
}
