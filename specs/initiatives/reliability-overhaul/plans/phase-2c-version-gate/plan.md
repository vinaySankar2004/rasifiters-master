# Phase 2 track C — plan

# PLAN: Reliability overhaul Phase 2 track C. Backend version gate: additive per-platform `app-config` fields and an off-by-default `BLOCK_UNVERSIONED_ANDROID` 426 switch

**Brief accepted**: yes (8 files: 1 new, 7 edited. There is one deliberate addition inside a briefed file: `registry.json` `reference_impl.paths` gains `middleware/versionGate.js` so git-version maps the new file to this feature.)

**Feature/version prediction**: `app-config` v0.1.0 → v0.2.0. This is MINOR because it adds new owned behavior, makes an additive owned-interface change and changes `reference_impl`. Tag: `feature/app-config@v0.2.0`.

**Surfaces in scope**: [backend] only. Web, iOS and Android get no changes; their client work is Phase 3. There is one implementer.

**Already checked by the planner (read-only):**
- The `versionGate.js` and `server.js` code below was run in a scratch copy:
  - `node --check` passed;
  - the normalizer checks passed;
  - the two-server boot smoke in step 9 passed 13 of 13.
- Live prod `GET /api/app-config` returns `{"min_ios_version":"1.2.0"}` with `cache-control: public, max-age=300`. The live value matches `render.yaml:38-39`, so open question 3 is answered without reading Render env.

**Decisions on the brief's open questions:**
1. **`X-App-Build` is in the header contract** (`X-App-Platform`, `X-App-Version`, `X-App-Build`; `X-Request-Id` belongs to A).
   - **FLAG for A:** track A's plan must use exactly these names.
   - Track C reads only whether `X-App-Version` is present, plus the User-Agent.
2. **Shared-file order:**
   - C edits and commits its hunks in `server.js`, `.env.example` and `ENV_RUNBOOK.md` first.
   - A starts its edits to those three files only after C's commit. A can work on its own files in parallel the whole time.
   - Why: the harness has no interactive staging, so two tracks' hunks in one working-tree file can't be committed separately.
   - C's anchors are text, not line numbers, so they survive any order.
   - A's request-id and logger middleware must sit **above** the `// app-config` comment block, so the 426s get logged.
3. **SPEC F4:** fix the doc to match `render.yaml`. `render.yaml` is not touched.

## Steps — backend

1. **NEW** `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/versionGate.js`. Create it with exactly this content (54 lines):
```js
// Version gate — owned by the app-config feature (specs/features/app-config/SPEC.md v0.2.0). No DB.
//   getAppConfig()          → the public GET /api/app-config body: a hard minimum + a soft-nudge version
//                             per platform, from env. Unset/malformed → null = nobody blocked or nudged
//                             (D-C3, D-C4). Clients compare + act; the server never 426s a versioned client.
//   blockUnversionedAndroid → the ONE server-side 426: header-less Android (1.0.0 builds send only
//                             `User-Agent: okhttp/x`, never X-App-Version), and only while
//                             BLOCK_UNVERSIONED_ANDROID=true (default off) (D-C5). Replies directly —
//                             errorHandler.js would drop `code`.
// Env is read per request, exactly like the original inline route (no cached copy).

const UPDATE_REQUIRED_MESSAGE = "Please update RaSi Fiters from the Play Store";

// iOS marketing version ("1.4.2"): trimmed, dot-separated integers only — the format the iOS
// comparator parses — else null (D-C3).
function normalizeVersion(raw) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return /^\d+(\.\d+)*$/.test(trimmed) ? trimmed : null;
}

// Android versionCode ("5"): trimmed, positive integer only, else null (D-C4).
function normalizeVersionCode(raw) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const code = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(code) && code > 0 ? code : null;
}

function getAppConfig(env = process.env) {
    return {
        min_ios_version: normalizeVersion(env.MIN_IOS_VERSION),
        latest_ios_version: normalizeVersion(env.LATEST_IOS_VERSION),
        min_android_version_code: normalizeVersionCode(env.MIN_ANDROID_VERSION_CODE),
        latest_android_version_code: normalizeVersionCode(env.LATEST_ANDROID_VERSION_CODE)
    };
}

function isBlockingUnversionedAndroid(env = process.env) {
    const raw = env.BLOCK_UNVERSIONED_ANDROID;
    return typeof raw === "string" && raw.trim().toLowerCase() === "true";
}

function blockUnversionedAndroid(req, res, next) {
    if (!isBlockingUnversionedAndroid()) return next();
    const unversioned = !req.get("X-App-Version");
    const okhttp = /^okhttp\//i.test(req.get("User-Agent") || "");
    if (unversioned && okhttp) {
        return res.status(426).json({ error: UPDATE_REQUIRED_MESSAGE, code: "update_required" });
    }
    return next();
}

module.exports = { normalizeVersion, normalizeVersionCode, getAppConfig, blockUnversionedAndroid };
```

2. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js` (**SHARED with A/B. Edit only these two hunks.**)
   - **2a.** Directly after the line `const { errorHandler } = require("./middleware/errorHandler");` (currently line 8), insert:
```js
const { getAppConfig, blockUnversionedAndroid } = require("./middleware/versionGate");
```
   - **2b.** Replace the whole block from `// app-config — the iOS version gate (consumed_by = [ios]; web ignores it)...` through the closing `});` of `app.get("/api/app-config", ...)` (currently lines 47-63). That block includes the inline `normalizeMinIosVersion` function. The new block must be followed by one blank line and then the unchanged `app.use("/api/auth", authRoutes);`:
```js
// app-config — the version gate (specs/features/app-config/SPEC.md v0.2.0). Public, always 200, cached
// 5 min (D-C2). Body = per-platform hard minimum + soft nudge from env; `min_ios_version` keeps its exact
// name/shape for the live iOS binary, the other 3 keys are additive (D-C4); unset/malformed env → null =
// nobody blocked (D-C3). Route kept inline (D-C1); the normalizers live in middleware/versionGate.js.
// Push (APNs/FCM) is owned by `notifications` + `auth`.
app.get("/api/app-config", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.json(getAppConfig());
});

// D-C5: header-less Android (the 1.0.0 builds) → 426 "Please update…" — a no-op unless
// BLOCK_UNVERSIONED_ANDROID=true (default off). Mounted AFTER app-config (never gated) and BEFORE every
// router. Request-id / request-log middleware must mount above app-config so these 426s are logged.
app.use("/api", blockUnversionedAndroid);
```
   - Nothing else in `server.js` changes: CORS, `express.json()`, routers, `/api/test` and `errorHandler` stay as they are.

3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example` (shared, **append only**). After the last line, `MIN_IOS_VERSION=1.2.0` (line 21), append:
```
# --- Version gate (app-config SPEC v0.2.0, D-C4/D-C5) — leave unset: nobody is blocked, nudged or 426'd ---
# LATEST_IOS_VERSION=1.5.0          # iOS soft "Update available" nudge below this marketing version
# MIN_ANDROID_VERSION_CODE=6        # Android hard minimum versionCode (blocking update screen)
# LATEST_ANDROID_VERSION_CODE=6     # Android soft-nudge versionCode
# BLOCK_UNVERSIONED_ANDROID=true    # 426 every header-less Android (1.0.0) /api request — default OFF
```

4. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md` §3 (shared, **only the `MIN_IOS_VERSION` row and the new rows**).
   - Replace line 109, which begins ``| `MIN_IOS_VERSION` |``, with the five rows below.
   - The `CORS_ALLOWED_ORIGINS` row at line 110 is track A's; leave it alone.
