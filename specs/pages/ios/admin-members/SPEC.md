# iOS Screen SPEC — `AdminMembersTab` / `StandardMembersTab` (the Members tab body)

> **Surface:** `ios` · **Provenance (legacy, archived):**
> `ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/{AdminOtherTabs.swift (AdminMembersTab), StandardMembersTab.swift}`
> (+ card structs from `Detail/MemberCards.swift`, `Detail/MemberPickerOverviewView.swift`,
> `Detail/MemberMetricsViews.swift (MemberMetricsPreviewCard)`; `GlassButton` from `Detail/ActivityTimelineViews.swift:153`)
> **Web sibling (co-equal reference):** `/members` landing — `specs/pages/web/members/SPEC.md`
> **Ported to:** `apps/ios/RaSi-Fiters-App/Features/Home/Tabs/{AdminMembersTab,StandardMembersTab,MemberCards,MemberOverviewPicker}.swift`
> + `Shared/Components/GlassButton.swift` (+ `Tabs/MemberCardsState.swift`, 0.5.0) · **Run:** 55 (2026-06-30) · **v0.6.0** (2026-10-14)

## 1. What it is + who uses it
The **Members tab** — Tab 2 of `AdminHomeView`, the iOS analogue of the web `/members` landing. A **per-member
performance dashboard** rendered as two role-bifurcated views: **`AdminMembersTab`** (program admin + global_admin)
and **`StandardMembersTab`** (logger + member), selected by `AdminHomeView`'s `isProgramAdmin` switch. It shows a
selected member's overview/history/streak/recent-workouts/health cards (+ an admin metrics preview), with a
**"View as"** member picker for staff.

## 2. Why it exists
It is the program's member-analytics hub — staff inspect any enrolled member's progress; a plain member sees only
their own. It mirrors the built web `/members` landing (same card set, same role gating, same view-as semantics),
adapted to native idioms (a view-as **sheet** + `NavigationLink` push detail views instead of web routes/inline modals).

## 3. Route / location
- **App:** ios · **Files:** `Features/Home/Tabs/AdminMembersTab.swift`, `StandardMembersTab.swift`,
  `MemberCards.swift` (the 4 inline list cards + `memberTimelinePoints`), `MemberOverviewPicker.swift`
  (`MemberPickerView` · `MemberOverviewCard` · `MemberMetricsCard` · `MemberMetricsPreviewCard` · `SortField`/`SortDirection`);
  `Shared/Components/GlassButton.swift` (new shared chrome).
- **Entry:** Tab 2 of `AdminHomeView`'s `TabView` — `isProgramAdmin ? AdminMembersTab() : StandardMembersTab()`.

## 4. Contents / sections

### `AdminMembersTab` (program admin + global_admin) — legacy `AdminOtherTabs.swift:5-153`
| Block | Reference `file:line` | Notes |
|---|---|---|
| Header (title "Members" · program name · **Invite** `GlassButton`) | `AdminOtherTabs.swift:25-40` | Invite → `InviteMemberView` (a deferred stub at port time; since ported). **0.5.0 (D-NP1):** the button is `person.2` → `PeopleListView` (a swap of `envelope.badge.person.crop`, not a new button — NP-U1); Invite moves to People's `Invite member` row and stays on the Program tab. |
| **Member Metrics preview** card (`NavigationLink` → `MemberMetricsDetailView`) | `:43-48` | `MemberMetricsPreviewCard` — fetches the leaderboard, shows top member (web F5) |
| **View as** selector (`canViewAs = isProgramAdmin`) → `MemberPickerView` sheet | `:50-51, 87-118` | global_admin gets the "None" option; program admin defaults to self |
| `MemberOverviewCard` · `MemberHistoryCard` · `MemberStreakCard` · `MemberRecentCard` · `MemberHealthCard` (when a member is selected) | `:52-58` | each card is a `NavigationLink` to a detail view (deferred at port time; all since ported). The Overview's **PTD MP %** = active days ÷ the program's days so far, clamped 0–100 (D-C2). |

