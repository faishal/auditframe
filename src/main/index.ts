import { BrowserWindow, Tray, app, globalShortcut, nativeImage, session } from 'electron';
import path from 'node:path';
import sharp from 'sharp';
import { EVENTS } from '../shared/ipc';
import type { CaptureMode } from '../shared/types';
import { registerIpc, requestOsLocation, startCapture, type AppContext } from './ipc';
import { CapturePipeline } from './services/CapturePipeline';
import { CaptureService } from './services/CaptureService';
import { ComposerService } from './services/ComposerService';
import { EvidenceVaultService } from './services/EvidenceVaultService';
import { LocationService } from './services/LocationService';
import { TimeService } from './services/TimeService';
import { SettingsStore } from './settings';
import { createTray, registerShortcuts } from './shortcuts';
import { NOOP_HOOKS } from './v2/interfaces';
import { createMainWindow, isTrustedUrl } from './windows';

// Linux: let Chromium capture via the PipeWire portal on Wayland (X11 works without it).
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

let mainWindow: BrowserWindow | null = null;
let tray: (Tray & { refresh?: () => void }) | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  void app.whenReady().then(bootstrap);
}

async function trayIcon() {
  const color = process.platform === 'darwin' ? '#000000' : '#38bdf8';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V4h7M21 4h7v7M28 21v7h-7M11 28H4v-7"/><rect x="11" y="11" width="10" height="10" rx="1"/></svg>`;
  const png = await sharp(Buffer.from(svg)).resize(process.platform === 'darwin' ? 32 : 32).png().toBuffer();
  return nativeImage.createFromBuffer(png, { scaleFactor: process.platform === 'darwin' ? 2 : 1 });
}

async function bootstrap() {
  const settings = new SettingsStore();
  await settings.load();

  const getWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);

  const capture = new CaptureService({
    ownWindows: () => BrowserWindow.getAllWindows().filter((w) => w === mainWindow),
    stitchAll: () => settings.get().allScreensStitched
  });
  const time = new TimeService(() => settings.get().ntpHost);
  const ctxRef: { ctx?: AppContext } = {};
  const location = new LocationService(
    { enabled: () => settings.get().includeLocation, reverseGeocode: () => settings.get().reverseGeocode },
    { requestOs: () => requestOsLocation(ctxRef.ctx!) }
  );
  const vault = new EvidenceVaultService(path.join(app.getPath('userData'), 'vault'), () => settings.get().saveDirectory);
  const composer = new ComposerService();
  const pipeline = new CapturePipeline({ capture, time, location, composer, vault, appVersion: app.getVersion(), hooks: NOOP_HOOKS });

  const trigger = (mode: CaptureMode) => {
    // Window mode needs the picker UI; region/screen/all run immediately.
    if (mode === 'window') {
      const w = getWindow();
      w?.show();
      w?.focus();
      w?.webContents.send(EVENTS.triggerCapture, mode);
      return;
    }
    void startCapture(ctx, mode);
  };

  const ctx: AppContext = {
    getMainWindow: getWindow,
    settings,
    pipeline,
    capture,
    vault,
    location,
    version: app.getVersion(),
    onSettingsChanged: () => {
      const failed = registerShortcuts(settings.get(), trigger);
      if (failed.length) console.warn('Could not register shortcuts:', failed.join(', '));
      tray?.refresh?.();
    }
  };
  ctxRef.ctx = ctx;
  registerIpc(ctx);

  // Only our own pages may use geolocation; everything else is denied.
  const allow = (wc: Electron.WebContents | null, permission: string, url: string) =>
    permission === 'geolocation' && wc === mainWindow?.webContents && isTrustedUrl(url);
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => cb(allow(wc, permission, details.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allow(wc, permission, wc?.getURL() ?? origin));

  mainWindow = createMainWindow();
  mainWindow.on('closed', () => (mainWindow = null));

  tray = createTray(await trayIcon(), getWindow, trigger, () => settings.get());
  ctx.onSettingsChanged();

  app.on('activate', () => {
    if (!getWindow()) {
      mainWindow = createMainWindow();
      mainWindow.on('closed', () => (mainWindow = null));
    }
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
