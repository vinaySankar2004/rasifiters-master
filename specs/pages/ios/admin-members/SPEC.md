# iOS Screen SPEC — `AdminMembersTab` / `StandardMembersTab` (the Members tab body)

> **Surface:** `ios` · **Reference impl (legacy):**
> `../ios-mobile/RaSi-Fiters-App/Features/Home/Tabs/{AdminOtherTabs.swift (AdminMembersTab), StandardMembersTab.swift}`
> (+ card structs from `Detail/MemberCards.swift`, `Detail/MemberPickerOverviewView.swift`,
> `Detail/MemberMetricsViews.swift (MemberMetricsPreviewCard)`; `GlassButton` from `Detail/ActivityTimelineViews.swift:153`)
> **Web sibling (co-equal reference):** `/members` landing — `specs/pages/web/members/SPEC.md`
> **Ported to:** `apps/ios/RaSi-Fiters-App/Features/Home/Tabs/{AdminMembersTab,StandardMembersTab,MemberCards,MemberOverviewPicker}.swift`
> + `Shared/Components/GlassButton.swift` · **Run:** 55 (2026-06-30)

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
| Header (title "Members" · program name · **Invite** `GlassButton`) | `AdminOtherTabs.swift:25-40` | Invite → `InviteMemberView` (deferred stub) |
| **Member Metrics preview** card (`NavigationLink` → `MemberMetricsDetailView`) | `:43-48` | `MemberMetricsPreviewCard` — fetches the leaderboard, shows top member (web F5) |
| **View as** selector (`canViewAs = isProgramAdmin`) → `MemberPickerView` sheet | `:50-51, 87-118` | global_admin gets the "None" option; program admin defaults to self |
| `MemberOverviewCard` · `MemberHistoryCard` · `MemberStreakCard` · `MemberRecentCard` · `MemberHealthCard` (when a member is selected) | `:52-58` | each card is a `NavigationLink` to a deferred detail view |

### `StandardMembersTab` (logger + member) — legacy `StandardMembersTab.swift:5-199`
| Block | Reference `file:line` | Notes |
|---|---|---|
| Header (title · program name · **View Members** `GlassButton`) | `StandardMembersTab.swift:31-47` | View Members → `ProgramMembersListView` (deferred stub) |
| `MemberOverviewCard` (self) | `:55-57` | |
| `MemberMetricsCard(metric:, hero: .workouts)` (self) | `:60-62` | the member-self metrics card |
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
| **global_admin** | `AdminMembersTab` | Invite · metrics preview · **View as any** member (incl. "None") · the 5 member cards. |
| **program admin** (`my_role==admin`) | `AdminMembersTab` | Same, but picker has **no "None"** and **auto-selects self** on load (`AdminOtherTabs.swift:145-152`). |
| **logger** (`my_role==logger`) | `StandardMembersTab` | Own Overview/Metrics/History/Streak + a **logs-only** view-as picker scoping Recent + Health; View Members pill. |
| **member** | `StandardMembersTab` | Own Overview/Metrics/History/Streak/Recent/Health; View Members pill. No view-as, no invite. |

**`admin_only_data_entry`: N/A** — the Members tab performs **no data entry** (every card is a read or a
`NavigationLink`; no log forms — unlike the Summary tab, run 54). The lock governs the deferred log/edit detail
views, not this tab. Matches the web `/members` landing (web SPEC §7).

## 8. States & edge cases
- **Loading:** `StandardMembersTab` shows a `ProgressView` while `isLoading`; `AdminMembersTab` shows cards once a
  member is selected (default-selected to self for non-global-admins).
- **Empty:** Overview "No workouts logged yet."; Recent "No workouts logged yet."; Health "No daily health logs
  yet."; metrics preview "No members to display".
- **Error:** **swallowed** — load errors surface nowhere (matches the web landing, which also surfaces none).
  `StandardMembersTab.errorMessage` is set ("Unable to identify logged-in user.") but **never rendered** (F1).
- **Unauth:** handled upstream (`AppRootView` `authToken` bifurcation); the tab is only reachable post-auth.

## 9. Decisions made
| ID | Decision | Rests on |
|---|---|---|
| **D-SCOPE** | Port the two tab bodies + the inline cards/picker/types (`MemberMetricsPreviewCard`, `MemberOverviewCard`, `Member{History,Streak,Recent,Health}Card`, `MemberMetricsCard`, `MemberPickerView`, `SortField`/`SortDirection`, `memberTimelinePoints`) + the new `GlassButton`. **Defer** the 6 forward-nav detail targets as `ScaffoldPlaceholder` stubs + extend the `ActivityTimelineDetailView` stub. The scope cut IS the run (runs 21/50/52/53/54). | `AdminOtherTabs.swift`, `StandardMembersTab.swift` |
| **D-REF** | **Keep iOS-native multi-screen nav** — a view-as picker **sheet** + `NavigationLink` push detail views. Web `/members` renders the whole hub on one page (inline modals); iOS keeps native nav. The card SET + role gating already match web → this is a **platform-idiom divergence**, not a parity gap (runs 52/53). `consumed_by = [ios]`. | web `/members` SPEC D-REF; `AdminOtherTabs.swift:108`, `MemberCards.swift` `NavigationLink`s |
| **D-DEPS** | **One new dependency:** `GlassButton` (28-line shared chrome) + the `memberTimelinePoints` free func — both used by the ported subset, neither in the foundation. Everything else (api fns/DTOs/loaders/theme/`ActivityTimelineCardSummary`) already ported. | grep: no `GlassButton`/`memberTimelinePoints` in `apps/ios` pre-run |
| **D-S1** | **Faithful 1:1** — no behavioral deviation. **No web-parity ADD this run** (the run-53 shape): both web and legacy iOS swallow load errors, so unlike run 52's ProgramPicker there is no swallow-vs-surface gap. | web `/members` landing surfaces no errors; `StandardMembersTab.swift:163` |
| **D-STUB** | Extend the existing `ActivityTimelineDetailView` stub to accept `memberId: String? = nil` + `showActiveSeries: Bool = true` (defaults keep the run-54 Summary call site `ActivityTimelineDetailView(initialPeriod:)` compiling) — `MemberHistoryCard` passes all three. New stubs: `MemberMetricsDetailView`, `InviteMemberView`, `ProgramMembersListView`, `MemberStreakDetail`, `MemberRecentDetail(memberId:memberName:)`, `MemberHealthDetail(memberId:memberName:)`. | `MemberCards.swift:26-31, 115, 189`; `AdminOtherTabs.swift:36, 44`; `StandardMembersTab.swift:43` |

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
- **v0.1.0** (run 55, 2026-06-30) — initial SPEC; Members tab body ported (2 tab bodies + 7 inline cards/picker +
  `GlassButton`); 6 detail targets deferred as stubs, `ActivityTimelineDetailView` stub extended. Faithful 1:1, no
  web-parity ADD. Build green-check owned by the user (Xcode).
