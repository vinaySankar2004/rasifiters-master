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

## Lessons log (self-learning loop)
Full run-by-run history → **`LESSONS_ARCHIVE.md`** (not auto-loaded). **Protocol every run:** append the
new run to `LESSONS_ARCHIVE.md`; promote any *new* durable pattern into "Converged lessons"; keep this
`SKILL.md` lean.
