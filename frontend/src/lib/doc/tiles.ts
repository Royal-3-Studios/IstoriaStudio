// Optional tiling scaffold for future memory wins (e.g., 512x512 tiles).

export type TileKey = string; // `${tx},${ty}`

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface TileIndex {
  size: number;
  keys: TileKey[];
}

export function tileKey(tx: number, ty: number): TileKey {
  return `${tx},${ty}`;
}

export function parseTileKey(key: TileKey): { tx: number; ty: number } {
  const [sx, sy] = key.split(",");
  return { tx: parseInt(sx, 10) || 0, ty: parseInt(sy, 10) || 0 };
}

export function rectForTile(tx: number, ty: number, tileSize = 512): TileRect {
  return { x: tx * tileSize, y: ty * tileSize, w: tileSize, h: tileSize };
}

/**
 * Expand an arbitrary rect to whole-tile bounds (useful for caching or invalidation).
 * Returns an empty rect when input has non-positive area.
 */
export function expandRectToTileBounds(
  rect: TileRect,
  tileSize = 512
): TileRect {
  if (rect.w <= 0 || rect.h <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const tminx = Math.floor(rect.x / tileSize);
  const tminy = Math.floor(rect.y / tileSize);
  const tmaxx = Math.floor((rect.x + rect.w - 1) / tileSize);
  const tmaxy = Math.floor((rect.y + rect.h - 1) / tileSize);
  return {
    x: tminx * tileSize,
    y: tminy * tileSize,
    w: (tmaxx - tminx + 1) * tileSize,
    h: (tmaxy - tminy + 1) * tileSize,
  };
}

/**
 * List tile keys that cover the given rect. Returns [] for empty rects.
 */
export function tilesCoveringRect(rect: TileRect, tileSize = 512): TileIndex {
  if (rect.w <= 0 || rect.h <= 0) return { size: tileSize, keys: [] };
  const tminx = Math.floor(rect.x / tileSize);
  const tminy = Math.floor(rect.y / tileSize);
  const tmaxx = Math.floor((rect.x + rect.w - 1) / tileSize);
  const tmaxy = Math.floor((rect.y + rect.h - 1) / tileSize);
  const keys: TileKey[] = [];
  for (let ty = tminy; ty <= tmaxy; ty++) {
    for (let tx = tminx; tx <= tmaxx; tx++) {
      keys.push(tileKey(tx, ty));
    }
  }
  return { size: tileSize, keys };
}
