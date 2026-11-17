import type {
  AppState,
  CaptureMode,
  DraftSummary,
  HistoryRecord,
  SaveResult,
  Settings,
  StampOptions,
  VerifyResult,
  WindowInfo
} from './types';

/** Invoke channels (renderer -> main). The preload allowlist is derived from this. */
export const INVOKE = {
  appState: 'app:state',
  settingsSet: 'settings:set',
  settingsPickDir: 'settings:pick-dir',
  listWindows: 'capture:list-windows',
  captureStart: 'capture:start',
  draftPreview: 'draft:preview',
  draftSave: 'draft:save',
  draftCopy: 'draft:copy',
  draftDiscard: 'draft:discard',
  historyList: 'history:list',
  historyVerify: 'history:verify',
  historyReveal: 'history:reveal',
  openPermissionSettings: 'permissions:open-settings',
  geoResult: 'location:os-result',
  overlaySubmit: 'overlay:submit',
  overlayCancel: 'overlay:cancel'
} as const;

/** Event channels (main -> renderer). */
export const EVENTS = {
  draftsReady: 'drafts:ready',
  historyUpdated: 'history:updated',
  locationRequest: 'location:os-request',
  captureError: 'capture:error',
  captureStarted: 'capture:started',
  overlayInit: 'overlay:init',
  triggerCapture: 'capture:trigger'
} as const;

export type InvokeChannel = (typeof INVOKE)[keyof typeof INVOKE];
export type EventChannel = (typeof EVENTS)[keyof typeof EVENTS];

export interface OverlayInit {
  displayId: number;
  /** Frozen screenshot of this display, as a data URL (physical pixels). */
  image: string;
  scaleFactor: number;
}

export interface GeoRequestResult {
  ok: boolean;
  lat?: number;
  lon?: number;
  accuracy?: number;
  errorCode?: number;
  message?: string;
}

/** API exposed on `window.auditframe`. */
export interface AuditFrameApi {
  getState(): Promise<AppState>;
  saveSettings(settings: Settings): Promise<Settings>;
  pickSaveDirectory(): Promise<string | null>;
  listWindows(): Promise<WindowInfo[]>;
  startCapture(mode: CaptureMode, windowId?: string): Promise<void>;
  previewDraft(draftId: string, stamp: StampOptions): Promise<string>;
  saveDraft(draftId: string, stamp: StampOptions): Promise<SaveResult>;
  copyDraft(draftId: string, stamp: StampOptions): Promise<void>;
  discardDraft(draftId: string): Promise<void>;
  listHistory(): Promise<HistoryRecord[]>;
  verifyHistory(evidenceId: string): Promise<VerifyResult>;
  revealHistory(evidenceId: string): Promise<void>;
  openPermissionSettings(kind: 'screen' | 'location'): Promise<void>;
  onDraftsReady(cb: (drafts: DraftSummary[]) => void): () => void;
  onHistoryUpdated(cb: (records: HistoryRecord[]) => void): () => void;
  onCaptureError(cb: (message: string) => void): () => void;
  onCaptureTrigger(cb: (mode: CaptureMode) => void): () => void;
  onLocationRequest(cb: () => void): () => void;
  sendLocationResult(result: GeoRequestResult): Promise<void>;
}

export interface OverlayApi {
  onInit(cb: (init: OverlayInit) => void): void;
  submit(sel: { displayId: number; x: number; y: number; width: number; height: number }): void;
  cancel(): void;
}
