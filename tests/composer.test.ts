import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAMP } from '../src/shared/defaults';
import type { CaptureMeta, StampOptions } from '../src/shared/types';
import { buildLines, computePlacement, wrapLine } from '../src/main/services/bannerLayout';
import { ComposerService } from '../src/main/services/ComposerService';

const meta: CaptureMeta = {
  evidenceId: '11111111-2222-4333-8444-555555555555',
  mode: 'screen',
  sourceTitle: 'Display 1',
  width: 400,
  height: 300,
  displays: [],
  rawSha256: 'a'.repeat(64),
  time: {
    utc: '2025-03-04T05:06:07.000Z',
    source: 'NTP',
    sourceLabel: 'NIST NTP',
    server: 'time.nist.gov',
    rttMs: 20,
    driftMs: -12,
    localClock: '2025-03-04T05:06:06.988Z'
  },
  geo: { status: 'ok', method: 'IP-Approx', lat: 1.5, lon: 2.5, accuracyM: 5000, label: 'Paris, FR' },
  system: { hostname: 'host', os: 'macOS', osVersion: '14', arch: 'arm64', appVersion: '1.0.0' }
};

const stamp = (over: Partial<StampOptions>): StampOptions => ({ ...DEFAULT_STAMP, note: 'SOC2 CC6.1', ...over });

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [...data.subarray(i, i + info.channels)];
}

async function makeRaw() {
  return sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 200, g: 10, b: 20, alpha: 1 } } })
    .png()
    .toBuffer();
}

describe('layout', () => {
  it('emits only enabled fields', () => {
    const lines = buildLines(meta, stamp({ fields: { ...DEFAULT_STAMP.fields, location: false, system: false, rawHash: false } }));
    expect(lines.some((l) => l.startsWith('Location'))).toBe(false);
    expect(lines.some((l) => l.startsWith('Note: SOC2'))).toBe(true);
    expect(lines.some((l) => l.includes('NIST NTP'))).toBe(true);
  });

  it('wraps long tokens without losing characters', () => {
    const wrapped = wrapLine('Raw SHA-256: ' + 'a'.repeat(64), 30);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.every((l) => l.length <= 30)).toBe(true);
    expect(wrapped.join('').replace(/\s/g, '')).toContain('a'.repeat(64));
  });

  it('banner placement never overlaps the image', () => {
    const lines = buildLines(meta, stamp({}));
    for (const position of ['top', 'bottom', 'left', 'right'] as const) {
      const p = computePlacement(400, 300, lines, stamp({ position }), 1);
      const imgRect = { x: p.imageX, y: p.imageY, w: 400, h: 300 };
      const b = p.panel;
      const overlap =
        imgRect.x < b.x + b.width && imgRect.x + imgRect.w > b.x && imgRect.y < b.y + b.height && imgRect.y + imgRect.h > b.y;
      expect(overlap, position).toBe(false);
      expect(p.canvasWidth).toBeGreaterThanOrEqual(400);
      expect(p.canvasHeight).toBeGreaterThanOrEqual(300);
    }
  });
});

describe('ComposerService', () => {
  const svc = new ComposerService();

  it('append banner keeps every evidence pixel intact', async () => {
    const raw = await makeRaw();
    for (const position of ['top', 'bottom', 'left', 'right'] as const) {
      const out = await svc.compose(raw, meta, stamp({ position }));
      const info = await sharp(out).metadata();
      expect(info.width! * info.height!).toBeGreaterThan(400 * 300);
      const p = computePlacement(400, 300, buildLines(meta, stamp({ position })), stamp({ position }), 1);
      expect(await pixel(out, p.imageX + 10, p.imageY + 10)).toEqual([200, 10, 20, 255]);
      expect(await pixel(out, p.imageX + 399, p.imageY + 299)).toEqual([200, 10, 20, 255]);
    }
  });

  it('watermark keeps canvas size', async () => {
    const raw = await makeRaw();
    const out = await svc.compose(raw, meta, stamp({ mode: 'watermark', position: 'top', opacity: 0.5 }));
    const info = await sharp(out).metadata();
    expect([info.width, info.height]).toEqual([400, 300]);
    expect(await pixel(out, 399, 299)).toEqual([200, 10, 20, 255]);
  });
});
