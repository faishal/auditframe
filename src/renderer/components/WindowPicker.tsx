import { useEffect, useState } from 'react';
import type { WindowInfo } from '../../shared/types';

export function WindowPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [windows, setWindows] = useState<WindowInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    window.auditframe
      .listWindows()
      .then(setWindows)
      .catch((e: Error) => setError(e.message));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = windows?.filter((w) => w.title.toLowerCase().includes(filter.toLowerCase())) ?? [];

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true" aria-label="Select a window">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg border border-slate-700 bg-slate-900">
        <div className="flex items-center gap-3 border-b border-slate-800 p-3">
          <h2 className="font-semibold">Select a window</h2>
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title"
            className="ml-auto w-64 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm"
          />
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800">
            Cancel
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 overflow-auto p-3 md:grid-cols-3">
          {error && <p className="col-span-full text-red-300">{error}</p>}
          {!windows && !error && <p className="col-span-full text-slate-400">Loading windows…</p>}
          {windows && shown.length === 0 && <p className="col-span-full text-slate-400">No capturable windows found.</p>}
          {shown.map((w) => (
            <button
              key={w.id}
              onClick={() => onPick(w.id)}
              className="rounded border border-slate-700 bg-slate-950 p-2 text-left hover:border-sky-500"
            >
              <img src={w.thumbnail} alt="" className="h-28 w-full rounded bg-slate-800 object-contain" />
              <div className="mt-2 flex items-center gap-2">
                {w.appIcon && <img src={w.appIcon} alt="" className="h-4 w-4" />}
                <span className="truncate text-sm" title={w.title}>
                  {w.title}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
