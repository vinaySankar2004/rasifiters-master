---
name: android-build
description: The Android compile-check loop for apps/android via the Gradle CLI (./gradlew) — build the app module, read Kotlin/AGP diagnostics, fix, rebuild until clean. Pure-CLI (no MCP, unlike ios-build). Compile-only by design — NO emulator boot, NO screenshots (the user runs the emulator + visual checks). Use after porting/editing any Android screen, or on "build the android app", "does it compile", "check the android build", /android-build. LIVING — append LESSONS_ARCHIVE.md every run.
---

# android-build — the Android compile-check loop (Gradle CLI)

The Android analogue of the web `npm run build ✓` gate and the iOS `ios-build` loop. After porting or
editing anything in `apps/android`, verify it **compiles cleanly** via the Gradle wrapper — then hand off
to the user for the visual/emulator run. We do **not** boot emulators or take screenshots; that's the
user's job (memory `ios-user-verifies-builds-visually` applies here too). Loop: **build → read diagnostics
→ fix → rebuild → report clean.**

## Why pure CLI (no MCP)
Unlike iOS (which needs the `xcode` MCP bridge to dodge a CoreSimulator/`actool` quirk), Android builds are
plain Gradle — the wrapper is committed and runs headless through Bash. No MCP, no open IDE required.
Kotlin/AGP emit `file:line: error:`-style diagnostics that grep cleanly. This is the *simpler* of the two
native loops.

## Trigger
"build the android app", "does it compile", "check the android build", after porting an Android
screen/feature, or `/android-build`. Whenever `apps/android/**` Kotlin/Gradle/resources changed and you
need a compile gate.

## Prereqs (already true on this Mac, 2026-07-08)
- **JDK 17+** (Temurin 21 present) + **Android SDK** at `~/Library/Android/sdk` (platform android-36,
  build-tools, adb). `apps/android/local.properties` carries `sdk.dir` (gitignored).
- **Gradle wrapper committed** (`gradlew` + `gradle/wrapper/*`, pinned to 8.11.1). Never needs a global
  `gradle`. (`gradle` was brew-installed once only to *generate* the wrapper; not required thereafter.)
- No emulator/AVD needed to **compile** — only to run. AVD creation + the visual run are the user's.

## Workflow
1. **Build** the debug variant: `cd apps/android && ./gradlew :app:assembleDebug`. For a faster type-only
   pass use `./gradlew :app:compileDebugKotlin`. Pipe through `tail -40` (or grep, see lessons) — never
   dump the full log.
2. **Read diagnostics.** Kotlin errors are `e: file://…:line:col <message>`; AGP/resource errors surface in
   the failing task. Report concisely: `N errors` + each `file:line: message` — NOT the raw log.
3. **Fix → rebuild** until `BUILD SUCCESSFUL`. Warnings: surface, fix only ones our change introduced
   (ignore pre-existing deprecation notes like `kotlinOptions`).
4. **Report clean + hand off.** "Compiles clean — `BUILD SUCCESSFUL`. Run it on the emulator when you want
   (`./gradlew :app:installDebug` or Android Studio Run); visual check is yours."

