# Phase 2 track D — plan-adversary verdict

# PLAN VERDICT: OBJECTIONS (7)

1. **[BLOCKING] The mobile banners cut off the shared offline message, and web doesn't.** The iOS step 13 `Text(message)…lineLimit(2)` and the Android step 21 `maxLines = 2, overflow = TextOverflow.Ellipsis` truncate the error-variant copy whenever Retry and × both show. Web step 6 has no clamp and wraps, so the three surfaces render the same copy differently. This also fails the "UI must fit, no clipping" gate.
   - Evidence (iOS): I measured with the system SF font (13pt semibold = `AppTypography.footnote`) using the plan's own layout math. "Can't connect. Check your internet connection and try again." is 384.6pt wide. The text slot is 191pt at 375pt screen width and 209pt at 393pt, which lays out as **3 lines** at both widths, so it gets truncated. At 402pt and 430pt it fits in 2 lines.
   - Evidence (Android): this is an estimate, not a measurement. M3 `bodyMedium` is 14sp with 0.25sp letter spacing, which puts the string at roughly 429dp. The slot on the user's Pixel 7 (412dp) is about 212dp, so it needs 3 or more lines and gets cut.
   - Larger Dynamic Type sizes make it worse.
   - The plan's own `#Preview` (`.error(AppError(kind: .offline)), onRetry:, onDismiss:`) and Android `@Preview` show exactly this case.
   - Failure scenario: Phase 3 shows a save-failed-offline banner on an iPhone 15/16 or a Pixel 7. The user sees "Can't connect. Check your / internet connection and try…".
   - Fix: drop the clamp. On iOS, remove `.lineLimit(2)` and add `.fixedSize(horizontal: false, vertical: true)`. On Android, remove `maxLines` and `overflow`. Also add a mobile visual-fit step to sit beside step 25: the user checks the previews at 375/393pt and 360/412dp.
   - Step 25's expectation is also stale: at 390px the web text slot is about 197px, so the offline message wraps to 3 lines, not "2-line".

2. **[ADVISORY] SPEC §4 turns every 401 into "Your session has ended", but the backend also uses 401 for credential errors.** Evidence:
   - `apps/backend/services/authService.js:82,84,126,143` return "Invalid credentials".
   - `:611` returns "Current password is incorrect."
   - `:295,369,438` return Google / link / federated sign-in failures.
   - D-KIT-3 throws away the server text for 401s.

   Failure scenario: Phase 3 adopts the kit on login or change-password (sessions and the Google button are in Phase 3). A mistyped password then shows "Your session has ended. Please sign in again." Fix: add a scope rule to §4. Either credential forms (login, set/change password, link, oauth) don't route 401 through the vocabulary, or a 401 from a credential endpoint maps to invalidInput with the server text.

3. **[ADVISORY] On web, the fixed-position banner breaks inside glass cards.** `.glass-card` sets `backdrop-filter` (`apps/web/src/app/globals.css:116-121`), which makes it the containing block for `position: fixed` children. Pages wrap content in `<GlassCard className="relative z-30">` at `app/members/metrics/page.tsx:190`, `members/workouts/page.tsx:228` and `members/health/page.tsx:298`. A banner rendered inside one of those pins to the card, not the viewport. The §6 web adoption recipe should say to render `<FloatingBanner>` at the page root, outside any glass-card, backdrop-blur or transformed ancestor.

4. **[ADVISORY] The SPEC says "Depends on: nothing … imports no feature code", but all three kits import the batch row-error type.** The imports are:
   - web `apps/web/src/lib/api/logs.ts:18`
   - iOS `apps/ios/RaSi-Fiters-App/Shared/Services/APIClient+Workouts.swift:147,163`
   - Android `apps/android/app/src/main/java/com/app/rasifiters/net/Dtos.kt:439`

   These belong to the workout-logs / daily-health-logs batch contract. Under git-version's graph rule (an import earns a `depends_on` edge), the step 29 registry block should carry `"depends_on": ["workout-logs","daily-health-logs"]`. Otherwise a change to the `rowErrors` shape won't list frontend-kit in the blast-radius report.

5. **[ADVISORY] git-version won't see later iOS or Android kit edits.** `reference_impl` lists only the web paths, so an edit to `KitCopy.swift` or `KitCopy.kt` alone maps to "zero feature impact" and nothing enforces D-KIT-2 ("all three + §3 in one commit"). Step 29.8's LESSONS append (or SPEC §8) should tell git-version to map `Shared/Kit/**`, `Shared/Theme/AppPalette.swift`, `core/kit/**`, `ui/components/kit/**` and `core/theme/Palette.kt` to frontend-kit.

6. **[ADVISORY] Android `toAppError()` rethrows `TimeoutCancellationException`, because it is a `CancellationException` subtype.** If Phase 3 implements the 15 s timeout with `withTimeout`, timeouts will be silently treated as cancellations instead of TIMEOUT, which contradicts D-KIT-4. Fix: add `is TimeoutCancellationException -> AppError(AppErrorKind.TIMEOUT)` before the cancellation branch, or have the SPEC require the timeout to be OkHttp `callTimeout`. Today nothing uses `withTimeout` (I grepped the Android sources).

7. **[ADVISORY] iOS `NetworkMonitor` would be the first `@Observable` in an app that is otherwise all `ObservableObject`.** I grepped `apps/ios` and found no `@Observable`, and `apps/ios/CONTEXT.md` describes the app as "MVVM via one central ProgramContext ObservableObject". The workspace rule is "follow existing patterns". The only pre-decided compile fallback covers `assumeIsolated`, and the iOS gate runs only after the merge. Either use `ObservableObject` with `@Published private(set) var isOnline`, or also pre-decide a fallback for errors from the `@Observable` macro itself.

**What I checked and found clean:**
- **Anchors:** all cited anchors are current: manifest line 4 INTERNET, `SummaryScreen.kt:165`, `ProgramPickerScreen.kt:477`, `AppRootView.swift:177`, and the three CONTEXT `## Stack` anchors.
- **Name collisions:** none of the new names exist yet on iOS, Android or web.
- **iOS project setup:** the synchronized root group exists with only the `Info.plist` exception, and the build settings (MainActor default isolation, Swift 5, 18.6) are as stated.
- **Symbols and signatures the new code calls all exist with the planned shapes:**
  - iOS: `Color(hex:)`, `Color(light:dark:)`, `adaptiveShadow`, `adaptiveColumn`, `AdaptiveLayout` 520/700, every `AppSpacing` / `AppTypography` / `AppCornerRadius` member used, the `AppPrimaryButton` memberwise init, `APIHTTPError`, `BulkWorkoutError`.
  - Android: `ApiException` / `toApiException` / `BulkRowError` signatures, `PillButton`, `RaSiFitersTheme(darkTheme:)`.
  - Build deps: icons-extended and ui-tooling-preview are present, Kotlin is 2.0.21.
- **Web build pieces:** every `rf-*` color and shadow token exists, the palette hex values match `globals.css`, and Tailwind 3.4.19 compiles the arbitrary `bottom-[calc(max(…)+7.5rem)]` class to valid CSS (I tested it).
- **Web page wiring:** `/kit-preview` is outside the middleware matcher.
- **Program-picker clearance:** the FAB geometry (iOS 150, Android 146.dp) matches the code.
- **Fence check:** the step 24 greps come back empty on today's tree.
- **Overlap with track C:** C edits `registry.json` before its git-version step, and step 29.1's precondition handles that.
- **Live binaries:** no backend contract change, so nothing affects them.
- **Consumers:** no kit symbol is consumed anywhere yet (web, iOS and Android all grepped).
