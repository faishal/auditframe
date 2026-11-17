import sharp from 'sharp';
import type { CaptureMeta, StampOptions } from '../../shared/types';
import { buildLines, computePlacement, type Placement } from './bannerLayout';

const FONT_STACK = "Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace";

const THEMES = {
  dark: { bg: '#111827', fg: '#f9fafb', accent: '#fbbf24' },
  light: { bg: '#f9fafb', fg: '#111827', accent: '#92400e' }
} as const;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function panelSvg(p: Placement, stamp: StampOptions): Buffer {
  const theme = THEMES[stamp.theme];
  const { panel, layout } = p;
  const alpha = stamp.mode === 'watermark' ? stamp.opacity : 1;
  // Border line separates the banner from the evidence without covering any evidence pixels.
  const text = layout.lines
    .map((line, i) => {
      const y = layout.pad + layout.lineHeight * i + layout.fontSize;
      const fill = i === 0 ? theme.accent : theme.fg;
      return `<text x="${layout.pad}" y="${y}" fill="${fill}" xml:space="preserve">${esc(line)}</text>`;
    })
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${panel.width}" height="${panel.height}">` +
    `<rect width="100%" height="100%" fill="${theme.bg}" fill-opacity="${alpha}"/>` +
    `<g font-family="${FONT_STACK}" font-size="${layout.fontSize}" font-weight="500">${text}</g>` +
    `</svg>`;
  return Buffer.from(svg);
}

export class ComposerService {
  /** Scale factor used to keep banner text legible on high-DPI captures. */
  static scaleFor(meta: CaptureMeta): number {
    const primary = meta.displays[0];
    return Math.max(1, primary?.scaleFactor ?? 1);
  }

  async compose(rawPng: Buffer, meta: CaptureMeta, stamp: StampOptions): Promise<Buffer> {
    const logical = buildLines(meta, stamp);
    if (logical.length === 0) return rawPng;

    const placement = computePlacement(meta.width, meta.height, logical, stamp, ComposerService.scaleFor(meta));
    const panel = panelSvg(placement, stamp);
    const bg = stamp.mode === 'banner' ? hexToRgba(THEMES[stamp.theme].bg) : { r: 0, g: 0, b: 0, alpha: 0 };

    return sharp({
      create: { width: placement.canvasWidth, height: placement.canvasHeight, channels: 4, background: bg }
    })
      .composite([
        { input: rawPng, left: placement.imageX, top: placement.imageY },
        { input: panel, left: placement.panel.x, top: placement.panel.y }
      ])
      .png({ compressionLevel: 9 })
      .toBuffer();
  }
}

function hexToRgba(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };
}
