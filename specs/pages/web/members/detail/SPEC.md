# Page: `members/detail` (web) — global_admin per-member editor (members sub-route 2 of 8)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/detail?memberId=<id>` — the **per-member editor** reached by clicking a row on
> [`members/list`](../list/SPEC.md) (global_admin only). Identity card + editable **Joined Program** date +
> **Active Membership** checkbox → `updateMembership`; **Remove from program** → `removeMember`. **2nd** of the
> eight deferred `/members` sub-routes (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`)
> and the **target** of `members/list`'s global_admin-only row click.
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/members/detail/page.tsx` (162 lines).
> **Consumes (features):** [`program-memberships`](../../../../features/program-memberships/SPEC.md)
> (`GET /program-memberships/details`, `PUT /program-memberships`, `DELETE /program-memberships` — all
> `authenticateToken`; already mounted) via the already-ported `lib/api/programs.ts`
> `fetchMembershipDetails`/`updateMembership`/`removeMembership`; [`auth`](../../../../features/auth/SPEC.md)
> (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS edits memberships natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ 3 cleanups** (D-C1 `window.confirm` → `ConfirmDialog`; D-C2 tokenize the Remove
> button danger color; D-C3 clear stale error on field edit). **No new dependency, zero backend work, no feature
> bump.** Oddities flagged §10.

---

## 1. What it is + who uses it

The **per-member membership editor** for the signed-in user's active program — an identity card (avatar · name ·
`@username` · a "Program Admin" line · gender / account-created) plus two editable fields (**Joined Program** date,
**Active Membership** toggle) saved via `updateMembership`, and a **Remove from program** action. **global_admin
only** — every other role is redirected to `/members` on mount (`members/detail/page.tsx:29-33`). It is the editor
behind `members/list`'s global_admin-only clickable rows (run 39 F1).

## 2. Why it exists

`members/list` is a read-only roster; this is where a global_admin actually **edits** one membership — correct the
program-join date, deactivate/reactivate the membership, or remove the member from the program. It is the lone
write surface in the `/members` family's read-only roster path.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/detail?memberId=<id>` (`apps/web/src/app/members/detail/page.tsx`). `export const dynamic =
  "force-dynamic"` (faithful — it reads the `memberId` search param via `useClientSearchParams`).
- **Reached from:** [`members/list`](../list/SPEC.md) row click — **global_admin only** (`members/list/page.tsx:65`,
  107-112).
- **Back:** `PageHeader backHref="/members/list"`.
- **Leaves to:** `/members/list` after a successful Save **or** Remove (`router.push("/members/list")`); `/members`
  on the non-global_admin redirect.

## 4. Contents / sections

1. **`PageHeader`** — title "Member Details", `backHref="/members/list"` (`members/detail/page.tsx:91`).
2. **Identity block** (`GlassCard padding="lg"`, `:97-111`) — `initials(member_name)` avatar · `member_name` ·
   `@username` · a "Program Admin" line when `program_role === "admin"`.
3. **Read-only facts** (`:113-116`) — `Gender: …` and `Account Created: …` (each shown only when present).
4. **Editable fields** (`:118-135`):
   - **Joined Program** — a `<input type="date">` bound to `joinedAt` (seeded from `member.joined_at`).
   - **Active Membership** — a `<input type="checkbox">` bound to `isActive` (seeded from `member.is_active ?? true`).
5. **Error line** — `errorMessage` in `text-rf-danger` when a save/remove fails (`:137`).
6. **Actions** (`:139-159`) — **Save changes** (`bg-rf-accent`, `disabled` while saving) → `handleSave`; **Remove
   from program** (danger button) → opens the `ConfirmDialog` (D-C1).
7. **`ConfirmDialog`** (D-C1) — danger confirm "Remove `<name>` from the program?" → `handleRemove`.

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`), `GlassCard`, `LoadingState`,
  `ErrorState`, `ConfirmDialog` (→ `Modal`) — every one landed with earlier runs (summary landing / `/program/*`
  sub-routes / `members/list`).
- **New dep:** **none** — `updateMembership`/`removeMembership` already live in `lib/api/programs.ts` (ported with
  the `program` landing run 24 / `program/roles` run 26); the read-only `members/list` (run 39) was the belated
  consumer of `fetchMembershipDetails`, this page is the belated consumer of the **write** fns. The sweep ports only
  the page file.
- **Hooks/api:** `useAuthGuard` (`auth`), `useClientSearchParams`, `initials` (`lib/format.ts`),
  `fetchMembershipDetails`/`updateMembership`/`removeMembership` + `MembershipDetail` (`lib/api/programs.ts`) — all
  already ported.

