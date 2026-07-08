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

## Run 5 — 2026-07-08 · Phase D details (Summary detail views + log forms)

Ported the 5 Summary forward targets (were `StubScreen`): the **log-workout** + **log-health** multi-row
forms and the **activity / distribution / workout-types** chart drill-downs. Faithful to the iOS/web SPECs
(`specs/pages/{ios,web}/{log-workout,log-health,summary-*}`). `:app:assembleDebug` = **BUILD SUCCESSFUL**;
`app-debug.apk` 19.7 MB. Emulator/visual run handed to the user.

**What landed**
- **net**: `ProgramMemberDTO` / `ProgramWorkoutDTO` lookups (`GET /program-memberships/members`,
  `GET /program-workouts`); `BulkWorkoutEntry`/`BulkWorkoutRequest`/`BulkWorkoutResult`/`BulkRowError`
  (`POST /workout-logs/batch`); `DailyHealthRequest` (`POST /daily-health-logs`). `ErrorBody` grew a
  `rowErrors` field and `ApiException` carries it, so the batch form maps per-row backend errors onto cards.
- **ProgramContext**: `canLogForAnyMember` (global_admin|admin|logger → per-row member picker),
  `loggedInMemberId/Name`, `summaryRefreshToken` (bumped on save → Summary reloads, the iOS
  `summaryRefreshToken` / web `invalidateQueries(["summary"])` analogue), `loadProgramMembers/Workouts`,
  `addWorkoutLogsBatch`, `addDailyHealthLog`, `loadActivityTimeline(period)`.
- **UI**: shared `DetailChrome.kt` (circular back button, searchable bottom-sheet picker, self-locked member
  field, `DatePillField` → Material `DatePicker`, numeric fields) + `ChartPrimitives.kt` (extracted the
  `BarLineChart`/`niceAxis`/`smoothPath` so the landing cards + detail charts share one primitive).
  `LogWorkoutScreen` (up-to-200 rows, empty-skip / invalid-block, per-row remove, lock mount-guard),
  `LogHealthScreen` (sleep 0:00–24:00 + at-least-one-metric gate, explicit-null diet clear), and the 3
  read-only drill-downs (activity = W/M/Y/P period selector + daily-average header + re-fetch per period).

**Durable lessons (promote-worthy)**
- **Cross-file `private` top-level decls don't resolve even in the same package.** `DAY_SHORT` and
  `topSixWithOthers` live in `SummaryCharts.kt`; the new detail screens (separate files, same package)
  couldn't see them until widened to `internal`. Kotlin file-`private` ≠ package-visible. Same reason the
  shared `BarLineChart`/`niceAxis`/`smoothPath` had to move to `ChartPrimitives.kt` as `internal`.
- **Resuming an interrupted port → duplicate-declaration landmines.** A prior pass had already written the
  3 detail screens + `AppScaffold` wiring + a `loadActivityTimeline`; adding a second `loadActivityTimeline`
  compiled to `Conflicting overloads` (identical signature). When continuing prior work, grep for the
  symbol before adding it. Empty untracked stub files overwrite silently via Write; non-empty ones force a
  Read first — a useful signal for "was this already implemented?".
- **`Json { explicitNulls = false }` is fine for the health form's clearable diet** — the backend
  `parseOptionalNumber(food_quality)` treats undefined ≡ null, so omitting the field when cleared is
  behaviourally identical to sending `null` (no `@EncodeDefault` needed).
- **Material `DatePicker` (BOM 2024.12.01 → material3 1.3.1) exchanges UTC-midnight millis** — convert via
  `date.atStartOfDay(ZoneOffset.UTC)` / `Instant.ofEpochMilli(m).atZone(UTC)` so the calendar day never
  shifts; gate past/today with a `SelectableDates` impl.

---

## Run 6 — 2026-07-08 · Phase E: the Members tab + all 8 detail screens

**What changed.** The full Members tab (Tab 2) — both role variants (`AdminMembersBody` /
`StandardMembersBody`, split on `isProgramAdmin`) + view-as picker + 7 inline cards
(`ui/members/MemberCards.kt`, `MembersScreen.kt`) — plus every inner screen: metrics table + Sort/Filter
sheets (`MemberMetricsDetailScreen`), per-member W/M/Y/P history chart + streak/milestone ladder
(`MemberSimpleDetails`), the two write surfaces View Workouts + View Health with per-row Edit/Delete +
sort/filter + CSV export (`MemberRecentDetailScreen`, `MemberHealthDetailScreen`), and the invite/roster/
editor cluster (`MemberManagementScreens`). `net` gained the member DTOs + 12 endpoints; `ProgramContext`
gained `isProgramAdmin`/`loggedInUserProgramRole`, the focused-member slot, 8 loaders + 7 write actions;
a FileProvider (`res/xml/file_paths.xml` + manifest `<provider>`) for CSV export. Compiled clean on the
first `./gradlew :app:assembleDebug` (BUILD SUCCESSFUL).

**Durable lessons (promote-worthy)**
- **`@HTTP(method="DELETE", hasBody=true)` + `@QueryMap Map<String,String>` both work cleanly** with the
  retrofit2-kotlinx-serialization converter (BOM set). DELETE-with-body is needed for `/workout-logs`,
  `/daily-health-logs`, `/program-memberships` (the backend reads identifiers from the body, not the path).
