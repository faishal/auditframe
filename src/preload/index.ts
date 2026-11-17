import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EVENTS, INVOKE, type AuditFrameApi, type EventChannel, type InvokeChannel } from '../shared/ipc';

// Allowlists derived from the shared channel map. Anything else is rejected before reaching ipcRenderer.
const INVOKE_ALLOWED = new Set<string>(Object.values(INVOKE));
const EVENT_ALLOWED = new Set<string>(Object.values(EVENTS));

function invoke<T>(channel: InvokeChannel, payload?: unknown): Promise<T> {
  if (!INVOKE_ALLOWED.has(channel)) return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

function subscribe<T>(channel: EventChannel, cb: (payload: T) => void): () => void {
  if (!EVENT_ALLOWED.has(channel)) throw new Error(`Blocked IPC event: ${channel}`);
  // The IpcRendererEvent is deliberately not forwarded to the page.
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: AuditFrameApi = {
  getState: () => invoke(INVOKE.appState),
  saveSettings: (settings) => invoke(INVOKE.settingsSet, settings),
  pickSaveDirectory: () => invoke(INVOKE.settingsPickDir),
  listWindows: () => invoke(INVOKE.listWindows),
  startCapture: (mode, windowId) => invoke(INVOKE.captureStart, { mode, windowId }),
  previewDraft: (draftId, stamp) => invoke(INVOKE.draftPreview, { draftId, stamp }),
  saveDraft: (draftId, stamp) => invoke(INVOKE.draftSave, { draftId, stamp }),
  copyDraft: (draftId, stamp) => invoke(INVOKE.draftCopy, { draftId, stamp }),
  discardDraft: (draftId) => invoke(INVOKE.draftDiscard, { draftId }),
  listHistory: () => invoke(INVOKE.historyList),
  verifyHistory: (evidenceId) => invoke(INVOKE.historyVerify, { evidenceId }),
  revealHistory: (evidenceId) => invoke(INVOKE.historyReveal, { evidenceId }),
  openPermissionSettings: (kind) => invoke(INVOKE.openPermissionSettings, { kind }),
  onDraftsReady: (cb) => subscribe(EVENTS.draftsReady, cb),
  onHistoryUpdated: (cb) => subscribe(EVENTS.historyUpdated, cb),
  onCaptureError: (cb) => subscribe(EVENTS.captureError, cb),
  onCaptureTrigger: (cb) => subscribe(EVENTS.triggerCapture, cb),
  onLocationRequest: (cb) => subscribe(EVENTS.locationRequest, () => cb()),
  sendLocationResult: (result) => invoke(INVOKE.geoResult, result)
};

contextBridge.exposeInMainWorld('auditframe', api);
