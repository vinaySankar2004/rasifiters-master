# Screen: `member-streaks-detail` (android) — the Streak Stats + milestone ladder

> **Status:** 🏗️ built (ported to `apps/android/`) · **Version:** 0.1.0 · **App:** `android` (Compose)
> **Thin port-note.** Full behavior = the shared contract in [`ios member-streaks-detail`](../../ios/member-streaks-detail/SPEC.md)
> + [`web members/streaks`](../../web/members/streaks/SPEC.md) — this file records only the Android realization + idiom deviations.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.MEMBER_STREAKS` (`MemberStreakDetailScreen`), pushed from
> the Members tab's `MemberStreakCard` (after `focusMember(id, name)`).
> **Consumes:** reads the pre-loaded `ProgramContext.memberStreaks` (from `GET /member-streaks`, loaded by the tab
> upstream) — **no fetch of its own**, no write.
> **Files:** `ui/members/MemberSimpleDetails.kt` (`MemberStreakDetailScreen`, `MilestoneChips`) + `MemberCards.kt`
> (`StreakTile`) + `ui/summary/DetailChrome.kt` (`DetailTopBar`).

## Parity + Android-idiom deviations

- **Faithful (iOS/web 1:1):** title **"Streak Stats"**; **Current** + **Longest** tiles (flame icon `AppOrange` /
  trophy icon `AppYellow`, value = "N days"); a **"Milestones"** ladder of day-value chips rendered over the
  server-computed streak math. Empty → "No streak data." No API call, no write — it reads state the card already
  loaded (matching the iOS "loaded upstream" contract).
- **D-C2 (non-color ✓ milestone affordance, web parity):** an achieved milestone chip gets a **leading ✓ (Check)
  icon + an orange border ring** (plus the orange tint + 15%-alpha fill); an unachieved chip is a plain grey
  surface with no ✓. The achievement is legible without relying on color alone — the same non-color parity the iOS
  SPEC records as D-C2.
- **Deviation A-1 (scoped via `focusedMemberId`):** the streak state is member-scoped by the tab's `focusMember`
  before push; the screen has no nav args and issues no fetch, so it renders whatever member the card loaded.
- **Deviation A-2 (flat Material chrome):** iOS's glass tiles/chips → flat rounded Material surfaces (`StreakTile`
  + `FlowRow` of chips); the top bar is `DetailTopBar` (circle back + centered title).

## Data / API

| Call | Endpoint | Sets / does |
|------|----------|-------------|
| _(none — reads pre-loaded state)_ | `GET /member-streaks` (loaded by the tab's `loadMemberStreaks`) | `currentStreakDays` · `longestStreakDays` · `milestones[]` (day + achieved) |

No fetch on entry — the tab's `MemberStreakCard` already loaded `memberStreaks`. Bearer-authed by the OkHttp layer.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-07-08 | Initial Android port (Phase E). Current/Longest tiles + milestone ladder over pre-loaded `memberStreaks` (no own fetch). D-C2 non-color ✓-prefix + orange-ring achieved affordance; empty "No streak data." Reads scoped `focusedMemberId`. `assembleDebug` BUILD SUCCESSFUL. Visual run = user. |