```
| `MIN_IOS_VERSION` | min iOS app version, served as `min_ios_version` at `GET /api/app-config` | no | legacy `1.2.0`; force-upgrade gate for the iOS client. Keep. **Declared in `render.yaml`** (`value: "1.2.0"` — blocks nobody; oldest live iOS is 1.4.0); change it there (app-config SPEC §7, F4). |
| `LATEST_IOS_VERSION` | iOS soft "Update available" threshold, served as `latest_ios_version` | no | **NEW (app-config 0.2.0, D-C4)** — dot-separated ints (`1.5.0`); unset/malformed → `null` (no nudge). Operator-managed: **not** in `render.yaml`; set via the Render MCP `update_environment_variables` (per-call confirm) when a release ships. |
| `MIN_ANDROID_VERSION_CODE` | Android hard minimum `versionCode`, served as `min_android_version_code` | no | **NEW (D-C4)** — positive integer (`6`); unset/malformed → `null` (nobody blocked). Read by the Phase 3 Android build (blocking update screen). Operator-managed, not in `render.yaml`. |
| `LATEST_ANDROID_VERSION_CODE` | Android soft-nudge `versionCode`, served as `latest_android_version_code` | no | **NEW (D-C4)** — positive integer; unset/malformed → `null`. Operator-managed, not in `render.yaml`. |
| `BLOCK_UNVERSIONED_ANDROID` | switch: `426 {error, code:"update_required"}` on every `/api/*` request (except `/api/app-config`) from header-less Android — no `X-App-Version` + `User-Agent: okhttp/…` = the 1.0.0 builds | no | **NEW (D-C5)** — on only when exactly `true` (trimmed, case-insensitive); **default OFF**. Turn on only after the Phase 3 Android build (sends `X-App-Version` on every OkHttp client) is adopted AND a backend change needs it. Operator-managed, not in `render.yaml`. |
```

5. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/app-config/SPEC.md`: bump to v0.2.0.
   - Line numbers refer to the **current** file. Match on the quoted old text, or apply bottom-up (5l first).

   - **5a. Lines 1-6.** Replace from `# Feature: \`app-config\` — the iOS version gate (+ a push index)` through `> **Depends on:** nothing ...` with:
```
# Feature: `app-config` — the mobile version gate (iOS + Android) (+ a push index)

> **Status:** 🚀 deployed (ported to `apps/backend/`) · **Version:** 0.2.0 · **Apps (`consumed_by`):** `ios`
> (Android reads the 0.2.0 fields from its Phase 3 build; `consumed_by` gains `android` when that build ships — D-C4)
> **Provenance (legacy, archived):** `backend` — `server.js` (the inline `GET /api/app-config` route +
> the `MIN_IOS_VERSION` env). **0.2.0** adds `middleware/versionGate.js` (env normalizers, `getAppConfig()`,
> the `blockUnversionedAndroid` middleware). Still no service / model / router file and no DB.
> **Depends on:** nothing (no auth — the gate is public, hit before login).
```
   - **5b. Lines 12-14.** Replace from `> **Deliberate changes (2 cleanups vs legacy, the rest faithful 1:1):**` through `...broken client comparison.` with:
```
> **Deliberate changes vs legacy:** **D-C2** add `Cache-Control` to the response so the gate is cached between
> polls; **D-C3** trim + validate the iOS version env so a malformed value yields `null` (no gate) instead of a
> broken client comparison. **0.2.0 (reliability overhaul, Phase 2 track C):** **D-C4** three additive
> per-platform threshold keys (enforced client-side); **D-C5** the off-by-default `BLOCK_UNVERSIONED_ANDROID`
> 426 switch; **D-C6** the `X-App-*` client header contract (shared with the observability track).
```
   - **5c. §1, lines 20-25.** Replace from `The **app-config endpoint** — a single public route` through `the simplest backend surface in the app.` with:
```
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
```
   - **5d. §2, lines 36-39.** Replace from `So the team can **force an iOS upgrade**` through `so \`consumed_by = [ios]\`.` with:
```
So the team can **force (or nudge) a mobile upgrade** without a store review cycle: raise a threshold env var on
Render and every client below it is blocked (or nudged) at next launch until it updates. This protects against
old clients hitting a changed/removed API contract — the reliability overhaul's **no-shims** policy
(DESIGN_BOARD §0.3) relies on it: backend changes stay additive, and when one must break old builds, the gate
blocks them with an update message instead. Mobile-only by design — the web app is always current (served
fresh from Vercel) and has no version to check, so web never consumes it (F5).
```
   - **5e. §3, lines 41-51.** Replace from `## 3. Functionality (the route)` through `**\`Cache-Control: public, max-age=300\`** (D-C2).` with:
````
## 3. Functionality (the route + the switch)

One inline route in `server.js` (no router module, faithful to legacy — **D-C1**) plus one `/api` middleware
from `middleware/versionGate.js`. The route is public (no `authenticateToken`) — the gate must work
before/around login.

| # | Route / mount | Handler | Auth | Purpose |
|---|---------------|---------|------|---------|
| 1 | `GET /api/app-config` | inline in `server.js` → `getAppConfig()` (`middleware/versionGate.js`) | **none** (public) | Return the 4 threshold keys. Always `200`. Never gated by #2. |
| 2 | `app.use("/api", blockUnversionedAndroid)` | `middleware/versionGate.js` | n/a | No-op unless `BLOCK_UNVERSIONED_ANDROID=true`; then `426` for header-less Android (D-C5). Mounted after #1, before every router. |

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
by the middleware itself (`errorHandler.js` would drop `code`). Match rule + scope: D-C5.
````
   - **5f. After line 62** (the `- **Triggers:** app init ...` bullet), insert:
```
- **Phase 3 (planned):** a dismissable "Update available" banner from `latest_ios_version` (once per version),
  and every request sends the D-C6 headers. The live 1.4.x binaries decode `AppConfigResponse` with the default
  `JSONDecoder` (`APIClient.swift:37-47`), which ignores the 3 new keys.

### Android consumption (planned — Phase 3, not live)

- The next Android build fetches `GET /api/app-config` (kotlinx `ignoreUnknownKeys = true`), compares its own
  `versionCode` with `min_android_version_code` (blocking screen → Play Store / Play in-app *immediate* update)
  and `latest_android_version_code` (soft banner), and sends the D-C6 headers on **every** OkHttp client (the
  D-C5 precondition). Android 1.0.0 (3)/(4) never calls app-config.
```
   - **5g. §4, lines 66-70.** Replace from ``- **`GET /api/app-config`** — return `{ min_ios_version: normalizeMinIosVersion(`` through `(raw, untrimmed, unvalidated).` with:
```
- **`GET /api/app-config`** — inline in `server.js`: `res.set("Cache-Control", "public, max-age=300")`, then
  `res.json(getAppConfig())`. Always `200`.
- **`getAppConfig(env = process.env)`** (0.2.0) — returns `min_ios_version: normalizeVersion(MIN_IOS_VERSION)`,
  `latest_ios_version: normalizeVersion(LATEST_IOS_VERSION)`, `min_android_version_code:
  normalizeVersionCode(MIN_ANDROID_VERSION_CODE)`, `latest_android_version_code:
  normalizeVersionCode(LATEST_ANDROID_VERSION_CODE)`. Env is read per request (no cache), like the original route.
- **`normalizeVersion(raw)`** (D-C3; named `normalizeMinIosVersion`, inline in `server.js`, through 0.1.0) — `null`
  if not a string; else `trim()` and return it only if it matches `^\d+(\.\d+)*$` (dot-separated integers, the
  exact format the iOS comparator parses), else `null`. Legacy returned `process.env.MIN_IOS_VERSION || null` (raw).
- **`normalizeVersionCode(raw)`** (D-C4) — `null` if not a string; else `trim()`; must match `^\d+$`, then
  `parseInt(…, 10)`; returned only if a safe integer `> 0`, else `null`.
- **`blockUnversionedAndroid(req, res, next)`** (D-C5) — `next()` unless `BLOCK_UNVERSIONED_ANDROID` (trimmed,
  lower-cased) equals `"true"`; when on, a request with **no** `X-App-Version` header **and** a `User-Agent`
  matching `^okhttp\/` (case-insensitive) gets `426 { error: "Please update RaSi Fiters from the Play Store",
  code: "update_required" }`; everything else → `next()`.
```
   - **5h. §5, line 74.** Replace with:
```
**None.** No DB read or write; no model; no migration delta. Inputs are the five env vars in §7 and, for the
D-C5 switch, the request's `X-App-Version` + `User-Agent` headers.
```
   - **5i. §6, lines 80-81.** Replace from ``single-sourced there. **Push is `consumed_by = [ios]` only**`` through `zero device-token registration).` with:
```
single-sourced there. **Push reaches iOS (APNs) and Android (FCM, since [`notifications`](../notifications/SPEC.md)
D-C9, 2026-07-08 — `platform:'android'` tokens, the `firebase-admin` sender in `utils/pushNotifications.js`,
`FIREBASE_SERVICE_ACCOUNT`).** The table below maps the iOS/APNs path; the FCM path is single-sourced in
notifications D-C9. The web client receives notifications via SSE (`/api/notifications/stream`), never push
(web sweep: zero device-token registration).
```
   - **5j. §7, lines 96-102.** Replace from `## 7. Flags / env` through `deferred (D-C4 there).` with:
```
## 7. Flags / env

All five are non-secret. Unset/malformed → `null` (or switch off) → **nobody blocked, nudged or 426'd**. The
staging API (Phase 2 track B) inherits the same defaults.

| Var | Served as / effect | Format | Where it's set |
|---|---|---|---|
| `MIN_IOS_VERSION` | `min_ios_version` — iOS hard minimum | dot-separated ints (`1.2.0`), D-C3 | **Declared in `render.yaml`** (`value: "1.2.0"`, live value confirmed 2026-10-12 — blocks nobody; oldest live iOS is 1.4.0). Change it in `render.yaml` so the Blueprint stays the source of truth (F4) |
| `LATEST_IOS_VERSION` | `latest_ios_version` — iOS soft nudge | dot-separated ints, D-C3 | Operator-managed, **not** in `render.yaml` — Render MCP `update_environment_variables` (per-call confirm), only when needed |
| `MIN_ANDROID_VERSION_CODE` | `min_android_version_code` — Android hard minimum | positive integer `versionCode` (`6`), D-C4 | Operator-managed (as above) |
| `LATEST_ANDROID_VERSION_CODE` | `latest_android_version_code` — Android soft nudge | positive integer `versionCode`, D-C4 | Operator-managed (as above) |
| `BLOCK_UNVERSIONED_ANDROID` | `426` for header-less Android on every `/api/*` route except app-config (D-C5) | on only for `true` (trimmed, case-insensitive); **default OFF** | Operator-managed (as above). Turn on only per D-C5's precondition |

- **`APNS_*`** (referenced, owned by [`notifications`](../notifications/SPEC.md)) — APNs creds, `sync:false`,
  live since 2026-06-30 (notifications D-C8).
```
   - **5k. §8.**
     - In lines 107-108, replace `The only changes are two pinned cleanups on the owned\nroute:` with `The 0.1.0 changes are two pinned cleanups on the owned\nroute; 0.2.0 adds the net-new D-C4–D-C6 (last bullet):`.
     - After line 121 (end of the D-C3 bullet, `...returned identically (now trimmed).`), insert:
```
- **D-C4–D-C6 (0.2.0, reliability overhaul Phase 2 track C)** — three additive per-platform threshold keys, the
  off-by-default `BLOCK_UNVERSIONED_ANDROID` 426 switch, and the `X-App-*` header contract. Net-new (not legacy
  behavior); zero effect on any live binary while the switch is off (the default). Detail in §9.
```
     - Replace lines 123-124 (`**What stays (faithful 1:1):** ...`) with:
```
**What stays (faithful 1:1):** the route path, the public (no-auth) access, the response key `min_ios_version`
(name + string-or-null shape), the `null`-when-unset semantics, and the always-`200` contract.
```
   - **5l. §9 table.**
     - Replace the rows **D-C1** (line 133), **D-C2** (134) and **D-C3** (135) with the six rows below (D-C1, D-C2, D-C3, then new D-C4, D-C5, D-C6).
     - Replace **D-REF** (136) and **D-S1** (137) with the two rows after them.
```
| **D-C1** | **Scope = own app-config, reference push; keep the route inline.** Own `GET /api/app-config` + its env (inline route in `server.js`, faithful). Since 0.2.0 the normalizers + the D-C5 middleware live in `middleware/versionGate.js` (keeps `server.js` thin); the route itself stays inline. Push is documented in [`notifications`](../notifications/SPEC.md) + [`auth`](../auth/SPEC.md); §6 is a cross-reference index, not a re-doc (SSOT). | `server.js` (inline `app.get("/api/app-config", …)`); legacy `server.js:40-44`; notifications/auth SPECs; COVERAGE L26. User answers (own+reference; keep inline). |
| **D-C2** | **Add `Cache-Control: public, max-age=300`** to the response — iOS polls on every launch/foreground/widget-open; legacy had no cache header. Body unchanged. | `server.js` app-config route; iOS triggers `AppRootView.swift:37,70,85`. User pinned. |
| **D-C3** | **Trim + validate the iOS version env** via `normalizeVersion` (`^\d+(\.\d+)*$`, else `null`; named `normalizeMinIosVersion` until 0.2.0, now also used for `LATEST_IOS_VERSION`); legacy returned the raw env. Behavior change only for a malformed env (→ `null`, no gate, instead of a broken client comparison). | `middleware/versionGate.js` `normalizeVersion`; legacy `server.js:42`; iOS comparator `ProgramContext+VersionCheck.swift:29-42`. User pinned. |
| **D-C4** | **Per-platform thresholds, additive; enforcement is client-side (0.2.0).** The body gains `latest_ios_version` (string or null, iOS soft nudge), `min_android_version_code` (int or null, Android hard minimum) and `latest_android_version_code` (int or null, Android soft nudge); `min_ios_version` keeps its exact name and shape. `LATEST_IOS_VERSION` uses the D-C3 normalizer; `MIN_/LATEST_ANDROID_VERSION_CODE` accept `^\d+$` → positive int, else `null`. Clients compare and act (blocking screen below `min_*`, dismissable once-per-version banner below `latest_*`); the server **never** 426s a versioned client below a minimum. Android compares **`versionCode`**, not `versionName` (`versionName` stayed `1.0.0` across codes 3/4/5). **No store-URL fields** (iOS hard-codes its App Store URL; Android uses the Play listing / Play in-app update). The 4 new vars are operator-managed (not in `render.yaml`). `consumed_by` stays `[ios]` until the Phase 3 Android build ships (then `+= android`, MINOR). | DESIGN_BOARD §1 + §0.3 (approved 2026-10-11); BRIEF §7 Phase 2 row C; iOS `APIClient.swift:37-47` (default `JSONDecoder` ignores unknown keys); Android `Network.kt` `ignoreUnknownKeys = true`; `apps/android/app/build.gradle.kts:41-42`; RELEASES.md. |
| **D-C5** | **`BLOCK_UNVERSIONED_ANDROID` — the one server-side 426 (0.2.0), default OFF.** On only when the env (trimmed, lower-cased) equals `"true"`. Match: no `X-App-Version` header **and** `User-Agent` matching `^okhttp\/` (case-insensitive) — Android 1.0.0 sends only `okhttp/4.12.0`; iOS (CFNetwork), browsers, curl and Node fetch never match. Reply `426 { error: "Please update RaSi Fiters from the Play Store", code: "update_required" }` directly from the middleware (`errorHandler.js` keeps only `error`). Mounted `app.use("/api", …)` after the app-config route (never gated) and before every router; `/` (health check) is outside `/api`. **Off: zero behavior change for every binary.** On: every `/api/*` call from 1.0.0 → 426; its refresh client signs out on any non-2xx (`Network.kt:113`) and the next login shows the `error` text (`ApiException.kt:30`). **Precondition to turning it on:** the Phase 3 Android build is adopted AND sends `X-App-Version` on **every** OkHttp client — the main Retrofit client (`Network.kt:32-36`), the bare refresh client (`Network.kt:75`, no interceptors today) and `NotificationStreamClient.kt:26` — else the new build blocks itself; and a backend change actually needs it ("on only when needed"). | DESIGN_BOARD §1 (old-Android row) + §0.3 no-shims; `middleware/errorHandler.js:5`; Android `Network.kt`, `NotificationStreamClient.kt`, `ApiException.kt`. |
| **D-C6** | **Client header contract (0.2.0) — shared with Phase 2 track A (observability), which logs these.** Phase 3 clients send on every request: `X-App-Platform` (`ios` / `android` / `web`, lowercase); `X-App-Version` (marketing version — iOS `CFBundleShortVersionString`, Android `versionName`; web may omit); `X-App-Build` (integer — iOS `CFBundleVersion`, Android `versionCode`; web omits). `X-Request-Id` is owned by observability. app-config reads **only the presence of `X-App-Version`** (+ `User-Agent`), so it works however track A logs. If track A pins a CORS `allowedHeaders` list it must include all four (today `cors` reflects the requested headers). | DESIGN_BOARD §1 (names `X-App-Platform` + `X-App-Version`) + §7.1; `X-App-Build` added because Android `versionName` stayed `1.0.0` across codes 3/4/5 (RELEASES.md), so the version alone can't tell builds apart in logs. |
| **D-REF** | **Reference impl = legacy `backend`. app-config `consumed_by = [ios]`** (Android joins with its Phase 3 build, D-C4). Push reaches iOS (APNs) + Android (FCM, notifications D-C9). Web consumes **neither** app-config nor push (no `/api/app-config`, no device-token registration — it uses SSE for notifications). | iOS sweep (`ProgramContext+VersionCheck.swift`, `APIClient+Auth.swift`, `LoginView.swift`) + web sweep (zero matches); notifications D-C9. |
| **D-S1** | **Stance = faithful 1:1 except D-C2/D-C3 (0.1.0) and the net-new D-C4–D-C6 (0.2.0).** The route path, public access, the `min_ios_version` key + shape, `null`-when-unset, and always-`200` ported exactly; the cleanups are defensive and the 0.2.0 additions are additive / off by default. Oddities flagged (§10). | `server.js`; §8; user answer (0.1.0); DESIGN_BOARD approval 2026-10-11 (0.2.0). |
```
   - **5m. §10.**
     - In row **F3** (line 145), replace `` `server.js:51` (no auth middleware) `` with `` `server.js` app-config route (no auth middleware) ``.
     - Replace row **F4** (line 146) with:
```
| **F4** | **`MIN_IOS_VERSION` is Blueprint-declared; the 0.2.0 vars are operator-managed.** `render.yaml:38-39` declares `MIN_IOS_VERSION` `value: "1.2.0"` (live value confirmed 2026-10-12; blocks nobody — the oldest live iOS is 1.4.0). The four 0.2.0 vars are **not** in `render.yaml` — absent → `null` / off — and are set via the Render MCP only when needed. *(0.1.0 said `MIN_IOS_VERSION` was "not declared in `render.yaml`" — wrong; corrected in 0.2.0.)* | `apps/backend/render.yaml:38-39`; `.claude/skills/deploy/SKILL.md` (non-secret vars live in the YAML) | Kept — `render.yaml` left untouched (track B adds the staging service there). |
```
   - **5n. §11.** After line 153 (the 0.1.0 row), append:
```
| 0.2.0 | 2026-10-12 | **Version gate for iOS + Android (reliability overhaul Phase 2 track C; DESIGN_BOARD §1, approved 2026-10-11).** `GET /api/app-config` gains three additive keys — `latest_ios_version`, `min_android_version_code`, `latest_android_version_code` — from new env `LATEST_IOS_VERSION` / `MIN_ANDROID_VERSION_CODE` / `LATEST_ANDROID_VERSION_CODE` (unset/malformed → `null`; `min_ios_version` unchanged) (**D-C4**). New off-by-default switch `BLOCK_UNVERSIONED_ANDROID`: header-less Android (`okhttp/` UA, no `X-App-Version`) → `426 { error, code: "update_required" }` on every `/api/*` route except app-config (**D-C5**). Client header contract `X-App-Platform` / `X-App-Version` / `X-App-Build` (**D-C6**, shared with track A). New module `middleware/versionGate.js` (`normalizeVersion` [was `normalizeMinIosVersion`], `normalizeVersionCode`, `getAppConfig`, `blockUnversionedAndroid`); the route stays inline (D-C1). Doc fixes: F4 (`MIN_IOS_VERSION` IS in `render.yaml`), §3 route anchor, §6 push is iOS + Android (FCM), §7 `APNS_*` live. Zero effect on any live binary (iOS 1.4.x ignores unknown keys; Android 1.0.0 never calls app-config; switch off). Client UI (iOS soft banner, Android blocking screen + headers) = Phase 3. `consumed_by` unchanged (`[ios]`). MINOR. |
```

6. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json`, the `"app-config"` entry (lines 343-357).
   - Set `"version": "0.1.0"` → `"version": "0.2.0"`.
   - Set `"paths": ["server.js"]` → `"paths": ["server.js", "middleware/versionGate.js"]`, keeping the file's existing 2-space, one-item-per-line array formatting.
   - Everything else stays (`consumed_by` `["ios"]`, `depends_on` `[]`, `status` `"deployed"`).

7. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md`, line 26. Replace the `app-config` row with:
```
| `app-config` | 0.2.0 | 🚀 | `ios` | `backend` (`server.js` [inline `GET /api/app-config`], `middleware/versionGate.js` [per-platform thresholds + `BLOCK_UNVERSIONED_ANDROID` switch]) | [app-config/SPEC.md](app-config/SPEC.md) |
```
   - Leave the history prose at lines 92-95 untouched.

## Steps — web
None (F5: web never consumes app-config).

## Steps — ios
None. The iOS soft banner and headers come in Phase 3. The live 1.4.x binaries ignore the new keys.

## Steps — android
None. The blocking screen, soft banner and `X-App-*` headers on all three OkHttp clients come in Phase 3.

## Endgame

8. **Compile check (backend).** The implementer runs these:
   - Syntax:
     ```
     cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && node --check server.js && node --check middleware/versionGate.js && echo CHECK_OK
     ```
   - Normalizers (no DB). Expected output: `normalizers OK`.
     ```
     cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && node -e 'const a=require("node:assert");const {normalizeVersion:v,normalizeVersionCode:c,getAppConfig:g}=require("./middleware/versionGate");a.strictEqual(v(" 1.2.0 "),"1.2.0");a.strictEqual(v("v1.5"),null);a.strictEqual(v("1.2."),null);a.strictEqual(v(""),null);a.strictEqual(v(undefined),null);a.strictEqual(c(" 6 "),6);a.strictEqual(c("0"),null);a.strictEqual(c("-3"),null);a.strictEqual(c("6.0"),null);a.strictEqual(c("abc"),null);a.strictEqual(c(undefined),null);a.deepStrictEqual(g({}),{min_ios_version:null,latest_ios_version:null,min_android_version_code:null,latest_android_version_code:null});console.log("normalizers OK")'
     ```
   - Web, Android and iOS: nothing is touched, so there is no build to run.
   - iOS compile and all visual or live checks are the USER's. This repo has no staging and no test suite.

9. **Local boot smoke.** Claude runs it.
   - It boots two local servers. They connect to the live Supabase DB using the `DATABASE_URL` in `apps/backend/.env`, which only runs `sequelize.authenticate()`.
   - The Supabase keys are placeholders; no request in this smoke reaches Supabase Auth.
   - `apps/backend/.env.local` must not exist (it doesn't today).
   - Write the script to the session scratchpad as `boot-smoke.sh` and run it from `apps/backend` with `bash <scratchpad>/boot-smoke.sh server.js`.
   - Every line must be PASS, ending `PASS=13 FAIL=0`.
```bash
#!/usr/bin/env bash
# usage (cwd = apps/backend so dotenv loads DATABASE_URL from .env): bash boot-smoke.sh server.js
set -u
SRV="$1"; LOG=$(mktemp -d)
COMMON=(SUPABASE_URL=https://kpadxjekpiwfkqcxtrio.supabase.co SUPABASE_ANON_KEY=smoke-placeholder SUPABASE_SERVICE_ROLE_KEY=smoke-placeholder MIN_IOS_VERSION=1.2.0)
env "${COMMON[@]}" PORT=5057 LATEST_IOS_VERSION= MIN_ANDROID_VERSION_CODE= LATEST_ANDROID_VERSION_CODE= BLOCK_UNVERSIONED_ANDROID= node "$SRV" >"$LOG/off.log" 2>&1 & P1=$!
env "${COMMON[@]}" PORT=5058 LATEST_IOS_VERSION=1.5.0 MIN_ANDROID_VERSION_CODE=6 LATEST_ANDROID_VERSION_CODE=7 BLOCK_UNVERSIONED_ANDROID=true node "$SRV" >"$LOG/on.log" 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null' EXIT
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1 — expected [$3] got [$2]"; FAIL=$((FAIL+1)); fi; }
req() { curl -s -m 10 --retry 20 --retry-connrefused --retry-delay 1 -o "$LOG/body" -D "$LOG/hdr" -w '%{http_code}' "$@"; }
OFF=http://127.0.0.1:5057; ON=http://127.0.0.1:5058; OK='okhttp/4.12.0'
check "off: app-config 200" "$(req $OFF/api/app-config)" "200"
check "off: app-config body" "$(cat $LOG/body)" '{"min_ios_version":"1.2.0","latest_ios_version":null,"min_android_version_code":null,"latest_android_version_code":null}'
check "off: Cache-Control" "$(grep -i '^cache-control:' $LOG/hdr | cut -d' ' -f2- | tr -d '\r')" "public, max-age=300"
check "off: header-less okhttp passes" "$(req -A "$OK" $OFF/api/test)" "200"
check "on: app-config body" "$(req $ON/api/app-config; cat $LOG/body)" '200{"min_ios_version":"1.2.0","latest_ios_version":"1.5.0","min_android_version_code":6,"latest_android_version_code":7}'
check "on: header-less okhttp → 426" "$(req -A "$OK" $ON/api/test)" "426"
check "on: 426 body" "$(cat $LOG/body)" '{"error":"Please update RaSi Fiters from the Play Store","code":"update_required"}'
check "on: login route gated too" "$(req -A "$OK" -X POST -H 'Content-Type: application/json' -d '{}' $ON/api/auth/login/global)" "426"
check "on: versioned Android passes" "$(req -A "$OK" -H 'X-App-Platform: android' -H 'X-App-Version: 1.1.0' -H 'X-App-Build: 6' $ON/api/test)" "200"
check "on: app-config never gated" "$(req -A "$OK" $ON/api/app-config)" "200"
check "on: iOS UA passes" "$(req -A 'RaSi%20Fiters/56 CFNetwork/1568.100.1 Darwin/24.0.0' $ON/api/test)" "200"
check "on: curl/browser UA passes" "$(req $ON/api/test)" "200"
check "on: / (health) not gated" "$(req -A "$OK" $ON/)" "200"
echo "PASS=$PASS FAIL=$FAIL"; [ "$FAIL" = 0 ] || { echo "--- off.log"; tail -20 "$LOG/off.log"; echo "--- on.log"; tail -20 "$LOG/on.log"; }
```
   - Afterwards confirm both ports are free:
     ```
     lsof -ti tcp:5057 -ti tcp:5058 -sTCP:LISTEN | xargs kill 2>/dev/null; echo clean
     ```

10. **Migration:** none (there is no DB surface).

11. **Post-deploy prod check (read-only, public; Claude may run it).**
    - The push to `main` auto-deploys `rasifiters-api`: `server.js` and `middleware/` match the `buildFilter`.
    - The app-config response should be exactly `{"min_ios_version":"1.2.0","latest_ios_version":null,"min_android_version_code":null,"latest_android_version_code":null}` with `cache-control: public, max-age=300`:
      ```
      curl -s -D - https://rasifiters-api.onrender.com/api/app-config
      ```
    - The switch should be off, so this returns `200`:
      ```
      curl -s -o /dev/null -w '%{http_code}\n' -A 'okhttp/4.12.0' https://rasifiters-api.onrender.com/api/test
      ```
    - Set no Render env vars in this track.

12. **git-version:**
    - Feature: `app-config` 0.1.0 → **0.2.0** (MINOR: new owned behavior, additive owned-interface change, and `reference_impl.paths` gains `middleware/versionGate.js`).
    - Dependents: none (no `depends_on` edge points at app-config).
    - Steps 5n, 6 and 7 already set the SPEC changelog, `registry.json` and `REGISTRY.md` to 0.2.0. git-version must verify them, not bump again.
    - Commit: `feat(app-config): per-platform version gate fields + BLOCK_UNVERSIONED_ANDROID switch (v0.2.0)`, tag `feature/app-config@v0.2.0`.
    - Stage only C's 8 files, and commit **before** track A edits the shared `server.js`, `.env.example` and `ENV_RUNBOOK.md`.
    - Not touched: `HANDOFF.md` and `BRIEF.md` (the orchestrator's job) and `render.yaml`.

## Risks the implementer must watch

- **Shared-file collisions (FLAG):**
  - In `server.js`, touch only the require line and the app-config block. `ENV_RUNBOOK.md` gets only the `MIN_IOS_VERSION` row plus the 4 new rows. `.env.example` is append-only.
  - If A's hunks are already in the working tree when C commits, stop and tell the orchestrator. Don't try to split hunks; interactive staging isn't available.
- **Mount order:**
  - C's gate must stay after the app-config route, so app-config is never gated, and before `app.use("/api/auth", ...)`.
  - A's request-id and logger middleware must sit above the app-config comment block. Otherwise 426s go unlogged and `X-Request-Id` is never echoed on them.
- **Live-binary compatibility:** `min_ios_version` must keep its exact name and string-or-null type. Don't rename, nest or reorder it into a wrapper, because iOS 1.4.x decodes only that key.
- **426 goes out directly, not through `next(err)`.** `errorHandler.js:5` emits only `{error}` and would drop `code`.
- **The switch matches only the literal `true`**, case-insensitive and trimmed. `1`, `yes` and `on` stay off. That is intentional, so a typo can't block anyone.
- **Phase 3 precondition (D-C5).** Before anyone turns the switch on, the new Android build must send `X-App-Version` on all three OkHttp clients, including the interceptor-less refresh client at `Network.kt:75`. Otherwise it blocks itself. Turning the switch on is out of scope for this track.
- **Header-contract FLAG (D-C6):** `X-App-Build` is the planner's pick (the board names only two headers).
  - If the orchestrator or track A drops it, remove the `X-App-Build` clause from the D-C6 row and from the 0.2.0 changelog row.
  - No code changes would be needed: C never reads it, and the smoke test only sends it.
- **CORS (track A):** if A pins `allowedHeaders`, it must include `X-App-Platform`, `X-App-Version`, `X-App-Build` and `X-Request-Id`. Today the `cors` default reflects the requested headers.
- **Keep `render.yaml` untouched.** Track B is adding the staging service there. The 4 new vars stay operator-managed, and the staging service inherits null/off.
- **Local boot smoke:** use only the placeholder Supabase keys shown, and never write real secrets into the scratch script. The smoke deliberately never sends an un-gated request that would reach Supabase Auth.
