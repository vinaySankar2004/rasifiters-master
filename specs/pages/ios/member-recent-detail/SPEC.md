# Screen: `member-recent-detail` (ios) — the per-member Workout history (write surface)

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from the Members tab's recent-workouts card
> (`MemberCards.swift:118`, `NavigationLink { MemberRecentDetail(memberId:memberName:) }`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Sheets/WorkoutSortFilterSheets.swift`
> (`MemberRecentDetail` + sort/filter sheets, lines 1–655) + `WorkoutLogEditSheet` (legacy-quirkily in
> `HealthSortFilterSheets.swift:850-990`, relocated here).
> **Web parity reference:** [`web members/workouts`](../../web/members/workouts/SPEC.md) — same sorted/filterable list +
> Edit (duration) / Delete per row + client CSV; `admin_only_data_entry` **LIVE**.
> **Consumes:** `ProgramContext.loadMemberRecent` / `updateWorkoutLog` / `deleteWorkoutLog` / `loadProgramWorkouts`.
> **Stance:** faithful 1:1 port **+ D-C1 (web-parity `admin_only_data_entry` lock — hide Edit/Delete when locked)**. §10.

---

## 1. What it is + who uses it

The **per-member workout history** — a sorted, filterable `List` of the member's workout logs (type · date · duration),
with swipe **Edit** (duration only) / **Delete** per row and a client-side **CSV export**. The per-member **write**
surface, iOS analogue of web `/members/workouts`. Reached from the Members tab recent card, gated upstream.

## 2. Why it exists

The recent card is a preview; tapping opens the full list with sort/filter and inline edit/delete. It re-fetches on
every control change (server-driven). It is a **write** surface → the `admin_only_data_entry` lock bites.

## 3. Route / location

- **App:** `ios`. **Reached via:** `MemberCards.swift:118` recent card →
  `MemberRecentDetail(memberId: memberId, memberName: selectedMember?.member_name ?? loggedInUserName)`
  (`memberId` = `selectedMember?.id ?? loggedInUserId`).
- **Leaves to:** `WorkoutSortSheet` / `WorkoutFilterSheet` / `WorkoutLogEditSheet` modals; back only. No forward-nav.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Controls | Sort button (dir icon + field) + Filter button (active-tint) + active-filter summary chip. | legacy `:179-266` |
| Content list | `workoutRow` per item (dot · type · date · duration); loading skeletons; "No workouts found." empty. | legacy `:268-348` |
| Swipe actions | leading **Edit** (`appBlue`) → `WorkoutLogEditSheet`; trailing **Delete** → confirm alert. **Gated on `!dataEntryLocked` (D-C1).** | legacy `:298-313`; this run |
| Export toolbar | `square.and.arrow.up` → `exportCSV()` → `ShareSheet`; disabled when empty. | legacy `:111-120`, `:396-420` |
| `WorkoutSortSheet` | field (checkmark) + direction lists. | legacy `:424-482` |
| `WorkoutFilterSheet` | date toggles + `SearchablePickerSheet` type picker (lazy `loadProgramWorkouts`) + hr:min duration. | legacy `:485-655` |
| `WorkoutLogEditSheet` | duration hr/min editor → `updateWorkoutLog`. | legacy Health `:850-990` |

## 5. Components + features consumed

- **New this run (`Features/Home/Detail/MemberRecentDetail.swift`):** `MemberRecentDetail`, `WorkoutSortField`,
  `WorkoutSortDirection`, `WorkoutFilters`, `WorkoutSortSheet`, `WorkoutFilterSheet`, `WorkoutLogEditSheet`, file-private
  `formatDuration`.
- **Reused (foundation):** `ShareSheet`/`ShareItem`, `SearchablePickerSheet`, theme tokens.
- **Features:** none as a module — reads `ProgramContext` (`memberRecent`, `programWorkouts`, `dataEntryLocked`) and calls
  `loadMemberRecent`/`updateWorkoutLog`/`deleteWorkoutLog`/`loadProgramWorkouts` directly (faithful).

## 6. Data / API

- **`GET /member-recent?memberId=&…`** (`loadMemberRecent`) — server sort/filter; `limit: 0` → backend caps at ~1000 (F1).
- **`PUT /workout-logs`** (`updateWorkoutLog`, Edit — duration only) · **`DELETE /workout-logs`** (`deleteWorkoutLog`).
- **`GET /program-workouts`** (`loadProgramWorkouts`, lazy — the filter type picker). CSV export client-side.
- **`admin_only_data_entry` = LIVE** — the write path; the lock hides Edit/Delete for non-admins (D-C1).

## 7. Role-based view rules

| Viewer | Sees / can do |
|--------|---------------|
| global_admin / program admin | Any member's workouts; sort/filter/export; **Edit + Delete** (unless the program lock is on — but `isProgramAdmin` is exempt, so admins always keep the actions). |
| logger | Any member's workouts (the card's view-as); Edit + Delete **unless `dataEntryLocked`** (logger is NOT `isProgramAdmin` → locked out of the mutations when the flag is on; list stays read-only). |
| member | Own workouts (card scopes to self); Edit + Delete on own logs **unless `dataEntryLocked`** (then read-only). |

**`admin_only_data_entry` = LIVE (write path).** `dataEntryLocked = adminOnlyDataEntry && !isProgramAdmin` (run 54/60) →
when on, swipe Edit/Delete are hidden; the list + sort/filter/export stay usable. Backend `requireDataEntryAllowed` is the
real boundary.

## 8. States & edge cases

- **Loading:** `isLoading` → 5 redacted skeleton rows.
- **Empty:** `memberRecent.isEmpty` → "No workouts found."
- **Control change:** `.onChange` of sort/dir/filters re-fetches.
- **No `memberId`:** `loadWorkouts` guards and returns (no fetch).
- **Delete/Edit:** confirm alert → mutate → success alert; failures → error alert (only mutation errors surface — no
  list-query error state, F5).
- **Locked:** swipe reveals no actions (D-C1); the list remains viewable.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | Ported as part of the **Members detail cluster** (run-58→62) with metrics / streaks / health. Leaf write view; deferred stub removed. | run-62; `MemberCards.swift:118`. |
| **D-S1** | **Stance = faithful 1:1** (both web `/members/workouts` AND legacy iOS agree on the list + Edit/Delete + client CSV) **+ D-C1**. | legacy file; web SPEC; user answer. |
| **D-C1** | **Web-parity `admin_only_data_entry` lock** — the swipe Edit/Delete actions are gated on `!programContext.dataEntryLocked`; locked non-admins see the list read-only with the mutations hidden (matches web `isDataEntryLocked` zeroing `canEdit`/`canDelete`). **Legacy iOS had NO lock handling** (relied on the backend 403) — this completes the run-54/60 lock arc on the detail write path. | web workouts D-WRITE; run-54/60; user answer; [[ios-matches-web-not-just-legacy]]. |
| **D-REF** | **Keep iOS-native** — swipe actions + native sheets vs web's route + inline modals; the list + role posture match web → idiom. `consumed_by=[ios]`. | run-52/53. |
| **D-DEPS** | **No new dependency** — every API fn / DTO / `dataEntryLocked` / `ShareSheet` / `SearchablePickerSheet` already ported (run 50/54); all sort/filter/edit sheets port co-located. `WorkoutLogEditSheet` relocated from the legacy health file to its owner here. | collision grep; run-50/54. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **`limit: 0` → backend cap ~1000** (not truly unbounded) — mirrors web F1. | `loadWorkouts` | Kept (faithful). |
| **F2** | **Client-stricter-than-backend scope** — the card scopes a member to self, but `getMemberRecent` enforces only `ensureProgramAccess` + target-enrolled (mirrors web F2). | `MemberCards.swift`; backend | Kept (faithful); backend is the boundary. |
| **F3** | **`member_name` passed to `updateWorkoutLog`** — the edit sends the display name (legacy contract); backend resolves the target. Mirrors web F3 (name-only-for-others). | `WorkoutLogEditSheet.save()` | Kept (faithful). |
| **F4** | **Lazy `program-workouts`** — the filter type picker fetches on first open, not page load (mirrors web F4). | `WorkoutFilterSheet.task` | Kept (faithful). |
| **F5** | **No list-query error state** — a failed `loadMemberRecent` renders header + controls only, silently; only mutation errors alert (mirrors web F5). | `loadWorkouts` | Kept (faithful). |
| **F6** | **Edit is duration-only** (type + date disabled) — mirrors web F6. | `WorkoutLogEditSheet` | Kept (faithful). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC via `question-asker` (run 63) — the Members **workout-history detail** (write surface), ported into `apps/ios/.../Features/Home/Detail/MemberRecentDetail.swift` (+ its sort/filter/edit sheets; `WorkoutLogEditSheet` relocated from the legacy health file); deferred stub removed. **D-SCOPE** (Members detail cluster) · **D-S1** (faithful 1:1 — both-agree) · **D-C1** (web-parity `admin_only_data_entry` lock — hide Edit/Delete when `dataEntryLocked`; legacy had none; completes the run-54/60 lock arc) · **D-REF** (keep iOS-native; `consumed_by=[ios]`) · **D-DEPS** (no new dep). Flagged F1–F6. `admin_only_data_entry` LIVE (write path). Build green-check owned by the user (Xcode); symbols grep-verified. |
