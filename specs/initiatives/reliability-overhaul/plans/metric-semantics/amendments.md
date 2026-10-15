# Metric semantics (D4 + D5): amendments (binding on top of `plan.md`)

> Orchestrator, 2026-10-14. `plan.md` is the planner's output, saved byte-exact. Plan-adversary verdict:
> **APPROVE-WITH-FIXES** (0 blocking, 6 advisory, all adopted below).
>
> - **The user asked for:** D4 (MTD change badges compare the same days of last month) and D5 (the current streak resets
>   to 0, judged on the member's own day), as a separate task after the parity sweep.
> - **Scope:** backend only, with response shapes unchanged.
>
> Where this file and `plan.md` disagree, this file wins.

## M1: east-of-UTC streak vs active days (document it; don't clip)
For members east of UTC, between their local midnight and UTC midnight (India 00:00–05:30 IST), a workout logged on
their local today counts toward `current_streak` / `longest_streak`, but not toward `workouts` / `active_days`. Those
still stop at the UTC `rangeEnd`. So the same Members row can briefly show a streak 1 higher than active days.

Keep it that way: clipping the streak back to UTC would break the agreement between `/member-metrics`, `/member-streaks`
and the People profile, which the web Members page shows side by side. Say it in member-analytics **D-C14** and in the
plan's Risks: "until UTC midnight, current/longest may exceed workouts/active_days by 1 for members east of UTC".

## M2: the D4 check query covers all four badges
In step 14's D4 SQL:
- In `t`, add `(SELECT count(*) FROM program_memberships pm2 WHERE pm2.program_id = w.program_id AND pm2.status = 'active') AS total_members`.
- In the final SELECT, add:
  - `round(100.0 * cur_active / NULLIF(total_members, 0), 1) AS cur_pct`
  - `round(100.0 * prev_active / NULLIF(total_members, 0), 1) AS prev_pct`
  - `round(cur_minutes::numeric / NULLIF(cur_workouts, 0)) AS cur_avg`
  - `round(prev_minutes::numeric / NULLIF(prev_workouts, 0)) AS prev_avg`
- Apply the same percent-change rule (previous = 0 → 100 / 0) to pct and avg, as in `analyticsService.js:302-306` and
  `:498-502`.

## M3: docs: §8 dependencies
- `specs/features/member-analytics/SPEC.md` §8 Upstream: add `notifications` (`currentStreak`, `getTimeZones`,
  `localDateOrUtc`).
- `specs/features/notifications/SPEC.md` §8 Downstream: add member-analytics (the streak rule and the zone read) and
  people (stats).

This keeps the registry `depends_on` edge and the SPECs in agreement.

## M4: docs: locate edits by ID, not line
The parity-sweep docs commit lands first and shifts lines in the analytics and member-analytics SPECs. Find each edit
by its ID (D-S1, F2, F4, §8, §11). Take versions in landing order: parity gives analytics 0.6.2 and member-analytics
0.8.1, then this task gives analytics 0.7.0 and member-analytics 0.9.0.

## M5: an impossible `endDate` still bounds the streak
In step 4c, replace `const endDay = isValidDate(endDate) ? endDate : null;` with:
```js
    const endDay = endDate ? (isValidDate(endDate) ? endDate : rangeEndDay) : null;
```
(e.g. `2026-09-31` rolls over in `rangeEnd`; the streak must not then run to local today.)

## M6: verify `getMemberMetrics` old vs new before deploy
Add a stubbed-model comparison to step 14's scratch check. Stub `Program.findOne`, `ProgramMembership.findAll`,
`WorkoutLog.findAll` (honouring `Op.in` / `Op.between`), `DailyHealthLog.findAll` and `NotificationPreference.findAll`,
and use a global-admin user. Compare HEAD's and the new `getMemberMetrics` on every field except
`current_streak` / `longest_streak` across five scenarios:
1. the default range;
2. a Vancouver member near midnight;
3. a program with a null `start_date`;
4. a past `endDate`;
5. a future `endDate`.

All non-streak fields must be identical. The adversary's harness is a starting point:
`/private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/7654d7b2-3b8b-433d-9d3b-cd2326a54929/scratchpad/harness.js`
(scratch only, never committed).

## M7: members with no stored time zone get the most forgiving day window (user-directed, 2026-10-14)
Preview on the live main program: only 3 of 19 members have `notification_preferences.time_zone`. Old iOS builds don't
send `X-Time-Zone`; iOS 1.5.2+, Android 1.2.x and web do, and the inbox route stores it. A plain UTC fallback would
show 0 from 17:00 PDT for most Vancouver members who haven't logged yet that day.

The rule:
- **No zone (or a rejected zone):** judge the streak on the most forgiving window on Earth. `today` = the UTC−12
  date, so a streak is never zeroed early. Logs count up to the UTC+14 date, so a just-logged day is never ignored.
  New `utils/localTime.streakDayWindow(timeZone, now)` → `{ today, latest }`.
  `computeStreaks(dates, today, latest = today)`: current = the run ending at the last day ≤ `latest`, counted only
  when that day ≥ `today − 1`.
- **Known zone:** `{ today: local, latest: local }`. This is exactly `memberActivityStats.currentStreak` (today if logged,
  else yesterday, else 0).

Cost: a missed day can keep a zone-less member's streak alive up to about a day longer. The window closes as members
update to apps that send their zone (this same release). Docs: member-analytics D-C14 states both windows.
