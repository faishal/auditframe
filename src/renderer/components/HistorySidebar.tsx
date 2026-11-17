import { useState } from 'react';
import type { HistoryRecord, VerifyResult } from '../../shared/types';

export function HistorySidebar({ records }: { records: HistoryRecord[]; onChanged: (r: HistoryRecord[]) => void }) {
  const [results, setResults] = useState<Record<string, VerifyResult | 'pending'>>({});

  const verify = async (id: string) => {
    setResults((r) => ({ ...r, [id]: 'pending' }));
    try {
      const res = await window.auditframe.verifyHistory(id);
      setResults((r) => ({ ...r, [id]: res }));
    } catch (e) {
      setResults((r) => ({ ...r, [id]: { ok: false, stampedMatches: false, rawMatches: false, problems: [(e as Error).message] } }));
    }
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900/50">
      <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-300">Capture history</h2>
      <ul className="flex-1 space-y-2 overflow-auto p-3">
        {records.length === 0 && <li className="text-sm text-slate-500">No captures yet.</li>}
        {records.map((r) => {
          const v = results[r.evidenceId];
          return (
            <li key={r.evidenceId} className="rounded border border-slate-800 bg-slate-900 p-2">
              <img src={r.thumbnail} alt="" className="h-20 w-full rounded bg-slate-800 object-contain" />
              <div className="mt-1 truncate text-xs text-slate-300" title={r.note}>
                {r.note || 'No note'}
              </div>
              <div className="font-mono text-[10px] text-slate-500">{r.utc.replace('.000Z', 'Z')}</div>
              <div className="font-mono text-[10px] text-slate-500">
                {r.evidenceId.slice(0, 8)} · {r.source}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => void verify(r.evidenceId)} className="rounded bg-slate-800 px-2 py-0.5 text-xs hover:bg-slate-700">
                  Verify hash
                </button>
                <button onClick={() => void window.auditframe.revealHistory(r.evidenceId)} className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800">
                  Show
                </button>
                {v === 'pending' && <span className="text-xs text-slate-400">checking…</span>}
                {v && v !== 'pending' && (
                  <span className={`text-xs ${v.ok ? 'text-emerald-400' : 'text-red-400'}`} title={v.problems.join('\n')} role="status">
                    {v.ok ? '✓ Verified' : '✗ Mismatch'}
                  </span>
                )}
              </div>
              {v && v !== 'pending' && !v.ok && <p className="mt-1 text-[10px] text-red-300">{v.problems.join('; ')}</p>}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