- **`Json { explicitNulls = false }` BREAKS "clear one metric" on a PUT that uses hasOwnProperty.** The
  health-log UPDATE backend distinguishes present-null (clear the field) from absent (leave unchanged);
  with `explicitNulls=false` a null Kotlin field is OMITTED → the metric never clears. Fix: send that one
  body as a `kotlinx.serialization.json.JsonObject` built with `buildJsonObject { put("sleep_hours", x) }`
  — `JsonNull` in a JsonObject serializes regardless of `explicitNulls` (it governs class properties, not
  JsonElement values). The POST path is unaffected (its backend treats undefined ≡ null).
- **CSV/file share needs a FileProvider** — add `androidx.core.content.FileProvider` with authority
  `${applicationId}.fileprovider` + a `<cache-path>` in `res/xml/file_paths.xml`, write to
  `cacheDir/exports/`, `FileProvider.getUriForFile(...)`, `ACTION_SEND` + `FLAG_GRANT_READ_URI_PERMISSION`.
  androidx.core is already on the classpath (transitive), no new dep.
- **`material-icons-extended` is a declared dep** (`app/build.gradle.kts:66`) — `LocalFireDepartment`,
  `EmojiEvents`, `FitnessCenter`, `Restaurant`, `IosShare`, `FilterList`, `UnfoldMore`, `MailOutline`, etc.
  all resolve. No need to fall back to core-only glyphs.
- **`internal`/public top-level composables are package-wide** — declaring `ControlButton`, `Segmented`,
  `SkeletonCard`, `LogRow`, `LogSortSheet`, `MemberInitialsAvatar`, `StreakTile` non-`private` in one
  `ui/members` file lets every sibling screen reuse them (the Run-4/5 file-`private` lesson, applied proactively this run — one definition, shared across metrics/workouts/health).
- **Per-row edit/delete → trailing ⋮ `DropdownMenu`, not swipe.** Compose has no built-in swipe-action on
  `LazyColumn` rows; the Android idiom (and the ProgramPicker precedent) is a trailing overflow menu. Gate
  it on `!dataEntryLocked` to hide the mutations for locked non-admins (the iOS swipe-hidden parity).

---

## Run 7 — 2026-07-08 · Phase F: Lifestyle tab + details (workout-types dashboard + timeline drill-down + workout-types manager)

**Scope.** Ported Tab 3 (Lifestyle) + its 2 forward targets, replacing the `StubScreen("Lifestyle")` route.
New: `ui/lifestyle/{LifestyleScreen,LifestyleCards,LifestyleTimelineDetailScreen,WorkoutTypesListScreen}.kt`.
Net gained health-timeline + 4 analytics-v2 workout-type DTOs + 5 workout-management request DTOs + endpoints
(incl. `memberId` on `getWorkoutTypes`); `ProgramContext` gained `LifestyleData` + `loadLifestyle`/
`loadHealthTimeline`, a separate hoisted "View as" slot (`lifestyleViewAsId`/`lifestyleViewAsChosen`/
`ensureLifestyleViewAsDefault`), and the full workout-management set (`programWorkoutsAll` +
add/edit/delete/toggle). Added a dual-axis `SleepDietChart` to `ChartPrimitives.kt`; hoisted
`Period`/`PERIODS`/`PeriodSelector` into `DetailChrome.kt` (shared by Activity + Lifestyle timeline);
made Members `MemberPickerSheet`/`GlassIconButton` public + added a `noneLabel` param. `assembleDebug` green
after one fix.

**The one build error (durable — promote):** a Canvas `Offset(...)` / `Size(...)` call fed a **`Double`**
where a `Float` was expected (bar height computed from `List<Double>` sleep hours) → the compiler reported
`Cannot access 'constructor(packedValue: Long): Offset': it is internal` — a **misleading** message pointing
at the internal single-`Long` `Offset` constructor, NOT the real cause. Fix: `.toFloat()` the Double before
the geometry call. Lesson: an "Offset/Size constructor is internal" error almost always means a Double
(or other non-Float) slipped into a `Offset(Float,Float)`/`Size(Float,Float)` call — check the arg types.

**Other notes**
- **Dual-axis chart in one primitive.** `SleepDietChart(dualAxis: Boolean)` reuses the shared `drawTooltip`
  + `niceAxis` + `smoothPath`: `dualAxis=true` (detail) scales the 0–5 diet line onto the sleep-hours domain
  (`diet/5*axisMax`) and labels a trailing "/5" axis; `dualAxis=false` (preview card) shares one axis, no
  trailing labels, no tooltip (tapping the card navigates — a nav affordance, legitimately tooltip-less).
  Keeps EVERY interactive chart on the one shared tooltip look (memory `android-shared-chart-tooltip`).
- **A second, independent "View as" slot.** The Lifestyle view-as is semantically distinct from the Members
  one (null = program-wide "Admin" vs global-admin "None"), so it's a SEPARATE hoisted `ProgramContext` slot
  — reusing `membersViewAsId` would cross-wire the two tabs. Both persist across a detail push+back (memory
  `persist-tab-selections-across-nav`). The picker sheet itself IS shared (added a `noneLabel` param).
- **Non-default params after a defaulted one compile fine** when every call site uses named args
  (`SleepDietChart(..., barColor = …, lineColor = …)`) — no need to reorder around `modifier`.
- **Shared chrome refactor pays off.** Hoisting `PeriodSelector`/`Period`/`PERIODS` from ActivityDetailScreen
  into `DetailChrome.kt` (same `summary` package → no import churn for Activity; `internal`/public →
  cross-package reuse from `ui/lifestyle`) removed a ~30-line dup instead of copying it. `EmptyText`/
  `CircleBackButton`/`FormErrorText`/`TooltipData`/`axisLabels`/`SleepDietChart`/`SummaryCard` all resolve
  cross-package (same Gradle module) once non-`private`.
