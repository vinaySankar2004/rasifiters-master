# Screen: `member-health-detail` (ios) — the per-member daily-Health logs (write surface)

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from the Members tab's health card
> (`MemberCards.swift:192`, `NavigationLink { MemberHealthDetail(memberId:memberName:) }`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Sheets/HealthSortFilterSheets.swift`
> (`MemberHealthDetail` + sort/filter sheets + `DailyHealthEditSheet`, lines 1–848).
> **Web parity reference:** [`web members/health`](../../web/members/health/SPEC.md) — the write twin of
> `/members/workouts`: sorted/filterable list + Edit (sleep + diet) / Delete + client CSV; `admin_only_data_entry` **LIVE**.
> **Consumes:** `ProgramContext.loadMemberHealthLogs` / `updateDailyHealthLog` / `deleteDailyHealthLog`.
> **Stance:** faithful 1:1 port **+ D-C1 (web-parity `admin_only_data_entry` lock)** — the write twin of member-recent. §10.

---

## 1. What it is + who uses it

The **per-member daily-health logs** — a sorted, filterable `List` of the member's health logs (sleep hrs · date · diet
/5), with swipe **Edit** (sleep + diet, at-least-one-metric) / **Delete** per row and a client-side **CSV export**. The
write twin of `member-recent-detail`, iOS analogue of web `/members/health`. Reached from the Members tab health card,
gated upstream.

## 2. Why it exists

The health card is a preview; tapping opens the full list with sort/filter and inline edit/delete. Server-driven fetch on
control change; a **write** surface → the `admin_only_data_entry` lock bites.

## 3. Route / location

- **App:** `ios`. **Reached via:** `MemberCards.swift:192` health card →
  `MemberHealthDetail(memberId: memberId, memberName: memberName)` (`memberId` = `selectedMember?.id ?? loggedInUserId`).
- **Leaves to:** `HealthSortSheet` / `HealthFilterSheet` / `DailyHealthEditSheet` modals; back only. No forward-nav.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Controls | Sort button (dir icon + field) + Filter button (`appBlueLight` active-tint) + active-filter summary chip. | legacy `:146-244` |
| Content list | `healthRow` per item — **DC-10** two-line (`logDate` semibold; `Sleep … · Diet … · Steps …`, `—` for missing, steps grouped); loading skeletons; "No daily health logs found." empty. | legacy `:254-334` |
| Swipe actions | leading **Edit** (`appBlue`) → `DailyHealthEditSheet`; trailing **Delete** → confirm alert. **Gated on `!dataEntryLocked` (D-C1).** | legacy `:284-299`; this run |
| Export toolbar | `square.and.arrow.up` → `exportCSV()` → `ShareSheet`; disabled when empty. | legacy `:98-107`, `:385-411` |
| `HealthSortSheet` | field (checkmark) + direction lists; `HealthSortField` gains **`steps`**. | legacy `:415-473` |
| `HealthFilterSheet` | date toggles + sleep hr:min + diet 1–5 + **steps min/max** digit fields (no lazy type query — health has no vocabulary, F4). | legacy `:476-626` |
| `DailyHealthEditSheet` | sleep hr:min (0:00–24:00) + diet 1–5 `Menu` + **steps digit field** (blank = clear) + at-least-one-metric gate (sleep/diet/steps) → `updateDailyHealthLog(…, steps:)`. | legacy `:628-848` |

## 5. Components + features consumed

- **New this run (`Features/Home/Detail/MemberHealthDetail.swift`):** `MemberHealthDetail`, `HealthSortField`,
  `HealthSortDirection`, `HealthFilters`, `HealthSortSheet`, `HealthFilterSheet`, `DailyHealthEditSheet`.
- **Reused (foundation):** `ShareSheet`/`ShareItem`, theme tokens.
- **Features:** none as a module — reads `ProgramContext` (`memberHealthLogs`, `dataEntryLocked`) and calls
  `loadMemberHealthLogs`/`updateDailyHealthLog`/`deleteDailyHealthLog` directly (faithful).

## 6. Data / API

- **`GET /daily-health-logs?memberId=&…`** (`loadMemberHealthLogs`) — server sort/filter; `limit: 0` → backend cap (F1).
- **`PUT /daily-health-logs`** (`updateDailyHealthLog(…, steps:)`, Edit — explicit null clears steps/diet) ·
  **`DELETE /daily-health-logs`** (`deleteDailyHealthLog`).
- The GET now flows through the new steps-aware `fetchDailyHealthLogs` (adds `minSteps`/`maxSteps`) into a
  local `logs: [APIClient.DailyHealthLogItem]`. No lazy type query (health metrics are numeric, F4). CSV
  export client-side (header gains a **Steps** column).
- **`admin_only_data_entry` = LIVE** — write path; the lock hides Edit/Delete for non-admins (D-C1).

## 7. Role-based view rules

| Viewer | Sees / can do |
|--------|---------------|
| global_admin / program admin | Any member's health logs; sort/filter/export; **Edit + Delete** (always — `isProgramAdmin` is lock-exempt). |
| logger | Any member's health logs (view-as); Edit + Delete **unless `dataEntryLocked`** (logger not `isProgramAdmin` → locked out; list read-only). |
| member | Own health logs; Edit + Delete on own logs **unless `dataEntryLocked`** (then read-only). |

**`admin_only_data_entry` = LIVE (write path).** Same `dataEntryLocked` predicate + hide-Edit/Delete treatment as
`member-recent-detail`. Backend `requireDataEntryAllowed` is the real boundary.

## 8. States & edge cases

- **Loading:** `isLoading` → 5 redacted skeleton rows.
- **Empty:** `memberHealthLogs.isEmpty` → "No daily health logs found."
- **Control change:** `.onChange` of sort/dir/filters re-fetches.
- **No `memberId`:** `loadHealthLogs` guards and returns; the edit sheet only mounts `if let mId = memberId`.
- **Edit validity:** at-least-one-metric (`sleepValue != nil || foodQuality != nil`) + sleep 0:00–24:00 (F6); Save disabled otherwise.
- **Delete/Edit:** confirm alert → mutate → reload; failures → error alert (only mutation errors surface — no list-query error state, F5).
- **Locked:** swipe reveals no actions (D-C1); the list remains viewable.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | Ported as part of the **Members detail cluster** (run-58→62) with metrics / streaks / recent. Leaf write view; deferred stub removed. | run-62; `MemberCards.swift:192`. |
| **D-S1** | **Stance = faithful 1:1** (both web `/members/health` AND legacy iOS agree — the write twin of member-recent) **+ D-C1**. | legacy file; web SPEC; user answer. |
| **D-C1** | **Web-parity `admin_only_data_entry` lock** — swipe Edit/Delete gated on `!programContext.dataEntryLocked` (locked non-admins see the list read-only). Legacy iOS had none (backend 403); completes the run-54/60 lock arc — same treatment as `member-recent-detail` D-C1. | web health D-WRITE; run-54/60; user answer. |
| **D-REF** | **Keep iOS-native** — swipe actions + native sheets vs web route + modals; list + role posture match web → idiom. `consumed_by=[ios]`. | run-52/53. |
| **D-DEPS** | **No new dependency** — every API fn / DTO / `dataEntryLocked` / `ShareSheet` already ported (run 50); all sort/filter/edit sheets port co-located. `WorkoutLogEditSheet` (legacy-co-located here) moved to `member-recent-detail`'s file where it belongs. | collision grep; run-50. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`limit: 0` → backend cap** (shared with the workouts twin, web F1). | `loadHealthLogs` | Kept (faithful). |
| **F2** | **Client-stricter-than-backend scope** — card scopes to self; `getMemberHealthLogs` enforces only `ensureProgramAccess` + target-enrolled (web F2). | `MemberCards.swift`; backend | Kept (faithful); backend is the boundary. |
| **F3** | **`memberId` always sent** to `updateDailyHealthLog`/`deleteDailyHealthLog` (unlike the workouts twin's name-only-for-others, web F3). | `DailyHealthEditSheet`/`deleteHealthLog` | Kept (faithful). |
| **F4** | **No lazy filter query** — health filter is numeric (sleep + diet), no type vocabulary (unlike the workouts twin, web F4). | `HealthFilterSheet` | Kept (faithful). |
| **F5** | **No list-query error state** — only mutation errors alert (web F5). | `loadHealthLogs` | Kept (faithful). |
| **F6** | **Edit: sleep + diet editable (date disabled), at-least-one-metric + 0:00–24:00 sleep** (log-health run-37 mirror, web F6). | `DailyHealthEditSheet` | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-09 | **Steps throughout (daily-health-logs 0.2.0).** `MemberHealthDetail` reads a local `logs: [APIClient.DailyHealthLogItem]` via the new steps-aware `fetchDailyHealthLogs`/`loadMemberHealthLogs(… minSteps: maxSteps:)`. `HealthSortField` gains `steps`; `HealthFilters` gains `minSteps`/`maxSteps` (+ chip "Steps ≥/≤") + a filter-sheet "Steps" section; `healthRow` adopts the DC-10 two-line layout (`Sleep · Diet · Steps`, grouped); the CSV header gains a Steps column. `DailyHealthEditSheet` takes a `DailyHealthLogItem`, gains a Steps digit field (blank = clear), at-least-one-metric now includes steps, and calls `updateDailyHealthLog(…, steps:)` (`ProgramContext+WorkoutManagement` + the new `APIClient+DailyHealth` overload — explicit null clears). Build green-check owned by the user (Xcode). |
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 63) — the Members **daily-health detail** (write surface, twin of member-recent), ported into `apps/ios/.../Features/Home/Detail/MemberHealthDetail.swift` (+ its sort/filter/edit sheets); deferred stub removed; `WorkoutLogEditSheet` relocated out to `member-recent-detail`'s file. **D-SCOPE** (Members detail cluster) · **D-S1** (faithful 1:1 — both-agree write twin) · **D-C1** (web-parity `admin_only_data_entry` lock — same as member-recent) · **D-REF** (keep iOS-native; `consumed_by=[ios]`) · **D-DEPS** (no new dep). Flagged F1–F6. `admin_only_data_entry` LIVE (write path). Build green-check owned by the user (Xcode); symbols grep-verified. |
