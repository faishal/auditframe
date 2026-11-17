import { useEffect, useState } from 'react';
import type { DraftSummary, HistoryRecord, StampFields, StampOptions } from '../../shared/types';

const FIELD_LABELS: Record<keyof StampFields, string> = {
  evidenceId: 'Evidence ID',
  timestamp: 'Authoritative timestamp + source',
  localClock: 'System clock + drift',
  location: 'Location',
  system: 'Hostname / OS / resolution',
  note: 'Audit note',
  rawHash: 'Raw SHA-256'
};

interface Props {
  drafts: DraftSummary[];
  active: number;
  onActive: (i: number) => void;
  stamp: StampOptions;
  onStamp: (s: StampOptions) => void;
  onSaved: (r: HistoryRecord) => void | Promise<void>;
  onCopied: () => void;
  onDiscard: () => void;
  onError: (m: string) => void;
}

export function Review({ drafts, active, onActive, stamp, onStamp, onSaved, onCopied, onDiscard, onError }: Props) {
  const draft = drafts[active];
  const [preview, setPreview] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // Debounced live preview. A stale response is ignored if inputs changed in the meantime.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      window.auditframe
        .previewDraft(draft.draftId, stamp)
        .then((url) => !cancelled && setPreview(url))
        .catch((e: Error) => !cancelled && onError(e.message));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draft.draftId, stamp, onError]);

  const set = <K extends keyof StampOptions>(k: K, v: StampOptions[K]) => onStamp({ ...stamp, [k]: v });
  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    try {
      await fn();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const m = draft.meta;
  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col p-4">
        {drafts.length > 1 && (
          <div className="mb-2 flex gap-2" role="tablist">
            {drafts.map((d, i) => (
              <button
                key={d.draftId}
                role="tab"
                aria-selected={i === active}
                onClick={() => onActive(i)}
                className={`rounded px-3 py-1 text-sm ${i === active ? 'bg-sky-600' : 'bg-slate-800 hover:bg-slate-700'}`}
              >
                Screen {i + 1}
              </button>
            ))}
          </div>
        )}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded border border-slate-800 bg-[conic-gradient(#0f172a_25%,#111c33_0_50%,#0f172a_0_75%,#111c33_0)] bg-[length:20px_20px]">
          {preview ? <img src={preview} alt="Stamped evidence preview" className="max-h-full max-w-full object-contain" /> : <span className="text-slate-500">Rendering preview…</span>}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {m.sourceTitle} · {m.width}×{m.height}px · {m.time.sourceLabel}
          {m.time.source === 'LOCAL_FALLBACK' && <span className="ml-1 text-amber-300">(unverified: no network time source reachable)</span>}
          {m.geo.status === 'ok' && <span> · {m.geo.method}</span>}
          {m.geo.status === 'unavailable' && <span className="text-amber-300"> · location unavailable</span>}
        </p>
      </section>

      <aside className="w-80 shrink-0 space-y-4 overflow-auto border-l border-slate-800 p-4 text-sm">
        <div>
          <label className="mb-1 block text-slate-300" htmlFor="note">
            Audit control note
          </label>
          <input
            id="note"
            value={stamp.note}
            maxLength={500}
            onChange={(e) => set('note', e.target.value)}
            placeholder="SOC2 CC6.1 - Access Review"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-slate-300">Mode</legend>
          <Segmented
            value={stamp.mode}
            options={[
              ['banner', 'Append banner'],
              ['watermark', 'Watermark']
            ]}
            onChange={(v) => set('mode', v)}
          />
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-slate-300">Position</legend>
          <Segmented
            value={stamp.position}
            options={[
              ['top', 'Top'],
              ['bottom', 'Bottom'],
              ['left', 'Left'],
              ['right', 'Right']
            ]}
            onChange={(v) => set('position', v)}
          />
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-slate-300">Theme</legend>
          <Segmented
            value={stamp.theme}
            options={[
              ['dark', 'Dark'],
              ['light', 'Light']
            ]}
            onChange={(v) => set('theme', v)}
          />
        </fieldset>

        <div>
          <label className="flex justify-between text-slate-300" htmlFor="fs">
            Font size <span>{stamp.fontSize}px</span>
          </label>
          <input id="fs" type="range" min={9} max={32} value={stamp.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))} className="w-full" />
        </div>
        <div className={stamp.mode === 'watermark' ? '' : 'opacity-40'}>
          <label className="flex justify-between text-slate-300" htmlFor="op">
            Opacity (watermark) <span>{Math.round(stamp.opacity * 100)}%</span>
          </label>
          <input
            id="op"
            type="range"
            min={10}
            max={100}
            disabled={stamp.mode !== 'watermark'}
            value={Math.round(stamp.opacity * 100)}
            onChange={(e) => set('opacity', Number(e.target.value) / 100)}
            className="w-full"
          />
        </div>

        <fieldset>
          <legend className="mb-1 text-slate-300">Fields</legend>
          <div className="space-y-1">
            {(Object.keys(FIELD_LABELS) as Array<keyof StampFields>).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={stamp.fields[k]} onChange={(e) => set('fields', { ...stamp.fields, [k]: e.target.checked })} />
                {FIELD_LABELS[k]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-slate-800 pt-4">
          <button
            disabled={working}
            onClick={() => run(async () => void (await onSaved((await window.auditframe.saveDraft(draft.draftId, stamp)).record)))}
            className="rounded bg-sky-600 px-3 py-2 font-medium hover:bg-sky-500 disabled:opacity-50"
          >
            Save PNG + JSON
          </button>
          <button
            disabled={working}
            onClick={() =>
              run(async () => {
                await window.auditframe.copyDraft(draft.draftId, stamp);
                onCopied();
              })
            }
            className="rounded bg-slate-800 px-3 py-2 hover:bg-slate-700 disabled:opacity-50"
          >
            Copy image to clipboard
          </button>
          <button disabled={working} onClick={onDiscard} className="rounded px-3 py-2 text-slate-400 hover:bg-slate-800">
            Discard
          </button>
        </div>
      </aside>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex overflow-hidden rounded border border-slate-700" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={v === value}
          onClick={() => onChange(v)}
          className={`flex-1 px-2 py-1 ${v === value ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
