export const SCHEMA_VERSION = 1;

export type CaptureMode = 'window' | 'screen' | 'all' | 'region';
export type TimeSource = 'NTP' | 'HTTPS' | 'LOCAL_FALLBACK';
export type GeoMethod = 'GPS/OS' | 'IP-Approx';
export type BannerPosition = 'top' | 'bottom' | 'left' | 'right';
export type StampMode = 'banner' | 'watermark';
export type Theme = 'light' | 'dark';

export interface DisplayInfo {
  id: number;
  label: string;
  /** DIP bounds in the global desktop space. */
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  /** Physical pixel size of the capture of this display. */
  pixelWidth: number;
  pixelHeight: number;
}

export interface TimeStamp {
  /** Authoritative UTC instant, ISO-8601 with ms. */
  utc: string;
  source: TimeSource;
  /** Human label, e.g. "NIST NTP". */
  sourceLabel: string;
  server: string;
  rttMs: number | null;
  /** localClock - authoritative, in ms. null when unknown. */
  driftMs: number | null;
  localClock: string;
  /** Present when a higher-priority source failed. */
  fallbackReason?: string;
}

export interface GeoFix {
  status: 'ok' | 'unavailable' | 'disabled';
  method?: GeoMethod;
  lat?: number;
  lon?: number;
  accuracyM?: number;
  label?: string;
  reason?: string;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  osVersion: string;
  arch: string;
  appVersion: string;
}

export interface CaptureMeta {
  evidenceId: string;
  mode: CaptureMode;
  sourceTitle: string;
  width: number;
  height: number;
  displays: DisplayInfo[];
  rawSha256: string;
  time: TimeStamp;
  geo: GeoFix;
  system: SystemInfo;
}

export interface StampFields {
  evidenceId: boolean;
  timestamp: boolean;
  localClock: boolean;
  location: boolean;
  system: boolean;
  note: boolean;
  rawHash: boolean;
}

export interface StampOptions {
  mode: StampMode;
  position: BannerPosition;
  fields: StampFields;
  theme: Theme;
  fontSize: number;
  /** 0.1 - 1; used by watermark mode. */
  opacity: number;
  note: string;
  showLocalTime: boolean;
  timeFormat: string;
  timeZone: 'utc' | 'utc+local';
}

export interface Settings {
  ntpHost: string;
  timeFormat: string;
  timeZone: 'utc' | 'utc+local';
  includeLocation: boolean;
  /** Send GPS coordinates to OpenStreetMap Nominatim for a city/region label. Off by default (privacy). */
  reverseGeocode: boolean;
  allScreensStitched: boolean;
  saveDirectory: string;
  shortcuts: Record<CaptureMode, string>;
  stamp: StampOptions;
}

export interface DraftSummary {
  draftId: string;
  meta: CaptureMeta;
}

export interface WindowInfo {
  id: string;
  title: string;
  thumbnail: string;
  appIcon?: string;
}

export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' | 'not-required';

export interface PermissionsInfo {
  screen: PermissionState;
  location: PermissionState;
}

export interface AppState {
  settings: Settings;
  permissions: PermissionsInfo;
  platform: string;
  sessionType: string | null;
  version: string;
}

export interface EvidenceSidecar {
  schemaVersion: number;
  tool: { name: 'AuditFrame'; version: string };
  evidenceId: string;
  files: { png: string; raw: string };
  hashes: { rawSha256: string; stampedSha256: string; algorithm: 'SHA-256' };
  timestamp: {
    authoritativeUtc: string;
    source: TimeSource;
    sourceLabel: string;
    server: string;
    rttMs: number | null;
    fallbackReason?: string;
  };
  localClock: { iso: string; driftMs: number | null };
  geolocation: GeoFix;
  system: SystemInfo;
  capture: {
    mode: CaptureMode;
    sourceTitle: string;
    width: number;
    height: number;
    displays: DisplayInfo[];
  };
  stamp: StampOptions;
  auditNote: string;
  /** Reserved for v2 features. */
  authenticity: unknown[];
  sync: unknown[];
  redactions: unknown[];
}

export interface HistoryRecord {
  evidenceId: string;
  savedAt: string;
  pngPath: string;
  jsonPath: string;
  rawPath: string;
  stampedSha256: string;
  rawSha256: string;
  note: string;
  mode: CaptureMode;
  utc: string;
  source: TimeSource;
  thumbnail: string;
}

export interface VerifyResult {
  ok: boolean;
  stampedMatches: boolean;
  rawMatches: boolean;
  problems: string[];
}

export interface SaveResult {
  record: HistoryRecord;
}
