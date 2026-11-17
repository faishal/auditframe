import { BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { EVENTS, INVOKE, type GeoRequestResult } from '../shared/ipc';
import {
  captureStartSchema,
  draftStampSchema,
  geoResultSchema,
  idSchema,
  overlaySelectionSchema,
  settingsSchema
} from '../shared/schemas';
import type { AppState, CaptureMode } from '../shared/types';
import { getPermissions, openPermissionSettings } from './permissions';
import { CancelledError, type CaptureService } from './services/CaptureService';
import type { CapturePipeline } from './services/CapturePipeline';
import type { EvidenceVaultService } from './services/EvidenceVaultService';
import type { LocationService } from './services/LocationService';
import type { SettingsStore } from './settings';
import { isTrustedUrl } from './windows';

export interface AppContext {
  getMainWindow: () => BrowserWindow | null;
  settings: SettingsStore;
  pipeline: CapturePipeline;
  capture: CaptureService;
  vault: EvidenceVaultService;
  location: LocationService;
  version: string;
  onSettingsChanged: () => void;
}

type Origin = 'main' | 'overlay';

/** Pending OS geolocation request (renderer answers via INVOKE.geoResult). */
let pendingGeo: { resolve: (r: GeoRequestResult) => void } | null = null;

export function requestOsLocation(ctx: AppContext, timeoutMs = 10_000): Promise<GeoRequestResult> {
  const win = ctx.getMainWindow();
  if (!win || win.isDestroyed()) return Promise.resolve({ ok: false, message: 'No window available for location request' });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingGeo = null;
      resolve({ ok: false, message: 'OS location request timed out' });
    }, timeoutMs);
    pendingGeo = {
      resolve: (r) => {
        clearTimeout(timer);
        pendingGeo = null;
        resolve(r);
      }
    };
    win.webContents.send(EVENTS.locationRequest);
  });
}

let capturing = false;

/** Shared entry point for UI, tray, and global shortcuts. */
export async function startCapture(ctx: AppContext, mode: CaptureMode, windowId?: string): Promise<void> {
  if (capturing) return;
  capturing = true;
  const win = ctx.getMainWindow();
  try {
    win?.webContents.send(EVENTS.captureStarted, mode);
    const drafts = await ctx.pipeline.run(mode, windowId);
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send(EVENTS.draftsReady, drafts);
    }
  } catch (e) {
    if (!(e instanceof CancelledError)) win?.webContents.send(EVENTS.captureError, (e as Error).message);
    if (win && !win.isDestroyed()) win.show();
  } finally {
    capturing = false;
  }
}

export function registerIpc(ctx: AppContext): void {
  const trusted = (e: IpcMainInvokeEvent, origin: Origin): boolean => {
    const url = e.senderFrame?.url ?? '';
    if (!isTrustedUrl(url)) return false;
    if (origin === 'main') return e.sender === ctx.getMainWindow()?.webContents;
    return true; // overlay windows are checked against RegionOverlay's own window set
  };

  function handle<S extends z.ZodTypeAny, R>(
    channel: string,
    schema: S | null,
    origin: Origin,
    fn: (payload: z.infer<S>, e: IpcMainInvokeEvent) => Promise<R> | R
  ) {
    ipcMain.handle(channel, async (e, raw) => {
      if (!trusted(e, origin)) throw new Error('Untrusted IPC sender');
      const payload = schema ? schema.parse(raw) : undefined;
      return fn(payload as z.infer<S>, e);
    });
  }

  handle(INVOKE.appState, null, 'main', (): AppState => ({
    settings: ctx.settings.get(),
    permissions: getPermissions(ctx.location.permission),
    platform: process.platform,
    sessionType: process.env.XDG_SESSION_TYPE ?? null,
    version: ctx.version
  }));

  handle(INVOKE.settingsSet, settingsSchema, 'main', async (s) => {
    const saved = await ctx.settings.set(s as never);
    ctx.onSettingsChanged();
    return saved;
  });

  handle(INVOKE.settingsPickDir, null, 'main', async () => {
    const win = ctx.getMainWindow();
    const opts = { properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return r.canceled ? null : r.filePaths[0] ?? null;
  });

  handle(INVOKE.listWindows, null, 'main', () => ctx.capture.listWindows());

  handle(INVOKE.captureStart, captureStartSchema, 'main', (p) => {
    // Fire and forget: results arrive via events so long-running region selection does not hold the invoke open.
    void startCapture(ctx, p.mode, p.windowId);
  });

  handle(INVOKE.draftPreview, draftStampSchema, 'main', (p) => ctx.pipeline.preview(p.draftId, p.stamp));

  handle(INVOKE.draftSave, draftStampSchema, 'main', async (p) => {
    const record = await ctx.pipeline.save(p.draftId, p.stamp);
    ctx.getMainWindow()?.webContents.send(EVENTS.historyUpdated, await ctx.vault.list());
    return { record };
  });

  handle(INVOKE.draftCopy, draftStampSchema, 'main', async (p) => {
    const png = await ctx.pipeline.stampedPng(p.draftId, p.stamp);
    clipboard.writeImage(nativeImage.createFromBuffer(png));
  });

  handle(INVOKE.draftDiscard, z.object({ draftId: idSchema }), 'main', (p) => ctx.pipeline.discard(p.draftId));

  handle(INVOKE.historyList, null, 'main', () => ctx.vault.list());
  handle(INVOKE.historyVerify, z.object({ evidenceId: idSchema }), 'main', (p) => ctx.vault.verify(p.evidenceId));
  handle(INVOKE.historyReveal, z.object({ evidenceId: idSchema }), 'main', async (p) => {
    const rec = await ctx.vault.get(p.evidenceId);
    if (rec) shell.showItemInFolder(rec.pngPath);
  });

  handle(INVOKE.openPermissionSettings, z.object({ kind: z.enum(['screen', 'location']) }), 'main', (p) =>
    openPermissionSettings(p.kind)
  );

  handle(INVOKE.geoResult, geoResultSchema, 'main', (r) => {
    pendingGeo?.resolve(r);
  });

  handle(INVOKE.overlaySubmit, overlaySelectionSchema, 'overlay', (sel, e) => {
    ctx.capture.regionOverlay.submit(e.sender.id, sel);
  });
  handle(INVOKE.overlayCancel, null, 'overlay', (_p, e) => {
    ctx.capture.regionOverlay.cancel(e.sender.id);
  });
}
