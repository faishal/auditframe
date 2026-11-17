import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, CaptureMode, DraftSummary, HistoryRecord, Settings, StampOptions } from '../shared/types';
import { CapturePanel } from './components/CapturePanel';
import { HistorySidebar } from './components/HistorySidebar';
import { PermissionBanner } from './components/PermissionBanner';
import { Review } from './components/Review';
import { SettingsDialog } from './components/SettingsDialog';
import { WindowPicker } from './components/WindowPicker';

const api = window.auditframe;

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [active, setActive] = useState(0);
  const [stamp, setStamp] = useState<StampOptions | null>(null);
  const [busy, setBusy] = useState<CaptureMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;

  const refreshState = useCallback(async () => {
    const s = await api.getState();
    setState(s);
    setStamp((prev) => prev ?? s.settings.stamp);
    return s;
  }, []);

  useEffect(() => {
    void refreshState();
    void api.listHistory().then(setHistory);
    const offs = [
      api.onDraftsReady((d) => {
        setBusy(null);
        setError(null);
        setDrafts(d);
        setActive(0);
        void refreshState(); // permissions may have changed (e.g. location result)
      }),
      api.onHistoryUpdated(setHistory),
      api.onCaptureError((m) => {
        setBusy(null);
        setError(m);
        void refreshState();
      }),
      api.onCaptureTrigger((m) => {
        if (m === 'window') setShowPicker(true);
      }),
      // Main asks for an OS-level location fix; Chromium's geolocation API lives in the renderer.
      api.onLocationRequest(() => {
        if (!navigator.geolocation) {
          void api.sendLocationResult({ ok: false, message: 'Geolocation API unavailable' });
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (p) =>
            void api.sendLocationResult({
              ok: true,
              lat: p.coords.latitude,
              lon: p.coords.longitude,
              accuracy: p.coords.accuracy
            }),
          (e) => void api.sendLocationResult({ ok: false, errorCode: e.code, message: e.message.slice(0, 280) }),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      })
    ];
    return () => offs.forEach((off) => off());
  }, [refreshState]);

  const start = async (mode: CaptureMode, windowId?: string) => {
    setError(null);
    setNotice(null);
    setBusy(mode);
    try {
      await api.startCapture(mode, windowId);
    } catch (e) {
      setBusy(null);
      setError((e as Error).message);
    }
  };

  const onCaptureClick = (mode: CaptureMode) => (mode === 'window' ? setShowPicker(true) : void start(mode));

  const saveSettings = async (s: Settings) => {
    const saved = await api.saveSettings(s);
    setState((prev) => (prev ? { ...prev, settings: saved } : prev));
    setStamp((prev) => (prev ? { ...prev, timeFormat: saved.timeFormat, timeZone: saved.timeZone } : saved.stamp));
    setShowSettings(false);
  };

  const finishDraft = async (draftId: string, saved: boolean) => {
    if (!saved) await api.discardDraft(draftId);
    const rest = drafts.filter((d) => d.draftId !== draftId);
    setDrafts(rest);
    setActive((a) => Math.max(0, Math.min(a, rest.length - 1)));
  };

  if (!state || !stamp) return <div className="p-6 text-slate-400">Loading…</div>;
  const current = drafts[active];

  return (
    <div className="flex h-full">
      <HistorySidebar records={history} onChanged={setHistory} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">AuditFrame</h1>
          <button className="rounded px-3 py-1 text-sm text-slate-300 hover:bg-slate-800" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </header>

        <PermissionBanner state={state} onOpen={(k) => void api.openPermissionSettings(k)} />
        <CapturePanel settings={state.settings} busy={busy} onCapture={onCaptureClick} />

        {error && (
          <div role="alert" className="mx-4 mt-3 rounded border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mx-4 mt-3 rounded border border-emerald-800 bg-emerald-950/60 px-3 py-2 text-sm text-emerald-200">
            {notice}
          </div>
        )}

        {current ? (
          <Review
            key={current.draftId}
            drafts={drafts}
            active={active}
            onActive={setActive}
            stamp={stamp}
            onStamp={setStamp}
            onSaved={async (rec) => {
              setNotice(`Saved ${rec.pngPath}`);
              setHistory(await api.listHistory());
              // Keep the chosen stamp options as the new default.
              void api.saveSettings({ ...state.settings, stamp }).then((s) => setState({ ...state, settings: s }));
              await finishDraft(current.draftId, true);
            }}
            onCopied={() => setNotice('Copied stamped image to clipboard')}
            onDiscard={() => void finishDraft(current.draftId, false)}
            onError={setError}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            Choose a capture mode to begin.
          </div>
        )}
      </main>

      {showPicker && (
        <WindowPicker
          onClose={() => setShowPicker(false)}
          onPick={(id) => {
            setShowPicker(false);
            void start('window', id);
          }}
        />
      )}
      {showSettings && <SettingsDialog settings={state.settings} state={state} onCancel={() => setShowSettings(false)} onSave={saveSettings} />}
    </div>
  );
}
