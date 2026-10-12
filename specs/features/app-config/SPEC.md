# Feature: `app-config` — the mobile version gate (iOS + Android) (+ a push index)

> **Status:** 🚀 deployed (ported to `apps/backend/`) · **Version:** 0.2.0 · **Apps (`consumed_by`):** `ios`
> (Android reads the 0.2.0 fields from its Phase 3 build; `consumed_by` gains `android` when that build ships — D-C4)
> **Provenance (legacy, archived):** `backend` — `server.js` (the inline `GET /api/app-config` route +
> the `MIN_IOS_VERSION` env). **0.2.0** adds `middleware/versionGate.js` (env normalizers, `getAppConfig()`,
> the `blockUnversionedAndroid` middleware). Still no service / model / router file and no DB.
> **Depends on:** nothing (no auth — the gate is public, hit before login).
> **References (push, not owned here):** [`notifications`](../notifications/SPEC.md) (the APNs device routes
> `PUT`/`DELETE /api/notifications/device`, the APNs dispatch `utils/pushNotifications.js`, the
> `member_push_tokens` table, the `APNS_*` env) · [`auth`](../auth/SPEC.md) (`upsertPushToken`/
> `removePushToken` + the login-body push capture). This SPEC is the **push index** — §6 maps the
> end-to-end APNs path 1:1; the mechanics live in those two SPECs (single-sourced).
> **Deliberate changes vs legacy:** **D-C2** add `Cache-Control` to the response so the gate is cached between
> polls; **D-C3** trim + validate the iOS version env so a malformed value yields `null` (no gate) instead of a
> broken client comparison. **0.2.0 (reliability overhaul, Phase 2 track C):** **D-C4** three additive
> per-platform threshold keys (enforced client-side); **D-C5** the off-by-default `BLOCK_UNVERSIONED_ANDROID`
> 426 switch; **D-C6** app-config reads only the presence of `X-App-Version` (+ `User-Agent`) — the `X-App-*`
> header contract itself is owned by the observability SPEC.

---

## 1. What it is

