import type { GeoRequestResult } from '../../shared/ipc';
import type { GeoFix, PermissionState } from '../../shared/types';

export interface LocationDeps {
  /** Ask the renderer (Chromium) for an OS-level fix. */
  requestOs: () => Promise<GeoRequestResult>;
  ipLookup: () => Promise<{ lat: number; lon: number; label?: string; accuracyM: number }>;
  reverseGeocode: (lat: number, lon: number) => Promise<string | undefined>;
}

/** City-level accuracy assumed for IP geolocation, in meters. */
export const IP_ACCURACY_M = 25_000;

async function getJson(url: string, timeoutMs = 4000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json', 'User-Agent': 'AuditFrame/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const label = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(', ') || undefined;

export const defaultIpLookup: LocationDeps['ipLookup'] = async () => {
  const errors: string[] = [];
  try {
    const j = await getJson('https://ipapi.co/json/');
    if (typeof j.latitude === 'number' && typeof j.longitude === 'number') {
      return { lat: j.latitude, lon: j.longitude, accuracyM: IP_ACCURACY_M, label: label(j.city, j.region, j.country_name) };
    }
    errors.push('ipapi.co: no coordinates');
  } catch (e) {
    errors.push(`ipapi.co: ${(e as Error).message}`);
  }
  try {
    const j = await getJson('https://ipwho.is/');
    if (j.success !== false && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
      return { lat: j.latitude, lon: j.longitude, accuracyM: IP_ACCURACY_M, label: label(j.city, j.region, j.country) };
    }
    errors.push('ipwho.is: no coordinates');
  } catch (e) {
    errors.push(`ipwho.is: ${(e as Error).message}`);
  }
  throw new Error(errors.join('; '));
};

export const defaultReverseGeocode: LocationDeps['reverseGeocode'] = async (lat, lon) => {
  try {
    const j = await getJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`,
      3000
    );
    const a = j?.address ?? {};
    return label(a.city ?? a.town ?? a.village ?? a.county, a.state, a.country_code?.toUpperCase());
  } catch {
    return undefined;
  }
};

export class LocationService {
  private osState: PermissionState = 'unknown';
  private deps: LocationDeps;

  constructor(
    private opts: { enabled: () => boolean; reverseGeocode: () => boolean },
    deps: Pick<LocationDeps, 'requestOs'> & Partial<LocationDeps>
  ) {
    this.deps = { ipLookup: defaultIpLookup, reverseGeocode: defaultReverseGeocode, ...deps };
  }

  /** Best-known OS location permission, inferred from the last request. */
  get permission(): PermissionState {
    return this.osState;
  }

  async acquire(): Promise<GeoFix> {
    if (!this.opts.enabled()) return { status: 'disabled' };

    let osReason = '';
    try {
      const r = await this.deps.requestOs();
      if (r.ok && r.lat !== undefined && r.lon !== undefined) {
        this.osState = 'granted';
        const fix: GeoFix = { status: 'ok', method: 'GPS/OS', lat: r.lat, lon: r.lon, accuracyM: r.accuracy };
        if (this.opts.reverseGeocode()) fix.label = await this.deps.reverseGeocode(r.lat, r.lon);
        return fix;
      }
      if (r.errorCode === 1) this.osState = 'denied';
      osReason = r.errorCode === 1 ? 'OS location permission denied' : r.message || 'OS location unavailable';
    } catch (e) {
      osReason = (e as Error).message;
    }

    try {
      const ip = await this.deps.ipLookup();
      return {
        status: 'ok',
        method: 'IP-Approx',
        lat: ip.lat,
        lon: ip.lon,
        accuracyM: ip.accuracyM,
        label: ip.label,
        reason: osReason
      };
    } catch (e) {
      return { status: 'unavailable', reason: `${osReason}; IP lookup failed: ${(e as Error).message}` };
    }
  }
}
