# Feature: `app-config` — the iOS version gate (+ a push index)

> **Status:** 🏗️ built (ported to `apps/backend/`) · **Version:** 0.1.0 · **Apps (`consumed_by`):** `ios`
> **Reference impl (legacy):** `../../../backend` — `server.js` (the inline `GET /api/app-config` route +
> the `MIN_IOS_VERSION` env). **No service / model / route file** — it is a single static inline route.
> **Depends on:** nothing (no auth — the gate is public, hit before login).
> **References (push, not owned here):** [`notifications`](../notifications/SPEC.md) (the APNs device routes
> `PUT`/`DELETE /api/notifications/device`, the APNs dispatch `utils/pushNotifications.js`, the
> `member_push_tokens` table, the `APNS_*` env) · [`auth`](../auth/SPEC.md) (`upsertPushToken`/
> `removePushToken` + the login-body push capture). This SPEC is the **push index** — §6 maps the
> end-to-end APNs path 1:1; the mechanics live in those two SPECs (single-sourced).
> **Deliberate changes (2 cleanups vs legacy, the rest faithful 1:1):** **D-C2** add `Cache-Control` to the
> response so the gate is cached between polls; **D-C3** trim + semver-validate `MIN_IOS_VERSION` so a
> malformed env yields `null` (no gate) instead of a broken client comparison.

---

## 1. What it is

The **app-config endpoint** — a single public route, `GET /api/app-config`, returning
`{ "min_ios_version": "x.y.z" | null }`. It is the **iOS version gate**: the iOS client polls it on launch,
on foreground, and before opening a widget deep-link, and if the installed app version is below
`min_ios_version` it shows a **non-dismissable force-update modal** ("Update Required" → App Store). The
value is sourced from the `MIN_IOS_VERSION` env var (Render dashboard). No body, no auth, no DB —
the simplest backend surface in the app.

This is also the **last backend COVERAGE row** (`app-config (min iOS version) + push (APNs)`,
[COVERAGE.md](../../../COVERAGE.md) L26). The **push (APNs)** half of that row is **already fully ported +
documented** in [`notifications`](../notifications/SPEC.md) (device routes, APNs dispatch, `member_push_tokens`,
`APNS_*`) and [`auth`](../auth/SPEC.md) (login capture + `upsert/removePushToken`). So this SPEC **owns
app-config** and acts as the **cross-reference index** for push (§6) — closing the row without duplicating
the push docs (single-source-of-truth).

## 2. Why it exists

So the team can **force an iOS upgrade** without an App Store review cycle: bump `MIN_IOS_VERSION` in Render
and every iOS client below it is blocked at next launch until it updates. This protects against old clients
hitting a changed/removed API contract. It is **iOS-only by design** — `min_ios_version` gates the native app;
the web app is always current (served fresh from Vercel) and has no version to check, so `consumed_by = [ios]`.

## 3. Functionality (the route)

One inline route in `server.js` (no router module, faithful to legacy — **D-C1**). Public (no
`authenticateToken`) — the gate must work before/around login.

| # | Route | Handler | Auth | Purpose |
|---|-------|---------|------|---------|
| 1 | `GET /api/app-config` | inline `server.js:47-62` (ported) | **none** (public) | Return `{ min_ios_version }` for the iOS version gate. Always `200`. |

**Response:** `{ "min_ios_version": "1.2.3" | null }`. `200` always; no error paths (a missing/malformed env
→ `null`, see D-C3). **`Cache-Control: public, max-age=300`** (D-C2).

### iOS consumption (the gate — reference only, not owned)

- **Fetch:** `ProgramContext+VersionCheck.swift:7-22` `checkMinimumSupportedVersion()` → `GET /api/app-config`,
  decodes `AppConfigResponse { min_ios_version }` (`APIClient.swift:37-39`).
- **Compare:** `ProgramContext+VersionCheck.swift:29-42` `isVersion(_:lessThan:)` — parses dot-separated ints
  (`"1.2.3" → [1,2,3]`), left-to-right; `currentVersion` from `CFBundleShortVersionString`. Sets
  `isUpdateRequired` (`:19`).
- **UI:** `ForcedUpdateModalView` (`NotificationModalView.swift:46-93`) — full-screen, `interactiveDismissDisabled(true)`,
  "Update Now" → App Store URL. Cannot be dismissed; must update.
