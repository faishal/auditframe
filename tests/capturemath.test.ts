import { describe, expect, it } from 'vitest';
import { cropRect, stitchLayout } from '../src/main/services/captureMath';

describe('stitchLayout', () => {
  it('places mixed-DPI displays in physical pixels, including negative origins', () => {
    const r = stitchLayout([
      { displayId: 1, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
      { displayId: 2, bounds: { x: 0, y: 0, width: 1512, height: 982 }, scaleFactor: 2 }
    ]);
    expect(r.scale).toBe(2);
    expect(r.tiles[0]).toMatchObject({ left: 0, top: 0, width: 3840, height: 2160 });
    expect(r.tiles[1]).toMatchObject({ left: 3840, top: 0, width: 3024, height: 1964 });
    expect(r.width).toBe(6864);
    expect(r.height).toBe(2160);
  });
});

describe('cropRect', () => {
  it('scales DIP selection to physical pixels', () => {
    const c = cropRect({ x: 100, y: 50, width: 200, height: 100 }, { x: 0, y: 0, width: 1512, height: 982 }, 3024, 1964);
    expect(c).toEqual({ x: 200, y: 100, width: 400, height: 200 });
  });
  it('clamps to the image and keeps at least 1px', () => {
    const c = cropRect({ x: 1500, y: 980, width: 100, height: 100 }, { x: 0, y: 0, width: 1512, height: 982 }, 1512, 982);
    expect(c.x + c.width).toBeLessThanOrEqual(1512);
    expect(c.y + c.height).toBeLessThanOrEqual(982);
    expect(c.width).toBeGreaterThanOrEqual(1);
  });
});
