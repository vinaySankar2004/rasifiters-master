# Parity sweep: amendments (binding on top of `plan.md`)

> Orchestrator, 2026-10-14. `plan.md` is the planner's output (revision 2), saved byte-exact. `sweep.md` and
> `findings.md` are the read-only sweep it was built from.
>
> - **The user's decisions:** D1 (server progress), D2 (PTD = days so far), D3 ("N members").
> - **In:** A1–A7 + A9.
> - **Out:** D4 / D5 (a separate task: `../metric-semantics/`), A8, X-4, X-1 cleanup.
> - **Versions:** each store keeps its own version train.
>
> Where this file and `plan.md` disagree, this file wins.

## A9: web "today" is the UTC date

The orchestrator verified the bug. It is now **inside `plan.md`** as steps 8, 14d, 15 and 16, with the helpers
`toLocalISODate` and `todayLocalISO` in `lib/format.ts`. The rule: a user-entered calendar date defaults to the
**local** day, as on iOS and Android. This is separate from D1/D2's UTC rule for server-computed progress counts.
Nothing to add here.

## Flagged parity extensions (plan "Risks"): pending the user's approval

- (i) Web's Most popular and Longest duration get the "No data" null state.
- (ii) Android's grid diet shows "N / 5".
- (iii) Total duration rounds to exact tenths, `round(min/6)/10`, on all three apps.

The orchestrator recommends keeping all three: they are the same class of parity fix.

## Plan-adversary findings (verdict: APPROVE-WITH-FIXES): all adopted

### B1 (BLOCKING): the PTD denominator counts in the **device-local** calendar day, not UTC
Log dates are local days: A9 makes web's default local, and the phones already default to local. A UTC "today"
inflates the denominator every evening west of UTC. For example, someone who logged every day reads "14 / 15 · 93%"
at 18:00 PDT, and 50% on a program's first evening. The rule now: **program progress (ring, Program tab, picker bar)
= the server's UTC numbers (D1). PTD's denominator = start → min(end, local today), inclusive, ≥ 1, clamped 0–100,
identical on all three apps.**
- **Web, step 6 (`program-days.ts`).** Add next to `todayUtcMs`:
  ```ts
  /** B1: the device's LOCAL calendar day as a UTC-midnight ms (so it subtracts cleanly from utcDayMs values). */
  function todayLocalAsUtcMs(): number {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }
  ```
  In `ptdDays`, use `todayLocalAsUtcMs()` instead of `todayUtcMs()`. Reword its doc comment and the file header: "PTD
  counts in the device's local calendar day (log dates are local days); progress counts in UTC days (server)".
- **iOS, step 27.** Do NOT replace `programTotalDays`: keep the existing `Calendar.current` version (lines 92–97 at
  HEAD). Only replace `memberProgressPercent` with:
  ```swift
      /// D2: active days ÷ the program's days so far (device-local calendar, inclusive), clamped 0–100 — web + Android same.
      private func memberProgressPercent(activeDays: Int) -> Int {
          let pct = Double(activeDays) / Double(programTotalDays)
          return min(max(Int(round(pct * 100)), 0), 100)
      }
  ```
  Keep the line-183 `min(m.active_days, programTotalDays)` change from step 27.
- **Android, step 38.** Drop the `import java.time.ZoneOffset` bullet and the line-611 `LocalDate.now(ZoneOffset.UTC)`
  bullet. `LocalDate.now()` stays. The line-606 comment becomes `// ---- PTD (D2, Members page SPEC): days so far =
  start → min(end, today) inclusive, min 1, in the device's local calendar day (log dates are local days); 0 when a
  date is missing ----`. Keep the line-295 clamp and the line-369 diet change.
- **Verification, cross-surface check 4.** It becomes: "b = Program-tab days elapsed + 1, except 17:00–24:00 Pacific
  (UTC date ahead), when b = elapsed."

### B2 (BLOCKING): Android step 32 line range
Replace `ProgramSections.kt` lines **88–115** (not 88–116). Line 116 closes the outer `Column` and must stay.

### A3: stale anchors (match by text)
- Step 9: `stepsLabel` ends at `format.ts:51`.
- Step 31: the comment is at `ProgramCards.kt:221`.

