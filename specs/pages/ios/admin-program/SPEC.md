# Screen: `AdminProgramTab` / `StandardProgramTab` (ios) — the Program tab (Tab 4, the LAST tab body)

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** Tab 4 **"Program"** (`calendar.badge.clock`) of `AdminHomeView`'s bottom `TabView` — the iOS
> analogue of the web `/program` workspace hub. Role-bifurcated by `programContext.isProgramAdmin`:
> `AdminProgramTab` (program/global admin — sectioned management menu) vs `StandardProgramTab` (logger/member —
> read-only program-info card + switch/leave). **This is the LAST of the 4 home-shell tab bodies — it CLOSES
> the `AdminHomeView` shell (Summary ✓ run 54 · Members ✓ run 55 · Lifestyle ✓ run 56 · Program ✓ this run).**
> **Reference impl (legacy iOS):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/AdminProgramTab.swift`
> + `.../StandardProgramTab.swift` + `.../ProgramInfoSection.swift` + `.../MyAccountSection.swift`; helpers in
> `.../Helpers/AdminHomeHelpers.swift`.
> **Web sibling (co-equal reference):** [`specs/pages/web/program/SPEC.md`](../../web/program/SPEC.md) — the
> built `/program` hub. Per memory `ios-matches-web-not-just-legacy` this run matches the built web app,
> resolving divergences toward web parity unless there's a platform reason.
> **Consumes:** the already-ported foundation (run 50) — `ProgramContext` (program info props, `leaveProgram()`,
> `loadMembershipDetails()`, `signOut()`, `canEditProgramData`/`isGlobalAdmin`, account identity props),
> `SummaryHeader` (run 54), `ThemeManager` (injected at `@main`), `APIConfig.privacyPolicy/supportURL`, theme.
> **Stance:** faithful 1:1 + 3 pinned cleanups (de-dup Leave logic, drop dead `PlaceholderTab`, tokenize `.blue`).
> NO web-parity ADD (error handling already matches web — leave-only error surface, read errors swallowed both
> sides).

---

## 1. What it is + who uses it

The **Program workspace tab** — Tab 4 of the post-pick home shell, the program-settings + account hub, the iOS
twin of web `/program`. It is **role-bifurcated** into two physically separate views:
- **`AdminProgramTab`** (program admin / global_admin) — a sectioned scroll of management cards: Program Info
  (select/edit/leave), Member Management, Role Management (admin-gated), Workout Types, and My Account.
- **`StandardProgramTab`** (logger / member) — a read-only Program Info card (name · status · duration ·
  client-computed progress · active members), a Switch-Program button, a Leave-Program button, and My Account.

Used by **every enrolled member**; which variant renders is decided by `AdminHomeView` from
`programContext.isProgramAdmin` (§7).

## 2. Why it exists

The workspace's program-and-account lens: an admin manages the program (info/members/roles/workout types) and
their own account without leaving the tab; a standard member sees the program at a glance, switches or leaves
it, and manages their account. It is the hub that fans out to the program editor, the member roster, the role
manager, the workout-type manager, and the account screens (profile/password/appearance/notifications).

## 3. Route / location

- **App:** `ios`. **Location:** `AdminHomeView` Tab 4 (`Tab.program`, label "Program"/`calendar.badge.clock`),
  selected via `@ViewBuilder programTab` → `programContext.isProgramAdmin ? AdminProgramTab() :
  StandardProgramTab()` ([AdminHomeView.swift:83-87](../../../../apps/ios/RaSi-Fiters-App/Features/Home/AdminHomeView.swift#L83)).
- **Reached:** after program pick (the shell is pushed by `ProgramPickerView` → `AdminHomeView`); Tab 4 of 4.
- **Leaves to:**
  - `ProgramPickerView()` — Select/Switch Program (already ported, real) — via `navigationDestination`.
  - `EditProgramInfoView()` — admin-only program editor (web `/program/edit`) — **deferred stub**.
  - `MyProfileView` / `ChangePasswordView` / `AppearanceSettingsView` / `NotificationsSettingsView` — the 4
    account screens — **deferred stubs** (web `/program/{profile,password,appearance}` + iOS-native
    Notifications).
  - `APIConfig.privacyPolicyURL` / `APIConfig.supportURL` — external `Link`s (web `/privacy-policy`,
    `/support`).
  - **Deferred THIS run as new `ScaffoldPlaceholder` stubs** (the 3 heavy management sections of
    `AdminProgramTab`): `ProgramMemberManagementSection` (roster + invite + member editor = web `/members/*`),
    `ProgramRoleManagementSection` (role grants = web `/program/roles`), `ProgramWorkoutTypesSection`
    (workout-type CRUD = web `/lifestyle/workouts`).

## 4. Contents / sections

**`AdminProgramTab`** (`AdminProgramTab.swift:7-52`) — `SummaryHeader` + a `VStack` of 5 sections:

| Block | What | Reference `file:line` (legacy) |
|---|---|---|
| Header | `SummaryHeader(title:"Program", subtitle:name, status:, initials:adminInitials)`. | `AdminProgramTab.swift:14-19` |
| Program Info | `ProgramInfoSection(showSelectProgram:)` — Select Program (→ picker) · Edit Program Details (admin-only → `EditProgramInfoView`) · Leave Program (non-global-admin). | `ProgramInfoSection.swift` |
| Member Management | `ProgramMemberManagementSection()` — **deferred stub** (View Members + Invite). | `MemberManagementSection.swift` |
| Role Management | `ProgramRoleManagementSection()` — **deferred stub**; gated by `canEditProgramData`. | `RoleManagementSection.swift` |
| Workout Types | `ProgramWorkoutTypesSection()` — **deferred stub**. | `WorkoutTypesSection.swift` |
| My Account | `ProgramMyAccountSection()` — profile/password/appearance/notifications/privacy/support/sign-out. | `MyAccountSection.swift` |

**`StandardProgramTab`** (`StandardProgramTab.swift:5-317`) — a flat `NavigationStack` scroll:

| Block | What | Reference `file:line` (legacy) |
|---|---|---|
| Header | Inline `HStack`: "Program" + program name + own initials avatar (orange gradient). | `StandardProgramTab.swift:31-55` |
| Program Info card | Read-only `GlassCard`: Name · Status (capsule badge) · Duration · **Progress bar** (`completionPercent` + elapsed/remaining days) · Active Members. | `StandardProgramTab.swift:95-213` |
| Switch Program | Button → `ProgramPickerView`. | `StandardProgramTab.swift:215-253` |
| Leave Program | Button → confirm alert → `leaveProgram()` → picker. | `StandardProgramTab.swift:255-295` |
| My Account | `ProgramMyAccountSection()` (shared). | `StandardProgramTab.swift:68` |

## 5. Components + features consumed

- **Ported THIS run** (→ `Tabs/AdminProgramTab.swift`, `Tabs/StandardProgramTab.swift`, `Tabs/ProgramCards.swift`):
  `AdminProgramTab`, `StandardProgramTab`, `ProgramInfoSection`, `ProgramMyAccountSection`; + the small free
  helpers `sectionHeader(title:icon:color:)` / `settingsRow(icon:color:title:subtitle:)` (co-located in the
  legacy `AdminHomeHelpers.swift`, never pulled into the foundation — the run-55/56 `GlassButton`/`AccentChip`
  situation); + the new shared `.leaveProgramConfirmation(...)` view modifier (D-C1).
- **Already ported (reused, no new dep):** `SummaryHeader` (run 54), `ProgramPickerView` (run 52), theme
  (`Color.appBackground`/`appOrange`/`appOrangeGradientEnd`/`appOrangeVeryLight`/`appOrangeLight`/`appBlue`/
  `appBlueLight`/`appGreen`/`appPurple`/`appRed`/`appRedLight`, `adaptiveShadow`), `ThemeManager` (injected at
  `@main`), `APIConfig.privacyPolicyURL`/`supportURL`.
- **Context (foundation run 50):** `name`/`status`/`dateRangeLabel`/`completionPercent`/`elapsedDays`/
  `remainingDays`/`activeMembers`/`adminInitials`/`loggedInUserName`/`loggedInUsername`/`loggedInUserInitials`;
  `canEditProgramData`/`isGlobalAdmin`/`isProgramAdmin`; `loadMembershipDetails()`/`leaveProgram()`/`signOut()`.

## 6. Data / API

No new api fn, zero backend work. The only async calls are already-ported `ProgramContext` methods:

| Call | Endpoint (via ProgramContext) | Notes |
|---|---|---|
| `loadMembershipDetails()` | `GET /program-memberships/details` | `AdminProgramTab.task` — hydrates member/role lists for the (deferred) management sections. |
| `leaveProgram()` | `PUT /program-memberships/leave` | on Leave confirm → on success navigates to `ProgramPickerView`. |
| `signOut()` | client-side token clear (+ revoke) | My Account → Sign Out. |

## 7. Role-based view rules

Variant is selected by `AdminHomeView`: `isProgramAdmin` (= `my_role=="admin" || isGlobalAdmin`) →
`AdminProgramTab`, else `StandardProgramTab`. Matches web's admin-menu-vs-read-only-card split exactly.

| Role | Variant | Sees / can do |
|---|---|---|
| **global_admin** | `AdminProgramTab` | All sections: Program Info (Select · Edit · **NOT Leave** — `canLeaveProgram = !isGlobalAdmin`, F2) · Member Mgmt · Role Mgmt (`canEditProgramData`) · Workout Types · My Account. |
| **program admin** (`my_role=="admin"`) | `AdminProgramTab` | All of global_admin **PLUS Leave Program**. |
| **logger** (`my_role=="logger"`) | `StandardProgramTab` | Read-only Program Info card · Switch · Leave · My Account. No management sections. |
| **member** (active, non-admin/logger) | `StandardProgramTab` | Same as logger. |

Within `AdminProgramTab`: Role Management is gated by `canEditProgramData`; Program Info's Edit row by
`canEditProgramData`; Program Info's Leave row by `canLeaveProgram = !isGlobalAdmin`.

**`admin_only_data_entry`:** **N/A on this tab** — it performs **no data entry** (no log forms; Leave is a
membership mutation, not gated by the lock). Matches web (the lock gates `/summary` + the workout/health
write sub-routes, not the program hub). The read-vs-write axis (runs 31/36/54/55) — this surface does no
*logging*.

## 8. States & edge cases

- **Loading:** no blocking spinner — the program info renders from already-hydrated `ProgramContext` (set at
  program pick). `AdminProgramTab.task` refreshes membership details for the (deferred) management sections.
- **Leaving:** the Leave button shows an inline `ProgressView` while `isLeavingProgram`; the button is
  `.disabled` during the leave.
- **Error:** **swallowed except Leave** — only the Leave-Program mutation surfaces an error (an `.alert`);
  read paths surface nothing. Web `/program` is identical (error banner only on Leave mutation failure, read
  queries swallowed) → faithful-swallow IS web parity, NO ADD (the run-53/55/56 both-swallow shape).
- **Leave success:** `leaveProgram()` → navigate to `ProgramPickerView` (the program no longer exists for the
  user).
- **Sign out:** confirm alert → `programContext.signOut()` → `AppRootView` bifurcates to the splash/login flow.

## 9. Decisions made

| ID | Decision | Basis |
|---|---|---|
| **D-SCOPE** | **The scope cut IS the run.** Port the 2 role-bifurcated tab bodies + the 2 light sections (`ProgramInfoSection`, `ProgramMyAccountSection`) + the `sectionHeader`/`settingsRow` helpers. **Defer** the 3 heavy management sections — `ProgramMemberManagementSection` (356 LoC, embeds roster + `MemberDetailEditView` + invite), `ProgramRoleManagementSection` (291 LoC, embeds `ManageRolesView`), `ProgramWorkoutTypesSection` (370 LoC, embeds the workout-type CRUD + edit sheet) — as `ScaffoldPlaceholder` stubs (the run-21/50/52-56 pattern). **This run CLOSES the 4-tab home shell.** | user answer ("Tabs + light sections; defer 3 CRUD sections"). |
| **D-REF** | **Keep iOS-native** (the platform-idiom EXCEPTION, runs 52/53). Two divergences from web, both kept native + flagged: (1) the admin management sections push to **native detail screens** vs web's flat card→sub-route links (same destinations — idiom, not a gap); (2) My Account keeps its **iOS-only Notifications + Support rows** (push-notification settings are iOS-only; the push/app-config feature is `consumed_by=[ios]`; web's account menu omits them). The card set + role gating already match web. `consumed_by=[ios]`. | user answer; web SPEC §7; memory `ios-matches-web-not-just-legacy`. |
| **D-S1** | **Stance = faithful 1:1**, NO web-parity ADD. The behavior-diff comes back parity: both web AND legacy iOS surface **only** the Leave-mutation error and swallow read errors → faithful-swallow IS web parity (the run-53/55/56 both-swallow shape — unlike run-52/54 where only web surfaced → an ADD). | user answer ("Faithful + cleanups"); web SPEC §8. |
| **D-C1** | **De-dup the Leave-Program logic.** The leave state machine (`isLeaving` + `leaveError`) + `leaveProgram()` async + the "Leave Program?" confirm alert + "Error" alert + the verbatim warning message are byte-identically **triplicated** across `ProgramInfoSection` and `StandardProgramTab`. Extracted into ONE reusable `.leaveProgramConfirmation(isPresented:isLeaving:onLeft:)` view modifier — mirrors web's extracted `LeaveProgramButton` helper. Behavior-preserving: each button keeps its own distinct styling (radius 14 inside-card vs radius 16 standalone); only the identical, non-visual logic/alerts are shared. | user pin; web SPEC `page.tsx:350-367`; runs 22/23 (logic-only cross-file de-dup is safe). |
| **D-C2** | **Drop the dead `PlaceholderTab` struct** (legacy `StandardProgramTab.swift:321-369`) — a "Coming Soon" placeholder referenced by NOBODY in the rebuilt 4-tab set (all tabs landed). Not ported (dead-code drop, the run-7 pattern). | user pin; grep (zero refs in legacy + rebuilt). |
| **D-C3** | **Tokenize the `.blue` section accent** → `Color.appBlue` (light-mode pixel-identical, dark-mode theme-aware — the run-26 clean mapping). The 3 bare `.blue` accents on the info-section headers/edit icon (`ProgramInfoSection` header + Edit icon, `StandardProgramTab` info-card header icon). `statusColor` is already tokenized (`appGreen`/`appBlue`/`appOrange`); `.gray`/`.appPurple`/`.appRed`/`Color(.systemGray*)`/`Color(.label)` stay faithful (no cleaner token). | user pin; selective tokenize (runs 26/27/42). |
| **D-DEPS** | **One small new dep class** — the `sectionHeader`/`settingsRow` free helpers (co-located in the legacy giant `AdminHomeHelpers.swift`, never pulled into the foundation — the run-55/56 `GlassButton`/`AccentChip` situation) + the new `.leaveProgramConfirmation` modifier (D-C1, authored this run). Everything else already ported (run 50/52/54): `SummaryHeader`, `ProgramPickerView`, `ThemeManager`, `APIConfig` URLs, theme, all `ProgramContext` props/methods. Zero new api fn. | dep-purity grep (foundation). |

## 10. Flagged characteristics kept as-is

- **F1 — 3 deferred management-section stubs:** `ProgramMemberManagementSection` (web `/members/*`),
  `ProgramRoleManagementSection` (web `/program/roles`), `ProgramWorkoutTypesSection` (web
  `/lifestyle/workouts`) — `ScaffoldPlaceholder` until their own runs. They render inline in `AdminProgramTab`
  (compact centered placeholder blocks). Each drags in its own embedded detail screens (roster +
  `MemberDetailEditView`, `ManageRolesView`, workout-type CRUD + `EditCustomWorkoutSheet`).
- **F2 — global_admin CANNOT Leave Program:** `canLeaveProgram = !isGlobalAdmin` (`ProgramInfoSection.swift:12-14`)
  — a global admin sees Select + Edit but not Leave (matches web's F3 asymmetry). Faithful.
- **F3 — iOS-only Notifications + Support account rows:** `ProgramMyAccountSection` has Notifications
  (→ `NotificationsSettingsView`) + Support (→ `APIConfig.supportURL`) rows that web's account menu omits;
  push-notification settings are iOS-only (`consumed_by=[ios]`), Support links the existing public web
  `/support` page. Kept native (D-REF). Rebuild note, not a parity gap.
- **F4 — native multi-screen management vs web's flat hub:** `AdminProgramTab`'s management sections push to
  native detail screens (and `EditProgramInfoView` via `NavigationLink`); web renders the flow as one page
  with card→route links. Same destinations, platform idiom (D-REF; runs 52/53). Faithful.
- **F5 — client role gating only:** the variant selection + section gating are client-side
  (`isProgramAdmin`/`canEditProgramData`/`isGlobalAdmin`); the backend (`PUT /programs`, `PUT
  /program-memberships`, etc.) is the real authorization boundary (mirrors web F-rows). Faithful.
- **F6 — duplicated read-only program-info layout:** `StandardProgramTab`'s read-only program-info card
  (`StandardProgramTab.swift:95-213`) duplicates the field rows web's non-admin `GlassCard` renders; kept
  inline (not extracted) — the layout diverged from `AdminProgramTab`'s sectioned info, so it stays its own
  view (run-22/23 "don't de-dup across diverged layouts"). Faithful.
- **F7 — progress is client-computed:** `completionPercent`/`elapsedDays`/`remainingDays` are computed in
  `ProgramContext` from the program dates (not fetched analytics) — mirrors web's local
  `computeProgramProgress`. Faithful.

## 11. Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-06-30 | Initial faithful port — `AdminProgramTab`/`StandardProgramTab` + `ProgramInfoSection` + `ProgramMyAccountSection` + `sectionHeader`/`settingsRow` + `.leaveProgramConfirmation` (D-C1); dropped dead `PlaceholderTab` (D-C2); tokenized `.blue`→`appBlue` (D-C3); deferred the 3 management sections as stubs. CLOSES the 4-tab home shell (run 57). |
