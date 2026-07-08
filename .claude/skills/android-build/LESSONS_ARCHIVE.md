# android-build — Lessons Archive

Full run-by-run history for the `android-build` skill (not auto-loaded). Newest first. Promote durable
patterns into `SKILL.md` → "Converged lessons"; keep this as the detailed log.

---

## Run 1 — 2026-07-08 — Phase A foundation, first green build

**Context:** Standing up `apps/android` from scratch (Phase A of the Android port plan). Goal: a compiling
foundation (Gradle project, DI, state hub, session, networking, theme, bottom-nav scaffold + stubs).

**Toolchain discovered already present:** Android Studio, SDK (platform android-36, build-tools 36.1.0 +
37.0.0, adb, emulator binary), Temurin JDK 21. **Missing:** any system image / AVD (user creates for the
run step), and `cmdline-tools` (not needed — used Android Studio's SDK). No global `gradle` → brew-installed
`gradle` (resolved to 9.6.1) ONCE to run `gradle wrapper --gradle-version 8.11.1 --distribution-type bin`,
which generated the committed wrapper. Thereafter only `./gradlew` is used.

**Version set chosen (builds clean):** AGP 8.9.1, Gradle 8.11.1, Kotlin 2.0.21, Compose BOM 2024.12.01,
Retrofit 2.11.0 + `retrofit2-kotlinx-serialization-converter` 1.0.0, OkHttp 4.12.0 (+ okhttp-sse,
logging), kotlinx-serialization-json 1.7.3, security-crypto 1.1.0-alpha06, datastore-preferences 1.1.1,
navigation-compose 2.8.5, lifecycle 2.8.7. compileSdk/targetSdk 36, minSdk 26, JDK 17 bytecode.

**Errors hit + fixes:**
1. `compileDebugKotlin FAILED — Variable 'Color_White' must be initialized` (×4). Cause: top-level `val`
   color schemes referenced a `private val Color_White` declared *below* them in Theme.kt; top-level init
   order is source order. Fix: declared `private val White` above the schemes (and inlined via
   `Color(0xFFFFFFFF)`). → rebuilt green.
2. (caught pre-build) `collectAsStateWithLifecycle` unresolved — added
   `androidx.lifecycle:lifecycle-runtime-compose` to the catalog + app deps.

**Result:** `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL** (cold ~92s incl. distribution + dep
download; incremental ~7s). Debug APK produced. Handed off to user for AVD creation + visual run.

**Benign noise (ignored):** `kotlinOptions` deprecation warning; `stripDebugDebugSymbols` "Unable to strip
libandroidx.graphics.path.so / libdatastore_shared_counter.so — packaging as-is".

## Run 2 — 2026-07-08 — Phase B auth path (Splash/Login/CreateAccount/ForgotPassword)

**Context:** Ported the logged-out auth path into `apps/android` (5 new Compose files: `ui/auth/{AuthComponents,
SplashScreen,LoginScreen,CreateAccountScreen,ForgotPasswordScreen}.kt` + `core/AppLinks.kt`), wired the real
screens into `ui/RootScreen.kt`'s `AuthGraph`, deleted the 4 auth stubs, copied the iOS `brandIcon(.dark).png`
into `res/drawable/brand_icon(_dark).png`. State-hub actions (`login`/`register`/`forgotPassword`) already
existed from Phase A. Login uses `POST /auth/login/app`; create-account does register→auto-login (iOS F2 parity).

**Errors hit + fixes (one rebuild):**
1. **Trailing-lambda bound to `modifier`, not the callback.** `AppPasswordField(label,value,onChange,visible,
   onToggleVisible,modifier)` — a trailing `{ … }` at the call site attaches to the LAST param (`modifier:
   Modifier`), yielding "No value passed for parameter 'onToggleVisible'" + "Argument type mismatch … Modifier
   expected". Fix: pass `onToggleVisible = { … }` **named** (don't rely on trailing-lambda when a trailing
   `modifier` follows the function-type param). Durable trap.
2. **`ExposedDropdownMenu` unresolved at import** in Compose BOM 2024.12.01 (`import androidx.compose.material3.
   ExposedDropdownMenu` = "Unresolved reference"). Sidestepped entirely: a plain `Box { OutlinedTextField(
   readOnly) + DropdownMenu }` with an `IconButton` trailing icon toggling `expanded` — no `ExposedDropdownMenuBox`,
   no experimental opt-in. Simpler + version-robust for a read-only picker.
3. **Wrong `weight` import shadowed the ColumnScope one.** `import androidx.compose.foundation.layout.weight`
   pulls an internal `RowColumnParentData?.weight` → "Cannot access … it is internal". `Modifier.weight(Float)`
   is a `ColumnScope`/`RowScope` receiver extension — available implicitly inside the `Column {}` lambda with
   NO import. Remove the bad import.

**Result:** `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL** (~2s incremental). 4 auth stubs gone; the
scaffold-removal tracker advances (Summary/Members/Lifestyle/Program stubs remain for Phases D–G). Handed off
to user for the Pixel 8 emulator visual run.

## Run 3 — 2026-07-08 — Phase C program-picker (the signed-in home)

**Context:** Ported the post-auth landing — "My Programs" (`ui/programs/ProgramPickerScreen.kt` +
`ui/programs/AccountMenuSheet.kt`). Extended `ProgramContext` (programs/activeProgram state +
`loadPrograms`/`moveProgram`/`persistProgramOrder`/`deleteProgram`/`respondToInvite`/`selectProgram`),
added `ProgramDTO` + order/membership DTOs + 4 endpoints (`GET /programs`, `PUT /programs/order`,
`DELETE /programs/:id`, `PUT /program-memberships`), and rewired `RootScreen` into a `SignedInGraph`
(token → picker → shell). First authenticated screen — exercises the Bearer header + 401 authenticator +
`GET /auth/me` self-heal against live data. Verified the backend wire contract from `programService.js`
(field names, COALESCE-to-0 ints, `{message}` order/delete return) before writing DTOs.

**Build blocker (NOT a compile error) + fix:**
1. `parseDebugLocalResources FAILED — Failed file name validation for … drawable/brand_icon 2.png`. Cause:
   **iCloud/Desktop sync had spawned space-suffixed duplicates** (`brand_icon 2.png`, `app-debug 2.apk`,
   `generated 2`, …) — all inside `app/build/` (the SOURCE `res/` was clean). AAPT rejects spaces in resource
   filenames. Fix: `rm -rf app/build` then rebuild → **BUILD SUCCESSFUL**. No source change needed. This repo
   lives under `~/Desktop` (iCloud-synced), so the build dir can get re-polluted; a `rm -rf app/build` before
   a fresh compile clears it. Durable — promoted to Converged lessons.

**Kotlin compile:** clean on the first real compile (no `e:` diagnostics) — the drag-reorder `ReorderState`,
`LazyColumn` + `animateItem()`/`graphicsLayer` translation, `ModalBottomSheet` account sheet, and
`LinearProgressIndicator(progress = { … })` lambda-overload all resolved under BOM 2024.12.01 with no
experimental opt-ins beyond `ModalBottomSheet`'s (already stable). Reused `ui/auth/AppTextField` for the
search field (public — cross-package reuse fine).

**Result:** `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL**, 19 MB debug APK. Scaffold-removal tracker
unchanged (the 4 bottom-tab stubs remain — picker is a NEW screen, not a stub replacement; it precedes the
shell). Handed off to user for the emulator visual run.

---

## Run 4 — 2026-07-08 · Phase D-landing (Summary dashboard)

**Scope:** ported the Summary tab dashboard (iOS `AdminSummaryTab` + `SummaryCards`/`SummaryChartCards`,
web `/summary` landing) → `ui/summary/{SummaryScreen,SummaryCards,SummaryCharts}.kt`. Added 7 analytics DTOs
+ `SummaryData` + 7 GET endpoints (`@Query`), `ProgramContext.loadSummary()` + `dataEntryLocked`, theme
secondary accents + `ChartPalette`/`workoutTypePaletteColor`. 5 forward targets stubbed per iOS D-SCOPE.

**Result:** `./gradlew :app:assembleDebug` → **BUILD SUCCESSFUL** on the first real compile (no `e:`
diagnostics). No `rm -rf app/build` needed this run (build dir stayed clean since run 3).

**Lessons (all minor, self-caught before compile):**
- **No charting lib in the toolchain** — Swift Charts / Recharts have no Compose analog and we deliberately
  don't add one (keep deps lean). Bars + the active-members line/points draw fine on a plain
  `androidx.compose.foundation.Canvas` (`drawRoundRect` + `drawLine`/`drawCircle`), with a weighted `Row` of
  `Text` beneath for x-labels. Good enough for a faithful preview; the interactive/period detail charts are
  the deferred detail-view concern anyway (iOS renders the summary distribution with `interactive: false`).
- **`RowScope.weight` for the two-per-row stat cards** — the metric-card composables take a `modifier`
  param and are invoked inside a `Row { }`, so `Modifier.weight(1f)` resolves against the RowScope receiver.
- **Progress needs no API call** — the `ProgramDTO` already carries `progress_percent` + `start/end_date`,
  so the ring/days come straight from `activeProgram`; skipped the vestigial `analytics/summary` over-fetch
  (iOS F2 / web F5 — feeds only deferred detail views). Fewer DTOs, one less round-trip.
- **djb2 palette hash ports 1:1** — Kotlin `Int` overflow wraps like Swift `&+`/`<<`, so
  `(hash shl 5) + hash + ch.code` + `abs % palette.size` reproduces iOS `workoutTypePaletteColor` dot colors
  exactly. Guarded the `abs(Int.MIN)` edge with an inline `if (hash < 0) -hash else hash`.

Handed off to user for the emulator visual run (open a program → Summary tab).

**Polish pass (same day, after user's emulator screenshots — light + dark):**
- **M3 nav "pink" tint** — the default `NavigationBar`/`NavigationBarItem` pull `secondaryContainer`/
  `surfaceContainer` from the M3 **baseline purple** palette (we only overrode primary/secondary/background/
  surface), so the selected pill + bar read lavender in light, glass-blue in dark. Fix: color the bar
  explicitly — `NavigationBar(containerColor = surface)` + `NavigationBarItemDefaults.colors(...)` with the
  orange primary for selected icon/label and a `primary.copy(alpha=0.16f)` indicator. Durable gotcha for any
  static (non-dynamic) M3 scheme: container/variant roles stay baseline-purple unless you set or override them.
- **Nav icon parity** — matched iOS: Lifestyle `Icons.Filled.Eco` (leaf, was `FavoriteBorder` heart),
  Program `Icons.Filled.CalendarMonth` (was `Settings` gear); Summary/Members already matched.
- **Charts looked subpar vs iOS Swift Charts** — first cut had fat 50%-slot bars, no axis, a straight line.
  Rebuilt `BarLineChart` on `Canvas` + `rememberTextMeasurer`: a left y-axis with `niceAxis()` ticks
  (the `automatic(desiredCount:)` analog — 8→0/2/4/6/8) + faint gridlines, thin fixed-width rounded bars
  (12dp timeline / 16dp distribution), x labels drawn centered under each bar, and a Catmull-Rom→cubic-bezier
  smoothed line with white-haloed points. No new dep — `androidx.compose.ui.text.drawText` + `Path.cubicTo`.
