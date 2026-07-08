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

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append the
new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons"; keep this
`SKILL.md` lean.
