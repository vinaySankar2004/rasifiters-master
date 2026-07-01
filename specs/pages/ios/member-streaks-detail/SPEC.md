# Screen: `member-streaks-detail` (ios) — the Streak Stats + milestone ladder

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from the Members tab's streak card
> (`MemberCards.swift:50`, `NavigationLink { MemberStreakDetail() }`).
> **Reference impl (legacy):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Home/Detail/MemberDetailViews.swift`
> (`MemberStreakDetail` + `WrapChips`, lines 5–107).
> **Web parity reference:** [`web members/streaks`](../../web/members/streaks/SPEC.md) — same current/longest tiles +
> milestone badge ladder over server-computed streak math.
> **Consumes:** `ProgramContext.memberStreaks` (server-computed via `GET /member-streaks`, loaded by the card upstream).
> No API call of its own, no write.
> **Stance:** faithful 1:1 port **+ D-C1 (tokenize `.orange`) + D-C2 (non-color ✓ milestone affordance, web parity)**. §10.

---

## 1. What it is + who uses it

The **streak stats** drill-down — two tiles (Current / Longest streak, in days) + a wrapped **milestone ladder**
(`7d`, `30d`, … chips, achieved vs not) rendered from the server-computed `ProgramContext.memberStreaks`. No client
streak math. Reached from the Members tab streak card, gated upstream; the screen has no internal role gate.

## 2. Why it exists

The Members tab streak card is a preview; tapping opens the tiles + milestone ladder, the iOS analogue of web
`/members/streaks`. Read-only — no logging, no lock.

## 3. Route / location

- **App:** `ios`. **Reached via:** `MemberCards.swift:50` streak card → `MemberStreakDetail()` (no args; reads
  `programContext.memberStreaks`, loaded by the card before navigation).
- **Leaves to:** back only. No forward-nav (leaf detail).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Streak tiles | `streakTile` ×2 — Current (`flame.fill`, appOrange) / Longest (`trophy.fill`, appYellow), "N days". | legacy `:11-14`, `:31-49` |
| Milestones | "Milestones" header + `WrapChips` over `s.milestones.map { (dayValue, achieved) }`. | legacy `:16-18`, `:52-107` |
| Empty | "No streak data." when `memberStreaks == nil`. | legacy `:19-23` |

## 5. Components + features consumed

- **New this run (`Features/Home/Detail/MemberStreakDetail.swift`):** `MemberStreakDetail`, `WrapChips` (self-contained
  wrapping-chip layout).
- **Reused (foundation):** theme tokens `appOrange`/`appYellow`/`appOrangeLight`.
- **Features:** none — reads `ProgramContext.memberStreaks` (`MemberStreaksResponse`: `currentStreakDays`,
  `longestStreakDays`, `milestones[].dayValue/.achieved`), all server-computed.

## 6. Data / API

- **No API call of its own** — `memberStreaks` is fetched by the Members tab card (`GET /member-streaks?memberId=`)
  before navigation. Read-only; `admin_only_data_entry` **N/A**.

## 7. Role-based view rules

| Viewer | Sees |
|--------|------|
| global_admin / program admin / logger | Any member's streaks (the card gates who can pick a member; run 43/55). |
| member | Own streaks only (the Members tab scopes a plain member to self; the screen has no internal gate — the loaded `memberStreaks` sets scope). |

**`admin_only_data_entry` = N/A** — read-only. Unlike web `/members/streaks`, iOS has **no in-view member-own-only
redirect** — the entry is gated upstream at the card (run 53/55), so the redirect web needs for its URL-addressable
route is N/A here (F3).

## 8. States & edge cases

- **Empty:** `memberStreaks == nil` → "No streak data."
- **No loading / error state** — the data is pre-loaded by the card; this leaf only renders it.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | Ported as part of the **Members detail cluster** (run-58→62) with metrics / recent / health. Leaf view; deferred stub removed. | run-62; `MemberCards.swift:50`. |
| **D-S1** | **Stance = faithful 1:1** (both web `/members/streaks` AND legacy iOS agree — tiles + milestone ladder over server math) **+ the 2 cleanups below**. | legacy file; web SPEC; user answer. |
| **D-C1** | **Tokenize the one bare `.orange`** — the achieved-chip foreground `.orange` → `Color.appOrange` (light-identical; run-62 D-C1 consistency). The only bare literal in the file (everything else is `Color.app*`/semantic `systemGray*`). | legacy `:104`; user answer; run-26/62. |
| **D-C2** | **Non-color milestone affordance** — achieved chips gain a **✓ prefix + a faint `appOrange` ring** so "achieved" is not signalled by color alone (matches web `/members/streaks` D-C1; a11y). Legacy iOS distinguished achieved by `appOrangeLight` background only. | web streaks D-C1; user answer. |
| **D-REF** | **Keep iOS-native** — `NavigationLink` push + native `WrapChips` layout vs web's route + flex badges; the tiles + ladder + role posture match web → idiom, not gap. `consumed_by=[ios]`. | run-52/53; [[ios-matches-web-not-just-legacy]]. |
| **D-DEPS** | **No new dependency** — `MemberStreaksResponse` DTO + theme tokens already ported (run 50); `WrapChips` ports co-located (self-contained). | collision grep; run-50. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Server-computed streak math** (no client computation — `currentStreakDays`/`longestStreakDays`/`milestones` all from the server) — mirrors web F1. | `programContext.memberStreaks` | Kept (faithful). |
| **F2** | **No load/error state** — the data is pre-loaded by the card; a `nil` `memberStreaks` shows "No streak data." rather than a spinner or banner. | `MemberStreakDetail.swift` | Kept (faithful). |
| **F3** | **No in-view member-own-only redirect** — web `/members/streaks` redirects a non-staff viewer off another member's `memberId`; iOS gates that at the Members tab card (run 43/55), so the screen carries no redirect (client-stricter-at-the-entry, not the screen — mirrors web F2 asymmetry from the other side). | `MemberCards.swift`; screen | Kept (faithful); backend is the real boundary. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 63) — the Members **streak-stats detail**, ported into `apps/ios/.../Features/Home/Detail/MemberStreakDetail.swift` (+ `WrapChips`); deferred stub removed. **D-SCOPE** (Members detail cluster) · **D-S1** (faithful 1:1 — both-agree) · **D-C1** (tokenize `.orange` → `appOrange`) · **D-C2** (non-color ✓ milestone affordance — web parity) · **D-REF** (keep iOS-native; `consumed_by=[ios]`) · **D-DEPS** (no new dep). Flagged F1–F3. Read-only → `admin_only_data_entry` N/A; the member-own-redirect is upstream, not in-view. Build green-check owned by the user (Xcode); symbols grep-verified. |
