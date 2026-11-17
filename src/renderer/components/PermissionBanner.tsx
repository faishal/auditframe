import type { AppState } from '../../shared/types';

export function PermissionBanner({ state, onOpen }: { state: AppState; onOpen: (kind: 'screen' | 'location') => void }) {
  const { permissions, settings, platform, sessionType } = state;
  const items: Array<{ key: string; text: string; action?: () => void; actionLabel?: string }> = [];

  if (permissions.screen !== 'granted' && permissions.screen !== 'not-required') {
    items.push({
      key: 'screen',
      text:
        permissions.screen === 'not-determined'
          ? 'Screen Recording permission has not been requested yet. Your first capture will prompt for it. After allowing it, restart AuditFrame.'
          : 'Screen Recording is not allowed for AuditFrame. Enable it in System Settings, then restart the app.',
      action: () => onOpen('screen'),
      actionLabel: 'Open Screen Recording settings'
    });
  }
  if (settings.includeLocation && (permissions.location === 'denied' || permissions.location === 'restricted')) {
    items.push({
      key: 'location',
      text: 'Location access is denied. Captures will use approximate IP-based location (labelled IP-Approx) until you allow it.',
      action: platform === 'linux' ? undefined : () => onOpen('location'),
      actionLabel: platform === 'darwin' ? 'Open Location Services settings' : 'Open location settings'
    });
  }
  if (platform === 'linux' && sessionType === 'wayland') {
    items.push({
      key: 'wayland',
      text: 'Wayland session detected. Your desktop will show a screen-sharing prompt for each capture. Window listing and region selection depend on the PipeWire portal.'
    });
  }
  if (items.length === 0) return null;

  return (
    <div className="space-y-2 px-4 pt-3">
      {items.map((i) => (
        <div key={i.key} className="flex items-center justify-between gap-3 rounded border border-amber-700 bg-amber-950/50 px-3 py-2 text-sm text-amber-100">
          <span>{i.text}</span>
          {i.action && (
            <button onClick={i.action} className="shrink-0 rounded bg-amber-700 px-2 py-1 text-xs font-medium hover:bg-amber-600">
              {i.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