The **app-config endpoint** — a single public route, `GET /api/app-config`, returning the **version gate** for
both mobile clients: per platform, a **hard minimum** (below it the app shows a non-dismissable "Update
required" screen) and a **soft nudge** (below it a dismissable "Update available" banner) — `min_ios_version` /
`latest_ios_version` (marketing versions) and `min_android_version_code` / `latest_android_version_code`
(Android `versionCode` integers). Each value comes from an env var on Render; unset or malformed → `null` →
nobody is blocked or nudged. The iOS client polls it on launch, on foreground and before opening a widget
deep-link, and enforces `min_ios_version` today (force-update modal → App Store); the iOS soft banner and the
whole Android side arrive with the Phase 3 client builds. One more piece lives here: an **off-by-default
switch** (`BLOCK_UNVERSIONED_ANDROID`) that answers header-less Android 1.0.0 requests with `426` "Please
update…" (D-C5). No body, no auth, no DB.

This is also the **last backend COVERAGE row** (`app-config (min iOS version) + push (APNs)`,
[COVERAGE.md](../../../COVERAGE.md) L31). The **push (APNs)** half of that row is **already fully ported +
documented** in [`notifications`](../notifications/SPEC.md) (device routes, APNs dispatch, `member_push_tokens`,
`APNS_*`) and [`auth`](../auth/SPEC.md) (login capture + `upsert/removePushToken`). So this SPEC **owns
app-config** and acts as the **cross-reference index** for push (§6) — closing the row without duplicating
the push docs (single-source-of-truth).

## 2. Why it exists

So the team can **force (or nudge) a mobile upgrade** without a store review cycle: raise a threshold env var on
Render and every client below it is blocked (or nudged) at next launch until it updates. This protects against
old clients hitting a changed/removed API contract — the reliability overhaul's **no-shims** policy
(DESIGN_BOARD §0.3) relies on it: backend changes stay additive, and when one must break old builds, the gate
blocks them with an update message instead. Mobile-only by design — the web app is always current (served
fresh from Vercel) and has no version to check, so web never consumes it (F5).

## 3. Functionality (the route + the switch)

One inline route in `server.js` (no router module, faithful to legacy — **D-C1**) plus one `/api` middleware
from `middleware/versionGate.js`. The route is public (no `authenticateToken`) — the gate must work
before/around login.

| # | Route / mount | Handler | Auth | Purpose |
|---|---------------|---------|------|---------|
| 1 | `GET /api/app-config` | inline in `server.js` → `getAppConfig()` (`middleware/versionGate.js`) | **none** (public) | Return the 4 threshold keys. Always `200`. Never gated by #2. |
| 2 | `app.use("/api", blockUnversionedAndroid)` | `middleware/versionGate.js` | n/a | No-op unless `BLOCK_UNVERSIONED_ANDROID=true`; then `426` for header-less Android (D-C5), except `POST /api/client-events`. Mounted after #1, before every router. |

**Response (#1):** `200` always; no error paths. **`Cache-Control: public, max-age=300`** (D-C2).

```jsonc
{
  "min_ios_version": "1.2.0",          // string or null — iOS hard minimum (force-update modal). Unchanged since 0.1.0
  "latest_ios_version": null,          // string or null — iOS soft nudge (banner, Phase 3)
  "min_android_version_code": null,    // int or null    — Android hard minimum (blocking screen, Phase 3)
  "latest_android_version_code": null  // int or null    — Android soft nudge (banner, Phase 3)
}
```

Each key is `null` when its env var is unset or malformed (D-C3/D-C4). A client acts only on non-null values:
installed `< min_*` → blocking screen; else installed `< latest_*` → soft nudge.

**426 (#2):** `426 { "error": "Please update RaSi Fiters from the Play Store", "code": "update_required" }`, sent
by the middleware itself (`errorHandler.js` would drop `code`). Match rule, exemptions + scope: D-C5.

**Request headers read:** only whether `X-App-Version` is present, plus `User-Agent` (#2 only; D-C6).
Header contract: owned by `specs/features/observability/SPEC.md` (lands with Phase 2 track A).

### iOS consumption (the gate — reference only, not owned)

- **Fetch:** `ProgramContext+VersionCheck.swift:7-22` `checkMinimumSupportedVersion()` → `GET /api/app-config`,
  decodes `AppConfigResponse { min_ios_version }` (`APIClient.swift:37-39`).
- **Compare:** `ProgramContext+VersionCheck.swift:29-42` `isVersion(_:lessThan:)` — parses dot-separated ints
  (`"1.2.3" → [1,2,3]`), left-to-right; `currentVersion` from `CFBundleShortVersionString`. Sets
  `isUpdateRequired` (`:19`).
- **UI:** `ForcedUpdateModalView` (`NotificationModalView.swift:46-93`) — full-screen, `interactiveDismissDisabled(true)`,
  "Update Now" → App Store URL. Cannot be dismissed; must update.
- **Triggers:** app init (`AppRootView.swift:37`), foreground (`:70`), pre-widget-deep-link (`:85-87`).
- **Phase 3 (planned):** a dismissable "Update available" banner from `latest_ios_version` (once per version),
  and every request sends the `X-App-*` headers (contract: observability SPEC). The live 1.4.x binaries decode
  `AppConfigResponse` with the default `JSONDecoder` (`APIClient.swift:37-47`), which ignores the 3 new keys.

### Android consumption (planned — Phase 3, not live)

- The next Android build fetches `GET /api/app-config` (kotlinx `ignoreUnknownKeys = true`), compares its own
  `versionCode` with `min_android_version_code` (blocking screen → Play Store / Play in-app *immediate* update)
  and `latest_android_version_code` (soft banner), and sends `X-App-Version` (with the rest of the `X-App-*`
  headers) on **every** OkHttp client (the D-C5 precondition). Android 1.0.0 (3)/(4) never calls app-config.

## 4. Feature list (behaviors to port)

- **`GET /api/app-config`** — inline in `server.js`: `res.set("Cache-Control", "public, max-age=300")`, then
  `res.json(getAppConfig())`. Always `200`.
- **`getAppConfig(env = process.env)`** (0.2.0) — returns `min_ios_version: normalizeVersion(MIN_IOS_VERSION)`,
  `latest_ios_version: normalizeVersion(LATEST_IOS_VERSION)`, `min_android_version_code:
  normalizeVersionCode(MIN_ANDROID_VERSION_CODE)`, `latest_android_version_code:
  normalizeVersionCode(LATEST_ANDROID_VERSION_CODE)`. `process.env` is read per request (no module-level copy),
  like the original route — but on Render it is fixed at process start, so a changed env applies only after a
  redeploy (§7).
- **`normalizeVersion(raw)`** (D-C3; named `normalizeMinIosVersion`, inline in `server.js`, through 0.1.0) — `null`
  if not a string; else `trim()` and return it only if it matches `^\d+(\.\d+)*$` (dot-separated integers, the
  exact format the iOS comparator parses), else `null`. Legacy returned `process.env.MIN_IOS_VERSION || null` (raw).
- **`normalizeVersionCode(raw)`** (D-C4) — `null` if not a string; else `trim()`; must match `^\d+$`, then
  `parseInt(…, 10)`; returned only if a safe integer `> 0` and `≤ 2100000000` (Play's maximum `versionCode`),
  else `null`.
- **`blockUnversionedAndroid(req, res, next)`** (D-C5) — `next()` unless `BLOCK_UNVERSIONED_ANDROID` (trimmed,
  lower-cased) equals `"true"`. When on: a request in the `UNGATED_ROUTES` allow-list (`POST /api/client-events`,
  matched on `req.method` + `req.baseUrl + req.path` with trailing slashes stripped and lower-cased — Express
  routing is non-strict + case-insensitive) → `next()`; otherwise a request with **no** `X-App-Version`
  header **and** a `User-Agent` matching `^okhttp\/` (case-insensitive) gets `426 { error: "Please update RaSi
  Fiters from the Play Store", code: "update_required" }`; everything else → `next()`.

## 5. Data / schema touchpoints

**None.** No DB read or write; no model; no migration delta. Inputs are the five env vars in §7 and, for the
D-C5 switch, the request's `X-App-Version` + `User-Agent` headers.

## 6. Push (APNs) — the cross-reference index (NOT owned here)

The "+ push (APNs)" half of [COVERAGE.md](../../../COVERAGE.md) L31 is **already ported + documented** in two
other SPECs. This section is the **end-to-end map** so the row is verifiably 1:1; the mechanics are
single-sourced there. **Push reaches iOS (APNs) and Android (FCM, since [`notifications`](../notifications/SPEC.md)
D-C9, 2026-07-08 — `platform:'android'` tokens, the `firebase-admin` sender in `utils/pushNotifications.js`,
`FIREBASE_SERVICE_ACCOUNT`).** The table below maps the iOS/APNs path; the FCM path is single-sourced in
notifications D-C9. The web client receives notifications via SSE (`/api/notifications/stream`), never push
(web sweep: zero device-token registration).

| Stage | Where (owned by) | Path |
|-------|------------------|------|
| Obtain APNs token | iOS `AppDelegate.swift:26-37` (client) | stores hex token in `UserDefaults` |
| Send token at login | iOS `LoginView.swift:152-158` → `POST /api/auth/login/global` body `push_token` (+ `device_id`) → [`auth`](../auth/SPEC.md) `loginGlobal` → `upsertPushToken` (`authService.js:99-121`) | login capture |
| Register post-login | iOS `APIClient+Auth.swift:64-76` → `PUT /api/notifications/device` body `push_token` → [`notifications`](../notifications/SPEC.md) → `authService.upsertPushToken` | device route |
| Unregister | iOS `APIClient+Auth.swift:79-91` → `DELETE /api/notifications/device` → `authService.removePushToken` | device route |
| Store | `member_push_tokens` table (`platform:'ios'`, unique `device_token`) — owned by [`notifications`](../notifications/SPEC.md) §5 | DB |
| Dispatch | `utils/pushNotifications.js` (`sendPushToMembers`, APNs `apn.Provider`) — owned by [`notifications`](../notifications/SPEC.md) §3 | APNs |
| Env | `APNS_*` (`sync:false`; **creds provisioned 2026-06-30** — notifications D-C8, Key ID `RA353TA52W`) → `getProvider()` returns a live provider ⇒ iOS push fires | `render.yaml` |

All push code is ported and faithful; the APNs **credentials** were provisioned 2026-06-30 (notifications
D-C8), so end-to-end iOS push is now live alongside SSE + DB delivery + token persistence.

## 7. Flags / env

All five are non-secret. Unset/malformed → `null` (or switch off) → **nobody blocked, nudged or 426'd**, so a
service that sets none of the four 0.2.0 vars (e.g. the Phase 2 track B staging API) blocks nobody.
**Every change needs a redeploy:** the code reads `process.env` per request, but on Render `process.env` is
fixed when the process starts — a new or changed value applies only on the next deploy.

| Var | Served as / effect | Format | Where it's set |
|---|---|---|---|
| `MIN_IOS_VERSION` | `min_ios_version` — iOS hard minimum | dot-separated ints (`1.2.0`), D-C3 | **Declared in `render.yaml`** (`value: "1.2.0"`, live value confirmed 2026-10-12 — blocks nobody; oldest live iOS is 1.4.0). Change it in `render.yaml` so the Blueprint stays the source of truth (F4); applies on the next deploy |
| `LATEST_IOS_VERSION` | `latest_ios_version` — iOS soft nudge | dot-separated ints (`<x.y.z>`), D-C3 | Operator-managed, **not** in `render.yaml` — Render MCP `update_environment_variables` (per-call confirm), **then redeploy**; only when needed |
| `MIN_ANDROID_VERSION_CODE` | `min_android_version_code` — Android hard minimum | positive integer `versionCode` (`<versionCode>`), D-C4 | Operator-managed (as above, then redeploy) |
| `LATEST_ANDROID_VERSION_CODE` | `latest_android_version_code` — Android soft nudge | positive integer `versionCode` (`<versionCode>`), D-C4 | Operator-managed (as above, then redeploy) |
| `BLOCK_UNVERSIONED_ANDROID` | `426` for header-less Android on every `/api/*` route except app-config and `POST /api/client-events` (D-C5) | on only for `true` (trimmed, case-insensitive); **default OFF** | Operator-managed (as above, then redeploy — on or off). Turn on only per D-C5's precondition |

- **`APNS_*`** (referenced, owned by [`notifications`](../notifications/SPEC.md)) — APNs creds, `sync:false`,
  live since 2026-06-30 (notifications D-C8).

## 8. The migration delta + the deliberate changes

**No auth-table / stack / schema migration delta** — app-config is a stateless static route; the legacy
inline route ports byte-for-byte onto the new stack. The 0.1.0 changes are two pinned cleanups on the owned
route; 0.2.0 adds the net-new D-C4–D-C6 (last bullet):

- **D-C1 — scope + route shape (keep inline).** This SPEC owns the `GET /api/app-config` route + its env (the
  five vars in §7). The route stays **inline in `server.js`** (faithful — legacy serves it inline too; a
  trivial static route warrants no router/service/model). Since 0.2.0 the normalizers, `getAppConfig()` and the
  D-C5 middleware live in `middleware/versionGate.js`, which keeps `server.js` thin. Push is **referenced**, not
  owned (§6) — re-documenting it here would duplicate [`notifications`](../notifications/SPEC.md) +
  [`auth`](../auth/SPEC.md) (SSOT violation).
- **D-C2 — add `Cache-Control: public, max-age=300`.** iOS polls the gate on every launch/foreground/widget-open
  (3 triggers); legacy returned it with no cache header. Adding a 5-minute cache lets the client/CDN avoid
  re-fetching the rarely-changing gate. Pure response-header addition; body unchanged.
- **D-C3 — trim + validate the iOS version env.** Legacy returned `process.env.MIN_IOS_VERSION || null`
  (raw). A stray-whitespace or malformed value (`" 1.2.3 "`, `"v1.2"`, `"latest"`) would flow to the iOS
  comparator, which parses dot-separated ints — producing a wrong or broken gate. `normalizeVersion`
  (`middleware/versionGate.js`; named `normalizeMinIosVersion`, inline in `server.js`, through 0.1.0) trims and
  accepts only `^\d+(\.\d+)*$`, else `null` (no gate); since 0.2.0 it also normalizes `LATEST_IOS_VERSION`.
  **Behavior change only for a malformed env**; a well-formed value is returned identically (now trimmed).
- **D-C4–D-C6 (0.2.0, reliability overhaul Phase 2 track C)** — three additive per-platform threshold keys, the
  off-by-default `BLOCK_UNVERSIONED_ANDROID` 426 switch, and the narrow header read the switch needs (the
  `X-App-*` contract itself is owned by observability). Net-new (not legacy behavior); zero effect on any live
  binary while the switch is off (the default). Detail in §9.

**What stays (faithful 1:1):** the route path, the public (no-auth) access, the response key `min_ios_version`
(name + string-or-null shape), the `null`-when-unset semantics, and the always-`200` contract.

> **Scope note (D-C1).** No migration delta — stateless route, no schema. This SPEC owns app-config; the push
> half is indexed (§6), owned by `notifications` + `auth`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = own app-config, reference push; keep the route inline.** Own `GET /api/app-config` + its env (inline route in `server.js`, faithful). Since 0.2.0 the normalizers + the D-C5 middleware live in `middleware/versionGate.js` (keeps `server.js` thin); the route itself stays inline. Push is documented in [`notifications`](../notifications/SPEC.md) + [`auth`](../auth/SPEC.md); §6 is a cross-reference index, not a re-doc (SSOT). | `server.js` (inline `app.get("/api/app-config", …)`); legacy `server.js:40-44`; notifications/auth SPECs; COVERAGE L31. User answers (own+reference; keep inline). |
| **D-C2** | **Add `Cache-Control: public, max-age=300`** to the response — iOS polls on every launch/foreground/widget-open; legacy had no cache header. Body unchanged. | `server.js` app-config route; iOS triggers `AppRootView.swift:37,70,85`. User pinned. |
| **D-C3** | **Trim + validate the iOS version env** via `normalizeVersion` (`^\d+(\.\d+)*$`, else `null`; named `normalizeMinIosVersion` until 0.2.0, now also used for `LATEST_IOS_VERSION`); legacy returned the raw env. Behavior change only for a malformed env (→ `null`, no gate, instead of a broken client comparison). | `middleware/versionGate.js` `normalizeVersion`; legacy `server.js:42`; iOS comparator `ProgramContext+VersionCheck.swift:29-42`. User pinned. |
| **D-C4** | **Per-platform thresholds, additive; enforcement is client-side (0.2.0).** The body gains `latest_ios_version` (string or null, iOS soft nudge), `min_android_version_code` (int or null, Android hard minimum) and `latest_android_version_code` (int or null, Android soft nudge); `min_ios_version` keeps its exact name and shape. `LATEST_IOS_VERSION` uses the D-C3 normalizer; `MIN_/LATEST_ANDROID_VERSION_CODE` accept `^\d+$` → positive int `≤ 2100000000` (Play's maximum `versionCode`), else `null`. Clients compare and act (blocking screen below `min_*`, dismissable once-per-version banner below `latest_*`); the server **never** 426s a versioned client below a minimum. Android compares **`versionCode`**, not `versionName` (`versionName` stayed `1.0.0` across codes 3/4/5). **No store-URL fields** (iOS hard-codes its App Store URL; Android uses the Play listing / Play in-app update). The 4 new vars are operator-managed (not in `render.yaml`); any change applies on the next deploy (§7). `consumed_by` stays `[ios]` until the Phase 3 Android build ships (then `+= android`, MINOR). | DESIGN_BOARD §1 + §0.3 (approved 2026-10-11); BRIEF §7 Phase 2 row C; iOS `APIClient.swift:37-47` (default `JSONDecoder` ignores unknown keys); Android `Network.kt` `ignoreUnknownKeys = true`; `apps/android/app/build.gradle.kts:41-42`; RELEASES.md. |
| **D-C5** | **`BLOCK_UNVERSIONED_ANDROID` — the one server-side 426 (0.2.0), default OFF.** On only when the env (trimmed, lower-cased) equals `"true"`. Match: no `X-App-Version` header **and** `User-Agent` matching `^okhttp\/` (case-insensitive) — Android 1.0.0 sends only `okhttp/4.12.0`; iOS (CFNetwork), browsers, curl and Node fetch never match. Reply `426 { error: "Please update RaSi Fiters from the Play Store", code: "update_required" }` directly from the middleware (`errorHandler.js` keeps only `error`). Mounted `app.use("/api", …)` after the app-config route and before every router; `/` (health check) is outside `/api`. **Never gated:** `GET /api/app-config` (answers before the gate) and `POST /api/client-events` (observability's client telemetry ingest, Phase 2 track A — an explicit allow-list in the middleware; harmless until that route exists). **Off: zero behavior change for every binary.** On: every other `/api/*` call from 1.0.0 → 426, answered **before auth** (the gate precedes every router, so `authenticateToken` never runs) — no 401, so no token refresh (`AuthAuthenticator` acts only on a 401) and **no sign-out** (barring a 401→refresh race during the deploy that flips the switch on): signed-in 1.0.0 users stay signed in and each screen's load fails with the server's `error` text, "Please update…" (`ApiException.kt:30`) — e.g. the program picker (`ProgramPickerScreen.kt:107`); a signed-out user's login request gets the same 426. **Precondition to turning it on:** the Phase 3 Android build is adopted AND sends `X-App-Version` on **every** OkHttp client — the main Retrofit client (`Network.kt:32-36`), the bare refresh client (`Network.kt:75`, no interceptors today) and `NotificationStreamClient.kt:26` — else the new build blocks itself; and a backend change actually needs it ("on only when needed"). Turning it on (or off) needs a redeploy (§7). | DESIGN_BOARD §1 (old-Android row) + §0.3 no-shims; `middleware/errorHandler.js:5`; Android `Network.kt:79-103` (`AuthAuthenticator`, the only `onAuthFailure` caller), `NotificationStreamClient.kt`, `ApiException.kt:30`, `ProgramPickerScreen.kt:107`. |
| **D-C6** | **The only request headers app-config reads (0.2.0): whether `X-App-Version` is present, plus `User-Agent`** — both for the D-C5 match only; no value is parsed, so D-C5 works however clients format the headers or the request log records them. Header contract: owned by `specs/features/observability/SPEC.md` (lands with Phase 2 track A). | `middleware/versionGate.js` `blockUnversionedAndroid`; DESIGN_BOARD §1 + §7.1; header-contract ownership set at plan approval (2026-10-12). |
| **D-REF** | **Reference impl = legacy `backend`. app-config `consumed_by = [ios]`** (Android joins with its Phase 3 build, D-C4). Push reaches iOS (APNs) + Android (FCM, notifications D-C9). Web consumes **neither** app-config nor push (no `/api/app-config`, no device-token registration — it uses SSE for notifications). | iOS sweep (`ProgramContext+VersionCheck.swift`, `APIClient+Auth.swift`, `LoginView.swift`) + web sweep (zero matches); notifications D-C9. |
| **D-S1** | **Stance = faithful 1:1 except D-C2/D-C3 (0.1.0) and the net-new D-C4–D-C6 (0.2.0).** The route path, public access, the `min_ios_version` key + shape, `null`-when-unset, and always-`200` ported exactly; the cleanups are defensive and the 0.2.0 additions are additive / off by default. Oddities flagged (§10). | `server.js`; §8; user answer (0.1.0); DESIGN_BOARD approval 2026-10-11 (0.2.0). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **iOS sends `device_id` but it is always `nil`** — the login + register paths carry a `device_id` param (backend `upsertPushToken` stores it), but the iOS client never populates it (`LoginView.swift:157` passes `nil`). So `member_push_tokens.device_id` is always null; tokens are keyed solely by the unique `device_token`. | iOS `LoginView.swift:152-158`; `authService.upsertPushToken` `device_id` param | Kept (faithful) — harmless; the unique `device_token` is the real key. A rebuild could populate `device_id` or drop the param. |
| **F2** | **No explicit push-token `DELETE` on logout** — iOS only unregisters when the user *denies* notifications in iOS Settings (`APIClient+Auth.swift:79-91`); a normal logout leaves the token row. The next user on the device re-`upsert`s the same `device_token` (re-pointing `member_id`), so cross-account leakage is avoided by the unique-token upsert, but stale rows can linger. | iOS push lifecycle; `upsertPushToken` (re-points on conflict) | Kept (faithful) — the unique-`device_token` upsert prevents misdelivery; a rebuild could `DELETE /device` on logout. |
| **F3** | **app-config is public (no `authenticateToken`)** — the gate must run before login, so it is the one unauthenticated `/api/*` route besides the auth endpoints. Returns only non-sensitive version thresholds (strings / ints). | `server.js` app-config route (no auth middleware) | Kept (faithful) — required for the pre-login gate. |
| **F4** | **`MIN_IOS_VERSION` is Blueprint-declared; the 0.2.0 vars are operator-managed.** `render.yaml:38-39` declares `MIN_IOS_VERSION` `value: "1.2.0"` (live value confirmed 2026-10-12; blocks nobody — the oldest live iOS is 1.4.0). The four 0.2.0 vars are **not** in `render.yaml` — absent → `null` / off — and are set via the Render MCP only when needed, then a redeploy applies them. *(0.1.0 said `MIN_IOS_VERSION` was "not declared in `render.yaml`" — wrong; corrected in 0.2.0.)* | `apps/backend/render.yaml:38-39`; `.claude/skills/deploy/SKILL.md` (non-secret vars live in the YAML) | Kept — `render.yaml` left untouched. |
| **F5** | **Web ignores app-config + push entirely** — `consumed_by = [ios]`. Web has no version gate and receives notifications via SSE, not APNs (web sweep: zero matches). | Web sweep | Kept (faithful) — web is always current; not a divergence to reconcile. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the **last backend COVERAGE row** — `app-config` (the inline `GET /api/app-config` iOS version gate + `MIN_IOS_VERSION` env) and indexes **push (APNs)** as a cross-reference (already ported + documented in `notifications` + `auth`). Decisions: **D-C1** (own app-config, reference push; keep the route inline) · **D-C2** (add `Cache-Control: public, max-age=300`) · **D-C3** (trim + semver-validate `MIN_IOS_VERSION` via `normalizeMinIosVersion` → malformed env yields `null`) · **D-REF** (`consumed_by = [ios]`; web consumes neither) · **D-S1** (faithful 1:1 otherwise). Flagged F1–F5 (`device_id` always nil; no logout `DELETE`; public route; operator-managed env; web ignores both). No migration delta (stateless static route, no schema). Two code changes applied to `server.js` (D-C2/D-C3); push code was already fully ported with `notifications`/`auth`. |
| 0.2.0 | 2026-10-12 | **Version gate for iOS + Android (reliability overhaul Phase 2 track C; DESIGN_BOARD §1, approved 2026-10-11).** `GET /api/app-config` gains three additive keys — `latest_ios_version`, `min_android_version_code`, `latest_android_version_code` — from new env `LATEST_IOS_VERSION` / `MIN_ANDROID_VERSION_CODE` / `LATEST_ANDROID_VERSION_CODE` (unset/malformed → `null`; `min_ios_version` unchanged) (**D-C4**). New off-by-default switch `BLOCK_UNVERSIONED_ANDROID`: header-less Android (`okhttp/` UA, no `X-App-Version`) → `426 { error, code: "update_required" }` on every `/api/*` route except app-config and `POST /api/client-events`, answered before auth (no 401, no refresh, no sign-out) (**D-C5**). app-config reads only the presence of `X-App-Version` + `User-Agent`; the `X-App-*` header contract is owned by `specs/features/observability/SPEC.md` (lands with Phase 2 track A) (**D-C6**). New module `middleware/versionGate.js` (`normalizeVersion` [was `normalizeMinIosVersion`], `normalizeVersionCode`, `getAppConfig`, `blockUnversionedAndroid`); the route stays inline (D-C1). Review follow-up: `normalizeVersionCode` also caps at `≤ 2100000000` (Play's maximum `versionCode`), and the D-C5 exemption key is trailing-slash-stripped + lower-cased (Express non-strict, case-insensitive routing). Env changes apply only on the next deploy (§7). Doc fixes: F4 (`MIN_IOS_VERSION` IS in `render.yaml`), §3 route anchor, §6 push is iOS + Android (FCM), §7 `APNS_*` live, §8 D-C1/D-C3 bullets. Zero effect on any live binary (iOS 1.4.x ignores unknown keys; Android 1.0.0 never calls app-config; switch off). Client UI (iOS soft banner, Android blocking screen + headers) = Phase 3. `consumed_by` unchanged (`[ios]`). MINOR. |
