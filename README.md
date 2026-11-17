# AuditFrame

Auditor-grade screenshot and evidence capture (SOC 2, ISO 27001, HIPAA). Electron + TypeScript + React + Vite + Tailwind. Specs live in `specs/auditframe-v1/`.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server + watch build of main/preload + Electron |
| `npm run build` | Production build into `dist/` |
| `npm start` | Build and run |
| `npm test` | Unit tests (NTP codec, time fallback, composer, vault, capture math) |
| `npm run typecheck` | Type-check main/preload and renderer |
| `npm run dist` | Package with electron-builder |

## Architecture
`src/main/services`: `CaptureService`, `TimeService`, `LocationService`, `ComposerService`, `EvidenceVaultService`, orchestrated by `CapturePipeline`. IPC channels are declared once in `src/shared/ipc.ts`; `src/preload` exposes only allowlisted calls, and main validates sender and payload (zod). v2 extension interfaces (`AuthenticityProvider`, `StorageSyncProvider`, `RedactionLayer`) are in `src/main/v2/interfaces.ts` and wired as empty `PipelineHooks`.

## Evidence output
`<UTC>_<id8>.png` plus `<UTC>_<id8>.evidence.json` in the save folder (default `~/Documents/AuditFrame Evidence`). The raw capture is kept in the app vault (`userData/vault/raw`) so the raw SHA-256 stays verifiable. Files are never overwritten.

## Platform notes
- **macOS**: grant Screen Recording (restart the app afterwards). Location uses CoreLocation through Chromium; on denial the app falls back to IP-Approx.
- **Windows**: DPI is handled via Electron's `scaleFactor`; captures are in physical pixels.
- **Linux**: `WebRTCPipeWireCapturer` is enabled for Wayland. Chromium's OS geolocation usually needs a Google API key on Linux, so IP-Approx is typical.

## Known v1 limits
- A region selection cannot span multiple displays.
- HTTPS time fallback depends on the remote `ts`/`Date` value; precision is sub-second (Cloudflare) or 1 s (time.gov).
- Banner text uses a monospace system font; exact glyph widths vary slightly by platform, so wrapping is conservative.
- Not yet verified on Windows/Linux or with a real multi-monitor setup. Only unit tests, typecheck, build, and an Electron startup check were run.

## Manual QA checklist
1. Each of the 4 modes from button, shortcut, and tray.
2. Region on Retina/4K: overlay `W x H` equals saved PNG dimensions.
3. Block UDP 123: source shows HTTPS; go offline: `LOCAL_FALLBACK`.
4. Location on/off/denied; verify `GPS/OS` vs `IP-Approx`.
5. Banner in 4 positions leaves the evidence pixels untouched; watermark opacity.
6. Save, then tamper with the PNG and confirm history "Verify hash" fails.