### A4: use the `/programs` row only while its dates are the open program's
After a date edit (until the refetch lands), the row still carries the old dates' day counts.
- **Web, step 6.** Add to `program-days.ts`:
  ```ts
  type Dated = { start_date?: string | null; end_date?: string | null };
  /** A4: the /programs row only while its dates are the open program's — after a date edit the cached row still holds
   *  the old dates' day counts until the refetch lands; null → the same-rule fallback on the program's own dates. */
  export function rowForDates<T extends Dated>(row: T | null, program?: Dated | null): T | null {
    if (!row || !program) return row;
    const day = (value?: string | null) => (value ?? "").slice(0, 10);
    return day(row.start_date) === day(program.start_date) && day(row.end_date) === day(program.end_date) ? row : null;
  }
  ```
  In steps 12(f) and 13(b), `programProgress(programRow ?? program)` becomes
  `programProgress(rowForDates(programRow, program) ?? program)`. Add `rowForDates` to both `@/lib/program-days` imports.
- **iOS, step 22.** In `serverProgress`, require the row's dates to match. Add to the `ProgramContext` class body (next
  to the progress vars):
  ```swift
      /// A4: `yyyy-MM-dd` of startDate / endDate — the same format `apply(program:)` parses them from.
      private static let dayFormatter: DateFormatter = {
          let formatter = DateFormatter()
          formatter.dateFormat = "yyyy-MM-dd"
          return formatter
      }()
  ```
  Then extend the guard in `serverProgress` with:
  ```swift
                row.start_date.map({ String($0.prefix(10)) }) == Self.dayFormatter.string(from: startDate),
                row.end_date.map({ String($0.prefix(10)) }) == Self.dayFormatter.string(from: endDate),
  ```
  (place it before `let total = row.total_days`). Android's nulling of the day fields on edit (step 39) stays as a
  second safeguard.

### A5: note only
The launch-cache seed (web) and `.cacheOnly` (iOS) can show a days-old row for a moment on open, until the network row
lands. The picker bar already behaves this way. Say so in programs D-C6.

### A6: fallback rounding = the server's (multiply first)
- Web step 6, fallback: `percent: Math.round((elapsedDays * 100) / totalDays)`.
- iOS step 22, fallback: `return Int((Double(elapsedDays * 100) / Double(totalDays)).rounded())`.
- Android step 31, fallback: `val percent = if (total > 0) Math.round(elapsed * 100.0 / total).toInt() else 0`.

### A7: iOS Program-tab "Members" stays fresh
In step 23 (`loadSummary`), right after the `if let programRows { switch read { … } }` block, add:
```swift
        if let row = programs.first(where: { $0.id == pid }), let count = row.active_members {
            activeMembers = count   // the Program-tab "Members" row (D3) follows the re-read row, as on web + Android
        }
```

### A8: iOS step 24 does not delay the save
Replace step 24's inserted block with a fire-and-forget re-read:
```swift

        // D1 (programs SPEC §9 D-C6): the Summary ring + Program tab read the /programs row — re-read the list in the
        // background so the save returns at once (Android parity); a failure keeps the date-guarded fallback (A4).
        Task { @MainActor [weak self] in
            if let updatedPrograms = try? await APIClient.shared.fetchPrograms(token: token) {
                self?.programs = updatedPrograms
            }
        }
```

### A9b: landing mock (web fence + `apps/web/src/components/landing/screens.tsx`)
Lines 41–42: `members="22 active / 22 members"` → `members="22 members"`, and `members="30 active / 30 members"` →
`members="30 members"` (D3: the marketing mock mirrors the app).

### A10 + docs the orchestrator adds (on top of plan "Docs for the orchestrator")
- `specs/features/analytics-v2/SPEC.md:80,163,198`: clients no longer use `/analytics/summary` (older iOS builds still
  call it).
- `specs/pages/web/summary/bulk-log-workout/SPEC.md:56`: the default date is the local day (A9).
- Web summary SPEC D-C1 (the `summary?: AnalyticsSummary` prop): superseded by D1.
- iOS admin-members SPEC: a program with no dates keeps iOS's placeholder dates (X-3, out of scope); web and Android
  read 0 days.
- Members page SPECs (all three apps): the PTD rule (B1).
- Landing SPEC: the mock's card line (A9b).