- **Triggers:** app init (`AppRootView.swift:37`), foreground (`:70`), pre-widget-deep-link (`:85-87`).

## 4. Feature list (behaviors to port)

- **`GET /api/app-config`** — return `{ min_ios_version: normalizeMinIosVersion(process.env.MIN_IOS_VERSION) }`
  with `Cache-Control: public, max-age=300`. Always `200`.
- **`normalizeMinIosVersion(raw)`** (new, D-C3) — `null` if not a string; else `trim()` and return it only if
  it matches `^\d+(\.\d+)*$` (dot-separated integers, the exact format the iOS comparator parses), else `null`.
  Legacy returned `process.env.MIN_IOS_VERSION || null` (raw, untrimmed, unvalidated).

## 5. Data / schema touchpoints

**None.** No DB read or write; no model; no migration delta. The only input is the `MIN_IOS_VERSION` env var.

## 6. Push (APNs) — the cross-reference index (NOT owned here)

The "+ push (APNs)" half of [COVERAGE.md](../../../COVERAGE.md) L26 is **already ported + documented** in two
other SPECs. This section is the **end-to-end map** so the row is verifiably 1:1; the mechanics are
single-sourced there. **Push is `consumed_by = [ios]` only** — the web client receives notifications via SSE
(`/api/notifications/stream`), never APNs (web sweep: zero device-token registration).

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

- **`MIN_IOS_VERSION`** (owned here) — the version gate value (e.g. `"1.2.3"`). Set in the Render dashboard;
  **not** declared in `render.yaml` (operator-managed, may be empty/absent → `null` → no gate). Trimmed +
  semver-validated (D-C3).
- **`APNS_*`** (referenced, owned by [`notifications`](../notifications/SPEC.md)) — APNs creds, `sync:false`,
  deferred (D-C4 there).

## 8. The migration delta + the deliberate changes

**No auth-table / stack / schema migration delta** — app-config is a stateless static route; the legacy
inline route ports byte-for-byte onto the new stack. The only changes are two pinned cleanups on the owned
route:

- **D-C1 — scope + route shape (keep inline).** This SPEC owns the `GET /api/app-config` route + the
  `MIN_IOS_VERSION` env, kept **inline in `server.js`** (faithful — legacy serves it inline too; a trivial
  static route warrants no router/service/model). Push is **referenced**, not owned (§6) — re-documenting it
  here would duplicate [`notifications`](../notifications/SPEC.md) + [`auth`](../auth/SPEC.md) (SSOT violation).
- **D-C2 — add `Cache-Control: public, max-age=300`.** iOS polls the gate on every launch/foreground/widget-open
  (3 triggers); legacy returned it with no cache header. Adding a 5-minute cache lets the client/CDN avoid
  re-fetching the rarely-changing gate. Pure response-header addition; body unchanged.
- **D-C3 — trim + semver-validate `MIN_IOS_VERSION`.** Legacy returned `process.env.MIN_IOS_VERSION || null`
  (raw). A stray-whitespace or malformed value (`" 1.2.3 "`, `"v1.2"`, `"latest"`) would flow to the iOS
  comparator, which parses dot-separated ints — producing a wrong or broken gate. `normalizeMinIosVersion`
  trims and accepts only `^\d+(\.\d+)*$`, else `null` (no gate). **Behavior change only for a malformed env**;
  a well-formed value is returned identically (now trimmed).

**What stays (faithful 1:1):** the route path, the public (no-auth) access, the response key `min_ios_version`,
the `null`-when-unset semantics, and the always-`200` contract.

