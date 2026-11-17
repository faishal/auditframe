import { useEffect, useRef, useState } from 'react';
import type { OverlayInit } from '../../shared/ipc';

interface Pt {
  x: number;
  y: number;
}

const rectOf = (a: Pt, b: Pt) => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y)
});

export function Overlay() {
  const [init, setInit] = useState<OverlayInit | null>(null);
  const [start, setStart] = useState<Pt | null>(null);
  const [cur, setCur] = useState<Pt>({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  const initRef = useRef<OverlayInit | null>(null);

  useEffect(() => {
    window.auditframeOverlay.onInit((i) => {
      initRef.current = i;
      setInit(i);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.auditframeOverlay.cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sel = start ? rectOf(start, cur) : null;
  // Live size in physical pixels, matching the saved capture.
  const sf = init?.scaleFactor ?? 1;
  const label = sel ? `${Math.round(sel.width * sf)} x ${Math.round(sel.height * sf)}` : '';

  const finish = (end: Pt) => {
    if (!start || !initRef.current) return;
    const r = rectOf(start, end);
    setStart(null);
    if (r.width < 3 || r.height < 3) return;
    window.auditframeOverlay.submit({ displayId: initRef.current.displayId, ...r });
  };

  return (
    <div
      className="fixed inset-0 select-none"
      style={{ cursor: 'crosshair' }}
      onMouseDown={(e) => {
        if (e.button === 2) return window.auditframeOverlay.cancel();
        setStart({ x: e.clientX, y: e.clientY });
        setCur({ x: e.clientX, y: e.clientY });
      }}
      onMouseMove={(e) => {
        setHover(true);
        setCur({ x: e.clientX, y: e.clientY });
      }}
      onMouseUp={(e) => finish({ x: e.clientX, y: e.clientY })}
      onContextMenu={(e) => e.preventDefault()}
    >
      {init && <img src={init.image} alt="" draggable={false} className="absolute inset-0 h-full w-full" />}
      <div className="absolute inset-0 bg-black/40" style={sel ? { clipPath: holeClip(sel) } : undefined} />
      {/* crosshair guides */}
      {hover && !sel && (
        <>
          <div className="absolute top-0 h-full w-px bg-sky-400/70" style={{ left: cur.x }} />
          <div className="absolute left-0 h-px w-full bg-sky-400/70" style={{ top: cur.y }} />
        </>
      )}
      {sel && (
        <>
          <div
            className="absolute border border-sky-400"
            style={{ left: sel.x, top: sel.y, width: sel.width, height: sel.height, boxShadow: '0 0 0 1px rgba(0,0,0,.6)' }}
          />
          <div
            className="absolute rounded bg-slate-900/90 px-2 py-0.5 font-mono text-xs text-white"
            style={{ left: sel.x, top: Math.max(0, sel.y - 24) }}
          >
            {label}
          </div>
        </>
      )}
      {!sel && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded bg-slate-900/90 px-3 py-1 text-sm text-white">
          Drag to select a region. Esc to cancel.
        </div>
      )}
    </div>
  );
}

/** Dim everything except the selected rectangle. */
function holeClip(r: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width: w, height: h } = r;
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x}px ${y + h}px, ${x + w}px ${y + h}px, ${x + w}px ${y}px, ${x}px ${y}px)`;
}
