export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TileInput {
  displayId: number;
  bounds: Rect;
  scaleFactor: number;
}

export interface Tile {
  displayId: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Lay displays out on a single composite canvas in physical pixels.
 * Mixed DPI is normalised to the highest scaleFactor so no display is downscaled.
 */
export function stitchLayout(displays: TileInput[]): { width: number; height: number; scale: number; tiles: Tile[] } {
  if (displays.length === 0) throw new Error('No displays');
  const minX = Math.min(...displays.map((d) => d.bounds.x));
  const minY = Math.min(...displays.map((d) => d.bounds.y));
  const scale = Math.max(...displays.map((d) => d.scaleFactor));
  const tiles = displays.map((d) => ({
    displayId: d.displayId,
    left: Math.round((d.bounds.x - minX) * scale),
    top: Math.round((d.bounds.y - minY) * scale),
    width: Math.round(d.bounds.width * scale),
    height: Math.round(d.bounds.height * scale)
  }));
  return {
    scale,
    tiles,
    width: Math.max(...tiles.map((t) => t.left + t.width)),
    height: Math.max(...tiles.map((t) => t.top + t.height))
  };
}

/**
 * Convert a DIP selection (relative to a display's top-left) into a pixel crop of that display's image.
 * Uses the real image size so rounding in OS-reported scale factors cannot shift the crop.
 */
export function cropRect(sel: Rect, displayBounds: Rect, imgWidth: number, imgHeight: number): Rect {
  const sx = imgWidth / displayBounds.width;
  const sy = imgHeight / displayBounds.height;
  const left = Math.max(0, Math.min(imgWidth - 1, Math.round(sel.x * sx)));
  const top = Math.max(0, Math.min(imgHeight - 1, Math.round(sel.y * sy)));
  const right = Math.max(left + 1, Math.min(imgWidth, Math.round((sel.x + sel.width) * sx)));
  const bottom = Math.max(top + 1, Math.min(imgHeight, Math.round((sel.y + sel.height) * sy)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
