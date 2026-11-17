import dgram from 'node:dgram';

/** Seconds between the NTP epoch (1900) and the Unix epoch (1970). */
export const NTP_UNIX_DELTA = 2_208_988_800;
const PACKET_SIZE = 48;

export function msToNtp(ms: number): { seconds: number; fraction: number } {
  const seconds = Math.floor(ms / 1000) + NTP_UNIX_DELTA;
  const fraction = Math.floor(((ms % 1000) / 1000) * 2 ** 32);
  return { seconds, fraction };
}

export function ntpToMs(seconds: number, fraction: number): number {
  return (seconds - NTP_UNIX_DELTA) * 1000 + (fraction / 2 ** 32) * 1000;
}

/** Build an SNTPv4 client request. The transmit timestamp is echoed back as the originate timestamp. */
export function buildRequest(nowMs: number): Buffer {
  const buf = Buffer.alloc(PACKET_SIZE);
  buf[0] = 0x23; // LI=0, VN=4, Mode=3 (client)
  const { seconds, fraction } = msToNtp(nowMs);
  buf.writeUInt32BE(seconds >>> 0, 40);
  buf.writeUInt32BE(fraction >>> 0, 44);
  return buf;
}

export interface NtpReading {
  /** Server clock minus local clock, in ms (midpoint-corrected). */
  offsetMs: number;
  /** Network round trip excluding server processing time. */
  rttMs: number;
  stratum: number;
}

/**
 * Parse an NTP response. `t1` is the local send time and `t4` the local receive time (ms).
 * Throws on malformed, unsynchronised, kiss-of-death, or non-matching replies.
 */
export function parseResponse(buf: Buffer, t1: number, t4: number): NtpReading {
  if (buf.length < PACKET_SIZE) throw new Error('NTP response too short');
  const li = buf[0] >> 6;
  const mode = buf[0] & 0x7;
  const stratum = buf[1];
  if (mode !== 4 && mode !== 5) throw new Error(`Unexpected NTP mode ${mode}`);
  if (li === 3) throw new Error('NTP server clock is unsynchronised');
  if (stratum === 0) throw new Error('NTP kiss-of-death response');
  if (stratum > 15) throw new Error('NTP stratum out of range');

  // Originate timestamp must echo our request transmit time.
  const orgSec = buf.readUInt32BE(24);
  const orgFrac = buf.readUInt32BE(28);
  const sent = msToNtp(t1);
  if (orgSec !== sent.seconds >>> 0 || orgFrac !== sent.fraction >>> 0) {
    throw new Error('NTP originate timestamp mismatch');
  }

  const t2 = ntpToMs(buf.readUInt32BE(32), buf.readUInt32BE(36));
  const t3 = ntpToMs(buf.readUInt32BE(40), buf.readUInt32BE(44));
  if (t3 === ntpToMs(0, 0)) throw new Error('NTP transmit timestamp missing');

  const offsetMs = (t2 - t1 + (t3 - t4)) / 2;
  const rttMs = t4 - t1 - (t3 - t2);
  return { offsetMs, rttMs, stratum };
}

export function queryNtp(host: string, timeoutMs = 3000, port = 123): Promise<NtpReading> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`NTP timeout (${host}:${port})`))), timeoutMs);

    socket.once('error', (err) => finish(() => reject(err)));
    socket.once('message', (msg) => {
      const t4 = Date.now();
      finish(() => {
        try {
          resolve(parseResponse(msg, t1, t4));
        } catch (e) {
          reject(e);
        }
      });
    });

    // Date.now() has ms resolution; keep the exact value used in the packet for the originate check.
    const t1 = Date.now();
    socket.send(buildRequest(t1), port, host, (err) => {
      if (err) finish(() => reject(err));
    });
  });
}