## 6. Data / API

- **`GET /api/program-memberships/details?programId`** ← `fetchMembershipDetails(token, programId)`, query key
  `["members","details",programId]` (**shared with `members/list`** — same key, same args), `enabled: !!token &&
  !!programId && !!memberId`. The page finds its member client-side: `data.find(m => m.member_id === memberId &&
  m.status === "active")` (`:42-46`).
- **`PUT /api/program-memberships`** ← `updateMembership(token, { program_id, member_id, joined_at: joinedAt ||
  null, is_active })` (`:59-64`). **Only `joined_at` + `is_active` are sent** — not `role`/`status`.
- **`DELETE /api/program-memberships`** ← `removeMembership(token, { program_id, member_id })` (`:79`).
- **Zero backend work, NO feature bump** — all three routes already mounted + `authenticateToken` (shipped with
  [`program-memberships`](../../../../features/program-memberships/SPEC.md); the PUT already consumed by `program/roles`
  run 26). The service `updateMembership`/`removeMember` independently enforce authz + the "Cannot remove the last
  admin" 400 (`membershipService.js:174`, `:297`, `:257`).

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. **Plus a
global_admin-only mount redirect** (`:29-33`): `if (!isGlobalAdmin) router.push("/members")`.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | The full editor — edit Joined-Program date + Active-Membership, Save, and Remove from program. |
| **program admin** (`my_role==="admin"`) | **Redirected to `/members`** on mount — no access (client gate, F1). |
| **logger** | **Redirected to `/members`** — no access. |
| **member** | **Redirected to `/members`** — no access. |

**`admin_only_data_entry`: N/A** — this edits **membership** (join date / active flag / removal), not workout/health
**data entry**; the lock gates the `/summary` log forms, not this editor.

**F1 (client gate is STRICTER than the backend):** the page restricts entry to **global_admin** only, but the
backend `updateMembership`/`removeMember` accept a **program admin** of the target program too
(`membershipService.js:181-193`, `:304-311`). The stricter client gate is faithful (kept); the backend is the real
authorization boundary.

## 8. States & edge cases

- **Loading** — `LoadingState message="Loading member..."` while the details query is in flight (`:94`).
- **Error (query)** — `ErrorState` with the query error message (`:95`).
- **Member not found** — `member` resolves to `null` (no matching `member_id` with `status==="active"`); the card
  simply doesn't render (no explicit empty state — faithful, F2).
- **Save/Remove failure** — `errorMessage` shows in `text-rf-danger`; cleared on the next field edit (D-C3) or
  submit.
- **In-flight** — both buttons `disabled` while `isSaving` (one shared flag for Save **and** Remove).
- **Non-global_admin** — redirected to `/members` before any editing UI is usable (F1).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-SCOPE** | This page only — **2nd** of the eight deferred `/members` sub-routes; does **not** close the group (`invite`/`metrics`/`history`/`streaks`/`workouts`/`health` still deferred). It is the **target** of `members/list`'s global_admin-only row click (run 39 F1, now resolved). | COVERAGE members row; [`members/list`](../list/SPEC.md) §D-SCOPE; `specs/pages/REGISTRY.md` |
| **D-REF** | `consumed_by = [web]` — the web membership editor; iOS edits memberships natively. | legacy `members/detail/page.tsx`; cross-app sweep |
| **D-DEPS** | **No new dependency** — `updateMembership`/`removeMembership`/`fetchMembershipDetails`/`MembershipDetail` (`lib/api/programs.ts`, ported run 24/26), `useAuthGuard`, `useClientSearchParams`, `initials`, and every chrome leaf (`PageShell`/`PageHeader`/`GlassCard`/`LoadingState`/`ErrorState`/`ConfirmDialog`) all already ported. The sweep ports only the page file. | `members/detail/page.tsx:5-15`; rebuilt `lib/api/programs.ts:99-145` |
| **D-S1** | Faithful 1:1 otherwise — same `["members","details",programId]` query + `enabled` gate, the client-side `member.find` (`status==="active"`), the `joinedAt`/`isActive` seeding `useEffect`, the global_admin-only redirect, the `joined_at \|\| null` + `is_active`-only PUT payload, the DELETE payload, both `router.push("/members/list")` navs (already deterministic — no `router.back()`, so no nav cleanup needed), and the card/field markup. | legacy `members/detail/page.tsx` |
| **D-C1** | **`window.confirm` → `ConfirmDialog`** (change-now) — the Remove action's native `window.confirm("Remove … from the program?")` (`:74`) → the already-ported `ui/ConfirmDialog` (a `showRemoveConfirm` state + danger/loading dialog), matching `program/profile` (run 27) + `lifestyle/workouts` (run 31). No rebuilt page uses `window.confirm`; keeping it would be the rebuild's lone divergence. | user decision; `members/detail/page.tsx:74`; runs 27/31 |
| **D-C2** | **Tokenize the Remove button** (change-now) — its literal `bg-red-100 … text-red-600` (`:154`, the only untokenized color on the page) → theme-aware `bg-rf-danger/10 text-rf-danger`, matching the sibling `members/list` "Inactive" badge (run 39 D-C1). | user decision; `members/detail/page.tsx:154`; run 39 D-C1 |
| **D-C3** | **Clear stale error on field edit** (change-now) — legacy leaves `errorMessage` lingering after a failed save/remove until the next submit, even as the date/checkbox are edited; clear it on field change (`if (errorMessage) setErrorMessage(null)` in both `onChange`s), matching `program/profile`/`program/password` (runs 27/28). | user decision; `members/detail/page.tsx:121-133`; runs 27/28 |

