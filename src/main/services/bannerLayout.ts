import type { CaptureMeta, StampOptions } from '../../shared/types';
import { formatDrift, formatTime } from '../../shared/timeFormat';

/** Monospace glyph advance relative to font size. Slightly conservative so text never overflows. */
export const CHAR_WIDTH_EM = 0.62;
export const LINE_HEIGHT_EM = 1.45;
export const PAD_EM = 0.9;
export const SIDEBAR_CHARS = 36;

/** Build the logical (unwrapped) text lines for the enabled fields. */
export function buildLines(meta: CaptureMeta, stamp: StampOptions): string[] {
  const f = stamp.fields;
  const lines: string[] = [];
  if (f.evidenceId) lines.push(`Evidence ID: ${meta.evidenceId}`);
  if (f.timestamp) {
    const t = new Date(meta.time.utc);
    lines.push(`Timestamp (UTC): ${formatTime(t, stamp.timeFormat, 'utc')} [${meta.time.sourceLabel}]`);
    if (stamp.timeZone === 'utc+local') lines.push(`Timestamp (Local): ${formatTime(t, stamp.timeFormat, 'local')}`);
  }
  if (f.localClock) {
    const local = new Date(meta.time.localClock);
    lines.push(`System clock: ${formatTime(local, stamp.timeFormat, 'utc')} (UTC) | Drift: ${formatDrift(meta.time.driftMs)}`);
  }
  if (f.location) {
    const g = meta.geo;
    if (g.status === 'ok' && g.lat !== undefined && g.lon !== undefined) {
      const acc = g.accuracyM !== undefined ? ` +/-${Math.round(g.accuracyM)} m` : '';
      const label = g.label ? ` ${g.label}` : '';
      lines.push(`Location: ${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}${acc} [${g.method}]${label}`);
    } else if (g.status === 'unavailable') {
      lines.push(`Location: unavailable${g.reason ? ` (${g.reason})` : ''}`);
    } else {
      lines.push('Location: not recorded');
    }
  }
  if (f.system) {
    const s = meta.system;
    lines.push(`Host: ${s.hostname} | OS: ${s.os} ${s.osVersion} (${s.arch}) | Capture: ${meta.width}x${meta.height} px`);
  }
  if (f.note && stamp.note.trim()) lines.push(`Note: ${stamp.note.trim()}`);
  if (f.rawHash) lines.push(`Raw SHA-256: ${meta.rawSha256}`);
  return lines;
}

/** Hard/soft wrap to a max character count. Splits on spaces when possible, else mid-token. */
export function wrapLine(line: string, maxChars: number, indent = '  '): string[] {
  if (maxChars < 8) maxChars = 8;
  if (line.length <= maxChars) return [line];
  const out: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const limit = first ? maxChars : maxChars - indent.length;
    if (rest.length <= limit) {
      out.push((first ? '' : indent) + rest);
      break;
    }
    let cut = rest.lastIndexOf(' ', limit);
    if (cut < Math.floor(limit / 2)) cut = limit;
    out.push((first ? '' : indent) + rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
    first = false;
  }
  return out;
}

export interface PanelLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  pad: number;
  /** Total text block height including padding. */
  height: number;
  /** Panel width needed (sidebar) or the supplied width. */
  width: number;
}

/** Lay out text inside a panel of fixed width. Height is derived from wrapped line count. */
export function layoutPanel(logical: string[], panelWidth: number, fontSize: number): PanelLayout {
  const pad = Math.round(fontSize * PAD_EM);
  const lineHeight = Math.round(fontSize * LINE_HEIGHT_EM);
  const maxChars = Math.floor((panelWidth - pad * 2) / (fontSize * CHAR_WIDTH_EM));
  const lines = logical.flatMap((l) => wrapLine(l, maxChars));
  return { lines, fontSize, lineHeight, pad, width: panelWidth, height: lines.length * lineHeight + pad * 2 };
}

export function sidebarWidth(fontSize: number): number {
  const pad = Math.round(fontSize * PAD_EM);
  return Math.ceil(SIDEBAR_CHARS * fontSize * CHAR_WIDTH_EM + pad * 2);
}

export interface Placement {
  canvasWidth: number;
  canvasHeight: number;
  imageX: number;
  imageY: number;
  panel: { x: number; y: number; width: number; height: number };
  layout: PanelLayout;
}

/** Compute canvas size and positions. Banner mode never overlaps the image. */
export function computePlacement(
  imgW: number,
  imgH: number,
  logical: string[],
  stamp: StampOptions,
  scale: number
): Placement {
  const fs = Math.max(6, Math.round(stamp.fontSize * scale));
  const horizontal = stamp.position === 'top' || stamp.position === 'bottom';
  const panelW = horizontal ? imgW : sidebarWidth(fs);
  const layout = layoutPanel(logical, panelW, fs);

  if (stamp.mode === 'watermark') {
    const h = horizontal ? Math.min(layout.height, imgH) : imgH;
    const w = panelW;
    const x = stamp.position === 'right' ? imgW - w : 0;
    const y = stamp.position === 'bottom' ? imgH - h : 0;
    return {
      canvasWidth: imgW,
      canvasHeight: imgH,
      imageX: 0,
      imageY: 0,
      panel: { x, y, width: Math.min(w, imgW), height: h },
      layout
    };
  }

  if (horizontal) {
    const h = layout.height;
    const top = stamp.position === 'top';
    return {
      canvasWidth: imgW,
      canvasHeight: imgH + h,
      imageX: 0,
      imageY: top ? h : 0,
      panel: { x: 0, y: top ? 0 : imgH, width: imgW, height: h },
      layout
    };
  }
  const w = panelW;
  const h = Math.max(imgH, layout.height);
  const left = stamp.position === 'left';
  return {
    canvasWidth: imgW + w,
    canvasHeight: h,
    imageX: left ? w : 0,
    imageY: 0,
    panel: { x: left ? 0 : imgW, y: 0, width: w, height: h },
    layout
  };
}