### `StandardMembersTab` (logger + member) — legacy `StandardMembersTab.swift:5-199`
| Block | Reference `file:line` | Notes |
|---|---|---|
| Header (title · program name · **View Members** `GlassButton`) | `StandardMembersTab.swift:31-47` | View Members → `ProgramMembersListView` (a deferred stub at port time; since ported). **0.5.0 (D-NP1):** `person.2` → `PeopleListView` (the roster is retired). |
| `MemberOverviewCard` (self) | `:55-57` | PTD MP % = active days ÷ the program's days so far, clamped 0–100 (D-C2) |
| `MemberMetricsCard(metric:, hero: .active_days)` (self — D-C7 primary-stat swap) | `:60-62` | the member-self metrics card |
| `MemberHistoryCard` · `MemberStreakCard` (self) | `:65-68` | |
| **logger only:** `loggerViewAsSelector` sheet, then `MemberRecentCard` + `MemberHealthCard` scoped to the picked member | `:70-74, 105-144` | logger can view-as another member's **logs only** |
| **member:** `MemberRecentCard` + `MemberHealthCard` (self) | `:76-81` | |

## 5. Components + shared features consumed
- **New shared chrome (ported this run):** `GlassButton(icon:)` — the circular gradient icon button (legacy
  `ActivityTimelineViews.swift:153`); both tabs' header actions use it. Was NOT in the foundation.
- **Already in foundation (run 50):** `ActivityTimelineCardSummary` (run 54) + `APIClient.ActivityTimelinePoint`
  (used by `MemberHistoryCard`); `adaptiveShadow`/`adaptiveTint`/`adaptiveBackground`/`Color.app*` theme;
  every member api fn + DTO + `ProgramContext` loader.
- **Consumes:** `ProgramContext` (`isProgramAdmin`/`isGlobalAdmin`/`loggedInUserId`/`loggedInUserName`/
  `loggedInUserProgramRole`/`members`/`membersProgramId`/`name`/`startDate`/`endDate` + the loaded member state).

## 6. Data / API
All endpoints already mounted + every fn ported in the foundation (run 50) — **zero backend work**. Loaders
(`ProgramContext+Members.swift`): `loadMemberMetrics` · `loadMemberOverview` · `loadMemberHistory` ·
`loadMemberStreaks` · `loadMemberRecent` · `loadMemberHealthLogs` · `loadLookupData`. The tab does **no writes**.

## 7. Role-based view rules
| Role | Variant | Sees / can do |
|---|---|---|
| **global_admin** | `AdminMembersTab` | ~~Invite~~ People (0.5.0) · metrics preview · **View as any** member (incl. "None") · the 5 member cards. |
| **program admin** (`my_role==admin`) | `AdminMembersTab` | Same, but picker has **no "None"** and **auto-selects self** on load (`AdminOtherTabs.swift:145-152`). |
| **logger** (`my_role==logger`) | `StandardMembersTab` | Own Overview/Metrics/History/Streak + a **logs-only** view-as picker scoping Recent + Health; ~~View Members~~ People pill (0.5.0). |
| **member** | `StandardMembersTab` | Own Overview/Metrics/History/Streak/Recent/Health; ~~View Members~~ People pill (0.5.0). No view-as, no invite. |

**`admin_only_data_entry`: N/A** — the Members tab performs **no data entry** (every card is a read or a
`NavigationLink`; no log forms — unlike the Summary tab, run 54). The lock governs the deferred log/edit detail
views, not this tab. Matches the web `/members` landing (web SPEC §7).

## 8. States & edge cases
- **Loading:** `StandardMembersTab` shows a `ProgressView` while `isLoading`; `AdminMembersTab` shows cards once a
  member is selected (default-selected to self for non-global-admins).
- **Empty:** Overview "No workouts logged yet."; Recent "No workouts logged yet."; Health "No daily health logs
  yet."; metrics preview "No members to display".
- **Error:** ~~**swallowed** — load errors surface nowhere (matches the web landing, which also surfaces none).
  `StandardMembersTab.errorMessage` is set ("Unable to identify logged-in user.") but **never rendered** (F1).~~
  **0.5.0 (D-NP2, the S5 recipe):** every card failed → `ErrorStateView` + Retry; a partial failure or a failure over
  kept data → the floating `Couldn't refresh` · Retry banner; a failed card shows `—` (streak tiles `…` while loading);
  pull-to-refresh and reconnect reload.
