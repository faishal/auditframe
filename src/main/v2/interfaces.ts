/**
 * v2 extension points. Interfaces only: nothing here is implemented in v1.
 * The capture pipeline accepts `PipelineHooks` and calls registered providers;
 * v1 registers none (see NOOP_HOOKS).
 */
import type { EvidenceSidecar } from '../../shared/types';

export interface AuthenticityArtifact {
  providerId: string;
  kind: 'rfc3161' | 'x509' | 'c2pa';
  /** Opaque payload, e.g. a DER timestamp token, a detached signature, or a C2PA manifest. */
  payload: Uint8Array;
  /** Optional: provider may return a PNG with embedded credentials (C2PA). */
  embeddedPng?: Uint8Array;
  createdAt: string;
}

export interface AuthenticityVerifyResult {
  valid: boolean;
  details: string[];
}

/** Future: RFC 3161 trusted timestamp tokens, local X.509/PKI signing, C2PA Content Credentials. */
export interface AuthenticityProvider {
  readonly id: string;
  readonly kind: AuthenticityArtifact['kind'];
  attest(input: { stampedPng: Uint8Array; sidecar: EvidenceSidecar }): Promise<AuthenticityArtifact>;
  verify(artifact: AuthenticityArtifact, stampedPng: Uint8Array): Promise<AuthenticityVerifyResult>;
}

export interface EvidenceBundle {
  evidenceId: string;
  stampedPng: Uint8Array;
  rawPng: Uint8Array;
  sidecar: EvidenceSidecar;
  artifacts: AuthenticityArtifact[];
}

export interface SyncReceipt {
  providerId: string;
  remoteId: string;
  uploadedAt: string;
  /** e.g. S3 object-lock retain-until date. */
  retainUntil?: string;
}

/** Future: WORM (e.g. S3 Object Lock) compliance vault upload. */
export interface StorageSyncProvider {
  readonly id: string;
  upload(bundle: EvidenceBundle): Promise<SyncReceipt>;
  verify(receipt: SyncReceipt): Promise<boolean>;
}

export interface RedactionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
}

/** Future: PII/secret blurring applied before the final hash is computed. */
export interface RedactionLayer {
  readonly id: string;
  redact(input: {
    png: Uint8Array;
    width: number;
    height: number;
  }): Promise<{ png: Uint8Array; regions: RedactionRegion[] }>;
}

export interface PipelineHooks {
  redaction: RedactionLayer[];
  authenticity: AuthenticityProvider[];
  sync: StorageSyncProvider[];
}

export const NOOP_HOOKS: PipelineHooks = { redaction: [], authenticity: [], sync: [] };
