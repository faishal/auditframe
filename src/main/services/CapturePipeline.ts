import { randomUUID } from 'node:crypto';
import os from 'node:os';
import sharp from 'sharp';
import type { CaptureMeta, CaptureMode, DraftSummary, StampOptions, SystemInfo } from '../../shared/types';
import { NOOP_HOOKS, type PipelineHooks } from '../v2/interfaces';
import { CaptureService, type RawImage } from './CaptureService';
import { ComposerService } from './ComposerService';
import { EvidenceVaultService, sha256 } from './EvidenceVaultService';
import type { LocationService } from './LocationService';
import type { TimeService } from './TimeService';

interface Draft {
  meta: CaptureMeta;
  rawPng: Buffer;
}

const OS_NAMES: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

export function systemInfo(appVersion: string): SystemInfo {
  return {
    hostname: os.hostname(),
    os: OS_NAMES[process.platform] ?? process.platform,
    osVersion: typeof process.getSystemVersion === 'function' ? process.getSystemVersion() : os.release(),
    arch: process.arch,
    appVersion
  };
}

/** Orchestrates capture -> metadata -> draft, and draft -> stamped output. */
export class CapturePipeline {
  private drafts = new Map<string, Draft>();

  constructor(
    private deps: {
      capture: CaptureService;
      time: TimeService;
      location: LocationService;
      composer: ComposerService;
      vault: EvidenceVaultService;
      appVersion: string;
      hooks?: PipelineHooks;
    }
  ) {}

  private get hooks() {
    return this.deps.hooks ?? NOOP_HOOKS;
  }

  async run(mode: CaptureMode, windowId?: string): Promise<DraftSummary[]> {
    // Time and location are requested alongside the grab so the timestamp reflects the capture moment.
    const timeP = this.deps.time.acquire();
    const geoP = this.deps.location.acquire();
    let images: RawImage[];
    try {
      images = await this.grab(mode, windowId);
    } catch (e) {
      void timeP.catch(() => undefined);
      void geoP.catch(() => undefined);
      throw e;
    }
    const [time, geo] = await Promise.all([timeP, geoP]);

    const summaries: DraftSummary[] = [];
    for (const img of images) {
      let png = img.png;
      let { width, height } = img;
      // v2 hook: redaction runs before the raw hash is computed.
      for (const layer of this.hooks.redaction) {
        const out = await layer.redact({ png, width, height });
        png = Buffer.from(out.png);
      }
      const meta: CaptureMeta = {
        evidenceId: randomUUID(),
        mode,
        sourceTitle: img.sourceTitle,
        width,
        height,
        displays: img.displays,
        rawSha256: sha256(png),
        time,
        geo,
        system: systemInfo(this.deps.appVersion)
      };
      const draftId = meta.evidenceId;
      this.drafts.set(draftId, { meta, rawPng: png });
      summaries.push({ draftId, meta });
    }
    return summaries;
  }

  private grab(mode: CaptureMode, windowId?: string): Promise<RawImage[]> {
    switch (mode) {
      case 'screen':
        return this.deps.capture.captureCurrentScreen();
      case 'all':
        return this.deps.capture.captureAllScreens();
      case 'region':
        return this.deps.capture.captureRegion();
      case 'window':
        if (!windowId) throw new Error('No window selected');
        return this.deps.capture.captureWindow(windowId);
    }
  }

  private get(draftId: string): Draft {
    const d = this.drafts.get(draftId);
    if (!d) throw new Error('Draft not found (it may have been discarded)');
    return d;
  }

  async preview(draftId: string, stamp: StampOptions): Promise<string> {
    const d = this.get(draftId);
    const stamped = await this.deps.composer.compose(d.rawPng, d.meta, stamp);
    const small = await sharp(stamped).resize({ width: 1800, withoutEnlargement: true }).png({ compressionLevel: 1 }).toBuffer();
    return `data:image/png;base64,${small.toString('base64')}`;
  }

  async stampedPng(draftId: string, stamp: StampOptions): Promise<Buffer> {
    const d = this.get(draftId);
    return this.deps.composer.compose(d.rawPng, d.meta, stamp);
  }

  async save(draftId: string, stamp: StampOptions) {
    const d = this.get(draftId);
    const stamped = await this.deps.composer.compose(d.rawPng, d.meta, stamp);
    const { record, sidecar } = await this.deps.vault.save(d.meta, d.rawPng, stamped, stamp);
    // v2 hooks: authenticity providers attest the stamped PNG; sync providers upload the bundle.
    for (const p of this.hooks.sync) {
      try {
        await p.upload({ evidenceId: d.meta.evidenceId, stampedPng: stamped, rawPng: d.rawPng, sidecar, artifacts: [] });
      } catch (e) {
        console.error(`Sync provider ${p.id} failed`, e);
      }
    }
    this.drafts.delete(draftId);
    return record;
  }

  discard(draftId: string): void {
    this.drafts.delete(draftId);
  }
}
