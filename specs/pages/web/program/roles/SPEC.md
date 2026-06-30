# Page: `program/roles` (web) — manage roles (program-settings sub-route 2 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/program/roles` — the **admin-only** role-management screen, the second of the six deferred
> `/program/*` settings sub-routes (reached from the [`program`](../SPEC.md) hub's "Role Management" row).
> A list of the program's **active** members, each with Admin / Logger / Member toggle buttons → `PUT
> /program-memberships` `{program_id, member_id, role}`.
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx`.
> **Consumes (features):** [`program-memberships`](../../../../features/program-memberships/SPEC.md)
> (`fetchMembershipDetails` → `GET /program-memberships/details`; `updateMembership` → `PUT
> /program-memberships` — the backend service enforces the 403 program-admin gate, the **"Cannot remove the
> last admin" 400**, and fires the **live `program.role_changed`** emit), and
> [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard` + the client role for the admin redirect).
> **Cross-app:** the iOS admin **Settings → Manage Roles** screen renders the same list natively; parity
> audited at the iOS port.
> **Stance:** faithful 1:1 port **+ three small cleanups** (D-C1 tokenize the role-button colors; D-C2
> optimistic role update; D-C3 disable all role buttons while any update is in flight). Oddities flagged §10.

---

## 1. What it is + who uses it

The **role-management list** for the active program. Each **active** member renders as a `GlassCard` with an
avatar pill (initials), name, current-role label (+ a "• Global Admin" tag), and a three-button row — **Admin
/ Logger / Member**. Tapping a role that the member doesn't already hold fires a `PUT /program-memberships`
that changes their program role. Used only by a **program admin** (or global admin) — a non-admin who reaches
it is redirected back to `/program`
([roles/page.tsx:26-30](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L26)), and the
backend independently enforces a 403.

## 2. Why it exists

To let a program admin assign each active member's role within the program — **admin** (full program control),
**logger** (may log for any member), or **member** (logs for self only). It is the write surface behind the
hub's "Role Management" row. The last active admin's buttons are disabled so a program can never be left
without an admin (mirrored by a backend 400). On a successful change the backend fires a `program.role_changed`
notification to the affected member.

## 3. Route / location

- **App:** `web`. **Route:** `/program/roles`. **Protected** — under the `middleware.ts` matcher (unauth edge
  request → `/login`); `useAuthGuard()` (default `requireProgram: true`) bounces to `/programs` with no active
  program; a client `useEffect` then bounces a **non-admin** to `/program`.
- **Reached via:** the [`program`](../SPEC.md) hub's "Role Management" row (`router.push("/program/roles")`,
  admin variant only).
- **Chrome:** `PageShell maxWidth="3xl"` + `PageHeader` (title "Manage Roles", `backHref="/program"`). No
  bottom nav (it is a sub-route, not a workspace tab).
- **Leaves to:** `/program` — on Back, and on the non-admin redirect.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "Manage Roles" / "Assign admin, logger, or member roles." + Back → `/program`. | [roles/page.tsx:74-78](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L74) |
| Error line | Inline `rf-danger` text on a failed mutation. | [roles/page.tsx:80](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L80) |
| Loading / error | `LoadingState` while fetching; `ErrorState` on a fetch error. | [roles/page.tsx:82-84](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L82) |
| Member card | Per **active** member: avatar pill (`initials`), name, role label (+ "• Global Admin"), an "Updating…" tag while that row mutates. | [roles/page.tsx:92-107](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L92) |
| Role buttons | A 3-up grid of `RoleButton` (Admin / Logger / Member); the active one shows "✓ "; disabled for the last active admin. | [roles/page.tsx:109-131](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L109) |
| Last-admin note | "You cannot remove the last active admin…" under the buttons when applicable. | [roles/page.tsx:133-137](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L133) |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard`, `ErrorState` (already ported); **`LoadingState` —
  newly ported this run** (verbatim from legacy, a 9-line shared-chrome leaf). The page-local `RoleButton` +
  `roleLabel`/`ROLE_TONES` stay co-located.
- **Hooks/state:** `useAuthGuard` (session/program/token/programId + role); `useQuery`/`useMutation`/
  `useQueryClient` (React Query); `initials` (`lib/format.ts`).
- **Consumed features:** [`program-memberships`](../../../../features/program-memberships/SPEC.md)
  (`fetchMembershipDetails`, `updateMembership`), [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).

## 6. Data / API

- **`GET /program-memberships/details?programId=`** via `fetchMembershipDetails(token, programId)`
  ([lib/api/programs.ts:141](../../../../../../apps/web/src/lib/api/programs.ts#L141)) — the full membership
  roster; the page filters to `status === "active"`.
- **`PUT /program-memberships`** via `updateMembership(token, { program_id, member_id, role })`
  ([lib/api/programs.ts:112](../../../../../../apps/web/src/lib/api/programs.ts#L112)). **Already mounted**
  ([apps/backend/routes/memberships.js:46](../../../../../../apps/backend/routes/memberships.js#L46) →
  `membershipService.updateMembership`). The service: 403 unless requester is global_admin or an active
  program admin → enforces **"Cannot remove the last admin from the program." (400)** when the change would
  drop the final active admin → fires a **live** `program.role_changed` notification to the affected member →
  returns the updated membership.
- **No backend work, no feature bump** — both routes, both client fns, and the `program.role_changed` emit were
  all delivered with the `program-memberships` + `notifications` features.

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **global_admin** | Full list, can change any role. | `isProgramAdmin` true via `isGlobalAdmin`; backend skips the membership check. |
| **program admin** | Full list, can change any role. | `program.my_role === "admin"`. |
| **logger** | **No access** — redirected to `/program`. | Client `useEffect` redirect; backend would also 403. |
| **member** | **No access** — redirected to `/program`. | Same as logger. |

- **`admin_only_data_entry` effect:** **N/A** — this is a role-management screen, not a data-entry surface; the
  toggle (set on `/program/edit`) gates the log forms on the workspace tabs, not this page.
- The client role is decoded from the JWT (recurring F1); the **real** authorization boundary is the backend
  403 + the 400 last-admin guard in `updateMembership`.

## 8. States & edge cases

- **Loading:** `LoadingState` ("Loading roles…") while the details query runs.
- **Error (fetch):** `ErrorState` with the query error message.
- **Error (mutation):** inline `rf-danger` line (`error.message` or a fallback); the optimistic change rolls
  back (D-C2).
- **Empty:** no active members → an empty list (no rows). Faithful — legacy renders nothing extra.
- **Updating:** the affected row shows "Updating…"; **all** role buttons across all rows are disabled while any
  update is in flight (D-C3).
- **Last active admin:** that member's three buttons are disabled + the guard note shows; the backend also 400s.
- **Permission-denied:** non-admin → redirected to `/program` before interacting; an admin who lost the role
  server-side gets the backend 403 surfaced in the error line.
- **No active program:** `useAuthGuard` bounces to `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; the iOS Settings → Manage Roles screen mirrors the same list and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `program/roles/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **This page only.** Port `/program/roles` faithful 1:1; the other four `/program/*` sub-routes (profile/password/appearance/privacy) remain their own deferred rows. | per-page cadence; [`program` SPEC §3](../SPEC.md) |
| **D-DEPS** | Port **`LoadingState` verbatim** into the rebuilt foundation (`components/ui/LoadingState.tsx`, shared chrome) rather than inlining — the remaining `/program/*` + other sub-routes reuse it. | legacy `components/ui/LoadingState.tsx` |
| **D-S1** | **Faithful 1:1** otherwise — same active-only filter, same card markup, same 3-button role grid, same last-admin disable + note, same `PUT /program-memberships` `{program_id, member_id, role}` payload. | [roles/page.tsx](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx) |
| **D-C1** | **Tokenize the role-button colors** — replace the inline-hex `ROLE_TONES` (`#f59e0b` / `#3b82f6` / `#6b7280`) with the `rf-*` tokens `rf-warning` (admin) / `rf-info` (logger) / `rf-text-muted` (member) so the buttons are theme-aware (the legacy hexes were a single fixed light-mode palette). Admin keeps dark ink on amber; logger/member keep white. Light-mode `--rf-warning` is literally `#f59e0b` → admin is pixel-identical in light mode. | [roles/page.tsx:149-153](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L149); `globals.css` `--rf-warning`/`--rf-info`/`--rf-text-muted` |
| **D-C2** | **Optimistic role update** — on click, write the new role into the `["program","roles",programId]` cache immediately (so the ✓ moves at once), then reconcile on settle; roll the cache back on error before surfacing the message. Legacy waited for the invalidate+refetch. Backend stays authoritative. | [roles/page.tsx:46-70](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L46) (legacy invalidate-only) |
| **D-C3** | **Disable all role buttons while any update is in flight** — gate every `RoleButton` on `updateMutation.isPending` (not just the `updatingId` row), preventing rapid cross-row clicks racing. Legacy only locked the same row via `updatingId`. | [roles/page.tsx:66](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L66) (legacy `updatingId` lock) |

## 10. Flagged characteristics (kept as-is)

- **F1 — client-side admin gate via JWT-decoded role + redirect** ([roles/page.tsx:20-30](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L20)).
  The page derives admin-ness from the decoded JWT (`session.user.globalRole` + `program.my_role`) and
  redirects non-admins client-side; the authoritative guard is the backend 403 in `updateMembership`. Recurring
  across the rebuild. Kept (defense-in-depth is correct).
- **F2 — client-side last-admin disable mirrors a backend 400** ([roles/page.tsx:89-90,133-137](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L89)).
  `isLastActiveAdmin` disables the buttons in the UI; `updateMembership` independently enforces "Cannot remove
  the last admin" (400). Two copies of the same rule — kept as defense-in-depth; the backend is authoritative.
- **F3 — only `role` is sent on a change** ([roles/page.tsx:46-52](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L46)).
  The PUT payload carries `program_id`/`member_id`/`role` only — `status`/`is_active`/`joined_at` are left
  untouched (the service partial-updates `!== undefined` keys). Faithful.
- **F4 — `member_name` is rendered raw / `roleLabel` defaults to "Member"** ([roles/page.tsx:98-101,189-198](../../../../../../rasifiters-webapp/src/app/program/roles/page.tsx#L98)).
  No null-guarding beyond `roleLabel`'s default branch; a missing `program_role` reads as "Member". Faithful.
- **F5 — no client-side rate-limit beyond the in-flight lock.** After D-C3 every button is disabled while a
  mutation runs; there is still no debounce/throttle on the settle→next-click window. Recurring across the
  rebuild. Kept.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 26) — the **twelfth web page spec**, the **second of the six deferred `/program/*` settings sub-routes**. The **admin-only role-management list** (active members → Admin/Logger/Member buttons → `PUT /program-memberships`). Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → Manage Roles mirrors later) · **D-SCOPE** (this page only; other 4 `/program/*` sub-routes deferred) · **D-DEPS** (port `LoadingState` verbatim as shared chrome) · **D-S1** (faithful 1:1) · **D-C1** (tokenize role-button colors → `rf-warning`/`rf-info`/`rf-text-muted`) · **D-C2** (optimistic role update + rollback) · **D-C3** (disable all role buttons while any update is in flight). Flagged F1–F5 (client JWT-decode admin gate; client last-admin disable mirroring the backend 400; role-only payload; raw name / default role label; no client throttle). Consumes `program-memberships` (`fetchMembershipDetails`/`updateMembership`) + `auth` (`useAuthGuard`); **all endpoints already mounted, api modules already ported, no feature bump.** Ported `apps/web/src/app/program/roles/page.tsx` + new shared `components/ui/LoadingState.tsx`. `npm run build` ✓. |
