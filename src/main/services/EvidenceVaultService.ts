import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  SCHEMA_VERSION,
  type CaptureMeta,
  type EvidenceSidecar,
  type HistoryRecord,
  type StampOptions,
  type VerifyResult
} from '../../shared/types';

export const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

const MAX_HISTORY = 200;

export function fileStem(utcIso: string, evidenceId: string): string {
  const compact = utcIso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${compact}_${evidenceId.slice(0, 8)}`;
}

export function buildSidecar(
  meta: CaptureMeta,
  stamp: StampOptions,
  stampedSha256: string,
  files: { png: string; raw: string }
): EvidenceSidecar {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'AuditFrame', version: meta.system.appVersion },
    evidenceId: meta.evidenceId,
    files,
    hashes: { rawSha256: meta.rawSha256, stampedSha256, algorithm: 'SHA-256' },
    timestamp: {
      authoritativeUtc: meta.time.utc,
      source: meta.time.source,
      sourceLabel: meta.time.sourceLabel,
      server: meta.time.server,
      rttMs: meta.time.rttMs,
      ...(meta.time.fallbackReason ? { fallbackReason: meta.time.fallbackReason } : {})
    },
    localClock: { iso: meta.time.localClock, driftMs: meta.time.driftMs },
    geolocation: meta.geo,
    system: meta.system,
    capture: {
      mode: meta.mode,
      sourceTitle: meta.sourceTitle,
      width: meta.width,
      height: meta.height,
      displays: meta.displays
    },
    stamp,
    auditNote: stamp.note,
    authenticity: [],
    sync: [],
    redactions: []
  };
}

export class EvidenceVaultService {
  private history: HistoryRecord[] | null = null;

  /**
   * @param dataDir app-private directory holding raw captures and the history index.
   * @param getSaveDir user-visible output directory for the PNG + sidecar.
   */
  constructor(
    private dataDir: string,
    private getSaveDir: () => string
  ) {}

  private get indexPath() {
    return path.join(this.dataDir, 'history.json');
  }
  private get rawDir() {
    return path.join(this.dataDir, 'raw');
  }

  async save(
    meta: CaptureMeta,
    rawPng: Buffer,
    stampedPng: Buffer,
    stamp: StampOptions
  ): Promise<{ record: HistoryRecord; sidecar: EvidenceSidecar }> {
    const outDir = this.getSaveDir();
    await fs.mkdir(outDir, { recursive: true });
    await fs.mkdir(this.rawDir, { recursive: true });

    const stem = fileStem(meta.time.utc, meta.evidenceId);
    const pngPath = path.join(outDir, `${stem}.png`);
    const jsonPath = path.join(outDir, `${stem}.evidence.json`);
    const rawPath = path.join(this.rawDir, `${meta.evidenceId}.png`);

    const stampedSha = sha256(stampedPng);
    const sidecar = buildSidecar(meta, stamp, stampedSha, { png: path.basename(pngPath), raw: rawPath });

    await writeExclusive(rawPath, rawPng);
    await writeExclusive(pngPath, stampedPng);
    await writeExclusive(jsonPath, Buffer.from(JSON.stringify(sidecar, null, 2) + '\n'));

    const thumb = await sharp(stampedPng).resize({ width: 160, height: 100, fit: 'inside' }).webp({ quality: 70 }).toBuffer();
    const record: HistoryRecord = {
      evidenceId: meta.evidenceId,
      savedAt: new Date().toISOString(),
      pngPath,
      jsonPath,
      rawPath,
      stampedSha256: stampedSha,
      rawSha256: meta.rawSha256,
      note: stamp.note,
      mode: meta.mode,
      utc: meta.time.utc,
      source: meta.time.source,
      thumbnail: `data:image/webp;base64,${thumb.toString('base64')}`
    };
    const list = await this.list();
    list.unshift(record);
    this.history = list.slice(0, MAX_HISTORY);
    await this.persist();
    return { record, sidecar };
  }

  async list(): Promise<HistoryRecord[]> {
    if (this.history) return this.history;
    try {
      const parsed = JSON.parse(await fs.readFile(this.indexPath, 'utf8'));
      this.history = Array.isArray(parsed) ? (parsed as HistoryRecord[]) : [];
    } catch {
      this.history = [];
    }
    return this.history;
  }

  async get(evidenceId: string): Promise<HistoryRecord | undefined> {
    return (await this.list()).find((r) => r.evidenceId === evidenceId);
  }

  /** Re-hash files on disk and compare with the sidecar and history index. */
  async verify(evidenceId: string): Promise<VerifyResult> {
    const rec = await this.get(evidenceId);
    if (!rec) return { ok: false, stampedMatches: false, rawMatches: false, problems: ['Record not found'] };
    const problems: string[] = [];
    let stampedMatches = false;
    let rawMatches = false;
    let sidecar: EvidenceSidecar | null = null;

    try {
      sidecar = JSON.parse(await fs.readFile(rec.jsonPath, 'utf8')) as EvidenceSidecar;
    } catch {
      problems.push('Sidecar JSON missing or unreadable');
    }

    try {
      const actual = sha256(await fs.readFile(rec.pngPath));
      const expected = sidecar?.hashes.stampedSha256 ?? rec.stampedSha256;
      stampedMatches = actual === expected && actual === rec.stampedSha256;
      if (!stampedMatches) problems.push('Stamped PNG hash does not match recorded hash');
    } catch {
      problems.push('Stamped PNG missing');
    }

    try {
      const actual = sha256(await fs.readFile(rec.rawPath));
      const expected = sidecar?.hashes.rawSha256 ?? rec.rawSha256;
      rawMatches = actual === expected && actual === rec.rawSha256;
      if (!rawMatches) problems.push('Raw capture hash does not match recorded hash');
    } catch {
      problems.push('Raw capture missing from vault');
    }

    return { ok: stampedMatches && rawMatches && sidecar !== null, stampedMatches, rawMatches, problems };
  }

  private async persist() {
    await fs.mkdir(this.dataDir, { recursive: true });
    const tmp = this.indexPath + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.history ?? []));
    await fs.rename(tmp, this.indexPath);
  }
}

async function writeExclusive(file: string, data: Buffer): Promise<void> {
  // 'wx' refuses to overwrite existing evidence.
  await fs.writeFile(file, data, { flag: 'wx' });
}
