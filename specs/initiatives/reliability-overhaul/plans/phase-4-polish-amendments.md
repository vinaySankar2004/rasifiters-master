# Phase 4 polish (#9–#45, #32 = People S5) — approval amendments (all three tracks)

> **Status: DRAFT — binding once the user approves U1–U3.** Implementers apply these ON TOP of their track's
> `plans/phase-4-polish-{web,ios,android}/plan.md`; where a plan and this file disagree, this file wins. Evidence:
> [`phase-4-polish-parity.md`](phase-4-polish-parity.md) (P#) and each track's `verdict.md` (W# / I# / A#).
> Shared docs (feature + page SPECs, registry, REGISTRY, RELEASES) stay orchestrator-owned: one docs commit at landing.

## 1. User decisions
| # | Decision | Recommendation |
|---|---|---|
| U1 | #43 web `--rf-text-muted` #7c828e → #646a76 app-wide (web step 11a; W5) | yes (veto = skip 11a) |
| U2 | #35 Android `composeBom` 2024.12.01 → 2025.04.01, run first as a compile spike (Android step 0) | yes (no = F35 fallback) |
| U3 | In-flight indicator stays per-surface idiom (web "…", iOS per-card spinner, Android section spinner); "—" only after a settled failure on all three — recorded in D-KIT-11 | accept |

## 2. Shared rules (every track)
| # | Rule |
|---|---|
| PA1 | **One copy table.** #45 `Sync workouts, sleep, and steps` (iOS `ProgramPickerView.swift:664`, `ProgramCards.swift:365`; Android `AccountMenuSheet.kt:108`, `ProgramAccountSection.kt:93`) · `Choose how RaSi Fiters looks to you`. #38 `End date must be after the start date.` #16 picker: `No workout types available for this program yet.` / `No active members in this program yet.` / failure `Couldn't load this` / no search match `No results`. #17 `Account created. Please sign in.` #36 labels `Show password` / `Hide password` · `Remove entry N` · `Back` · `Week` `Month` `Year` `Program` · `Program actions` / `Program actions, N new` · `Invite member` · `View members` · `Workout types`. #41 `Support` / `Get help or contact us`; Program-tab confirm `Sign Out?` / `Are you sure you want to sign out?` / `Sign Out` (picker keeps `Sign Out`). #33 empty lines `No members in this program yet.` · `No members match your search.` · `No workout types yet.` · `No workout types match your search.` |
| PA2 | **#11 on all three.** The Active toggle / checkbox is retired on web, iOS **and Android** (`MemberManagementScreens.kt` :237, :274-280; Save = `editMembership(memberId, joinedAt = …)`); the server keeps accepting `is_active` for live binaries |
| PA3 | **#17 (auth D-C18).** After a successful register, a retry only signs in with the registered credentials; steps 1–2 can't change (web hides Back; iOS `.disabled(registered != nil)` and Android `enabled = registered == null` on the name/details fields); a sign-in failure shows PA1's `Account created. Please sign in.` in the existing slot; "taken" → the username step with the message. A register whose reply was lost is a recorded known limit on all three |
| PA4 | **#16 picker hint.** Loaded + empty → the specific PA1 string; lookup failed → `Couldn't load this`; loading / no program selected → no text; search with no match → `No results`. Android `SearchablePickerField(emptyHint: String? = null)`, its two constants removed; row cards pass the hint (widgets gate on every selected program's lookup having arrived); iOS adds the `No results` row. iOS's full ErrorStateView vs the compact inline error = D-KIT-11 idiom |
| PA5 | **#9.** A failed hide/show/delete is visible where the user is: web inside the open dialog; iOS the dismissable `.error` FloatingBanner (priority action error > stale — `loadStateChrome` gains `actionError` + `onDismissError`; the in-List Section goes); Android the pinned line under search |
| PA6 | **Keyed state (D-KIT-22; #10/#31/#34).** A program / View-as change resets the affected view to loading **in the same event as the pick**; a pick is never lost; a result for an older key is dropped. iOS: AdminWorkoutTypesTab `onChange(selectedMember?.id)` sets `.loading` on a key change; default scope = `selectedMember?.id ?? (!hasUserChosenViewAs && !isGlobalAdmin ? loggedInUserId : nil)` (no roster needed). Android: `setLifestyleViewAs` resets `_lifestyleState = Idle` + `lifestyleKey = null`; the View-as effect gates on `lifestyleDefaultedFor == pid`. Shared member loaders on both publish only if the program is unchanged and the member is still the focused/selected one. iOS `resetProgramScopedData` also clears `membershipDetails` |
| PA7 | **#15.** Spinner/"Deleting…" on the button; the error directly **under the button, above the caption** (web moves its line) |
| PA8 | **#18.** "—" with Link disabled and Add-password hidden until loaded; a failed read shows `Couldn't load this` + Retry and reloads on reconnect (iOS adds it for the email read, `MyProfileView.swift:411-420`); Save never sends an unloaded gender (web realizes it by gating Save); "Change email" is not gated (Android drops `enabled = memberLoaded`) |
| PA9 | **#29 helper (D-KIT-20).** No data while offline → the offline ErrorView, never a spinner: iOS `LoadStateContent` `.idle/.loading` && `!isOnline` → ErrorStateView(offline) |
| PA10 | **#27 (both phones).** Active-only list; the load state shows once (the first enabled sync section); after a fresh successful load, prune selected ids whose program isn't active, then persist |
| PA11 | **#33 Android.** Program-tab rows read `Loading...` while loading and "—" only on Failed |
| PA12 | **#36 web.** Password toggles `inline-flex min-h-[44px] items-center px-2` + `aria-label` Show/Hide password (login, create-account ×2, reset-password, program/password); log-form mobile Remove pill `inline-flex min-h-[44px] items-center px-4 text-sm`; desktop ✕ `aria-label="Remove entry {n}"` |
| PA13 | **#35 iOS.** The login identifier gets `keyboardType: .emailAddress` |

## 3. Track-specific fixes
- **Web:**
  - W1: Modal decides Escape on `event.target`, not `activeElement`, and skips `event.isComposing`; the missing Tab trap is recorded as debt.
  - Anchors: step 34 → `members/metrics/page.tsx:183-185`; step 21 → `members/invite/page.tsx:12`.
  - Program-tab confirm title `Sign Out?`.
  - `/programs` "+" `aria-label` per PA1.
- **iOS:**
  - I1, I2 and I3 via PA5, PA6 and PA1.
  - I4 via PA6, plus cancel `memberLoadTask` in `onDisappear`.
  - I7: `MemberStreakDetail` seeds from `programContext.memberStreaks` when it is the same member (as Android step 34).
  - I8: if VoiceOver doesn't read the segment labels, put the spoken label on the Picker.
  - Fix P-3 (#38 is server + clients) and P-6 (Android doesn't use "…").
  - Delete the #45 line from the D-KIT-11 note.
- **Android:**
  - A1: `Unit` as the last line inside `loadMembershipDetails`' `runCatching` (step 4(s)).
  - A3: `KitLoad` renders Loaded and Stale in one branch.
  - A5: `saveSheet` success → `load.reload()`.
  - A7: `RolePill` `enabled = !disabled`.
  - A8: drop the "Summary and Members chart cards scrub" check; member-analytics = 0.7.0.
  - PA2, PA1 (comma), PA4, PA11.
  - "+" label `Program actions[, N new]` (`ProgramPickerScreen.kt:310`).
  - `Remove entry ${index + 1}` on the ✕.

## 4. Hand-offs
- People S5: iOS Members-tab loading/error placeholders (#10's placeholder half and #32) **before the store release**.
- People S2: web `members/list` onto QueryView with PA1's roster strings.
- S3/S5: the iOS roster and workout-type empty lines.
- N4/N5: change only the count source of the "+" badge and its label.

## 5. Orchestrator (docs commit at landing)
- **Bumps (max per feature):**
  - frontend-kit 0.5.0
  - auth 0.15.0
  - programs 0.3.0
  - program-memberships 0.4.0
  - program-workouts 0.2.0
  - member-analytics 0.7.0
  - members 0.4.1
  - workout-logs 0.7.1
  - daily-health-logs 0.4.1
  - apple-health 0.9.0
  - health-connect 0.4.0
  - analytics 0.5.1
  - analytics-v2 0.2.2
  - invites 0.2.2
- **D-rule ids (assigned once):**
  - **D-KIT-20:** the one detail-load helper per surface: web `QueryView` / `InlineLoadError`; iOS `LoadStateContent` / `loadStateChrome` / `loadOutcome` / `applying`; Android `KitLoad` / `rememberLoad` / `InlineLoadError` / `KitStaleBanner`.
  - **D-KIT-21:** tap targets of 44 px / 44 pt / 48 dp, plus labels and selected state.
  - **D-KIT-22:** PA6.
  - **D-KIT-23:** web dialogs: Modal semantics, `closeOnEscape`, ConfirmDialog keep-open.
  - **D-KIT-11 additions:** U3, the PA4 iOS idiom, and the #16 hint living inside the picker sheet on the phones.
  - **auth D-C18:** PA3; the other auth rows get D-C19 onward.
  - **programs D-C3:** #38, server and all clients.
  - **program-memberships D-C6:** PA2, all three clients.
  - **member-analytics D-C9:** the iOS mechanism wording.
- **Other records:**
  - QA6 is superseded by D-KIT-20.
  - Correct DISCOVERY #11's surfaces to web · iOS · Android.
  - Every track's page-SPEC list, plus Android `member-management` for #11.
- **Deploy order:** the backend `programService.js` change deploys before web.
- **Tags:** after landing.
```