import { queryNtp, type NtpReading } from './ntp';
import type { TimeStamp } from '../../shared/types';

export interface HttpsReading {
  /** Server clock minus local clock, in ms. */
  offsetMs: number;
  rttMs: number;
  server: string;
  label: string;
}

export interface TimeServiceDeps {
  ntp: (host: string) => Promise<NtpReading>;
  https: () => Promise<HttpsReading>;
  now: () => number;
}

interface HttpsSource {
  url: string;
  label: string;
  parse: (headers: Headers, body: string) => number | null;
}

/** Ordered list of trusted HTTPS time sources. Cloudflare's trace has sub-second precision. */
const HTTPS_SOURCES: HttpsSource[] = [
  {
    url: 'https://www.cloudflare.com/cdn-cgi/trace',
    label: 'Cloudflare',
    parse: (_h, body) => {
      const m = /^ts=(\d+(?:\.\d+)?)$/m.exec(body);
      return m ? Number(m[1]) * 1000 : null;
    }
  },
  {
    url: 'https://time.gov/',
    label: 'time.gov',
    parse: (h) => {
      const d = h.get('date');
      const t = d ? Date.parse(d) : NaN;
      return Number.isNaN(t) ? null : t;
    }
  }
];

async function httpsReading(src: HttpsSource, timeoutMs = 4000): Promise<HttpsReading> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const t1 = Date.now();
    const res = await fetch(src.url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
    const t4 = Date.now();
    const body = await res.text();
    const server = src.parse(res.headers, body);
    if (server === null) throw new Error(`${src.label}: no usable time in response`);
    const mid = (t1 + t4) / 2;
    return { offsetMs: server - mid, rttMs: t4 - t1, server: new URL(src.url).host, label: src.label };
  } finally {
    clearTimeout(timer);
  }
}

async function defaultHttps(): Promise<HttpsReading> {
  const errors: string[] = [];
  for (const src of HTTPS_SOURCES) {
    try {
      return await httpsReading(src);
    } catch (e) {
      errors.push(`${src.label}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.join('; '));
}

const NIST_HOSTS = /(^|\.)nist\.gov$/i;

export class TimeService {
  private deps: TimeServiceDeps;

  constructor(
    private getHost: () => string,
    deps?: Partial<TimeServiceDeps>
  ) {
    this.deps = {
      ntp: (h) => queryNtp(h),
      https: defaultHttps,
      now: () => Date.now(),
      ...deps
    };
  }

  /** Acquire an authoritative timestamp now. Never throws: falls back NTP -> HTTPS -> local. */
  async acquire(): Promise<TimeStamp> {
    const host = this.getHost();
    const reasons: string[] = [];

    try {
      const r = await this.deps.ntp(host);
      return this.build('NTP', r.offsetMs, r.rttMs, host, NIST_HOSTS.test(host) ? 'NIST NTP' : `NTP (${host})`);
    } catch (e) {
      reasons.push(`NTP ${host}: ${(e as Error).message}`);
    }

    try {
      const r = await this.deps.https();
      return this.build('HTTPS', r.offsetMs, r.rttMs, r.server, `HTTPS (${r.label})`, reasons.join('; '));
    } catch (e) {
      reasons.push(`HTTPS: ${(e as Error).message}`);
    }

    const local = this.deps.now();
    return {
      utc: new Date(local).toISOString(),
      source: 'LOCAL_FALLBACK',
      sourceLabel: 'Local Fallback (unverified)',
      server: 'local',
      rttMs: null,
      driftMs: null,
      localClock: new Date(local).toISOString(),
      fallbackReason: reasons.join('; ')
    };
  }

  private build(
    source: TimeStamp['source'],
    offsetMs: number,
    rttMs: number,
    server: string,
    sourceLabel: string,
    fallbackReason?: string
  ): TimeStamp {
    const local = this.deps.now();
    const stamp: TimeStamp = {
      utc: new Date(Math.round(local + offsetMs)).toISOString(),
      source,
      sourceLabel,
      server,
      rttMs: Math.round(rttMs),
      driftMs: Math.round(-offsetMs),
      localClock: new Date(local).toISOString()
    };
    if (fallbackReason) stamp.fallbackReason = fallbackReason;
    return stamp;
  }
}
