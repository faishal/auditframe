# AuditFrame v1 — Design

## Stack
Electron (latest stable), TypeScript, React 18, Vite (via `vite-plugin-electron`-free setup: separate Vite renderer build + `tsc`/esbuild for main/preload), Tailwind CSS, `sharp` for compositing and hashing inputs, `ntp-time-sync`-free custom NTP client over `dgram`, `zod` for IPC validation, `vitest` for tests.

## Layout
```
src/
  shared/            # types, IPC channel map, zod schemas, defaults (no Node/DOM deps)
  main/
    index.ts         # app lifecycle, flags, window creation
    ipc.ts           # handler registration, sender + payload validation
    tray.ts shortcuts.ts permissions.ts settings.ts
    services/
      CaptureService.ts      # window/screen/all/region capture
      RegionOverlay.ts       # overlay windows + selection result
      TimeService.ts         # NTP -> HTTPS -> local
      LocationService.ts     # OS (renderer geolocation) -> IP fallback
      ComposerService.ts     # sharp-based stamping (banner/watermark)
      EvidenceVaultService.ts# save, sidecar, history, verify
      CapturePipeline.ts     # orchestrates a capture into an EvidenceDraft
    v2/                      # interfaces + no-op providers
  preload/
    index.ts         # contextBridge: typed `window.auditframe`
    overlay.ts       # minimal bridge for the region overlay
  renderer/
    index.html, main.tsx, App.tsx
    components/ (CapturePanel, WindowPicker, Preview, StampControls, History, Settings, PermissionBanner)
    overlay/ (overlay.html, Overlay.tsx)
    state/ (zustand-free: React context + hooks)
```

## Data model (shared)
- `CaptureMode = 'window' | 'screen' | 'all' | 'region'`
- `RawCapture { id, png: Buffer(main only), width, height, displayInfo[], mode, capturedAtLocal }`
- `TimeStamp { utc: ISO, source: 'NTP'|'HTTPS'|'LOCAL_FALLBACK', server, rttMs, driftMs, localClock: ISO }`
- `GeoFix { status:'ok'|'unavailable', method:'GPS/OS'|'IP-Approx', lat, lon, accuracyM, label?, reason? }`
- `StampOptions { mode:'banner'|'watermark', position, fields{...}, theme, fontSize, opacity, note }`
- `EvidenceSidecar` v1 schema (see tasks) with `schemaVersion: 1`.

## Capture flow (CapturePipeline)
1. Hide AuditFrame windows (R1.8).
2. Acquire time (TimeService) concurrently with capture; time is taken immediately before the image grab.
3. CaptureService returns raw PNG(s). `rawSha256 = sha256(png)`.
4. LocationService (if enabled) runs in parallel with a 5s cap.
5. Hook: `RedactionLayer.apply` (no-op) → then hash. Hook: `AuthenticityProvider.attest` after stamp (no-op).
6. Result draft (metadata + raw image) kept in main memory by id; renderer receives a preview data URL.
7. Preview: renderer sends StampOptions → main `ComposerService.compose` → PNG data URL (debounced).
8. Save: compose final, `stampedSha256`, write `<dir>/<ts>_<id8>.png`, `.evidence.json`, and raw into vault; add to history index. Hook: `StorageSyncProvider.upload` (no-op).

## Capture details
- **Screen/All**: `desktopCapturer.getSources({types:['screen'], thumbnailSize: physical size})` where physical = `bounds * scaleFactor`; match source to display by `display_id`. Stitched composite lays displays on a canvas using physical coordinates (display bounds relative to min x/y, each scaled by its scaleFactor; mixed DPI normalised to the max scaleFactor).
- **Window**: `getSources({types:['window'], thumbnailSize})`; list sends small thumbnails; capture re-requests at large size and picks by source id. Linux/Wayland: sources come via the PipeWire portal; flag set before `app.ready`.
- **Region**: capture each display full-res first, then show overlay windows (one per display, `setAlwaysOnTop('screen-saver')`, transparent, frameless). Overlay returns selection in DIP relative to a display; main multiplies by scaleFactor and crops from the pre-captured frame (freezes content, avoids capturing the overlay). Selection cannot span displays in v1 (documented). `Esc` or right-click cancels.
- macOS: `systemPreferences.getMediaAccessStatus('screen')`; non-granted → PermissionBanner with button opening `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`.