- **Program / View-as switch (0.5.1, D-REL1):** a program switch clears every shared card value before the new program
  loads and resets "View as" for every role (global admins too); a member switch cancels the previous member's reads, and
  a superseded read never publishes — the previous program's or member's numbers never sit under the new name.
- **Unauth:** handled upstream (`AppRootView` `authToken` bifurcation); the tab is only reachable post-auth.

## 9. Decisions made
| ID | Decision | Rests on |
|---|---|---|
| **D-SCOPE** | Port the two tab bodies + the inline cards/picker/types (`MemberMetricsPreviewCard`, `MemberOverviewCard`, `Member{History,Streak,Recent,Health}Card`, `MemberMetricsCard`, `MemberPickerView`, `SortField`/`SortDirection`, `memberTimelinePoints`) + the new `GlassButton`. **Defer** the 6 forward-nav detail targets as `ScaffoldPlaceholder` stubs + extend the `ActivityTimelineDetailView` stub. The scope cut IS the run (runs 21/50/52/53/54). | `AdminOtherTabs.swift`, `StandardMembersTab.swift` |
| **D-REF** | **Keep iOS-native multi-screen nav** — a view-as picker **sheet** + `NavigationLink` push detail views. Web `/members` renders the whole hub on one page (inline modals); iOS keeps native nav. The card SET + role gating already match web → this is a **platform-idiom divergence**, not a parity gap (runs 52/53). `consumed_by = [ios]`. | web `/members` SPEC D-REF; `AdminOtherTabs.swift:108`, `MemberCards.swift` `NavigationLink`s |
| **D-DEPS** | **One new dependency:** `GlassButton` (28-line shared chrome) + the `memberTimelinePoints` free func — both used by the ported subset, neither in the foundation. Everything else (api fns/DTOs/loaders/theme/`ActivityTimelineCardSummary`) already ported. | grep: no `GlassButton`/`memberTimelinePoints` in `apps/ios` pre-run |
| **D-S1** | **Faithful 1:1** — no behavioral deviation. **No web-parity ADD this run** (the run-53 shape): both web and legacy iOS swallow load errors, so unlike run 52's ProgramPicker there is no swallow-vs-surface gap. | web `/members` landing surfaces no errors; `StandardMembersTab.swift:163` |
| **D-STUB** | Extend the existing `ActivityTimelineDetailView` stub to accept `memberId: String? = nil` + `showActiveSeries: Bool = true` (defaults keep the run-54 Summary call site `ActivityTimelineDetailView(initialPeriod:)` compiling) — `MemberHistoryCard` passes all three. New stubs: `MemberMetricsDetailView`, `InviteMemberView`, `ProgramMembersListView`, `MemberStreakDetail`, `MemberRecentDetail(memberId:memberName:)`, `MemberHealthDetail(memberId:memberName:)`. | `MemberCards.swift:26-31, 115, 189`; `AdminOtherTabs.swift:36, 44`; `StandardMembersTab.swift:43` |
| **D-C1** | **Invite entry (reliability Phase 3 C2).** The Invite nav target (`InviteMemberView`) shows "Invitation sent" only on a 200 and every other status through the kit — see [program-member-management](../program-member-management/SPEC.md) D-C4. | invites §3.1. |
| **D-NP1** | **People from the header, every role (0.5.0; NP-U1 — supersedes iOS UA-1; people D-C14).** Both tabs' header `GlassButton` is `person.2` → `PeopleListView`: on `AdminMembersTab` it replaces the `envelope.badge.person.crop` Invite button (a swap, never a second header button — the custom-header rule), on `StandardMembersTab` it replaces the roster push. | NP amendments NP-U1; iOS plan TC1. |
| **D-NP2** | **The S5 recipe with owner tokens + render-time identity (0.5.0; member-analytics D-C12; iOS plan TC5/TC12, verdict #1).** `MemberCardState` per card (`Tabs/MemberCardsState.swift`); `ProgramContext.memberCardsOwner` (`members-tab`, or a `MemberFullStatsView` UUID) — a tab that finds another owner resets the cards to placeholders and reloads its own member, and both tabs skip their reconnect / `members.count` reloads while another owner holds them; the render-time identity tags `memberHistoryMemberId` / `memberStreaksMemberId` / `memberRecentMemberId` make a card show a placeholder unless the data is its member's; the Metrics preview keeps its own `loadedProgramId` (`.task(id: program\|refresh)`) so another program's rows never show. Accepted: placeholders flash once when returning from Workout History / View Workouts (they load without the owner flag). `loadMemberOverview` returns `AppError?`. | member-analytics D-C12; NP amendments R13. |
| **D-REL1** | **Phase 4 polish (#10, #29).** #10 keyed member cards (frontend-kit **D-KIT-23**): the picker calls `ProgramContext.resetProgramScopedData()` when the program changes (the cards, the owner token + identity tags, the metrics rows, `membershipDetails`); both tabs reset "View as" for every role on a program change — `AdminMembersTab` cancels its View-as `loadTask` and re-applies the default, `StandardMembersTab` cancels `loggerLoadTask` and clears `loggerViewAsMember`; a logger's member pick cancels the previous member's Recent read. The shared loaders (`loadMemberOverview` / `History` / `Streaks` / `Recent`, `loadMembershipDetails`, `loadLookupData`) publish only when not cancelled and the program is unchanged. I4: an unfinished View-as load is cancelled `onDisappear` and restarted on the next appearance while the cards are free. `MemberHistoryCard`'s render-time id falls back to the signed-in member, never the overview's member. #29 (one line in `MemberCards`): the streak card pushes `MemberStreakDetail(memberId: selectedMember?.id ?? loggedInUserId)`, which loads its own streaks ([member-streaks-detail](../member-streaks-detail/SPEC.md)). The cards' loading / error placeholders stay People S5's (D-NP2; iOS plan P-1). | `05e185a`; polish amendments PA6 (I4); iOS plan P-1, steps 35–37 |
| **D-C2** | **PTD MP % = active days ÷ the program's days so far, clamped (2026-10-14 parity sweep D2 + amendment B1; METHODOLOGY R9).** `MemberOverviewCard.programTotalDays` keeps its rule — `ProgramContext.startDate` → min(`endDate`, now) inclusive in `Calendar.current` (the **device's local calendar day** — log dates are local days), at least 1 — and `memberProgressPercent` now clamps the rounded % to 0–100; the bar's value is `min(active_days, programTotalDays)` and the caption stays `a / b days`. The clamp matters because `active_days` is not clipped to the program end ([member-analytics](../../../features/member-analytics/SPEC.md) §10). Web adopted this denominator and Android already had it, so the three read the same (program progress — ring / Program tab / picker bar — is the server's UTC numbers, [programs](../../../features/programs/SPEC.md) D-C6; the two day rules differ on purpose). **Dateless program (sweep X-3, out of scope):** a program without dates keeps `ProgramContext`'s placeholder dates (init ±180 days; `apply(program:)` keeps the previous dates when one is null), so iOS shows a non-zero denominator where web and Android read 0 days / 0 %. | `Features/Home/Tabs/MemberOverviewPicker.swift` (`programTotalDays`, `memberProgressPercent`); `Shared/Models/ProgramContext.swift:190-198`; `ProgramContext+ProgramManagement.swift`; parity-sweep plan D2 / X-3 + amendments B1. |