> **Scope note (D-C1).** No migration delta — stateless route, no schema. This SPEC owns app-config; the push
> half is indexed (§6), owned by `notifications` + `auth`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-C1** | **Scope = own app-config, reference push; keep the route inline.** Own `GET /api/app-config` + `MIN_IOS_VERSION` (inline in `server.js`, faithful). Push is documented in [`notifications`](../notifications/SPEC.md) + [`auth`](../auth/SPEC.md); §6 is a cross-reference index, not a re-doc (SSOT). | `server.js:47-62`; legacy `server.js:40-44`; notifications/auth SPECs; COVERAGE L26. User answers (own+reference; keep inline). |
| **D-C2** | **Add `Cache-Control: public, max-age=300`** to the response — iOS polls on every launch/foreground/widget-open; legacy had no cache header. Body unchanged. | `server.js:48`; iOS triggers `AppRootView.swift:37,70,85`. User pinned. |
| **D-C3** | **Trim + semver-validate `MIN_IOS_VERSION`** via `normalizeMinIosVersion` (`^\d+(\.\d+)*$`, else `null`); legacy returned the raw env. Behavior change only for a malformed env (→ `null`, no gate, instead of a broken client comparison). | `server.js:53-57`; legacy `server.js:42`; iOS comparator `ProgramContext+VersionCheck.swift:29-42`. User pinned. |
| **D-REF** | **Reference impl = legacy `../../../backend`. `consumed_by = [ios]`** (both app-config and push). Web consumes **neither** (web sweep: no `/api/app-config`, no device-token registration — it uses SSE for notifications). | iOS sweep (`ProgramContext+VersionCheck.swift`, `APIClient+Auth.swift`, `LoginView.swift`) + web sweep (zero matches); Explore agents. |
| **D-S1** | **Stance = faithful 1:1 except D-C2/D-C3.** The route path, public access, response shape, `null`-when-unset, and always-`200` ported exactly; the two cleanups are additive/defensive. Oddities flagged (§10). | `server.js`; §8; user answer (change now = the 2 cleanups). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **iOS sends `device_id` but it is always `nil`** — the login + register paths carry a `device_id` param (backend `upsertPushToken` stores it), but the iOS client never populates it (`LoginView.swift:157` passes `nil`). So `member_push_tokens.device_id` is always null; tokens are keyed solely by the unique `device_token`. | iOS `LoginView.swift:152-158`; `authService.upsertPushToken` `device_id` param | Kept (faithful) — harmless; the unique `device_token` is the real key. A rebuild could populate `device_id` or drop the param. |
| **F2** | **No explicit push-token `DELETE` on logout** — iOS only unregisters when the user *denies* notifications in iOS Settings (`APIClient+Auth.swift:79-91`); a normal logout leaves the token row. The next user on the device re-`upsert`s the same `device_token` (re-pointing `member_id`), so cross-account leakage is avoided by the unique-token upsert, but stale rows can linger. | iOS push lifecycle; `upsertPushToken` (re-points on conflict) | Kept (faithful) — the unique-`device_token` upsert prevents misdelivery; a rebuild could `DELETE /device` on logout. |
| **F3** | **app-config is public (no `authenticateToken`)** — the gate must run before login, so it is the one unauthenticated `/api/*` route besides the auth endpoints. Returns only a non-sensitive version string. | `server.js:51` (no auth middleware) | Kept (faithful) — required for the pre-login gate. |
| **F4** | **`MIN_IOS_VERSION` is operator-managed (not in `render.yaml`)** — set manually in the Render dashboard; absent/empty → `null` → no gate (every client passes). | `server.js:56`; Render env | Kept (faithful) — intentional; lets ops toggle the gate without a deploy. |
| **F5** | **Web ignores app-config + push entirely** — `consumed_by = [ios]`. Web has no version gate and receives notifications via SSE, not APNs (web sweep: zero matches). | Web sweep | Kept (faithful) — web is always current; not a divergence to reconcile. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker`. Documents the **last backend COVERAGE row** — `app-config` (the inline `GET /api/app-config` iOS version gate + `MIN_IOS_VERSION` env) and indexes **push (APNs)** as a cross-reference (already ported + documented in `notifications` + `auth`). Decisions: **D-C1** (own app-config, reference push; keep the route inline) · **D-C2** (add `Cache-Control: public, max-age=300`) · **D-C3** (trim + semver-validate `MIN_IOS_VERSION` via `normalizeMinIosVersion` → malformed env yields `null`) · **D-REF** (`consumed_by = [ios]`; web consumes neither) · **D-S1** (faithful 1:1 otherwise). Flagged F1–F5 (`device_id` always nil; no logout `DELETE`; public route; operator-managed env; web ignores both). No migration delta (stateless static route, no schema). Two code changes applied to `server.js` (D-C2/D-C3); push code was already fully ported with `notifications`/`auth`. |
