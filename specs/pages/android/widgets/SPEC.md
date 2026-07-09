# Screen: `widgets` (android) — quick-add home-screen widgets (workout + daily-health) via Jetpack Glance

> **Status:** 🏗️ built (`apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Jetpack Glance + Compose)
> **Thin port-note.** Parity target = the **current built iOS widgets** (`RaSi-Fiters-App-Widgets/AddWorkoutWidget.swift`
> + `Features/Widgets/QuickAdd*WidgetEntryView.swift`) — this file records the Android realization + idiom
> deviations only.
> **Consumes:** [`workout-logs`](../../../features/workout-logs/SPEC.md) `POST /workout-logs/batch` +
> [`daily-health-logs`](../../../features/daily-health-logs/SPEC.md) `POST /daily-health-logs/batch` +
> [`program-memberships`](../../../features/program-memberships/SPEC.md)/[`program-workouts`](../../../features/program-workouts/SPEC.md)
> lookups, via `ProgramContext`. **NO** new backend/API/DB, **NO** web change, **NO** iOS code change.
> **Files:** `widget/AddWorkoutWidget.kt` · `widget/AddDailyHealthWidget.kt` (Glance widgets + receivers);
> `core/WidgetRoute.kt` · `MainActivity.kt` (deep-link parse, `singleTop`) · `core/ProgramContext.kt`
> (pending route + capabilities + per-program lookups + explicit-primary batch saves) · `ui/RootScreen.kt`
> (consume-once nav in `SignedInGraph`) · `ui/Routes.kt` (`WIDGET_LOG_WORKOUT`/`WIDGET_LOG_HEALTH`) ·
> `ui/summary/QuickAddWorkoutWidgetScreen.kt` · `ui/summary/QuickAddHealthWidgetScreen.kt` (deep-link targets,
> reusing `LogWorkoutScreen`/`LogHealthScreen`'s `internal` row model + card); res drawables + `res/xml/quick_add_*_widget_info.xml`.

## Widget surface (Glance, home screen)

- **Two widgets, one resizable each** (D-ANDROID-WIDGET-1): `SizeMode.Responsive` with a **compact** set
  (`110×110`) and a **wide** set (`250×110`). Compact ↔ wide switches copy/label at width ≥ 200dp — the iOS
  `.systemSmall`/`.systemMedium` analog collapsed into one resizable Android widget.
  - **Add workout** (orange gradient, **black** text): compact "Add workout" / "Quick add" / button "Log"
    (bolt); wide "Add workout session" / "Quick add a session for any program." / "Log session" (bolt).
    Icon-circle `+` glyph; chevron. Deep-link `rasifiters://quick-add-workout`.
  - **Log health** (blue gradient, **white** text): compact "Log health" / "Quick add" / button "Log" (plus);
    wide "Log daily health" / "Quick add a health log for any program." / "Log day" (plus). Icon-circle `bed`
    glyph; chevron. Deep-link `rasifiters://quick-add-health`.
- Tapping the widget fires `actionStartActivity` with the `rasifiters://` VIEW intent into `MainActivity`
  (already `launchMode="singleTop"`), which parses `WidgetRoute.fromUri(intent.data)` and stashes it on
  `ProgramContext.setWidgetRoute` (onCreate **and** onNewIntent — mirrors iOS `.onOpenURL` on both paths).

## Deep-link target forms (`QuickAdd*WidgetScreen`) — 1:1 with iOS `QuickAdd*WidgetEntryView`

- **Same batch form as the in-app log screens** (D-ANDROID-WIDGET-3): the widget screens **reuse**
  `LogWorkoutScreen`/`LogHealthScreen`'s `internal` `WorkoutRow`/`HealthRow` model + validation helpers +
  `WorkoutRowCard`/`HealthRowCard` (widened `private`→`internal`, additive). The shared screens stay
  behaviorally untouched; the only additive change is `ProgramMultiSelect(alwaysShow: Boolean = false)`.
- **No auto-selected program:** `currentProgramId = ""`, nothing force-checked, and `ProgramMultiSelect` is
  rendered even for a single program (`alwaysShow = true`). Member/workout options are the **intersection**
  across the selected programs (per-program lookups cached in `membersByProgram`/`workoutsByProgram`,
  computed only once **all** selected lookups are present — a transient fetch miss never wipes entered rows).
- **Member privilege from the program LIST** (no active program): `canLogForAnyProgramMember` = global admin
  OR admin/logger in any loaded program; `isPrivilegedIn(program)` per program. Member selection unlocks only
  when the viewer is privileged in **every** selected program; otherwise the member field is hidden and rows
  are seeded/forced to self (iOS `ignoreMember`/`memberLocked` parity). `memberLockHint` footnote when the
  viewer *can* select members but a non-privileged program is in the selection (passed explicitly, O3).
- **Save:** `addWorkoutLogsBatchExplicit` / `addDailyHealthLogsBatchExplicit(primaryProgramId =
  selectedProgramIds.sorted().first(), programIds = selectedProgramIds.toList(), entries)` — the widget has no
  active program, so the primary `program_id` + full `program_ids[]` are passed explicitly. Success bumps
  `summaryRefreshToken` (no `_messages` Snackbar — the widget host has no collector).
- **In-view success toast** (Android idiom for iOS `WidgetSuccessToast`): a bottom pill — checkmark (`AppGreen`)
  + "Workout logged" / "Daily health logged" — dwells **1.4s** (`delay(1400)`), then exits to My Programs.
- **Exit to My Programs:** the custom back, **system back** (`BackHandler`), and the post-save dwell all call
  `onExit` → `clearWidgetRoute()` + `clearActiveProgram()` + navigate `PROGRAM_PICKER` popUpTo-inclusive
  (iOS `returnToMyPrograms`). All health-form R-1 rules (at-least-one-metric, sleep hr/min, diet 1–5, steps,
  in-batch (member,date) duplicate) are lifted verbatim from `LogHealthScreen`.

## §9 Decisions (law)

- **D-ANDROID-WIDGET-1:** ONE resizable Glance widget per type (two total) via `SizeMode.Responsive` — compact
  set ("Add workout"/"Log health") + expanded set ("Add workout session"/"Log daily health"). Copy/icons/
  labels/deep-links 1:1 with iOS.
- **D-ANDROID-WIDGET-2:** Reuse the **Android theme tokens** (AppOrange `0xFFF5761A`→AppOrangeGradientEnd
  `0xFFFFC043`; AppBlue `0xFF2F6FEB`→AppBlueLight `0xFF64B5F6`), NOT the iOS literals. Text: **black** on
  orange, **white** on blue. Intentional shade delta vs iOS (the two apps already differ slightly in brand
  ramp) — the widget matches the rest of the Android surface, not the iOS RGB.
- **D-ANDROID-WIDGET-3:** The deep-link opens a NEW root-level widget-entry screen (`QuickAdd*WidgetScreen`) —
  a 1:1 port of iOS `QuickAdd*WidgetEntryView`: no auto-selected program, intersection lookups, explicit
  primary + full `program_ids[]` on save, exit-to-My-Programs, in-view 1.4s success toast. The shared
  `LogWorkoutScreen`/`LogHealthScreen` stay behaviorally untouched (additive `internal` widening + one
  additive default-false `alwaysShow` param).
- **Signed-out = STASH & REPLAY (iOS parity, NOT a divergence):** a widget tap while signed out stashes the
  route on `ProgramContext` and leaves it intact; `RootScreen`'s signed-out branch does **not** clear it. The
  moment a token flips authed, `SignedInGraph` mounts and its `LaunchedEffect(widgetRoute)` replays the stashed
  route (consumed once, `launchSingleTop`). `clearSession()` nulls the route on explicit logout so a stale
  route can't outlive a session. This mirrors iOS `AppRootView` gating **presentation** on `authToken != nil`
  while never clearing `widgetRoute` — same behavior, not an Android-specific rule.

## §10 Parity notes

- **Parity target:** the **current built iOS widget behavior** (widget chrome + the deep-link entry forms).
  Android widgets are a client-side surface over the existing `workout-logs`/`daily-health-logs` features — no
  backend/API/DB/web/iOS-code change. The deep-link contract (`rasifiters://quick-add-workout` /
  `quick-add-health`), the batch endpoints, the exit-to-My-Programs + consume-once route semantics, and the
  in-view success toast (standing in for iOS `WidgetSuccessToast`) all track iOS 1:1.
- **iOS parity reference** not backfilled as a separate `specs/pages/ios/widgets/SPEC.md`; the iOS source files
  (`AddWorkoutWidget.swift`, `AppRootView.swift`, `ProgramContext.swift`, `QuickAdd*WidgetEntryView.swift`) are
  the authoritative reference and are named in the Files line above.
- **Glance realization:** background gradients + icon-circle + capsules are `res/drawable` shape/vector assets
  (Glance renders RemoteViews, so Compose brushes aren't available); the two families collapse into one
  `SizeMode.Responsive` widget. Vector glyphs are white-filled so `ColorFilter.tint` recolors them black/white
  per surface.
- **Picker preview + default size (Android-idiom, no iOS analog — iOS has no widget-gallery preview):** each
  `res/xml/quick_add_*_widget_info.xml` sets `previewLayout` to a static banner layout
  (`res/layout/widget_preview_{workout,health}.xml`, mirroring the widget's wide state via the same drawables)
  so the widget-picker tile shows the real orange/blue card, not the generic app-icon placeholder. The default
  drop size is the **wide banner** (`targetCellWidth=4`, `targetCellHeight=2`; `minWidth=250dp`) so the banner
  shows immediately on placement; the widget still resizes down to the compact `110dp` square
  (`minResizeWidth/Height=110dp`). On API < 31 launchers without `previewLayout` support the tile falls back to
  the default placeholder (cosmetic only).