## 10. Flagged characteristics kept as-is
- **F1** — `StandardMembersTab.errorMessage` is set (`:163`) but **never rendered**; load errors are swallowed
  (matches web). Rebuild-cleanup candidate (surface it), but kept faithful = web parity.
- **F2** — **`MemberOverviewCard.member` param is vestigial** — the card reads `programContext.selectedMemberOverview`,
  not the passed `member` (`MemberPickerOverviewView.swift:78, 80`). Faithful.
- **F3** — **View-as not persisted** — `@State selectedMember`/`loggerViewAsMember` reset on program change / app
  relaunch; web persists in `sessionStorage` (per-session, also ephemeral) — roughly equivalent. Not promoted to
  `UserDefaults` (would over-match web). Web SPEC F3.
- **F4** — **Over-fetched metrics preview** — `MemberMetricsPreviewCard` calls `loadMemberMetrics` (full leaderboard)
  but renders only the top member + count (web F5). Faithful.
- **F5** — **Two metric renderers** — `MemberMetricsPreviewCard` (admin preview) + `MemberMetricsCard` (member-self)
  overlap (web F6). Not consolidated.
- **F6** — **Client role gating** — `canViewAs`/`isLogger` from `loggedInUserProgramRole` + an unverified JWT decode;
  the backend re-authorizes every read (web F1). Faithful.
