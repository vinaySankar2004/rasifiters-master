# Page: `members/streaks` (web) — per-member streak stats (members sub-route 6 of 8)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/streaks?memberId=&name=` — the **Streak Stats** detail for one member, reached by the
> `/members` landing's "Streak Stats" card. Two metric pills (Current / Longest, in days) over a row of milestone
> badges. **6th** of the eight deferred `/members` sub-routes
> (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`); does **not** close the group.
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/members/streaks/page.tsx` (84 lines).
> **Consumes (features):** [`member-analytics`](../../../../features/member-analytics/SPEC.md)
> (`GET /member-streaks` — `authenticateToken` route + service-level `ensureProgramAccess` + target-enrolled check;
> already mounted) via the already-ported `lib/api/members.ts` `fetchMemberStreaks`;
> [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS surfaces member streaks natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ 1 cleanup** (D-C1 non-color milestone affordance). **No new dependency, zero
> backend work, no feature bump.** Read-only — no write path. Oddities flagged §10.

---

## 1. What it is + who uses it

The **Streak Stats** detail for a single program member — one `GlassCard` showing two `metric-pill` tiles (Current
streak / Longest streak, both in days) over a wrapped row of **milestone badges** (`7d`, `30d`, … — the
program-wide milestone ladder, each marked achieved or not). The target member comes from the URL (`memberId` +
display `name`). Reached by program staff (global_admin / program admin / logger) for any member via the `/members`
landing, or by a plain member for **their own** streaks (a non-staff user who navigates to someone else's `memberId`
is redirected away — see §7).

## 2. Why it exists

The drill-down behind the `/members` landing's per-member Streak Stats card — staff (and a member, for themselves)
see how many consecutive days the member has trained (current + best-ever), and which streak milestones they have
hit.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/streaks` (`apps/web/src/app/members/streaks/page.tsx`). `export const dynamic =
  "force-dynamic"` (faithful — the page reads URL search params).
- **URL params:** `memberId` (the target member, required — drives the query + the redirect gate) and `name` (display
  only, defaults to "Member") via `useClientSearchParams` (`page.tsx:19-21`).
- **Reached from:** the `/members` landing's "Streak Stats" card (`MemberStreakCard`) — rendered inside the view-as /
  logger / member overview blocks, passing `memberId`+`name` (`members/page.tsx:347, 381, 431`).
- **Back:** `PageHeader backHref="/members"`.
- **Leaves to:** nowhere — the only navigation off the page is the back link, or the non-staff redirect to `/members`
  (§7).

## 4. Contents / sections

1. **`PageHeader`** — title "Streak Stats", subtitle = the `name` URL param (the member's display name),
   `backHref="/members"` (`page.tsx:42`).
2. **States** — `LoadingState "Loading streaks..."` / `ErrorState` (the query error message) (`page.tsx:44-46`).
3. **Streaks `GlassCard`** (`padding="lg"`, rendered when `streaksQuery.data`) (`page.tsx:48-81`):
   - **Two `metric-pill` tiles** (`md:grid-cols-2`) — "Current" → `currentStreakDays` days, "Longest" →
     `longestStreakDays` days.
   - **Milestones** — a "Milestones" label over a `flex-wrap` row of `metric-pill` rounded badges, one per
     `milestones[]` entry, labeled `{dayValue}d`. Achieved badges are `text-rf-accent`; unachieved are
     `text-rf-text-muted`.
   - **D-C1 non-color affordance** — achieved badges additionally carry a `✓` prefix + a faint `ring-1
     ring-rf-accent/40`, so achieved-vs-not is not signaled by color alone (see §8, §9).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), `GlassCard`, `LoadingState`,
  `ErrorState` — landed with earlier runs; `useClientSearchParams` (`lib/use-client-search-params.ts`); the
  `metric-pill` CSS class (`globals.css:216`) and the `rf-accent` token (`tailwind.config.ts:18`). **No chart** — this
  page imports no Recharts (unlike its twin `members/history`).
- **New dep:** **none** — `fetchMemberStreaks`/`MemberStreaks` already live in `lib/api/members.ts:131` (ported
  "vestigial-here" with the `/members` landing run 22; byte-identical to legacy). This page is its belated consumer.
  The sweep ports only the page file. (Sized per-function: the fn is in this page's **own** members family — run-41's
  own-family case.)
- **Hooks/api:** `useAuthGuard` (`auth`), `fetchMemberStreaks` (`lib/api/members.ts`) — all already ported.

## 6. Data / API

- **`GET /api/member-streaks?programId=&memberId=`** ← `fetchMemberStreaks(token, programId, memberId)`
  (`members.ts:131-134`). React Query key `["members","streaks",programId, memberId]` (no period — unlike `history`),
  `enabled: !!token && !!programId && !!memberId` (`page.tsx:34-38`). Response:
  `{ currentStreakDays, longestStreakDays, milestones: [{ dayValue, achieved }] }`.
- **Zero backend work, NO feature bump** — `GET /api/member-streaks` already mounted (`server.js:59`,
  `streaksRouter.get("/", authenticateToken)`), and the service `getMemberStreaks` enforces
  `ensureProgramAccess(user.id, user.global_role, programId)` → 403 for non-members (`memberAnalyticsService.js:306`)
  **plus** a target-enrolled check → 404 if the `memberId` is not an active member of the program
  (`memberAnalyticsService.js:309-312`), shipped with
  [`member-analytics`](../../../../features/member-analytics/SPEC.md). The milestone ladder + streak computation
  (`computeStreaks` over distinct `workout_logs.log_date` from the program start) are server-derived
  (`memberAnalyticsService.js:317-336`). The api fn already ported.

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. The page
carries a **client-side per-member redirect**: `canViewAny = isGlobalAdmin || my_role==="admin" || my_role==="logger"`
(`page.tsx:23-24`); a non-`canViewAny` user whose URL `memberId` is **not their own** id is `router.push("/members")`'d
on mount (`page.tsx:27-32`). So staff may view **any** member's streaks; a plain member may view **only their own**.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | The streak stats for **any** `memberId` (`canViewAny`). Entry: the landing's Streak Stats card. |
| **program admin** (`my_role==="admin"`) | Same — any member's streaks. Entry: the landing's Streak Stats card. |
| **logger** (`my_role==="logger"`) | Same — any member's streaks (`canViewAny`). Entry: the landing's overview Streak Stats card. |
| **member** | **Only their own** streaks — viewing another member's `memberId` redirects to `/members` on mount. |

**`admin_only_data_entry`: N/A** — this page **reads** streak stats; it performs **no logging** and no write of any
kind. The lock gates the `/summary` log forms, not this read view (run-31/36/40 read-vs-write-lock axis: the lock
follows whether the page does *logging*).

**Role-gate asymmetry (F2):** the page's client redirect is **stricter** than the backend. `getMemberStreaks` only
checks `ensureProgramAccess` (requester is an active member of the program) + the target is enrolled — it does **not**
restrict which member a non-staff requester may view. So any active member could fetch any enrolled member's streaks
directly via the API; only the client UI enforces "members see only their own." Faithful — the client gate is the UX
layer, the (looser) backend is the real boundary (the run-40 `members/detail` / run-43 `members/history` mirror).

## 8. States & edge cases

- **No `memberId`** — the redirect `useEffect` early-returns (`if (!memberId) return`) and the query is disabled
  (`enabled` requires `memberId`); the page renders header only, no card. Faithful (a degenerate direct-nav case; the
  landing always passes `memberId`).
- **Loading** — `streaksQuery.isLoading` → `LoadingState "Loading streaks..."`.
- **Error** — `streaksQuery.isError` → `ErrorState` with `(error as Error).message` (e.g. a 403/404 from the service).
- **Loaded** — the two metric pills + the milestone badge row. There is **no empty-state branch** (history's D-C1
  all-zero guard has **no analog** here — no chart, and a zero-streak member still renders a meaningful `0 days` +
  all-unachieved milestone row). The milestone list is a fixed server-driven ladder (always non-empty).
- **Non-staff viewing another member** — `router.push("/members")` on mount before any data renders (§7).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Faithful 1:1 port of legacy `members/streaks/page.tsx` (84 lines). `consumed_by = [web]` — iOS surfaces member streaks natively. | `rasifiters-webapp/src/app/members/streaks/page.tsx` |
| **D-SCOPE** | This page only — **6th of the 8 deferred `/members` sub-routes**; does **not** close the group (`workouts`/`health` still deferred). | `COVERAGE.md` `/members` row |
| **D-DEPS** | **No new dependency** — `fetchMemberStreaks`/`MemberStreaks` (`lib/api/members.ts:131`, byte-identical) + every chrome leaf + the `metric-pill` class + the `rf-accent` token already ported; the sweep ports only the page file. Sized per-function: the fn is in this page's own members family (run-41). | `apps/web/src/lib/api/members.ts:131` |
| **D-TWIN** | Confirm-only **simpler-twin of `members/history` (run 43)** — same per-member URL `memberId`/`name` scope + the identical `canViewAny` role-redirect, but **SUBTRACT** the chart machinery (no `PeriodSelector`, no `BarChart`, no Recharts, no `period` in the query key, no chart-theme imports). The decision shape (D-REF/D-SCOPE/D-DEPS/D-S1) transcribes from history; only the content + the D-C cleanup differ (run-43's twin-collapse, the subtract direction). | `apps/web/src/app/members/history/page.tsx` |
| **D-S1** | **Faithful otherwise** — same `force-dynamic` + `useClientSearchParams` (`memberId`/`name`), same `useAuthGuard()` + `canViewAny` redirect, same React Query key `["members","streaks",programId,memberId]` + `enabled` gate, same two-pill + milestone-badge markup, `maxWidth="3xl"`. Already fully `rf-*` tokenized → no tokenize cleanup; no `router.back()` → no nav cleanup (run-40/41); no chart → no empty-state guard (run-43 D-C1 has no analog). | `members/streaks/page.tsx:17-83` |
| **D-C1** | **Non-color milestone affordance** — achieved milestone badges, which legacy distinguished from unachieved by text color **only** (`text-rf-accent` vs `text-rf-text-muted`), additionally carry a `✓` prefix (`aria-hidden`) + a faint `ring-1 ring-rf-accent/40`. The run-33 color-only-distinguished concern, applied to badges. User chose faithful+affordance over pure-faithful. | `members/streaks/page.tsx:69-77` |
| **D-STANCE** | Faithful 1:1 **+ D-C1**. No backend work, no feature bump (route + api fn already shipped). | user, this run |

## 10. Open questions / flagged characteristics (kept as-is)

- **F1 — server-driven streak math, no client computation.** `currentStreakDays`/`longestStreakDays`/`milestones` are
  all computed server-side (`computeStreaks` over distinct `workout_logs.log_date` from the program `start_date`;
  `milestonesList` is the server's fixed ladder). The page renders the response verbatim — no client re-derivation.
  Faithful (the canonical server copy).
- **F2 — role-gate asymmetry (client redirect stricter than backend).** The page redirects a non-staff user away from
  another member's `memberId` (`page.tsx:27-32`), but `getMemberStreaks` only enforces `ensureProgramAccess` +
  target-enrolled — any active member could fetch any enrolled member's streaks via the API directly. Faithful; the
  run-40 `members/detail` / run-43 `members/history` mirror (client stricter than backend). Rebuild-cleanup candidate
  only if the per-member read restriction should be enforced server-side.
- **F3 — per-program read authz IS enforced (the secure characteristic).** Unlike the `/summary` analytics routes
  (their F2 — `authenticateToken`-only), `getMemberStreaks` calls `ensureProgramAccess` (403 non-member) **and**
  verifies the target `memberId` is an active member of the program (404 otherwise) — two distinct lookups gating two
  distinct members (run-13: requester vs target). Kept faithful.
- **F4 — `name` is display-only, defaults to "Member".** The subtitle is whatever `name` the landing passed
  (`encodeURIComponent`'d at the call site); a direct-nav without `name` shows "Member". The member identity is driven
  entirely by `memberId`. Faithful.
- **F5 — no `memberId` is a degenerate no-op.** Direct-nav to `/members/streaks` with no `memberId` disables the query
  and short-circuits the redirect `useEffect` → header only, no card. The landing always supplies `memberId`, so this
  is unreachable in normal flow. Faithful, flagged.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial faithful port of `members/streaks` (members sub-route 6 of 8) — per-member Streak Stats (Current/Longest day pills + milestone badge ladder, URL `memberId`/`name`, non-staff own-only redirect); D-C1 non-color milestone affordance (`✓` + ring on achieved). No new dependency, zero backend work, no feature bump. |
