# PLAN: Server-side metric fixes. D4: MTD change badges compare against the same days of last month. D5: the current streak resets to 0, judged on the member's own local day

**Brief accepted**: yes (6 briefed files; 5 edited. `apps/backend/services/analyticsService.js` needs no edit because its four consumers call the helper unchanged). Read-only imports of existing exports from `services/notificationPreferenceService.js` (`getTimeZones`) and `utils/memberVisibility.js` (`canonicalId`); both files stay untouched. No migration: the member time zone already exists in `notification_preferences.time_zone` (sql/011). It is written from each Phase 4 client's `X-Time-Zone` header and read by the scheduler through `listOptedIn` / `getTimeZones`.

**Feature/version prediction**: analytics v0.6.1 → v0.7.0 · analytics-v2 v0.3.1 → v0.4.0 · member-analytics v0.8.0 → v0.9.0 · people v0.1.1 → v0.2.0 · notifications v0.7.0 → v0.8.0. All MINOR: the behavior of owned endpoints changes, member-analytics gains a `depends_on` edge, and notifications gains an export. Response shapes are unchanged.

**Surfaces in scope**: [backend] only. Every client renders these values verbatim and none computes a streak itself (grep confirmed), so web, iOS and Android need no change (R9: one source).

## Decisions taken (no open choices left)
- **D4, "today" basis = UTC.**
  - These 4 endpoints are program-wide: one number for every viewer. A per-viewer zone would give two admins different badges for the same program, which breaks R9.
  - The backend's analytics date rule is already explicit UTC (analytics D-C3/D-C4, `resolveTimelineWindow`, program progress).
  - These routes have no member zone and the program has none either.
  - Windows:
    - current = this whole UTC month, 1st → last day, inclusive. A log made on an east-of-UTC member's local today still counts, and the 1st of next month no longer leaks in.
    - previous = last month's 1st → today's UTC day-of-month, capped at last month's length.
  - `percentChange` is unchanged. It still works with the new windows; it only gets noisier on the 1st–2nd of a month (see Risks).
- **D5, one rule.**
  - `memberActivityStats.currentStreak(days, today)` (today if logged, else yesterday, else 0) becomes the only current-streak rule.
  - `computeStreaks` stays in `memberAnalyticsService.js`, which keeps people's existing import and avoids registry edge churn. It becomes a thin wrapper: it de-dupes, ignores dates after `today`, computes longest with the same algorithm (fuzz-checked: 0 mismatches against the old one on 20,000 random sets), and takes `current` from `currentStreak`.
  - "today" = the target member's local date from `notification_preferences.time_zone`, else UTC, via a new `utils/localTime.localDateOrUtc`.
  - All three app call sites use the same data: one program's logs from the program start up to the member's local today. So `/member-metrics` (no custom range), `/member-streaks` and the People profile return the same number. The web Members page shows two of these side by side.
- **getMemberMetrics with an explicit `endDate`.**
  - Each member's streak is counted "as of" `min(endDate, member local today)`.
  - The log read goes up to the latest such day (at most UTC today + 1), so it can include a log on an east-of-UTC member's local today. Such logs feed only that member's streak; every other metric still stops at `rangeEnd`, so other numbers are unchanged.
  - One extra query per request (`getTimeZones(memberIds)`), not N+1.
- **Remaining legitimate difference from notifications** (notifications F14, narrowed):
  - Data set: reminders and the digest count workouts across all programs; the app's cards count one program.
  - Zone fallback: announcements fall back to the sender's zone; the app falls back to UTC.

## Steps — backend
Line numbers refer to HEAD `ffbc38b` before any edit. Edit each file bottom-up, or match on the quoted "before" text.

1. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/queryHelpers.js:20-37`: replace the whole `buildMTDDateRanges` function.
   Before: `const buildMTDDateRanges = () => { const today = new Date(); … };` (lines 20-37).
   After:
   ```js
   // Analytics D-C12 — month-to-date vs the SAME days of last month, on the UTC calendar (the backend's analytics date
   // rule; these totals are program-wide — one value for every viewer). current = this whole UTC month, 1st → last day:
   // every log dated this month counts, incl. one an east-of-UTC member logged on their local today. previous = last
   // month's 1st → today's UTC day-of-month, capped at last month's length (Mar 31 → Feb 1–28). Both ends inclusive
   // (the callers use [Op.between]).
   const buildMTDDateRanges = (now = new Date()) => {
       const year = now.getUTCFullYear();
       const month = now.getUTCMonth();
       const isoDay = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
       const prevMonthLength = new Date(Date.UTC(year, month, 0)).getUTCDate();

       return {
           current: { start: isoDay(year, month, 1), end: isoDay(year, month + 1, 0) },
           previous: {
               start: isoDay(year, month - 1, 1),
               end: isoDay(year, month - 1, Math.min(now.getUTCDate(), prevMonthLength))
           }
       };
   };
   ```
   `percentChange` (lines 13-18) and the exports stay as they are.

2. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/utils/localTime.js`
   a. After line 58 (the closing `};` of `addDaysToDate`), insert:
   ```js

   /** The calendar date ("YYYY-MM-DD") in `timeZone` at `now`; the UTC date when the zone is missing or Intl rejects it.
    *  The member-day rule for the app's streaks (member-analytics D-C14): a member's stored zone, else UTC. */
   const localDateOrUtc = (timeZone, now = new Date()) => localParts(timeZone, now)?.date || now.toISOString().slice(0, 10);
   ```
   b. Line 79. Before: `module.exports = { localParts, toMinutes, isValidDate, addDaysToDate, isoWeekKey, dayLabel };`
      After:
   ```js
   module.exports = { localParts, toMinutes, isValidDate, addDaysToDate, localDateOrUtc, isoWeekKey, dayLabel };
   ```

3. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberActivityStats.js:1-5`: replace the header comment only. There is no code change; the 2026-10-14 header called the app streak "a known gap" and that is no longer true.
   ```js
   // The member's OWN workout activity for notification content — notifications SPEC §3.6 (the scheduler rule) — and the
   // ONE current-streak rule (currentStreak): consecutive days with ≥ 1 workout, ending today if today has one, else
   // yesterday; 0 otherwise, where "today" is the member's local day. The app's streak cards use this same rule
   // (memberAnalyticsService.computeStreaks → currentStreak, member-analytics D-C14) over ONE program's log dates; the
   // snapshots here count workouts across ALL programs (workout_logs) — auto-synced sleep / steps never count, so a day
   // with only synced steps still gets its reminder. That data set is the one deliberate difference (notifications F14).
   // Each query function is ONE query for many members.
   ```

4. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/memberAnalyticsService.js`
   a. Lines 1-5 (imports). After:
   ```js
   const { Op } = require("sequelize");
   const { WorkoutLog, Member, Program, ProgramMembership, ProgramWorkout, DailyHealthLog } = require("../models");
   const { AppError } = require("../utils/response");
   const { resolveTimelineWindow, buildBuckets, bucketKey } = require("./analyticsService");
   const { loadViewer, hasProgramAccess, canView, canonicalId, redactMetricsRow, ACTIVITY_HIDDEN_MESSAGE } = require("../utils/memberVisibility");
   const { currentStreak } = require("./memberActivityStats");
   const { getTimeZones } = require("./notificationPreferenceService");
   const { addDaysToDate, isValidDate, localDateOrUtc } = require("../utils/localTime");
   ```
   b. Lines 27-47: replace the whole old `computeStreaks` (the version whose current-run loop treats `diff === 0` as +1) with:
   ```js
   // member-analytics D-C14 — the app's streak cards (member-metrics, member-streaks, People profiles). `dateStrings` =
   // one program's "YYYY-MM-DD" log dates; `today` = the member's local day (utils/localTime localDateOrUtc: their stored
   // zone, else UTC). current = memberActivityStats.currentStreak — the ONE rule the notifications use too: consecutive
   // days ending today if logged, else yesterday; 0 otherwise. longest = the longest run of consecutive days. Duplicate
   // dates count once; dates after `today` are ignored (they never extend or break a run).
   const computeStreaks = (dateStrings, today = new Date().toISOString().slice(0, 10)) => {
       const days = new Set(dateStrings.filter((day) => day <= today));
       if (days.size === 0) return { current: 0, longest: 0 };
       const sorted = [...days].sort();
       let longest = 1;
       let run = 1;
       for (let i = 1; i < sorted.length; i += 1) {
           run = sorted[i] === addDaysToDate(sorted[i - 1], 1) ? run + 1 : 1;
           if (run > longest) longest = run;
       }
       return { current: currentStreak(days, today), longest };
   };
   ```
   c. `getMemberMetrics`, lines 100-112. Before: `const memberIds = memberships.map(m => m.member_id);` followed by the `const logs = await WorkoutLog.findAll({ … })` block. After:
   ```js
       const memberIds = memberships.map(m => m.member_id);

       // D-C14 — each member's streak is counted up to their own day: their local today (stored zone, else UTC), or the
       // requested endDate when that is earlier. The log read reaches the latest such day, so a workout an east-of-UTC
       // member logged on their local today counts toward their streak; every other metric still stops at rangeEnd.
       const rangeEndDay = rangeEnd.toISOString().slice(0, 10);
       const endDay = isValidDate(endDate) ? endDate : null;
       const zones = await getTimeZones(memberIds);
       const streakDays = new Map(memberIds.map((id) => {
           const localToday = localDateOrUtc(zones.get(id), today);
           return [id, endDay && endDay < localToday ? endDay : localToday];
       }));
       const logsEndDay = [...streakDays.values()].reduce((max, day) => (day > max ? day : max), rangeEndDay);

       const logs = await WorkoutLog.findAll({
           where: {
               program_id: programId,
               member_id: { [Op.in]: memberIds },
               ...(rangeStart && rangeEnd ? {
                   log_date: { [Op.between]: [rangeStart.toISOString().slice(0, 10), logsEndDay] }
               } : {})
           },
           attributes: ["member_id", "log_date", "duration", "program_workout_id"],
           include: [{ model: ProgramWorkout, attributes: ["workout_name"] }]
       });
   ```
   The `healthLogs` query (lines 114-123) stays as is and still ends at `rangeEnd`.
   d. Line 142. Before: `    const perMemberDates = new Map();`. After:
   ```js
       const perMemberDates = new Map();
       const perMemberStreakDates = new Map(); // D-C14: every fetched log date (may run one day past rangeEnd)
   ```
   e. Lines 152-157, top of the `for (const log of logs)` loop. Before:
   ```js
       for (const log of logs) {
           const entry = metricsMap.get(log.member_id);
           if (!entry) continue;
           entry.workouts += 1;
   ```
   After:
   ```js
       for (const log of logs) {
           const entry = metricsMap.get(log.member_id);
           if (!entry) continue;
           if (!perMemberStreakDates.has(log.member_id)) perMemberStreakDates.set(log.member_id, new Set());
           perMemberStreakDates.get(log.member_id).add(log.log_date);
           if (rangeStart && log.log_date > rangeEndDay) continue; // D-C14: past rangeEnd → the streak only
           entry.workouts += 1;
   ```
   The rest of the loop is unchanged.
   f. Lines 203-207. Before:
   ```js
           if (dateSet) {
               const { current, longest } = computeStreaks(Array.from(dateSet));
               entry.current_streak = current;
               entry.longest_streak = longest;
           }
   ```
   After:
   ```js
           const streakDates = perMemberStreakDates.get(mid);
           if (streakDates) {
               const { current, longest } = computeStreaks(Array.from(streakDates), streakDays.get(mid));
               entry.current_streak = current;
               entry.longest_streak = longest;
           }
   ```
   g. `getMemberStreaks`, lines 329-350. Replace from `async function getMemberStreaks(` through `const { current, longest } = computeStreaks(dates);` with:
   ```js
   async function getMemberStreaks({ programId, memberId }, user) {
       await assertMemberAccess(programId, memberId, user);

       const memberKey = canonicalId(memberId);
       const [program, zones] = await Promise.all([
           Program.findOne({ where: { id: programId, is_deleted: false } }),
           getTimeZones(memberKey ? [memberKey] : [])
       ]);
       if (!program) throw new AppError(404, "Program not found.");

       // D-C4 — guard a null start_date (mirrors getMemberMetrics' guard); fall back to the epoch lower
       // bound so the [Op.between] stays valid and the streak window spans all of the member's logs.
       const start = program.start_date ? new Date(`${program.start_date}T00:00:00Z`) : new Date("1970-01-01T00:00:00Z");
       // D-C14 — the window and the streak end on the member's own local today (their stored zone, else UTC).
       const today = localDateOrUtc(zones.get(memberKey));

       const logs = await WorkoutLog.findAll({
           where: {
               program_id: programId,
               member_id: memberId,
               log_date: { [Op.between]: [start.toISOString().slice(0, 10), today] }
           },
           attributes: ["log_date"]
       });

       const { current, longest } = computeStreaks(logs.map((l) => l.log_date), today);
   ```
   The `return { currentStreakDays, longestStreakDays, milestones }` block (lines 352-356) and `module.exports` (which still includes `computeStreaks`) stay unchanged.

5. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/peopleService.js`
   a. After line 10 (`const { getKudosSummary, isActiveGiver } = require("./kudosService");`), insert:
   ```js
   const { getTimeZones } = require("./notificationPreferenceService");
   const { localDateOrUtc } = require("../utils/localTime");
   ```
   b. Lines 90-103 (the comment plus `buildStats`). Replace with:
   ```js
   // member-analytics D-C14 — the same streak data + rule as GET /api/member-streaks: this program's log dates from the
   // program start, counted up to the member's own local today (`memberToday` — their stored zone, else UTC), ending
   // today or yesterday, else 0. Active days this month = distinct log dates in the current UTC month.
   const buildStats = (dates, programStart, memberToday) => {
       const start = programStart || "1970-01-01";
       const { current, longest } = computeStreaks(dates.filter((d) => d >= start), memberToday);
       const month = todayUtc().slice(0, 7);
       return {
           current_streak: current,
           longest_streak: longest,
           active_days_this_month: dates.filter((d) => d.startsWith(month)).length,
           last_active: dates.length ? dates.reduce((max, d) => (d > max ? d : max)) : null
       };
   };
   ```
   c. Lines 130 and 144-147.
      - Line 130: change `const [dateRows, recentRows, kudos, canGive] = await Promise.all([` to `const [dateRows, recentRows, kudos, canGive, zones] = await Promise.all([`.
      - Line 145: change `base.is_you ? false : isActiveGiver(viewer, programId)` to `base.is_you ? false : isActiveGiver(viewer, programId),` and add a new line under it: `getTimeZones([base.member_id])`.
      - Line 147: replace `profile.stats = buildStats(...)` with:
   ```js
       profile.stats = buildStats(
           dateRows.map((row) => toDateString(row.log_date)).filter(Boolean),
           program.start_date,
           localDateOrUtc(zones.get(base.member_id))
       );
   ```

6. `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend/services/analyticsService.js`: no edit. Confirm with a grep that all 4 call sites still read `buildMTDDateRanges()` with no argument.

## Docs for the orchestrator (git-version, after the code passes review)
7. `specs/features/analytics/SPEC.md` (0.6.1 → 0.7.0)
   - Header: version on line 3; line 14 goes from "(8" to "(9" and appends **D-C12**.
   - §4 lines 109-111: describe the new windows.
   - §9: new row **D-C12** "MTD change badges compare like-for-like (deliberate; parity-sweep D4)". Content: the windows above, why UTC, the removed next-month-1st leak, `percentChange` unchanged, the 3 v1 routes plus analytics-v2 `/participation/mtd`, the clients' `vs prior MTD` copy is now literally true, and the swings on the 1st–2nd of a month. Add D-C12 to D-S1 (line 236).
   - §10 F4 (line 245): mark the `buildMTDDateRanges` half superseded by D-C12 (explicit UTC). `getPeriodRange` stays as it is.
   - §11: 0.7.0 row.
8. `specs/features/analytics-v2/SPEC.md` (0.3.1 → 0.4.0): §4 `getParticipationMTDV2` (lines 95-99) gets a pointer to analytics D-C12. New §9 **D-C7** (participation `change_pct` = this month vs the same days of last month; `participation_pct` / `active_members` lose only the next-month-1st leak). §11 row.
9. `specs/features/member-analytics/SPEC.md` (0.8.0 → 0.9.0)
   - Header deliberate-changes list (around line 21): add **D-C14**.
   - §4: lines 87-98 get the streak "as of" rule and the streak-only extension of the log read; lines 103-106 the window ends on the member's local today; lines 116-117 the `computeStreaks(dateStrings, today)` wrapper over `currentStreak`.
   - §9: new **D-C14** row, "current streak resets (deliberate; parity-sweep D5)". Content: the rule, today = the member's stored zone (`notification_preferences.time_zone`) else UTC, the `endDate` "as of" rule, de-dupe, dates after today ignored, longest algorithm unchanged, the one extra `getTimeZones` query, and the fact that member-metrics / member-streaks / People return the same number. Add D-C14 to D-S1 (line 228).
   - §10 F2 (line 265): **RESOLVED by D-C14**.
   - §11: 0.9.0 row.
   - `registry.json`: `member-analytics.depends_on` += `notifications`. This is an import edge, so it needs the blast-radius acknowledgement.
10. `specs/features/people/SPEC.md` (0.1.1 → 0.2.0)
    - §3 line 94: "streaks use the same window and rule as GET /api/member-streaks — ending on the member's local today or yesterday, else 0 (member-analytics D-C14)".
    - §4.2 line 176: "program start → the member's local today".
    - §9 D-C10 (line 307): supersede the "any streak semantic change (F1)" clause in place, "superseded at 0.2.0 by D-C15".
    - New **D-C15** pointing to member-analytics D-C14.
    - §10 F1 (line 317): RESOLVED.
    - §11: row.
11. `specs/features/notifications/SPEC.md` (0.7.0 → 0.8.0)
    - §3.6 lines 398-399: "the same rule as the app's streak cards (member-analytics D-C14); only the data set differs (F14)".
    - §10 F14 (line 755): narrowed to the data-set difference and the zone-fallback difference.
    - New **D-C33**: `localDateOrUtc` added to `utils/localTime.js`, and `currentStreak` is now the app's rule too. No change to notification behavior.
    - §11: row.
12. Page SPECs (PATCH, no tag, plus `specs/pages/REGISTRY.md` cells):
    - `specs/pages/web/members/person/SPEC.md` F1 (line 78) → resolved, 0.1.0 → 0.1.1.
    - `specs/pages/ios/people/SPEC.md` F2 (line 80) → resolved, 0.1.0 → 0.1.1.
    - The summary and streaks page SPECs say nothing false and stay untouched.
13. `registry.json` and `REGISTRY.md`: version cells for the 5 features. Tags: `feature/analytics@v0.7.0`, `feature/analytics-v2@v0.4.0`, `feature/member-analytics@v0.9.0`, `feature/people@v0.2.0`, `feature/notifications@v0.8.0` (push by name).

## Endgame
14. Compile and boot check (backend). No DB connection: a dummy URL is used.
    ```bash
    cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend && \
    for f in utils/queryHelpers.js utils/localTime.js services/memberActivityStats.js services/memberAnalyticsService.js services/peopleService.js; do node --check "$f" || exit 1; done && \
    DATABASE_URL=postgres://u:p@127.0.0.1:5432/db SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=x SUPABASE_ANON_KEY=x node -e "
    for (const f of ['./routes/analytics','./routes/memberAnalytics','./routes/people','./services/dailyReminderJob','./services/weeklyDigestJob','./services/announcementDelivery']) require(f);
    if (typeof require('./utils/localTime').localDateOrUtc !== 'function') throw new Error('localDateOrUtc missing');
    if (typeof require('./services/memberAnalyticsService').computeStreaks !== 'function') throw new Error('computeStreaks missing');
    console.log('boot check OK');"
    ```
    Then the scratch logic check. Write it to `/private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/7654d7b2-3b8b-433d-9d3b-cd2326a54929/scratchpad/d4d5-check.js`, run it with `node d4d5-check.js` from the scratchpad directory, and never commit it. The expected values were verified against a prototype of this exact code.
    ```js
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://u:p@127.0.0.1:5432/db";
    const assert = require("node:assert/strict");
    const B = "/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/backend";
    const { buildMTDDateRanges } = require(`${B}/utils/queryHelpers`);
    const { computeStreaks } = require(`${B}/services/memberAnalyticsService`);
    const { currentStreak } = require(`${B}/services/memberActivityStats`);
    const { localDateOrUtc } = require(`${B}/utils/localTime`);
    require(`${B}/services/peopleService`);
    const mtd = (iso) => buildMTDDateRanges(new Date(iso));
    assert.deepEqual(mtd("2026-03-31T12:00:00Z"), { current: { start: "2026-03-01", end: "2026-03-31" }, previous: { start: "2026-02-01", end: "2026-02-28" } });
    assert.deepEqual(mtd("2026-10-01T00:30:00Z"), { current: { start: "2026-10-01", end: "2026-10-31" }, previous: { start: "2026-09-01", end: "2026-09-01" } });
    assert.deepEqual(mtd("2026-10-14T19:00:00Z"), { current: { start: "2026-10-01", end: "2026-10-31" }, previous: { start: "2026-09-01", end: "2026-09-14" } });
    assert.deepEqual(mtd("2026-01-15T08:00:00Z"), { current: { start: "2026-01-01", end: "2026-01-31" }, previous: { start: "2025-12-01", end: "2025-12-15" } });
    assert.deepEqual(mtd("2028-03-30T10:00:00Z"), { current: { start: "2028-03-01", end: "2028-03-31" }, previous: { start: "2028-02-01", end: "2028-02-29" } });
    const T = "2026-10-14";
    assert.deepEqual(computeStreaks(["2026-10-12", "2026-10-13", "2026-10-14"], T), { current: 3, longest: 3 });            // logged today
    assert.deepEqual(computeStreaks(["2026-10-11", "2026-10-12", "2026-10-13"], T), { current: 3, longest: 3 });            // yesterday only
    assert.deepEqual(computeStreaks(["2026-10-10", "2026-10-11", "2026-10-12"], T), { current: 0, longest: 3 });            // 2-day gap → 0
    assert.deepEqual(computeStreaks(["2026-10-13", "2026-10-13", "2026-10-14", "2026-10-14", "2026-10-14"], T), { current: 2, longest: 2 }); // duplicates
    assert.deepEqual(computeStreaks(["2026-10-13", "2026-10-14", "2026-10-15"], T), { current: 2, longest: 2 });            // future-dated, UTC fallback: ignored
    assert.deepEqual(computeStreaks(["2026-10-13", "2026-10-14", "2026-10-15"], "2026-10-15"), { current: 3, longest: 3 }); // India member's local today
    assert.deepEqual(computeStreaks(["2026-10-12", "2026-10-13", "2026-10-15"], "2026-10-15"), { current: 1, longest: 2 }); // skipped local yesterday
    assert.deepEqual(computeStreaks([], T), { current: 0, longest: 0 });
    assert.equal(currentStreak(new Set(["2026-10-13"]), T), 1); // notification rule unchanged
    const now = new Date("2026-10-15T01:00:00Z"); // 18:00 PDT Oct 14 · 06:30 IST Oct 15
    assert.equal(localDateOrUtc("America/Vancouver", now), "2026-10-14");
    assert.equal(localDateOrUtc("Asia/Kolkata", now), "2026-10-15");
    assert.equal(localDateOrUtc(null, now), "2026-10-15");
    assert.equal(localDateOrUtc("Not/AZone", now), "2026-10-15");
    console.log("D4 + D5 checks passed");
    ```
    Read-only verification through the `supabase-rasifiters` MCP `execute_sql` (SELECT only).
    First, pick a program:
    ```sql
    SELECT p.id, p.name, count(*) AS logs_this_month
    FROM programs p JOIN workout_logs wl ON wl.program_id = p.id
    WHERE p.is_deleted = false AND wl.log_date >= date_trunc('month', now() AT TIME ZONE 'UTC')::date
    GROUP BY p.id, p.name ORDER BY logs_this_month DESC LIMIT 5;
    ```
    D4, old vs new badge inputs. Substitute `<PROGRAM_ID>`. avg = round(minutes / workouts); participation compares `cur_active` with `prev_active`.
    ```sql
    WITH b AS (
      SELECT '<PROGRAM_ID>'::uuid AS program_id, (now() AT TIME ZONE 'UTC')::date AS today,
             date_trunc('month', now() AT TIME ZONE 'UTC')::date AS cur_start
    ), w AS (
      SELECT 'old' AS rule, program_id, cur_start, (cur_start + interval '1 month')::date AS cur_end,
             (cur_start - interval '1 month')::date AS prev_start, cur_start - 1 AS prev_end FROM b
      UNION ALL
      SELECT 'new', program_id, cur_start, (cur_start + interval '1 month')::date - 1,
             (cur_start - interval '1 month')::date,
             LEAST((cur_start - interval '1 month')::date + (EXTRACT(day FROM today)::int - 1), cur_start - 1) FROM b
    ), t AS (
      SELECT w.rule, w.cur_start, w.cur_end, w.prev_start, w.prev_end,
             count(*) FILTER (WHERE wl.log_date BETWEEN w.cur_start AND w.cur_end) AS cur_workouts,
             count(*) FILTER (WHERE wl.log_date BETWEEN w.prev_start AND w.prev_end) AS prev_workouts,
             COALESCE(sum(wl.duration) FILTER (WHERE wl.log_date BETWEEN w.cur_start AND w.cur_end), 0) AS cur_minutes,
             COALESCE(sum(wl.duration) FILTER (WHERE wl.log_date BETWEEN w.prev_start AND w.prev_end), 0) AS prev_minutes,
             count(DISTINCT wl.member_id) FILTER (WHERE wl.log_date BETWEEN w.cur_start AND w.cur_end) AS cur_active,
             count(DISTINCT wl.member_id) FILTER (WHERE wl.log_date BETWEEN w.prev_start AND w.prev_end) AS prev_active
      FROM w
      JOIN workout_logs wl ON wl.program_id = w.program_id
      JOIN program_memberships pm ON pm.program_id = wl.program_id AND pm.member_id = wl.member_id AND pm.status = 'active'
      GROUP BY w.rule, w.cur_start, w.cur_end, w.prev_start, w.prev_end
    )
    SELECT rule, cur_start, cur_end, prev_start, prev_end, cur_workouts, prev_workouts,
           CASE WHEN prev_workouts = 0 THEN (CASE WHEN cur_workouts > 0 THEN 100 ELSE 0 END)
                ELSE round(100.0 * (cur_workouts - prev_workouts) / prev_workouts, 1) END AS workouts_change_pct,
           cur_minutes, prev_minutes,
           CASE WHEN prev_minutes = 0 THEN (CASE WHEN cur_minutes > 0 THEN 100 ELSE 0 END)
                ELSE round(100.0 * (cur_minutes - prev_minutes) / prev_minutes, 1) END AS minutes_change_pct,
           cur_active, prev_active
    FROM t ORDER BY rule DESC;
    ```
    D5, old vs new streak per active member, plus zone coverage:
    ```sql
    WITH m AS (
      SELECT pm.member_id, np.time_zone,
             (now() AT TIME ZONE 'UTC')::date AS utc_today,
             (now() AT TIME ZONE COALESCE(np.time_zone, 'UTC'))::date AS local_today,
             COALESCE(p.start_date, DATE '1970-01-01') AS start_date
      FROM program_memberships pm JOIN programs p ON p.id = pm.program_id
      LEFT JOIN notification_preferences np ON np.member_id = pm.member_id
      WHERE pm.program_id = '<PROGRAM_ID>' AND pm.status = 'active'
    ), d AS (
      SELECT DISTINCT r.rule, wl.member_id, wl.log_date
      FROM m JOIN workout_logs wl ON wl.member_id = m.member_id AND wl.program_id = '<PROGRAM_ID>'
      CROSS JOIN LATERAL (VALUES ('old', m.utc_today), ('new', m.local_today)) AS r(rule, cap)
      WHERE wl.log_date BETWEEN m.start_date AND r.cap
    ), i AS (
      SELECT rule, member_id, max(log_date) AS run_end, count(*) AS len
      FROM (SELECT rule, member_id, log_date,
                   log_date - (row_number() OVER (PARTITION BY rule, member_id ORDER BY log_date))::int AS grp FROM d) x
      GROUP BY rule, member_id, grp
    )
    SELECT m.member_id, m.time_zone, m.local_today,
      COALESCE((SELECT len FROM i WHERE i.rule = 'old' AND i.member_id = m.member_id ORDER BY run_end DESC LIMIT 1), 0) AS old_current,
      COALESCE((SELECT len FROM i WHERE i.rule = 'new' AND i.member_id = m.member_id AND i.run_end >= m.local_today - 1 ORDER BY run_end DESC LIMIT 1), 0) AS new_current,
      COALESCE((SELECT max(len) FROM i WHERE i.rule = 'old' AND i.member_id = m.member_id), 0) AS old_longest,
      COALESCE((SELECT max(len) FROM i WHERE i.rule = 'new' AND i.member_id = m.member_id), 0) AS new_longest
    FROM m ORDER BY old_current DESC;
    ```
    After deploy (Render auto-deploys on push), the USER verifies on prod. Staging is not needed: there is no migration and no auth/session change.
    - Summary MTD badges on the web apex domain, iOS and Android all show the same value and match the `new` row.
    - In the Members list, the current streak equals the streak card for the same member and the People profile streak.
    - A lapsed member shows 0.
    - No client build is needed. iOS (62) is not affected by this change.
15. Migration: none. `notification_preferences.time_zone` already exists (sql/011).
16. git-version: backend commit `fix(analytics,member-analytics): like-for-like MTD badges + streaks that reset` (code + docs in one commit), then bumps:
    - analytics 0.7.0, analytics-v2 0.4.0, member-analytics 0.9.0 and people 0.2.0: MINOR, because the behavior of owned endpoints changes with the same shapes.
    - notifications 0.8.0: MINOR, because the owned interface gains `localDateOrUtc` and becomes the shared streak rule. Notification behavior does not change.
    - The member-analytics `depends_on` += notifications needs the blast-radius acknowledgement.
    - No bump for programs. `programService.js` is untouched and belongs to the parallel task; if that task bumps a shared feature first, take consecutive versions in landing order.

## Risks the implementer must watch
- **Prod numbers move on deploy (intended).**
  - D4: the previous window shrinks from Sep 1–30 to Sep 1–14/15. The workouts and duration badges jump from typically about −50% to around 0 ± real change. Participation `change_pct` rises (fewer distinct members over a shorter window). Avg duration changes little. `total_workouts`, `total_minutes`, `avg_minutes` and `participation_pct` lose only logs dated the 1st of next month.
  - D5: every member whose last log in the program is 2 or more local days old drops to 0 on Members (list and card), the streak detail and the People profile. Sorting by current streak reorders, and `currentStreakMin` filter results shrink. Milestones and longest are unchanged; the only exception is that dates after the member's local today are now excluded.
- **Badge volatility.** On the 1st–2nd of a month the previous window is 1–2 days, so badges can show `+100.0%` (sticky, previous = 0) or 4-digit values like `1100.0%`. All three clients render `change >= 0` as up/green, 0 as `+0.0%`/▲0.0%, and negatives as down/red, with no client change. Ask the user to eyeball badge width on phones on Nov 1–2 (UI-fit gate). Capping `percentChange` is out of scope.
- **Members with no stored zone fall back to UTC.** That means live iOS binaries before 1.5.2, any member who never hit a notification route, and old Android builds. Such a member west of UTC sees 0 from UTC midnight (about 17:00 PDT) until they log that day. The gap closes as clients send `X-Time-Zone` (web live, Android 1.2.x, iOS 1.5.2+). The D5 SQL's `time_zone IS NULL` count sizes it.
- **The UTC basis for D4 is ±1 day** from a viewer's local MTD for part of each day: Vancouver evenings, India before 05:30 IST. This is accepted in exchange for one value per program (R9).
- **Id keys and casing.**
  - `getTimeZones` keys are lowercase DB ids. getMemberMetrics and People use DB ids.
  - `getMemberStreaks` must look up with `canonicalId(memberId)`. Do not use the raw query param: iOS can send upper case, which would silently fall back to UTC.
- **Keep the `rangeStart &&` guard** in the loop skip (step 4e). Without it, programs with a null `start_date` (no date filter) would stop counting future-dated logs in workouts.
- **Read order in getMemberMetrics.** `getTimeZones` must run before the logs read, because the read's upper bound depends on it. That is one extra query, not one per member. The People profile now reads the target's zone twice (kudos and stats). That is minor, and `kudosService.js` is out of scope.
- **Do not edit `currentStreak`** or the notification jobs. The reminder, digest and announcement `{streak}` values must stay byte-identical.
- **Response shapes are unchanged**: `current_streak`, `longest_streak`, `currentStreakDays`, `longestStreakDays`, `milestones` and `change_pct` keep the same types. Every live binary (iOS 1.4.2/1.5.x, Android 1.0.0–1.2.1, web) still decodes them.
- **Do not touch `apps/backend/services/programService.js`** (owned by the parallel task) or `apps/backend/services/analyticsService.js` (needs no edit).
