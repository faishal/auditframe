import type { AuditFrameApi, OverlayApi } from '../shared/ipc';

declare global {
  interface Window {
    auditframe: AuditFrameApi;
    auditframeOverlay: OverlayApi;
  }
}

export {};
