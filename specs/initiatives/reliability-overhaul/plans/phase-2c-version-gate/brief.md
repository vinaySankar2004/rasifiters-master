# Phase 2 track C — scope brief (pipeline status: clean)

# SCOPE BRIEF: Reliability overhaul, Phase 2 track C. Backend-only version gate: additive per-platform `app-config` fields plus a `BLOCK_UNVERSIONED_ANDROID` switch (default off)

- **Features**: app-config@0.1.0 (SPEC: specs/features/app-config/SPEC.md) · status deployed · consumed_by [ios] · depends_on [] · reference_impl backend `server.js`. Expected bump is 0.1.0 → **0.2.0** (MINOR, additive contract): `feature/app-config@v0.2.0`.
- **Pages/screens**: none in this track. The client update screens and soft nudge belong to Phase 3. They will touch iOS `ForcedUpdateModalView` (`NotificationModalView.swift`) and a new Android screen.

- **Approved design (DESIGN_BOARD §0.3, §1, §12; BRIEF §7 Phase 2 row C)**, which the planner must follow:
  - **Where enforcement lives:**
    - Version thresholds are **response fields the client acts on**. The client compares them and shows a blocking screen or soft banner in Phase 3.
    - The server sends a **426** in exactly one case: header-less Android, behind `BLOCK_UNVERSIONED_ANDROID`.
    - The server does not 426 versioned clients below the minimum.
  - **Response** (`GET /api/app-config`, stays public, always 200, keeps `Cache-Control: public, max-age=300`). `min_ios_version` keeps its exact name and shape. Three keys are added:
    `{ min_ios_version: string|null, latest_ios_version: string|null, min_android_version_code: int|null, latest_android_version_code: int|null }`
  - **Env vars:** `MIN_IOS_VERSION` (exists), plus new `LATEST_IOS_VERSION`, `MIN_ANDROID_VERSION_CODE` and `LATEST_ANDROID_VERSION_CODE` (the board's "4 env vars"), plus `BLOCK_UNVERSIONED_ANDROID`.
    - The iOS values reuse the D-C3 normalizer: trim, `^\d+(\.\d+)*$`, otherwise null.
    - The Android values are positive integers (`^\d+$` → `parseInt`), otherwise null.
    - Unset or malformed → null, so nobody is blocked or nudged.
  - **No store URLs.** The board does not call for them. iOS already hard-codes the App Store URL, and Android goes to the Play listing or Play in-app update.
  - **Unversioned-Android switch.** It is on only when `BLOCK_UNVERSIONED_ANDROID` trimmed and lower-cased equals `"true"` (default off).
    - Match rule: `!req.get("X-App-Version") && /^okhttp\//i.test(req.get("User-Agent") || "")`. Android 1.0.0 sends only `okhttp/4.12.0`. iOS (CFNetwork), browsers, curl and Node fetch never match.
    - Reply: `426 { error: "Please update RaSi Fiters from the Play Store", code: "update_required" }`, sent directly by the middleware. `errorHandler.js` drops `code`, so the reply must not go through it.
    - Mount: `app.use("/api", blockUnversionedAndroid)` placed **after** the inline app-config route and **before** the first router (currently `server.js:65`).
  - **Old binary that never calls app-config.** Android 1.0.0 (3)/(4) keeps working while the switch is off, which is the default.
    - When the switch is on, every `/api/*` call returns 426.
    - Its refresh client signs out on any non-2xx (`Network.kt:113`).
    - On the next login it shows the `error` text through `ApiException.kt:30` (`parsed?.error ?: parsed?.message`), so the user sees "Please update…".

- **Proposed header contract. FLAG: agree with track A before either plan is approved.**
  - `X-App-Platform: ios|android|web` (lowercase).
  - `X-App-Version: <marketing version>`: iOS `CFBundleShortVersionString`, Android `versionName`. Web may omit it.
  - **Recommended third header** `X-App-Build: <integer>`: iOS `CFBundleVersion`, Android `versionCode`. The board names only the first two (see open questions).
  - `X-Request-Id` is owned by A.
  - Track C reads **only whether `X-App-Version` is present** (plus User-Agent), so C works however A logs. There is no shared helper module between A and C, which keeps the fences disjoint.

- **Files (exhaustive — implementer may touch ONLY these), grouped by surface**:
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/middleware/versionGate.js — **NEW** (~50 lines). Exports `normalizeVersion`, `normalizeVersionCode`, `getAppConfig()` (builds the 4-key object from env) and the `blockUnversionedAndroid` middleware. It has no DB access, so it can be smoke-tested standalone.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/server.js — **SHARED with A (and possibly B), FLAG.**
    - C edits only the app-config block at lines 47-63: remove the inline `normalizeMinIosVersion` (it moves to the new module), keep the route inline per D-C1 with `res.json(getAppConfig())`, and update the comment.
    - C adds one `require` and one `app.use("/api", blockUnversionedAndroid)` line before line 65.
    - Ordering: A's request logger and request-id middleware must mount **before** C's gate so that 426s get logged.
  - backend/ — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/.env.example — add 4 commented lines for the new vars (all unset by default). **Shared with A/B**; append only.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/app-config/SPEC.md — v0.2.0. Update:
    - the header, §1, §3 (response + 426 middleware), §4, §7 (5 env vars), §9 (new D-rules: additive fields, the unversioned-Android switch, the header contract), §11 changelog;
    - F4, which is wrong (see mismatches).
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/registry.json — set `app-config.version` to "0.2.0".
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/features/REGISTRY.md — row 26 version and summary.
  - docs — /Users/vinayaksankaranarayanan/Developer/rasifiters-master/ENV_RUNBOOK.md — §3 backend table: add rows for the 4 new vars next to `MIN_IOS_VERSION` (line 109). **Shared with A/B**; edit only your own rows.
  - web/ — none · ios/ — none · android/ — none (Phase 3).

- **DB surface**: none.

- **Flags/env/config involved**:
  - `MIN_IOS_VERSION`: render.yaml:38-39 sets it to `"1.2.0"`. That blocks nobody, since the oldest live iOS is 1.4.0.
  - New and operator-managed, **not** added to render.yaml (they are set via the Render MCP `update_environment_variables` with per-call confirmation, only when needed): `LATEST_IOS_VERSION`, `MIN_ANDROID_VERSION_CODE`, `LATEST_ANDROID_VERSION_CODE`, `BLOCK_UNVERSIONED_ANDROID`.
  - The staging service (track B) inherits the same null defaults.
  - Leaving render.yaml alone avoids a conflict with B, which will probably add the `rasifiters-api-staging` service there.

- **Blast radius**:
  - No registry dependents: no `depends_on` edge points at app-config.
  - Parity surfaces: iOS today. Android consumes the new fields from Phase 3. Web never consumes them (F5).
  - Phase 3 requirement (record it as a D-rule in the SPEC): the next Android build must send `X-App-Version` on **every** OkHttp client before the switch can ever be turned on:
    - the main client `Network.kt:32-36`;
    - the **bare refresh client `Network.kt:75`**, which has no interceptors today;
    - `NotificationStreamClient.kt:26`.

    Otherwise the new build would block itself.
  - If track A sets an explicit CORS `allowedHeaders` list, it must include `X-App-Platform`, `X-App-Version`, `X-App-Build` and `X-Request-Id`. The `cors` default reflects request headers, so this is only a concern if A pins the list.

- **Live-binary compat**: purely additive. Backend deploys first, with no ordering constraint against clients.
  - iOS 1.4.0–1.4.2 decodes `AppConfigResponse { min_ios_version }` with the default `JSONDecoder` (`apps/ios/RaSi-Fiters-App/Shared/Services/APIClient.swift:37-47`), so unknown keys are ignored.
  - Android 1.0.0 (3)/(4) never calls app-config.
  - Web does not call app-config.
  - The switch is off by default, so there is zero behaviour change for any live binary until an operator turns it on. Turning it on is a deliberate break, allowed by the board's no-shim policy only after the Phase 3 Android build is adopted.

- **Doc↔code mismatches found**:
  1. app-config SPEC §7 and F4 say `MIN_IOS_VERSION` is "not declared in render.yaml (operator-managed)". In fact render.yaml:38-39 declares `value: "1.2.0"`, and the deploy skill (SKILL.md:67) says non-secret vars are baked into the YAML.
  2. app-config SPEC §3 cites the route at `server.js:47-62`; it is actually at 58-63.
  3. app-config SPEC §6 says push is `consumed_by=[ios]` only. That is stale: Android FCM is live (render.yaml `FIREBASE_SERVICE_ACCOUNT`). This is optional to fix while the SPEC is open.
  4. ENV_RUNBOOK.md:110 says `CORS_ALLOWED_ORIGINS` is externalized to env and set on Render, but server.js:31-39 hard-codes the origins. This belongs to track A, not C.

- **Out of scope (explicitly)**:
  - All client UI and header sending (iOS soft banner, Android blocking screen, Play in-app update, `X-App-*` interceptors): Phase 3.
  - Server-side 426 for versioned clients below the minimum.
  - Store-URL fields.
  - Changing `MIN_IOS_VERSION`'s value.
  - Turning the switch on.
  - render.yaml edits.
  - A's request logging of the headers.
  - Updating HANDOFF/BRIEF (the orchestrator's job).
  - `consumed_by` stays `[ios]`; Android is noted in the SPEC as planned.
  - There is no test runner (`npm test` is a stub), so verification is a standalone smoke of `versionGate.js` plus local curl with and without headers. `server.js` needs a DB connection to start.

- **Open questions for the orchestrator**:
  1. **Header contract with A:** the board names only `X-App-Platform` and `X-App-Version`. Should `X-App-Build` be added? Recommended, because Android `versionName` stayed `1.0.0` across codes 3, 4 and 5, so version alone cannot tell builds apart in the logs. C is unaffected either way.
  2. **Mount order in the shared `server.js`:** A's logger, then C's gate. Sequence the A and C implementers, or have one implementer apply both `server.js` hunks.
  3. **SPEC F4:** fix it to match render.yaml as it is today, or move `MIN_IOS_VERSION` out of render.yaml so the doc becomes true? Recommended: fix the doc and keep render.yaml untouched. Separately, confirm the live dashboard value with a read-only check. A Render env read may trigger the token-guard "env dump" prompt.
