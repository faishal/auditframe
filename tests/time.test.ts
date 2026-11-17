import { describe, expect, it } from 'vitest';
import { buildRequest, msToNtp, ntpToMs, parseResponse } from '../src/main/services/ntp';
import { TimeService } from '../src/main/services/TimeService';
import { formatDrift, formatTime } from '../src/shared/timeFormat';

function serverReply(t1: number, t2: number, t3: number, over: Partial<{ li: number; stratum: number }> = {}) {
  const b = Buffer.alloc(48);
  b[0] = ((over.li ?? 0) << 6) | (4 << 3) | 4;
  b[1] = over.stratum ?? 1;
  const o = msToNtp(t1);
  b.writeUInt32BE(o.seconds >>> 0, 24);
  b.writeUInt32BE(o.fraction >>> 0, 28);
  const r = msToNtp(t2);
  b.writeUInt32BE(r.seconds >>> 0, 32);
  b.writeUInt32BE(r.fraction >>> 0, 36);
  const x = msToNtp(t3);
  b.writeUInt32BE(x.seconds >>> 0, 40);
  b.writeUInt32BE(x.fraction >>> 0, 44);
  return b;
}

describe('ntp codec', () => {
  it('builds a 48-byte v4 client request', () => {
    const b = buildRequest(1_700_000_000_000);
    expect(b.length).toBe(48);
    expect(b[0]).toBe(0x23);
  });

  it('round-trips ms through NTP timestamps', () => {
    const ms = 1_700_000_000_123;
    const { seconds, fraction } = msToNtp(ms);
    expect(Math.round(ntpToMs(seconds, fraction))).toBe(ms);
  });

  it('computes offset and rtt', () => {
    const t1 = 1_700_000_000_000;
    // Server is 500 ms ahead; 40 ms each way; 2 ms processing.
    const t2 = t1 + 40 + 500;
    const t3 = t2 + 2;
    const t4 = t1 + 40 + 2 + 40;
    const r = parseResponse(serverReply(t1, t2, t3), t1, t4);
    expect(r.offsetMs).toBeCloseTo(500, 0);
    expect(r.rttMs).toBeCloseTo(80, 0);
  });

  it('rejects unsynchronised, kiss-of-death, and mismatched replies', () => {
    const t1 = 1_700_000_000_000;
    expect(() => parseResponse(serverReply(t1, t1, t1, { li: 3 }), t1, t1)).toThrow(/unsynchronised/);
    expect(() => parseResponse(serverReply(t1, t1, t1, { stratum: 0 }), t1, t1)).toThrow(/kiss/);
    expect(() => parseResponse(serverReply(t1 + 5, t1, t1), t1, t1)).toThrow(/originate/);
    expect(() => parseResponse(Buffer.alloc(10), t1, t1)).toThrow(/short/);
  });
});

describe('formatTime', () => {
  const d = new Date('2025-03-04T05:06:07.089Z');
  it('formats default ISO in UTC', () => {
    expect(formatTime(d, 'YYYY-MM-DDTHH:mm:ssZ', 'utc')).toBe('2025-03-04T05:06:07Z');
  });
  it('formats local with explicit offset', () => {
    expect(formatTime(d, 'YYYY-MM-DDTHH:mm:ssZ', 'local', 330)).toBe('2025-03-04T10:36:07+05:30');
    expect(formatTime(d, 'HH:mm:ss.SSS Z', 'local', -300)).toBe('00:06:07.089 -05:00');
  });
  it('formats drift', () => {
    expect(formatDrift(null)).toBe('unknown');
    expect(formatDrift(-42)).toBe('-42 ms');
    expect(formatDrift(1500)).toBe('+1.500 s');
  });
});

describe('TimeService fallback chain', () => {
  const now = () => 1_700_000_000_000;
  it('uses NTP when available and tags NIST', async () => {
    const svc = new TimeService(() => 'time.nist.gov', {
      now,
      ntp: async () => ({ offsetMs: 250, rttMs: 30, stratum: 1 })
    });
    const t = await svc.acquire();
    expect(t.source).toBe('NTP');
    expect(t.sourceLabel).toBe('NIST NTP');
    expect(t.driftMs).toBe(-250);
    expect(t.utc).toBe(new Date(now() + 250).toISOString());
  });

  it('falls back to HTTPS then local, recording reasons', async () => {
    const failNtp = async () => {
      throw new Error('blocked');
    };
    const https = new TimeService(() => 'pool.ntp.org', {
      now,
      ntp: failNtp,
      https: async () => ({ offsetMs: -100, rttMs: 90, server: 'time.gov', label: 'time.gov' })
    });
    const a = await https.acquire();
    expect(a.source).toBe('HTTPS');
    expect(a.fallbackReason).toMatch(/blocked/);

    const local = new TimeService(() => 'x', {
      now,
      ntp: failNtp,
      https: async () => {
        throw new Error('offline');
      }
    });
    const b = await local.acquire();
    expect(b.source).toBe('LOCAL_FALLBACK');
    expect(b.driftMs).toBeNull();
    expect(b.fallbackReason).toMatch(/offline/);
  });
});
