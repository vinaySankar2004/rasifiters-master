# Polish 1 — offline detection that reflects real reachability (web · iOS · Android)

> Status: approved direction (user, 2026-10-13: "instantly once we find out we don't have internet connection we need
> to show the appropriate [banner]"). Ships in the pre-submission polish round (iOS 1.5.1 (59), Android 1.1.x, web).

## Problem
All three clients decide "offline" from a **link-level** signal only — iOS `NWPathMonitor.status == .satisfied`,
Android `NET_CAPABILITY_INTERNET` (not VALIDATED, D-KIT-7), web `navigator.onLine`. A link without real internet
(USB/developer link, captive or dead Wi-Fi, a just-toggled airplane mode) reads as online, so screens spin or show
"Couldn't refresh" and the offline banner never appears (seen on the user's iPhone in airplane mode).

## Rule (identical on all three)
1. `isOnline = linkUp && !provenOffline`.
2. **Proven offline** — set the moment an API request fails with a *no-connection* error:
   - iOS `URLError`: `.notConnectedToInternet`, `.networkConnectionLost`, `.cannotFindHost`, `.cannotConnectToHost`,
     `.dnsLookupFailed`, `.internationalRoamingOff`, `.dataNotAllowed` (TLS failures are not offline).
   - Android: `UnknownHostException`, `ConnectException`, `NoRouteToHostException`, `PortUnreachableException`
     (and an `IOException` whose cause is one of these).
   - Web: `fetch` rejects with a `TypeError` (network error) and the request was not aborted by us.
   - **Timeouts are NOT offline** (slow server ≠ no connection) — they keep the existing "Couldn't refresh"/timeout copy.
3. **Cleared** by: any API request that gets an HTTP response (any status), the link monitor reporting a link change
   to up, or a successful **probe**.
4. **Probe** — while `provenOffline` and the app is in the foreground (web: tab visible): `GET {API}/app-config`, no
   auth, 5 s timeout, every 10 s; stop when cleared or backgrounded (it works signed-in or signed-out).
   No probe while `linkUp == false` (the link monitor will report the change).
5. The offline banner, screen-banner suppression (A6), refresh-backoff reset on reconnect (A3) and SSE pause/resume
   (A4) all key off this combined `isOnline` — nothing else changes.
6. A screen with no data that fails while offline shows the kit's **offline** error view (with Retry), never a spinner.

## Per surface (keep it small — one monitor, one reporting hook in the central request path)
- **iOS:** `Shared/Kit/NetworkMonitor.swift` (combine link + proven-offline + probe; main-actor) and the central
  request path in `Shared/Services/APIClient*.swift` (report success/failure). Clear `provenOffline` on link up.
- **Android:** `core/kit/ConnectivityObserver.kt` (or the app-level monitor that feeds `isOnline`) + one OkHttp
  interceptor / the central call wrapper in `net/Network.kt` to report outcomes; probe via the existing API service.
- **Web:** `src/lib/kit/use-online-status.ts` (combine `navigator.onLine` with a module-level proven-offline flag +
  probe) and `src/lib/api/client.ts` (report outcomes).

## Out of scope
No new UI, copy or dependencies; no backend change (`GET /api/app-config` already answers signed-out).
Record the rule in frontend-kit SPEC (D-KIT, supersedes the link-only part of D-KIT-7) — orchestrator.