## 10. Flagged characteristics kept as-is

- **F1** — **Client gate (global_admin only) is STRICTER than the backend (program admin allowed)** — the page
  redirects every non-global_admin to `/members` (`:29-33`), but `updateMembership`/`removeMember` independently
  authorize a **program admin** of the target program too (`membershipService.js:181-193`, `:304-311`). The
  stricter client gate is faithful; the backend is the real authorization boundary. Kept (faithful).
- **F2** — **No "member not found" empty state** — when `member` resolves to `null` (bad/blank `memberId`, or a
  member not in the active roster), the `GlassCard` simply doesn't render and the page shows only the header. No
  explicit message. Kept (faithful) — `:97`.
- **F3** — **Shared query key with `members/list`** — both use `["members","details",programId]` with identical
  args, so React Query serves the detail page from the list's cache (and vice-versa) when warm. Faithful + benign
  (dedupe-by-key, the run-35 pattern). Kept — `:36`.
- **F4** — **PUT sends only `joined_at` + `is_active`** — `role`/`status` are not part of this editor's payload
  (role lives on `program/roles`); the service partial-updates. Kept (faithful) — `:59-64`.
- **F5** — **One shared `isSaving` flag** gates both Save and Remove buttons; there is no per-action in-flight
  state, so a Save in flight also disables Remove and vice-versa. Kept (faithful) — `:25`, 145, 152.
- **F6** — **Client-side role from an unverified JWT decode** (`session.user.globalRole`) drives the mount redirect
  only; the backend re-verifies + re-authorizes every PUT/DELETE. Kept (faithful) — not a security boundary; `:23`.
- **F7** — **No client throttle** beyond the `isSaving` disable — rapid double-submit is guarded only by the
  disabled state + the redirect on success. Kept (faithful).

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 40) — the **26th web page spec**, the **global_admin per-member editor** (`/members` sub-route 2 of 8). Faithful 1:1 port of the legacy 162-line page: a `PageShell` + `PageHeader` ("Member Details" / `backHref="/members/list"`) wrapping a `GlassCard` identity block + editable **Joined Program** date + **Active Membership** checkbox → `updateMembership` (`PUT /program-memberships`, `joined_at`+`is_active` only), and **Remove from program** → `removeMember` (`DELETE`); both → `router.push("/members/list")`. **global_admin-only** (mount redirect for every other role); `admin_only_data_entry` **N/A** (membership editing, not logging). Decisions: **D-SCOPE** (this page; 2nd of 8, does not close the group; the target of `members/list`'s row click) · **D-REF** (`consumed_by=[web]`) · **D-DEPS** (no new dependency — the write fns already in `lib/api/programs.ts`, all chrome incl. `ConfirmDialog` already ported) · **D-S1** (faithful 1:1; both navs already deterministic `push` → no nav cleanup) · **D-C1** (`window.confirm` → `ConfirmDialog`) · **D-C2** (tokenize the Remove button `bg-red-100 text-red-600` → `bg-rf-danger/10 text-rf-danger`, matching run-39's list badge) · **D-C3** (clear stale error on field edit). Flagged F1–F7 (client gate stricter than backend; no not-found empty state; shared query key with the list; PUT sends only join-date+active; one shared in-flight flag; client JWT-decode role drives the redirect only; no client throttle). **Zero backend work, NO feature bump** — all three `/program-memberships` routes already mounted (`authenticateToken`). Ported `apps/web/src/app/members/detail/page.tsx`. `npm run build` ✓. |
