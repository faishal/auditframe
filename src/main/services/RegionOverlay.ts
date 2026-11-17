import { BrowserWindow, type Display, type NativeImage } from 'electron';
import path from 'node:path';
import { EVENTS, type OverlayInit } from '../../shared/ipc';
import { secureWebPreferences } from '../windows';

export interface Selection {
  displayId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Active {
  windows: Map<number, { win: BrowserWindow; display: Display }>;
  resolve: (s: Selection | null) => void;
}

export class RegionOverlay {
  private active: Active | null = null;

  /** Show one overlay per display, each with a frozen frame. Resolves with the selection or null if cancelled. */
  select(displays: Display[], frozen: Map<number, NativeImage>): Promise<Selection | null> {
    if (this.active) return Promise.resolve(null);
    return new Promise((resolve) => {
      const windows = new Map<number, { win: BrowserWindow; display: Display }>();
      const finish = (s: Selection | null) => {
        if (!this.active) return;
        const a = this.active;
        this.active = null;
        for (const { win } of a.windows.values()) if (!win.isDestroyed()) win.destroy();
        a.resolve(s);
      };
      this.active = { windows, resolve };

      for (const display of displays) {
        const img = frozen.get(display.id);
        if (!img) continue;
        const win = new BrowserWindow({
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height,
          frame: false,
          transparent: true,
          hasShadow: false,
          resizable: false,
          movable: false,
          skipTaskbar: true,
          alwaysOnTop: true,
          enableLargerThanScreen: true,
          show: false,
          backgroundColor: '#00000000',
          webPreferences: secureWebPreferences(path.join(__dirname, '../preload/overlay.js'))
        });
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        windows.set(win.webContents.id, { win, display });
        win.on('closed', () => finish(null));

        const init: OverlayInit = {
          displayId: display.id,
          image: img.toDataURL(),
          scaleFactor: display.scaleFactor
        };
        win.webContents.once('did-finish-load', () => {
          win.webContents.send(EVENTS.overlayInit, init);
          win.show();
          win.focus();
        });
        loadOverlayPage(win);
      }
      if (windows.size === 0) finish(null);
    });
  }

  /** Called from IPC. Validates that the sender is one of our overlay windows and the selection fits its display. */
  submit(senderId: number, sel: Selection): boolean {
    const entry = this.active?.windows.get(senderId);
    if (!entry || !this.active) return false;
    const { display } = entry;
    if (sel.displayId !== display.id) return false;
    if (sel.x + sel.width > display.bounds.width + 1 || sel.y + sel.height > display.bounds.height + 1) return false;
    const resolve = this.active.resolve;
    const windows = this.active.windows;
    this.active = null;
    for (const { win } of windows.values()) if (!win.isDestroyed()) win.destroy();
    resolve(sel);
    return true;
  }

  cancel(senderId: number): void {
    if (!this.active?.windows.has(senderId)) return;
    const { resolve, windows } = this.active;
    this.active = null;
    for (const { win } of windows.values()) if (!win.isDestroyed()) win.destroy();
    resolve(null);
  }
}

function loadOverlayPage(win: BrowserWindow) {
  const dev = process.env.AUDITFRAME_DEV_URL;
  if (dev) void win.loadURL(`${dev}/overlay.html`);
  else void win.loadFile(path.join(__dirname, '../renderer/overlay.html'));
}
