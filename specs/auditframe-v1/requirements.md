# AuditFrame v1 — Requirements

AuditFrame is a cross-platform (macOS, Windows, Linux) Electron + TypeScript + React (Vite, Tailwind) desktop tool for auditor-grade screenshot and evidence capture (SOC 2, ISO 27001, HIPAA).

## Glossary
- **Raw capture**: unmodified PNG bytes from the capture source.
- **Stamped image**: raw capture plus metadata banner/watermark.
- **Sidecar**: `<name>.evidence.json` written beside the PNG.

## R1. Capture modes
User story: As an auditor, I capture evidence in the way that fits the control being tested.

1. R1.1 The app SHALL offer four modes: Window, Current Screen, All Screens, Custom Region.
2. R1.2 Each mode SHALL be reachable from the main UI, a global shortcut, and the tray menu.
3. R1.3 Window mode SHALL list windows via `desktopCapturer` with title and thumbnail and capture the selected one.
4. R1.4 Current Screen SHALL capture the display containing the cursor (fallback: primary).
5. R1.5 All Screens SHALL, per a setting, produce either one stitched composite or one numbered capture per display.
6. R1.6 Region mode SHALL show a transparent, frameless, always-on-top overlay on every display, with crosshair drag selection, live `W x H` in physical pixels, and `Esc` to cancel.
7. R1.7 Region and screen captures SHALL be correct on mixed-DPI setups (scaleFactor applied; output in physical pixels).
8. R1.8 Capture SHALL NOT include AuditFrame's own windows (overlay hidden before capture).

## R2. Network timestamping
1. R2.1 The app SHALL query an NTP server (default `time.nist.gov:123/UDP`) and compute offset against the local clock.
2. R2.2 If NTP fails or times out, it SHALL fall back to an HTTPS time source, then to local clock.
3. R2.3 Every timestamp SHALL record its source: `NTP`, `HTTPS`, or `LOCAL_FALLBACK`, plus server name, round-trip, and drift (local − authoritative) in ms.
4. R2.4 Settings SHALL allow: NTP host, display timezone (UTC, optionally local alongside), and format (default ISO-8601 `YYYY-MM-DDTHH:mm:ssZ`).
5. R2.5 The time SHALL be acquired at the moment of capture, not at save.

## R3. Geolocation (optional)
1. R3.1 A setting SHALL toggle location inclusion (default off).
2. R3.2 When on, the app SHALL record lat, lon, accuracy (m), optional city/region label, and method `GPS/OS` or `IP-Approx`.
3. R3.3 OS/Chromium geolocation SHALL be tried first; failure or denial SHALL fall back to IP-based lookup, labelled `IP-Approx`.
4. R3.4 macOS Location Services permission states SHALL be surfaced (not-determined, denied, restricted, granted) with guidance to System Settings.
5. R3.5 Location failure SHALL never block capture; metadata records `unavailable` with a reason.

## R4. Metadata stamping
1. R4.1 Mode **Append Banner** (default) SHALL extend the canvas so no captured pixel is covered.
2. R4.2 Mode **Watermark Overlay** SHALL draw a semi-transparent overlay on the image with adjustable opacity.
3. R4.3 Position SHALL be Top, Bottom, Left, or Right. Left/Right banners SHALL render in a dedicated sidebar panel with wrapped (not rotated-only) text.
4. R4.4 Toggleable fields: Evidence ID (UUIDv4), authoritative timestamp + source, local clock + drift, location, hostname/OS/display resolution, audit note, raw SHA-256.
5. R4.5 Styling: light/dark theme, font size, opacity (watermark).
6. R4.6 A live preview SHALL update as controls change before save/export.
7. R4.7 Stamping SHALL be deterministic and high-DPI crisp (rendered at capture pixel size).

## R5. Export and history
1. R5.1 "Save PNG + JSON" SHALL write a lossless PNG and `.evidence.json` sidecar.
2. R5.2 Sidecar SHALL contain: evidence ID, raw SHA-256, stamped SHA-256, authoritative timestamp (+source, server), local timestamp, drift, geolocation, OS metadata, audit note, stamping options, app version, schema version.
3. R5.3 "Copy to Clipboard" SHALL copy the stamped image.
4. R5.4 A history sidebar SHALL list recent captures and offer one-click hash verification (re-hash file on disk vs sidecar).
5. R5.5 Raw captures SHALL be retained in the evidence vault so the raw hash stays verifiable.

## R6. Platform requirements
1. R6.1 macOS: check Screen Recording and Location permissions with `systemPreferences` and guide the user.
2. R6.2 Windows: DPI-aware multi-monitor coordinate mapping.
3. R6.3 Linux: enable `WebRTCPipeWireCapturer` for Wayland; X11 works by default.

## R7. Security
1. R7.1 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` for renderers.
2. R7.2 All IPC goes through a typed channel allowlist in `preload.ts`; main validates payloads (schema) and sender.
3. R7.3 CSP on renderer pages; navigation and new-window blocked.
4. R7.4 No renderer filesystem access; file paths chosen/validated in main.

## R8. v2 extensibility (interfaces only)
1. R8.1 `AuthenticityProvider` (RFC 3161, X.509/PKI signing, C2PA).
2. R8.2 `StorageSyncProvider` (WORM S3 vault).
3. R8.3 `RedactionLayer` (PII/secret blur before final hashing).
4. R8.4 The pipeline SHALL have hook points for these with no-op defaults; none implemented in v1.
5. R8.5 Services: `CaptureService`, `TimeService`, `LocationService`, `ComposerService`, `EvidenceVaultService`.
