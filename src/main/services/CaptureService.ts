import { BrowserWindow, desktopCapturer, screen, type Display, type NativeImage } from 'electron';
import sharp from 'sharp';
import type { DisplayInfo, WindowInfo } from '../../shared/types';
import { cropRect, stitchLayout } from './captureMath';
import { RegionOverlay } from './RegionOverlay';

export interface RawImage {
  png: Buffer;
  width: number;
  height: number;
  sourceTitle: string;
  displays: DisplayInfo[];
}

export class CancelledError extends Error {
  constructor() {
    super('Capture cancelled');
  }
}

const toDisplayInfo = (d: Display, img?: NativeImage, index = 0): DisplayInfo => {
  const size = img?.getSize();
  return {
    id: d.id,
    label: d.label || `Display ${index + 1}`,
    bounds: { ...d.bounds },
    scaleFactor: d.scaleFactor,
    pixelWidth: size?.width ?? Math.round(d.bounds.width * d.scaleFactor),
    pixelHeight: size?.height ?? Math.round(d.bounds.height * d.scaleFactor)
  };
};

export class CaptureService {
  private overlay = new RegionOverlay();

  constructor(
    private opts: {
      /** Windows to hide while capturing (app UI). */
      ownWindows: () => BrowserWindow[];
      stitchAll: () => boolean;
    }
  ) {}

  get regionOverlay(): RegionOverlay {
    return this.overlay;
  }

  /** Hide own windows, wait for the compositor, run fn, then restore. */
  private async withHiddenWindows<T>(fn: () => Promise<T>): Promise<T> {
    const wins = this.opts.ownWindows().filter((w) => !w.isDestroyed() && w.isVisible());
    wins.forEach((w) => w.hide());
    if (wins.length) await new Promise((r) => setTimeout(r, process.platform === 'linux' ? 400 : 250));
    try {
      return await fn();
    } finally {
      wins.forEach((w) => !w.isDestroyed() && w.show());
    }
  }

  private async grabDisplays(displays: Display[]): Promise<Map<number, NativeImage>> {
    const maxW = Math.max(...displays.map((d) => Math.round(d.bounds.width * d.scaleFactor)));
    const maxH = Math.max(...displays.map((d) => Math.round(d.bounds.height * d.scaleFactor)));
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: maxW, height: maxH } });
    const out = new Map<number, NativeImage>();
    displays.forEach((d, i) => {
      // display_id is empty on some Wayland/PipeWire setups; fall back to enumeration order.
      const src = sources.find((s) => s.display_id === String(d.id)) ?? (sources.length === displays.length ? sources[i] : undefined);
      if (src && !src.thumbnail.isEmpty()) out.set(d.id, src.thumbnail);
    });
    if (out.size === 0) {
      throw new Error('Screen capture returned no image. Check Screen Recording permission (macOS) or PipeWire portal (Linux/Wayland).');
    }
    return out;
  }

  async captureCurrentScreen(): Promise<RawImage[]> {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    return this.withHiddenWindows(async () => {
      const imgs = await this.grabDisplays([display]);
      const img = imgs.get(display.id);
      if (!img) throw new Error('Could not capture the current display');
      const size = img.getSize();
      return [
        { png: img.toPNG(), width: size.width, height: size.height, sourceTitle: display.label || 'Current screen', displays: [toDisplayInfo(display, img)] }
      ];
    });
  }

  async captureAllScreens(): Promise<RawImage[]> {
    const displays = screen.getAllDisplays();
    return this.withHiddenWindows(async () => {
      const imgs = await this.grabDisplays(displays);
      const captured = displays.filter((d) => imgs.has(d.id));
      if (!this.opts.stitchAll() || captured.length === 1) {
        return captured.map((d, i) => {
          const img = imgs.get(d.id)!;
          const s = img.getSize();
          return {
            png: img.toPNG(),
            width: s.width,
            height: s.height,
            sourceTitle: `Display ${i + 1} of ${captured.length}${d.label ? ` (${d.label})` : ''}`,
            displays: [toDisplayInfo(d, img, i)]
          };
        });
      }
      const layout = stitchLayout(captured.map((d) => ({ displayId: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor })));
      const composites = await Promise.all(
        layout.tiles.map(async (t) => {
          const img = imgs.get(t.displayId)!;
          const s = img.getSize();
          const input = s.width === t.width && s.height === t.height ? img.toPNG() : await sharp(img.toPNG()).resize(t.width, t.height).png().toBuffer();
          return { input, left: t.left, top: t.top };
        })
      );
      const png = await sharp({ create: { width: layout.width, height: layout.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
        .composite(composites)
        .png()
        .toBuffer();
      return [
        {
          png,
          width: layout.width,
          height: layout.height,
          sourceTitle: `All screens (${captured.length})`,
          displays: captured.map((d, i) => toDisplayInfo(d, imgs.get(d.id), i))
        }
      ];
    });
  }

  async listWindows(): Promise<WindowInfo[]> {
    const own = new Set(this.opts.ownWindows().filter((w) => !w.isDestroyed()).map((w) => w.getMediaSourceId()));
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: true
    });
    return sources
      .filter((s) => !own.has(s.id) && s.name.trim() !== '' && !s.thumbnail.isEmpty())
      .map((s) => ({
        id: s.id,
        title: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : undefined
      }));
  }

  async captureWindow(windowId: string): Promise<RawImage[]> {
    const primary = screen.getPrimaryDisplay();
    const size = { width: 7680, height: 4320 };
    return this.withHiddenWindows(async () => {
      const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: size });
      const src = sources.find((s) => s.id === windowId);
      if (!src || src.thumbnail.isEmpty()) throw new Error('That window is no longer available (closed, minimised, or not capturable).');
      const s = src.thumbnail.getSize();
      return [{ png: src.thumbnail.toPNG(), width: s.width, height: s.height, sourceTitle: src.name, displays: [toDisplayInfo(primary)] }];
    });
  }

  async captureRegion(): Promise<RawImage[]> {
    const displays = screen.getAllDisplays();
    const frozen = await this.withHiddenWindows(() => this.grabDisplays(displays));
    const sel = await this.overlay.select(displays, frozen);
    if (!sel) throw new CancelledError();
    const display = displays.find((d) => d.id === sel.displayId);
    const img = frozen.get(sel.displayId);
    if (!display || !img) throw new Error('Selection display not found');
    const size = img.getSize();
    const crop = cropRect(sel, display.bounds, size.width, size.height);
    const png = await sharp(img.toPNG())
      .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
      .png()
      .toBuffer();
    return [
      {
        png,
        width: crop.width,
        height: crop.height,
        sourceTitle: `Region ${crop.width}x${crop.height} on ${display.label || 'display ' + display.id}`,
        displays: [toDisplayInfo(display, img)]
      }
    ];
  }
}
