import { useState } from 'react';
import type { AppState, CaptureMode, Settings } from '../../shared/types';

const SHORTCUT_LABELS: Record<CaptureMode, string> = {
  window: 'Window',
  screen: 'Current screen',
  all: 'All screens',
  region: 'Region'
};

export function SettingsDialog(props: {
  settings: Settings;
  state: AppState;
  onCancel: () => void;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [s, setS] = useState<Settings>(props.settings);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  const input = 'w-full rounded border border-slate-700 bg-slate-950 px-2 py-1';
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="max-h-full w-full max-w-xl overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-5 text-sm">
        <h2 className="mb-4 text-lg font-semibold">Settings</h2>

        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="font-medium text-slate-300">Time</h3>
            <label className="block">
              NTP server
              <input className={input} value={s.ntpHost} onChange={(e) => set('ntpHost', e.target.value.trim())} />
            </label>
            <p className="text-xs text-slate-500">UDP port 123. Falls back to HTTPS time sources, then the local clock; the source is recorded with each capture.</p>
            <label className="block">
              Timestamp format
              <input className={`${input} font-mono`} value={s.timeFormat} onChange={(e) => set('timeFormat', e.target.value)} />
            </label>
            <p className="text-xs text-slate-500">Tokens: YYYY MM DD HH mm ss SSS Z. Default: YYYY-MM-DDTHH:mm:ssZ</p>
            <label className="block">
              Display timezone
              <select className={input} value={s.timeZone} onChange={(e) => set('timeZone', e.target.value as Settings['timeZone'])}>
                <option value="utc">UTC</option>
                <option value="utc+local">UTC + local time</option>
              </select>
            </label>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-slate-300">Location</h3>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.includeLocation} onChange={(e) => set('includeLocation', e.target.checked)} />
              Include device location in capture metadata
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!s.includeLocation} checked={s.reverseGeocode} onChange={(e) => set('reverseGeocode', e.target.checked)} />
              Look up city/region name for GPS fixes (sends coordinates to OpenStreetMap)
            </label>
            {props.state.platform === 'linux' && (
              <p className="text-xs text-slate-500">On Linux, OS positioning often requires a Google API key; AuditFrame falls back to IP-Approx automatically.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-slate-300">Capture</h3>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={s.allScreensStitched} onChange={(e) => set('allScreensStitched', e.target.checked)} />
              All Screens: stitch into one image (off = one numbered capture per display)
            </label>
            <div>
              Save folder
              <div className="flex gap-2">
                <input readOnly className={input} value={s.saveDirectory} />
                <button
                  className="shrink-0 rounded bg-slate-800 px-3 hover:bg-slate-700"
                  onClick={async () => {
                    const dir = await window.auditframe.pickSaveDirectory();
                    if (dir) set('saveDirectory', dir);
                  }}
                >
                  Browse…
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-medium text-slate-300">Global shortcuts</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SHORTCUT_LABELS) as CaptureMode[]).map((m) => (
                <label key={m} className="block">
                  {SHORTCUT_LABELS[m]}
                  <input
                    className={`${input} font-mono`}
                    value={s.shortcuts[m]}
                    onChange={(e) => set('shortcuts', { ...s.shortcuts, [m]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">Electron accelerator syntax, e.g. CommandOrControl+Shift+4.</p>
          </section>
        </div>

        {error && <p className="mt-3 text-red-300" role="alert">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800" onClick={props.onCancel}>
            Cancel
          </button>
          <button
            className="rounded bg-sky-600 px-3 py-1.5 font-medium hover:bg-sky-500"
            onClick={() => props.onSave(s).catch((e: Error) => setError('Invalid settings: check the NTP host, format, and shortcuts.'))}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