## Scope of our verification (what "good" means here)
Backend is already proven (live; web + iOS use it). For Android we verify the port is **wired + adapted**,
not re-validating business logic:
- **Compiles** (this skill's core).
- **Wired to our stack** — `BuildConfig.API_BASE_URL = https://rasifiters-api.onrender.com/api` for **both
  debug and release** (we always dev/test against the main live backend → live Supabase; local loopback
  `http://10.0.2.2:5001/api` is the temporary exception); Supabase-token auth via `POST /auth/login/app` +
  the OkHttp 401 authenticator.
- **Parity with web + iOS** — the ported screen matches the web/iOS SPEC 1:1 (`specs/pages/{web,ios}/**`).
  Flag divergences; don't "improve" silently. Android-idiom deviations (Material 3, Health Connect, FCM)
  are expected and recorded in `specs/pages/android/<screen>/SPEC.md`.

## Hard rules
- **NO emulator boot, NO screenshots, NO `adb`-driven UI automation from us.** Compile-only. The user runs
  the emulator/device and owns the visual/runtime confirmation.
- Keep diagnostics **structured + concise** — never paste raw multi-thousand-line Gradle logs into context.
- A green compile is the gate to commit an Android change (mirrors web's `npm run build ✓`); the user's
  visual run is a separate confirmation, not a commit blocker.
- Writes to the DB/schema still go through migration files (repo DB-write policy) — never inline SQL.

## Converged lessons (durable — fold new patterns here as they recur)
- **Green build command (confirmed 2026-07-08):** `cd apps/android && ./gradlew :app:assembleDebug`.
  First run downloads the 8.11.1 distribution + AGP/Compose/Retrofit deps (~90s cold); incremental ~7s.
- **Version set that builds clean:** AGP 8.9.1 · Gradle 8.11.1 · Kotlin 2.0.21 (+ compose & serialization
  compiler plugins same version) · Compose BOM 2024.12.01 · compileSdk 36 · minSdk 26 · JDK 17 bytecode
  (built on Temurin 21). Deps via `gradle/libs.versions.toml` version catalog.
- **Top-level `val` init order bites:** a top-level property referencing another top-level `val` declared
  *below* it fails "must be initialized" (hit in Theme.kt referencing a color declared after the scheme).
  Declare shared constants above their first use, or inline them.
- **`collectAsStateWithLifecycle` needs `androidx.lifecycle:lifecycle-runtime-compose`** — a separate
  artifact from `lifecycle-runtime-ktx`/`lifecycle-viewmodel-compose`. Missing it = unresolved-reference.
- **Benign, ignore:** `kotlinOptions` deprecation warning (AGP 8.9), and "Unable to strip … libandroidx…so"
  during `stripDebugDebugSymbols` — both are non-fatal.
- **iCloud/Desktop sync pollutes `app/build/` with space-suffixed dupes → AAPT fails.** The repo lives under
  `~/Desktop` (iCloud), which spawns `brand_icon 2.png` / `app-debug 2.apk` / `generated 2` copies inside the
  build dir. `parseDebugLocalResources` then dies: "Failed file name validation for … `brand_icon 2.png`"
  (spaces are illegal in resource names). The SOURCE `res/` is clean — it's build-dir-only. Fix: `rm -rf
  app/build` then rebuild. Not a code error; no source change. (Run 3.)
- **Trailing-lambda binds to the LAST param, not "the callback."** A composable ending
  `…, onSomething: () -> Unit, modifier: Modifier = …` binds a call-site trailing `{ }` to `modifier`
  (→ "No value passed for parameter 'onSomething'" + a Modifier type-mismatch). Pass the function-type arg
  **named** when a trailing `modifier` follows it. (Run 2.)
- **`Modifier.weight()` needs NO import** — it's a `ColumnScope`/`RowScope` receiver extension resolved
  implicitly inside the `Column {}`/`Row {}` lambda. `import androidx.compose.foundation.layout.weight`
  pulls the *internal* `RowColumnParentData?.weight` and fails "Cannot access … it is internal". (Run 2.)
- **`ExposedDropdownMenu` isn't importable in Compose BOM 2024.12.01** ("Unresolved reference"). For a
  read-only picker, use a plain `Box { OutlinedTextField(readOnly=true) + DropdownMenu }` with an
  `IconButton` trailing icon toggling `expanded` — no `ExposedDropdownMenuBox`, no experimental opt-in. (Run 2.)
- **File-`private` top-level decls aren't package-visible** — a sibling file in the SAME package can't see a
  `private val`/`private fun` in another; widen to `internal`. Bit us when new detail screens referenced
  `DAY_SHORT`/`topSixWithOthers`/`BarLineChart` from `SummaryCharts.kt`. Extract cross-file shared helpers to
  their own file as `internal`. (Run 5.)
- **Resuming an interrupted port duplicates declarations** — a prior pass had already added
  `loadActivityTimeline`; re-adding it → `Conflicting overloads`. Grep for a symbol before adding it when
  continuing prior work. (Empty untracked stubs overwrite via Write silently; non-empty files force a Read
  first — a tell they were already implemented.) (Run 5.)
- **Material `DatePicker` (BOM 2024.12.01 = material3 1.3.1) is available** and exchanges **UTC-midnight
  millis** — convert via `atStartOfDay(ZoneOffset.UTC)` / `Instant.ofEpochMilli().atZone(UTC)` so the day
  never shifts; restrict past/today with a `SelectableDates` impl. (Run 5.)
- **`@HTTP(method="DELETE", hasBody=true)` + `@QueryMap Map<String,String>`** both work with the
  retrofit2-kotlinx converter. DELETE-with-body is required by `/workout-logs`, `/daily-health-logs`,
  `/program-memberships` (identifiers ride in the body). QueryMap suits the ~20-param member-metrics filter
  (put only the present params). (Run 6.)
- **`explicitNulls=false` silently omits a null field → a hasOwnProperty PUT can't CLEAR a value.** The
  daily-health-log UPDATE backend treats present-null = clear vs absent = unchanged; a null Kotlin property
  is dropped, so the metric never clears. Send THAT body as a `buildJsonObject { put("food_quality", x) }`
  `JsonObject` — `JsonNull` in a JsonObject always serializes (explicitNulls governs class props, not
  JsonElements). POST paths are unaffected (undefined ≡ null there). Refines the Run-5 note. (Run 6.)
- **CSV/file share → add a FileProvider** (`androidx.core.content.FileProvider`, authority
  `${applicationId}.fileprovider`, `res/xml/file_paths.xml` `<cache-path name="exports" path="exports/"/>`).
  Write to `cacheDir/exports/`, `getUriForFile`, `ACTION_SEND` + `FLAG_GRANT_READ_URI_PERMISSION`.
  androidx.core is already transitive — no new dep. (Run 6.)
- **`material-icons-extended` IS a declared dep** — extended glyphs (`LocalFireDepartment`/`EmojiEvents`/
  `IosShare`/`FilterList`/`UnfoldMore`/`MailOutline`…) all resolve; no core-only fallback needed. (Run 6.)
- **Per-row edit/delete = trailing ⋮ `DropdownMenu`, not swipe** (Compose LazyColumn has no built-in swipe
  action; matches the ProgramPicker overflow precedent). Gate on `!dataEntryLocked` to hide mutations for
  locked non-admins (iOS swipe-hidden parity). (Run 6.)
- **"Offset/Size constructor is internal" ⇒ a `Double` leaked into a `Float`-only geometry call.** A Canvas
  `Offset(Float,Float)` / `Size(Float,Float)` fed a `Double` (e.g. a bar height from a `List<Double>`) fails
  with the *misleading* `Cannot access 'constructor(packedValue: Long): Offset': it is internal` — the real
  fix is `.toFloat()` the Double, not the (internal, unrelated) single-`Long` packed constructor. (Run 7.)
- **One dual-axis chart primitive, one shared tooltip.** `SleepDietChart(dualAxis)` in `ChartPrimitives.kt`
  reuses `drawTooltip`/`niceAxis`/`smoothPath`: `true` scales a 0–5 series onto the primary domain + labels a
  trailing axis; `false` (preview cards) shares one axis, no trailing labels, no tooltip (a tap-to-navigate
  card is legitimately tooltip-less). Keeps every interactive chart on the ONE tooltip look. (Run 7.)
- **Non-default params may follow a defaulted one** if all call sites pass them **named** (e.g.
  `SleepDietChart(…, barColor = …, lineColor = …)` after `modifier = Modifier`). No reorder needed. (Run 7.)
- **Hoist a shared widget into its own package file rather than duplicating** — moving
  `PeriodSelector`/`Period`/`PERIODS` from `ActivityDetailScreen` into `DetailChrome.kt` (public/`internal`)
  let a new-package screen (`ui/lifestyle`) reuse it with zero import churn for same-package callers. A
  second hoisted-state "View as" slot (Lifestyle) stays SEPARATE from the Members one — shared state would
  cross-wire the tabs; the picker *sheet* is shared via a `noneLabel` param. (Run 7.)
- **`runCatching { … }` whose LAST expression is `x?.let{}` or a bare `if(…) …` infers `Result<Unit?>`,
  not `Result<Unit>`** → "Return type mismatch: expected Result<Unit>, actual Result<Unit?>" flagged on the
  `return runCatching` line (misleading column). End such a suspend-action lambda with an explicit `Unit`.
  Bit two `ProgramContext` actions in one run. (Run 8.)
- **App-level appearance override = a plain SharedPreferences `StateFlow` store (`AppearanceStore`), NOT the
  encrypted `Session` (it must survive sign-out).** `MainActivity` collects it → `RaSiFitersTheme(darkTheme=)`
  (SYSTEM→`isSystemInDarkTheme()`). Thread cross-shell callbacks (Program-tab "Switch Program" →
  `popBackStack(PROGRAM_PICKER)`) down RootScreen → AppScaffold → screen, since a bottom-tab lives in the
  inner shell NavHost while the picker is the outer graph's start destination. (Run 8.)
- **`MaterialTheme` does NOT set text color — `LocalContentColor` defaults to BLACK. Only a `Surface` (or a
  Material `Scaffold`, which wraps one) re-provides it as `onBackground`.** So any bare `Text` (no explicit
  `color=`) drawn OUTSIDE a Scaffold renders black → invisible in dark mode. Bit the **program picker** +
  the **auth screens** (both draw a plain `Box`, no Surface) while every bottom-tab/detail screen — inside
  `AppScaffold`'s `Scaffold` — was fine. Fix ONCE at the root: wrap `RaSiFitersTheme`'s `content` in
  `Surface(color = background, contentColor = onBackground)`. Deliberate high-contrast controls that use
  `onBackground` directly (picker FABs/avatar = white-in-dark, black-in-light, the iOS `.label` idiom) are
  correct and unaffected. (Run 8b.)
- **Account-menu "Support" opens the web `/support` page (`AppLinks.supportUri`), NOT a `mailto:`** — matches
  iOS `APIConfig.supportURL`. The `mailto:` (`supportMailtoUri`) is only the forgot-password recovery
  fallback (iOS `supportEmailURL`). Don't conflate the two. (Run 8b.)
- **"Standardize the background across ALL pages" = converge the ODD screens onto the common style, NOT
  impose the odd style on all.** Only the auth screens had a faint orange gradient; every other screen was a
  flat dark `background`. The ask was to make auth match the flat background — I first spread the gradient
  everywhere and was corrected. Confirm the target style before a mass sed. Mechanically, a screen root's
  fill is `Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)`; `Modifier.background`
  also has a `Brush` overload (fully-qualified call in a sed avoids per-file imports) if you ever DO want a
  shared brush — but here the right answer was the solid theme color everywhere, auth included. (Run 9.)
- **Two NavHosts can register the SAME route constant with no conflict.** The picker (outer `SignedInGraph`
  NavHost) reaches the settings screens that also live in `AppScaffold`'s inner shell NavHost by
  re-registering the same `Routes.*` constants in the outer graph + threading `onNavigate` down to the
  account sheet — reuse the exact composables, no duplication. (Run 9.) **BUT the outer graph must re-supply
  the inset the inner `Scaffold` would have.** The settings screens carry no `statusBarsPadding()` of their
  own (`fillMaxSize().padding(20.dp)`), so in-program they sit below the status bar via `AppScaffold`'s
  `Modifier.padding(innerPadding)`, but the picker's Scaffold-less outer NavHost drew them under the status
  bar (edge-to-edge). Fix = wrap those outer destinations in a `Box(Modifier.fillMaxSize().statusBarsPadding())`
  helper so both entry points anchor identically. (Run 13.)
- **A "reset shared state on leave" must run on the long-lived context scope, NOT `rememberCoroutineScope`**
  (cancelled the instant the composable disposes → the launch never runs). Add `fun resetX(){ scope.launch{…} }`
  to `ProgramContext` and call it from `DisposableEffect{ onDispose{…} }`. Mirrors iOS `.onDisappear`. (Run 9.)
- **Member-detail log Edit/Delete must surface mutation failures.** `ProgramContext` mutation actions return
  `Result` for the caller to render; a `.onSuccess`-only handler drops the error (a failed delete leaves the
  confirm `AlertDialog` stuck open). Add `.onFailure { actionError = … }` + a shared error `AlertDialog`
  (iOS shows an alert on these exact paths). (Run 9.)
- **SSE = okhttp-sse `EventSource` on its OWN client with `readTimeout(0)`.** The stream client must NOT reuse
  the shared ApiService OkHttpClient (its finite read timeout kills a long-lived stream) — build a dedicated
  `OkHttpClient.Builder().readTimeout(0, SECONDS)`, set `Authorization: Bearer` explicitly on the Request (the
  D-C2 `/notifications/stream` auth accepts header or `?token=`), and re-read the token from `Session` on each
  `connect()` (no 401-authenticator on the stream). `EventSourceListener.onEvent(id, type, data)`: `type` is
  the SSE `event:` field → filter `type == "notification"` (skip the `ready` handshake + pings), decode `data`
  as the DTO. Recovery = restart on `ON_RESUME` (iOS `scenePhase == .active` parity), NOT an internal reconnect
  loop. App-root overlay (modal queue) + stream start/stop live in `RootScreen` (the iOS `AppRootView` ZStack
  analog); `LocalLifecycleOwner` comes from `androidx.lifecycle.compose`, not the deprecated `ui.platform`. (Run 10.)
- **FCM: google-services plugin REQUIRES `google-services.json` at build time (else build fails).** Wire the
  plugin via the catalog (`google-services` id 4.4.2, `apply false` in root, `alias(...)` in `app/`) + Firebase
  BOM (`platform(libs.firebase.bom)` 33.7.0 + `firebase-messaging`, no explicit version). The json is
  **gitignored** (public repo) but present locally at `apps/android/app/google-services.json` so the compile
  loop still works. The `FirebaseMessagingService` reaches app state via `(application as? App)?.container`
  (system-instantiated, no DI); `onMessageReceived` is a no-op (SSE owns foreground); token fetch is a `Task`
  (`FirebaseMessaging.getInstance().token.addOnCompleteListener`), `POST_NOTIFICATIONS` (13+) via a
  `RequestPermission()` launcher. Backend: `sendPushToMembers` fans out APNs+FCM; `upsertPushToken`'s new
  `platform` param **defaults to `"ios"`** so the LIVE iOS binary is untouched; FCM credential is a Render
  secret (`FIREBASE_SERVICE_ACCOUNT` base64), graceful-null when unset. (Run 11.)
- **kotlinx.serialization OMITS default-valued properties (no `encodeDefaults`) → a "constant" field never
  ships.** A request DTO field like `val platform: String = "android"` is DROPPED from the JSON body whenever
  it equals its default, so the server sees nothing and applies ITS default. Bit FCM registration: the token
  stored as `platform='ios'`, so the Android FCM sender skipped it (push silently never arrived, though iOS
  did). FIX: make such a field **required (no default)** and pass it explicitly — a no-default property is
  always encoded. Audit any DTO relying on a non-null default being transmitted. Debug oracle = the DB (the
  stored row showed the wrong platform → pointed at the body, not the sender); verify the SEND with a
  standalone `firebase-admin` `node` script (require by ABSOLUTE path) + `adb shell dumpsys notification`. A
  silently-swallowed `Task`/`runCatching` push path must log (`Log.w`) or it's undebuggable. (Run 12.)
- **Health Connect (`androidx.health.connect:connect-client:1.1.0-alpha07`) builds clean** at AGP 8.9.1 /
  compileSdk 36 / minSdk 26. Read auth is granted via **`PermissionController.createRequestPermissionResultContract()`**
  (`ActivityResultContract<Set<String>,Set<String>>` launched from a Composable — NOT a runtime dialog);
  manifest needs `android.permission.health.READ_EXERCISE`/`READ_SLEEP`, a `<queries>` for
  `com.google.android.apps.healthdata`, and the permissions-rationale intent-filters (`SHOW_PERMISSIONS_RATIONALE`
  + a `ViewPermissionUsageActivity` alias). The HealthKit **anchor analog is the Changes token, which carries
  NO history** — first sync must `readRecords(TimeRangeFilter.after(connectDate))` AND separately
  `getChangesToken`, later syncs drain `getChanges(token)` (expired → full re-read + fresh token); commit the
  token only after a successful sync. HC has **no immediate background-delivery observer** — sync on app
  triggers (launch/auth/`ON_RESUME`/program-entry), a documented deviation not a bug. (Run 14.)
- **Status-code-aware Retrofit write = declare the method `: Response<Unit>`** (not `: T`). A
  `suspend fun x(@Body b: JsonObject): Response<Unit>` returns the raw response for ALL statuses (never throws
  `HttpException`), so branch on `.code()` (200/201/409/400-403-404) — what a sum-on-conflict / POST-then-PUT
  upsert needs. Transport errors still throw (catch → retryable); the OkHttp Authenticator's 401 refresh is
  transparent, so a 401 reaching the caller = refresh failed → retryable. (Run 14.)
- **Kotlin has no partial classes — port an iOS `Foo+Bar` extension SET into ONE controller class**
  constructed with the state hub + `appContext`, owning its own `SharedPreferences` (the `UserDefaults`
  analog for non-sensitive sync state — NOT the encrypted `Session`) + StateFlows. Hang it off
  `ProgramContext` (`val health = HealthSyncController(appCtx, api, this)`; pass `context.applicationContext`
  via `AppContainer`) so every screen reaches it as `programContext.health` — zero extra threading. iOS
  static single-flight bools → an `AtomicBoolean` per flow. (Run 14.)
- **An inferred `var` type outlives a smart cast:** `var t = nullableParam` infers `String?` even after an
  early `if (nullableParam == null) return`. Annotate `var t: String = nullableParam` (the return proves
  non-null). Same family as the Run-8 `Result<Unit?>` inference gotcha. (Run 14.)

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append the
new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons"; keep this
`SKILL.md` lean.