- **F7** — **6 deferred detail stubs + the extended `ActivityTimelineDetailView`** — the iOS analogues of web's
  `/members/{metrics,invite,list,streaks,workouts,health}` sub-routes; each a later run. Forward-nav (web F2).

## 11. Changelog
- **v0.6.0** (2026-10-14, **D-C2 — parity sweep D2 + B1, METHODOLOGY R9**; iOS `d6f569a`) — PTD MP % is clamped 0–100 and
  the bar's value to the denominator; the denominator stays start → min(end, today) inclusive in the device's local
  calendar day (now the rule on web + Android too). Notes the dateless-program placeholder divergence (X-3, out of
  scope). §4 + §9.
- **v0.5.1** (2026-10-13, **D-REL1 — Phase 4 polish (`05e185a`)**) — #10 program switch clears the shared cards and resets
  View-as for every role, member switches cancel the previous reads, superseded loader replies never publish, the View-as
  load stops `onDisappear` (I4); #29 the streak card passes `memberId` to its self-loading detail.
- **v0.5.0** (2026-10-13, Phase 4 Notifications + People, `198407c`) — D-NP1: the header button is `person.2` → People on
  both tabs (admin swap of the Invite button); D-NP2: the S5 recipe — ErrorView only when every card failed, `—` per
  failed card, `Couldn't refresh · Retry`, pull-to-refresh + reconnect reload, `memberCardsOwner` tokens and the
  render-time identity tags (another member's / program's numbers never show; a one-time placeholder flash after
  History / View Workouts is accepted). New `Tabs/MemberCardsState.swift`.
- **v0.4.1** (2026-10-13, Phase 4 quick wins) — tab reads run in parallel and `MemberHealthCard` loads its own
  preview; the standard tab spins only for a program's first load, takes its self card from the memberId-scoped
  overview (no all-member download — member-analytics D-C10), and a logger's Recent follows View-as (#5).
- **v0.4.0** (2026-10-13, reliability Phase 3 C2) — D-C1: the Invite entry follows program-member-management D-C4
  ("Invitation sent" only on 200; the swallow removed).
- **v0.3.0** (2026-07-15, member-analytics 0.4.0 D-C7) — **Active Days primary**: self card hero `.active_days` +
  load `sort=active_days` (`StandardMembersTab`); `MemberMetricsCard` subtitle = "Workouts N" + grid row 1 =
  [Active Days, Workouts]; `MemberMetricsPreviewCard` default sort `.active_days` (top member = top-by-active-days)
  + mini tiles [Active Days, Workouts, Types]. Sort option list order unchanged; MTD Workouts untouched.
- **v0.2.0** (2026-07-09, steps-tracking) — the member-overview grid (`MemberOverviewPicker.metricsGrid`) gains a
  5th row: an **Avg Steps** `metricTile` (`figure.walk`, `NumberFormatter`-grouped `avg_steps` or "—" —
  member-analytics 0.2.0) beside the existing Current-Streak badge (moved into the grid as column 2). The
  `MemberHealthCard` 3-row preview (`MemberCards.swift`) adopts the **DC-10** two-line format
  (`logDate` semibold; `Sleep … · Diet … · Steps …`, `—` for missing, steps grouped via a local `stepsLabel`);
  its preview now reads a local `previewLogs: [APIClient.DailyHealthLogItem]` (reset to `[]` + `guard let memberId`
  on `.task(id: memberId)` per amendment A-1 so a member switch never flashes the previous member's rows).
  `MemberMetricsDTO` gains `avg_steps`; `loadMemberHealthLogs` returns `[DailyHealthLogItem]` (steps-aware) while the
  published `memberHealthLogs` type is unchanged. Build green-check owned by the user (Xcode).
- **v0.1.0** (run 55, 2026-06-30) — initial SPEC; Members tab body ported (2 tab bodies + 7 inline cards/picker +
  `GlassButton`); 6 detail targets deferred as stubs, `ActivityTimelineDetailView` stub extended. Faithful 1:1, no
  web-parity ADD. Build green-check owned by the user (Xcode).
