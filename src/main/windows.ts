import { BrowserWindow, shell, type WebPreferences } from 'electron';
import path from 'node:path';

export function secureWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
    spellcheck: false
  };
}

export const isDev = () => !!process.env.AUDITFRAME_DEV_URL;

/** Origin prefix of pages we trust to call IPC. */
export function isTrustedUrl(url: string): boolean {
  const dev = process.env.AUDITFRAME_DEV_URL;
  if (dev) return url.startsWith(dev);
  return url.startsWith('file://') && url.includes('/dist/renderer/');
}

/** Deny navigation away from the app and all window.open calls. External http(s) links open in the OS browser. */
export function lockNavigation(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'AuditFrame',
    backgroundColor: '#0b1220',
    webPreferences: secureWebPreferences(path.join(__dirname, '../preload/index.js'))
  });
  lockNavigation(win);
  win.once('ready-to-show', () => win.show());
  const dev = process.env.AUDITFRAME_DEV_URL;
  if (dev) void win.loadURL(`${dev}/index.html`);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return win;
}
