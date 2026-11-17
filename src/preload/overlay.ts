import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { EVENTS, INVOKE, type OverlayApi, type OverlayInit } from '../shared/ipc';

const api: OverlayApi = {
  onInit: (cb) => {
    ipcRenderer.once(EVENTS.overlayInit, (_e: IpcRendererEvent, init: OverlayInit) => cb(init));
  },
  submit: (sel) => {
    void ipcRenderer.invoke(INVOKE.overlaySubmit, sel);
  },
  cancel: () => {
    void ipcRenderer.invoke(INVOKE.overlayCancel);
  }
};

contextBridge.exposeInMainWorld('auditframeOverlay', api);
