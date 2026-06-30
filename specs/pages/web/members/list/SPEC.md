# Page: `members/list` (web) — active-member roster (members sub-route 1 of 8)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/list` — the **roster screen** behind the [`members`](../SPEC.md) landing's "View Members"
> pill: a searchable, read-only list of the program's **active** members. **1st** of the eight deferred `/members`
> sub-routes (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`) and the **entry point to
> `/members/detail`** (the deferred per-member editor, reached only by global_admin).
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/members/list/page.tsx` (113 lines).
> **Consumes (features):** [`program-memberships`](../../../../features/program-memberships/SPEC.md)
> (`GET /program-memberships/details` — `authenticateToken`; already mounted) via the already-ported
> `lib/api/programs.ts` `fetchMembershipDetails`; [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS renders its member roster natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ one tokenize cleanup** (D-C1 — the "Inactive" badge `bg-red-100 text-red-600`
> → `rf-danger`). **No new dependency, zero backend work, no feature bump.** Oddities flagged §10.

---

## 1. What it is + who uses it

A flat, searchable **roster of the active members** of the signed-in user's active program. Each member renders as a
`GlassCard` row (avatar · name · admin star · `@username` · an "Inactive" badge). **Every role can view the list**;
only **global_admin** gets clickable rows that navigate to the deferred `/members/detail` editor — for everyone else
the rows are static, informational cards. Reached from the [`members`](../SPEC.md) landing's "View Members" pill
(`members/page.tsx:234`, shown when `!canViewAs` — i.e. for loggers/members), so in practice it is a read-only
directory for the roles that actually land here.

## 2. Why it exists

The `/members` landing is a per-member **performance dashboard** (view-as cards), not a directory. This page is the
plain "who's in the program" roster — a name lookup + the global_admin entry point into the per-member detail/editor
(`/members/detail`). It is the simplest member sub-route: a single read query, client search, and a list.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/list` (`apps/web/src/app/members/list/page.tsx`). No `force-dynamic` (faithful — reads no
  search params; the only state is the local search string).
- **Reached from:** the [`members`](../SPEC.md) landing's "View Members" pill (`members/page.tsx:234`); the
  bottom-nav still shows because the path is under `/members` (`shell.tsx`).
- **Back:** `PageHeader backHref="/members"`.
- **Leaves to:** `/members/detail?memberId=<id>` on a row click — **global_admin only** (the deferred editor;
  forward-nav, F2).

## 4. Contents / sections

1. **`PageHeader`** — title "Members", subtitle = `program?.name ?? "Program"`, `backHref="/members"`
   (`members/list/page.tsx:41`).
2. **Search `GlassCard`** — a raw `<input class="input-shell …">` filtering the list client-side by `member_name`
   (case-insensitive `includes`, `members/list/page.tsx:43-50`, 32-37).
3. **Member grid** — `filtered.map(...)` of `MemberRow` cards (`members/list/page.tsx:58-69`). Each `MemberRow`
   (`:74-113`):
   - **Avatar** — `initials(member_name)` in a `bg-rf-surface-muted` circle.
   - **Name** + a `★` (`text-rf-accent`) when `program_role === "admin"`.
   - **`@username`** (`member.username ?? ""`).
   - **"Inactive" badge** — shown when `!member.is_active` (`bg-rf-danger/10 text-rf-danger` after D-C1).
   - **Clickability** — `canEdit` (global_admin) wraps the card in a `<button>` → `/members/detail?memberId=…`;
     otherwise the card renders as a static `<div>` (`:107-112`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), `GlassCard`, `LoadingState`,
  `EmptyState`, `ErrorState` — every one landed with earlier runs (summary landing / `/program/*` sub-routes).
- **New dep:** **none** — the sweep ports nothing but the page file itself.
- **Hooks/api:** `useAuthGuard` (`auth`), `fetchMembershipDetails` + `MembershipDetail` (`lib/api/programs.ts` —
  ported with the `program` landing run 24 / `program/roles` run 26, already consumed by 2 live pages), `initials`
  (`lib/format.ts`) — all already ported.

## 6. Data / API

- **`GET /api/program-memberships/details?programId`** ← `fetchMembershipDetails(token, programId)`, query key
  `["members","details",programId]`, `enabled: !!token && !!programId`. Returns `MembershipDetail[]`
  (`member_id`, `member_name`, `username?`, `program_role?`, `status?`, `is_active?`).
- **Client-side only:** filter to `status === "active"` (membership status), then case-insensitive name search.
  No server-side search param (unlike the `/members/metrics` route's `search`).
- **Zero backend work, NO feature bump** — `GET /program-memberships/details` already mounted + `authenticateToken`
  (shipped with [`program-memberships`](../../../../features/program-memberships/SPEC.md); already consumed by the
  `program` landing + `program/roles`).

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. **No
admin redirect** — every role renders the same roster; the only role-conditional behavior is row clickability.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | The active-member roster; **rows are clickable** → `/members/detail?memberId=…` (the deferred per-member editor). |
| **program admin** (`my_role==="admin"`) | The same roster, **read-only** (rows are static `<div>`s — not clickable). |
| **logger** (`my_role==="logger"`) | Same — read-only roster. The landing's "View Members" pill routes them here. |
| **member** (none of the above) | Same — read-only roster. |

**`admin_only_data_entry`: N/A** — this is a **read-only** list; it does no data entry, so the lock does not gate it.
(It gates the log forms on the `/summary` sub-routes, not this directory.)

## 8. States & edge cases

- **Loading** — `LoadingState message="Loading members..."` while the query is in flight (`members/list/page.tsx:52`).
- **Error** — `ErrorState` with the query error message (`:54`).
- **Empty** — `EmptyState message="No members found."` when the (post-filter) list is empty — covers both "no active
  members" and "search matched nothing" (`:56`).
- **Inactive member** — a member with active *membership* but a deactivated *account* (`status==="active"` but
  `!is_active`) shows the "Inactive" badge (F2).
- **No token / no active program** — `useAuthGuard` redirects to `/login` / `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — **1st** of the eight deferred `/members` sub-routes; does **not** close the group (`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health` still deferred). The row's nav target `/members/detail` is a separate deferred row (forward-nav, F1). | COVERAGE members row; `members` landing SPEC §D-SCOPE; `specs/pages/REGISTRY.md` |
| **D-REF** | `consumed_by = [web]` — the web roster; iOS renders its member list natively. | legacy `members/list/page.tsx`; cross-app sweep |
| **D-DEPS** | **No new dependency** — `fetchMembershipDetails`/`MembershipDetail` (ported with the `program` landing run 24 / `program/roles` run 26, already used by 2 live pages), `initials`, and every chrome leaf (`PageShell`/`PageHeader`/`GlassCard`/`LoadingState`/`EmptyState`/`ErrorState`) all already ported. The sweep ports only the page file. | `members/list/page.tsx:3-14`; rebuilt `lib/api/programs.ts:99-145` |
| **D-S1** | Faithful 1:1 otherwise — same `["members","details",programId]` query + `enabled` gate, the `status==="active"` filter, the client-side name search, the global_admin-only row clickability, and the `MemberRow` markup. | legacy `members/list/page.tsx` |
| **D-C1** | **Tokenize cleanup** (change-now) — the "Inactive" badge's literal `bg-red-100 text-red-600` → theme-aware `bg-rf-danger/10 text-rf-danger` (the soft-tinted danger pill, matching every other rebuilt page; `--rf-danger` is `#ef4444` light / `#f87171` dark). The only untokenized color on the page; nothing else to tokenize (avatar, star, text all already `rf-*`). | user decision; `members/list/page.tsx:98`; runs 27/31 (selective per-site tokenize) |

## 10. Flagged characteristics kept as-is

- **F1** — **Global_admin-only row clickability** — only `isGlobalAdmin` (`session.user.globalRole === "global_admin"`)
  makes a row a `<button>` → `/members/detail`; for all other roles the rows are static. The detail editor is
  global_admin-only by design. Note the entry-path asymmetry: the landing's "View Members" pill shows when
  `!canViewAs` (loggers/members), yet only global_admin can act on a row — so the roles that reach this page via the
  pill see a purely informational list, while global_admin (who reaches it by other nav) gets the clickable version.
  Kept (faithful) — `members/list/page.tsx:19`, 64, 107-112; target ported in the `/members/detail` run.
- **F2** — **`status` (membership) vs `is_active` (account) are distinct fields** — the list filters by
  `status === "active"` (program-membership status) but badges "Inactive" off `!is_active` (the member account
  flag). A member with active membership but a deactivated account renders with the "Inactive" badge; the two are
  not the same boolean. Kept (faithful) — `members/list/page.tsx:29`, 97.
- **F3** — **Client-side filter + search** — both the `status==="active"` filter and the name search run on the
  already-loaded `MembershipDetail[]` in the browser (no server `search` param), unlike the `/members/metrics`
  route which accepts a server-side `search`. Fine at program-roster scale; kept (faithful) — `:28-37`.
- **F4** — **Forward navigation to a not-yet-built route** — the row click targets `/members/detail`, deferred as
  its own page-spec row (the 2nd of the 8 `/members` sub-routes). 404s until that spec lands. Kept (faithful) —
  `:65`.
- **F5** — **Client-side role from an unverified JWT decode** (`session.user.globalRole`) drives only the
  display-level row clickability — there is no privileged action on this page (navigation only); the
  `/members/detail` editor re-verifies + re-authorizes server-side. Kept (faithful) — not a security boundary;
  `:19`.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 39) — the **25th web page spec**, the **active-member roster** (`/members` sub-route 1 of 8). Faithful 1:1 port of the legacy 113-line page: a `PageShell` + `PageHeader` ("Members" / program name / `backHref="/members"`) wrapping a search `GlassCard` + a grid of `MemberRow` cards, over `fetchMembershipDetails` (`GET /program-memberships/details`), client-filtered to `status==="active"` + client name search. **global_admin-only** row clickability → the deferred `/members/detail` editor; read-only for every other role; `admin_only_data_entry` **N/A** (read-only list). Decisions: **D-SCOPE** (this page; 1st of 8, does not close the group) · **D-REF** (`consumed_by=[web]`) · **D-DEPS** (no new dependency — `fetchMembershipDetails` + all chrome already ported) · **D-S1** (faithful 1:1) · **D-C1** (tokenize the "Inactive" badge `bg-red-100 text-red-600` → `bg-rf-danger/10 text-rf-danger`). Flagged F1–F5 (global_admin-only clickability + entry-path asymmetry; `status` vs `is_active`; client-only filter/search; forward-nav to deferred `/members/detail`; client JWT-decode role drives display-only clickability). **Zero backend work, NO feature bump** — `GET /program-memberships/details` already mounted (`authenticateToken`). Ported `apps/web/src/app/members/list/page.tsx`. `npm run build` ✓. |
