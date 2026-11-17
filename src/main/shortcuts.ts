import { Menu, Tray, app, globalShortcut, type BrowserWindow, type NativeImage } from 'electron';
import type { CaptureMode, Settings } from '../shared/types';

const MODES: Array<{ mode: CaptureMode; label: string }> = [
  { mode: 'window', label: 'Capture Window…' },
  { mode: 'screen', label: 'Capture Current Screen' },
  { mode: 'all', label: 'Capture All Screens' },
  { mode: 'region', label: 'Capture Region' }
];

/** Registers global shortcuts; returns the accelerators that could not be registered. */
export function registerShortcuts(settings: Settings, trigger: (mode: CaptureMode) => void): string[] {
  globalShortcut.unregisterAll();
  const failed: string[] = [];
  for (const { mode } of MODES) {
    const accel = settings.shortcuts[mode];
    try {
      if (!globalShortcut.register(accel, () => trigger(mode))) failed.push(accel);
    } catch {
      failed.push(accel);
    }
  }
  return failed;
}

export function createTray(
  icon: NativeImage,
  getWindow: () => BrowserWindow | null,
  trigger: (mode: CaptureMode) => void,
  settings: () => Settings
): Tray {
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  const tray = new Tray(icon);
  tray.setToolTip('AuditFrame');
  const build = () =>
    Menu.buildFromTemplate([
      ...MODES.map(({ mode, label }) => ({
        label,
        accelerator: settings().shortcuts[mode],
        registerAccelerator: false,
        click: () => trigger(mode)
      })),
      { type: 'separator' as const },
      {
        label: 'Show AuditFrame',
        click: () => {
          const w = getWindow();
          w?.show();
          w?.focus();
        }
      },
      { label: 'Quit', click: () => app.quit() }
    ]);
  tray.setContextMenu(build());
  tray.on('click', () => {
    if (process.platform !== 'darwin') {
      const w = getWindow();
      w?.show();
      w?.focus();
    }
  });
  (tray as Tray & { refresh?: () => void }).refresh = () => tray.setContextMenu(build());
  return tray;
}
