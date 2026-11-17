import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAMP } from '../src/shared/defaults';
import type { CaptureMeta } from '../src/shared/types';
import { EvidenceVaultService, fileStem, sha256 } from '../src/main/services/EvidenceVaultService';

const png = (c: number) =>
  sharp({ create: { width: 20, height: 20, channels: 4, background: { r: c, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();

function meta(raw: Buffer): CaptureMeta {
  return {
    evidenceId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    mode: 'region',
    sourceTitle: 'Region',
    width: 20,
    height: 20,
    displays: [],
    rawSha256: sha256(raw),
    time: {
      utc: '2025-03-04T05:06:07.123Z',
      source: 'HTTPS',
      sourceLabel: 'HTTPS (time.gov)',
      server: 'time.gov',
      rttMs: 10,
      driftMs: 5,
      localClock: '2025-03-04T05:06:07.128Z'
    },
    geo: { status: 'disabled' },
    system: { hostname: 'h', os: 'linux', osVersion: '6', arch: 'x64', appVersion: '1.0.0' }
  };
}

describe('EvidenceVaultService', () => {
  it('builds filesystem-safe stems', () => {
    expect(fileStem('2025-03-04T05:06:07.123Z', 'aaaaaaaa-bbbb')).toBe('20250304T050607Z_aaaaaaaa');
  });

  it('saves PNG + sidecar, lists, verifies, and detects tampering', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'af-'));
    const vault = new EvidenceVaultService(path.join(dir, 'data'), () => path.join(dir, 'out'));
    const raw = await png(10);
    const stamped = await png(99);
    const { record, sidecar } = await vault.save(meta(raw), raw, stamped, { ...DEFAULT_STAMP, note: 'SOC2 CC6.1' });

    const onDisk = JSON.parse(await readFile(record.jsonPath, 'utf8'));
    expect(onDisk.hashes.rawSha256).toBe(sha256(raw));
    expect(onDisk.hashes.stampedSha256).toBe(sha256(stamped));
    expect(onDisk.auditNote).toBe('SOC2 CC6.1');
    expect(sidecar.schemaVersion).toBe(1);
    expect((await vault.list())[0].evidenceId).toBe(record.evidenceId);

    expect((await vault.verify(record.evidenceId)).ok).toBe(true);

    await writeFile(record.pngPath, await png(1));
    const bad = await vault.verify(record.evidenceId);
    expect(bad.ok).toBe(false);
    expect(bad.stampedMatches).toBe(false);
    expect(bad.rawMatches).toBe(true);
  });

  it('refuses to overwrite existing evidence', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'af-'));
    const vault = new EvidenceVaultService(path.join(dir, 'data'), () => path.join(dir, 'out'));
    const raw = await png(10);
    await vault.save(meta(raw), raw, raw, DEFAULT_STAMP);
    await expect(vault.save(meta(raw), raw, raw, DEFAULT_STAMP)).rejects.toThrow();
  });
});
