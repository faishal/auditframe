import type { CaptureMode, Settings } from '../../shared/types';

const MODES: Array<{ mode: CaptureMode; title: string; desc: string }> = [
  { mode: 'window', title: 'Window', desc: 'Pick an open application window' },
  { mode: 'screen', title: 'Current Screen', desc: 'Display under the cursor' },
  { mode: 'all', title: 'All Screens', desc: 'Every connected display' },
  { mode: 'region', title: 'Region', desc: 'Drag to select an area' }
];

const pretty = (accel: string) =>
  accel
    .replace('CommandOrControl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')
    .replace('Shift', navigator.platform.includes('Mac') ? '⇧' : 'Shift')
    .replace(/\+/g, ' ');

export function CapturePanel(props: { settings: Settings; busy: CaptureMode | null; onCapture: (m: CaptureMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
      {MODES.map(({ mode, title, desc }) => (
        <button
          key={mode}
          disabled={props.busy !== null}
          onClick={() => props.onCapture(mode)}
          className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-left transition hover:border-sky-500 hover:bg-slate-800 disabled:opacity-50"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">{props.busy === mode ? 'Capturing…' : title}</span>
            <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">{pretty(props.settings.shortcuts[mode])}</kbd>
          </div>
          <p className="mt-1 text-xs text-slate-400">{desc}</p>
        </button>
      ))}
    </div>
  );
}