## Time
- NTP: UDP 48-byte SNTPv4 packet, 3s timeout, parse transmit timestamp, offset = ((t1−t0)+(t2−t3))/2. Pure functions (`buildRequest`, `parseResponse`) unit tested.
- HTTPS fallback: `HEAD`/`GET` to `https://time.gov` / `https://worldtimeapi.org/api/timezone/Etc/UTC` style endpoints; use `Date` header or JSON `utc_datetime`, RTT-midpoint corrected. Order configurable in code constant.
- Local fallback sets `source='LOCAL_FALLBACK'` and drift 0 (unknown), flagged in banner.
- Formatting through a small formatter supporting `YYYY-MM-DDTHH:mm:ssZ` tokens and UTC/local rendering.

## Location
- Renderer (hidden helper in main window) calls `navigator.geolocation` (Chromium; on macOS uses CoreLocation, Windows uses Location API). Main requests it via IPC `location:request-os`, renderer replies. If error/denied/timeout → IP fallback (`https://ipapi.co/json/`, with a secondary `https://ipwho.is/`) labelled `IP-Approx`.
- Reverse geocode label: for IP-Approx comes from the response; for GPS, an optional Nominatim lookup (best effort, off by default network wise, 3s cap) — failures leave label empty.
- macOS permission: `systemPreferences.getMediaAccessStatus` does not cover location; status derived from geolocation error code (`PERMISSION_DENIED`) and surfaced with guidance. Electron app needs `NSLocationUsageDescription` in `Info.plist` (set via electron-builder `extendInfo`).

## Composer
- Uses `sharp`: build banner as SVG (text wrapped by a measure function using approximate monospace-metric table for determinism), composite onto extended canvas (`extend`) for banner, or `composite` with opacity for watermark. Left/right banners are a fixed-width sidebar (wrapped lines). Fonts: bundled-safe family stack `Menlo, Consolas, DejaVu Sans Mono, monospace`.
- Pure layout function `layoutBanner(fields, width, fontSize)` returns lines/heights; unit tested.
- Font size is scaled by image DPI factor so text is legible on 4K.

## IPC
Channels are declared once in `shared/ipc.ts` as `{ channel: { req, res } }` with zod schemas. Preload exposes only named methods, each invoking one allowlisted channel. Main verifies `event.senderFrame.url` belongs to the app origin and parses payload with zod. Events from main to renderer (`capture:ready`, `history:updated`) use an allowlisted subscribe helper returning an unsubscribe.

## Security
BrowserWindow: `contextIsolation`, `sandbox`, no `nodeIntegration`, `webSecurity` default; CSP meta; `will-navigate` and `setWindowOpenHandler` deny. Renderer never receives file paths it can write to. Settings stored in `app.getPath('userData')/settings.json`, validated on load.

## v2 interfaces (`src/main/v2/`)
```ts
interface AuthenticityProvider { id: string; kind: 'rfc3161'|'x509'|'c2pa';
  attest(input: { stampedPng: Buffer; sidecar: EvidenceSidecar }): Promise<AuthenticityArtifact>;
  verify(artifact: AuthenticityArtifact, png: Buffer): Promise<VerifyResult>; }
interface StorageSyncProvider { id: string;
  upload(bundle: EvidenceBundle): Promise<SyncReceipt>; verify(receipt: SyncReceipt): Promise<boolean>; }
interface RedactionLayer { id: string;
  redact(input: { png: Buffer; width: number; height: number }): Promise<{ png: Buffer; regions: RedactionRegion[] }>; }
```
`PipelineHooks` holds arrays of each; v1 registers none. Sidecar has reserved `authenticity: []`, `sync: []`, `redactions: []` fields.

## Packaging
`electron-builder` config with mac `extendInfo` (usage descriptions), `asarUnpack` for `sharp` native binaries, targets dmg/nsis/AppImage.

## Testing
Vitest unit tests: NTP packet codec, time formatting, banner layout, region/stitch coordinate math, sidecar schema, hash verification. Manual cross-platform checklist in README.
