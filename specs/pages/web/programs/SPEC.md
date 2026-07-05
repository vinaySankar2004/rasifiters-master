# Page: `programs` (web) — the post-login programs hub

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.0 · **App:** `web` (Next.js App Router)
> **Route:** `/programs` — **the first protected route after login** (every auth page redirects here on
> success). **Not** a bottom-nav tab; it's the program-selector hub you land on before entering a program's
> tabbed workspace (`/summary` …).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/programs/page.tsx`
> (+ ported deps `components/ui/{PageShell,GlassCard,Modal,ConfirmDialog,StatusBadge}.tsx`,
> `lib/api/{programs,invites}.ts`).
> **Consumes (features):** [`programs`](../../../features/programs/SPEC.md) (`fetchPrograms`, `createProgram`,
> `updateProgram`, `deleteProgram`, `updateMembership`), [`program-memberships`](../../../features/program-memberships/SPEC.md)
> + [`invites`](../../../features/invites/SPEC.md) (`fetchMyInvites` / `fetchAllInvites` / `respondToInvite`),
> [`auth`](../../../features/auth/SPEC.md) (the foundation `useAuth` + `useAuthGuard`), and `saveActiveProgram`
> (`lib/storage.ts`).
> **Cross-app:** iOS program-picker / admin-home (`Features/Home/` — `Onboarding/`) renders the same hub
> concept (program cards + invites + create) natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ one reuse cleanup** (D-C3, `useAuthGuard`). Also resolves the standing
> **middleware HS256→ES256** open question via **D-C1** (edge = decode + expiry only). Oddities flagged §10.

---

## 1. What it is + who uses it

The **programs hub** — the authenticated landing page (`My Programs`) where a member sees every program they
belong to (or, for a global admin, every program), picks one to enter its workspace, manages pending program
**invites**, **creates** a new program, and opens an **account** menu (profile / password / appearance /
privacy / sign-out). Used by **every authenticated user**; what's listed and which controls appear vary by
role (§7). It is the first route the edge `middleware.ts` actually gates.

## 2. Why it exists

To be the post-login home base: choose the active program (persisted to `localStorage` via
`saveActiveProgram`, then `/summary`), and surface the cross-program actions (invites, create, account) that
don't belong inside a single program's workspace. Selecting a program is what unlocks the bottom-nav tabbed
surfaces — `useAuthGuard({ requireProgram: true })` on those pages bounces back here until a program is
chosen.

## 3. Route / location

- **App:** `web`. **Route:** `/programs`. **Protected** — in the `middleware.ts` matcher (`/programs/:path*`);
  an unauthenticated request is redirected to `/login?from=/programs` at the edge, and the page's
  `useAuthGuard` is a second client-side gate.
- **Reached via:** post-login / post-register / post-splash redirect (all auth pages route here), or the
  `useAuthGuard({ requireProgram: true })` bounce from a workspace page with no active program.
- **Leaves to:** `/summary` (selecting an openable program — sets the active program first) · `/program/profile`
  · `/program/password` · `/program/appearance` · `/program/privacy` (Account modal rows) · `/login` (Sign Out).
  All `/summary` + `/program/*` targets are **forward dependencies** (ported in later runs — F2).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "My Programs" / "Manage your fitness programs" + two FAB buttons (Account, Program actions). The actions FAB shows a **pending-invites count badge**. | programs/page.tsx:172-202 |
| Search card (net-new 0.2.0, D-N1) | `GlassCard padding="sm"` + `input-shell` input ("Search programs") between the header and the list — client-side name filter (trimmed, case-insensitive `.includes`). A no-match filter shows "No programs match your search". An order-save error renders as a red line under it. | programs/page.tsx (search card + `visiblePrograms`) |
| Programs list | Loading / error / empty (`No programs yet`) states, then a `Reorder.Group` (framer-motion) of `ReorderableProgramRow`s — **drag-to-reorder by grip handle**, persisted per-member (D-N1). | programs/page.tsx (list section) |
| `ProgramCard` | Name + date range + **grip handle (net-new 0.2.0)** + `StatusBadge` (handle sits left of the badge, top-right); either invite/request status + Accept/Decline(Cancel) buttons, or `active/total members` + a progress bar; **Edit/Delete** when `canManage`. Whole card clickable → select (when `canOpen`); drag ONLY by the handle. | programs/page.tsx (`ReorderableProgramRow` + `ProgramCard`) |
| Program Actions modal | A `Modal` with a segmented control: **Invites tab** (`All Invites` for global admin, else `My Invites`) + **Create tab**. Opens to invites if any pending, else create. | programs/page.tsx:252-319 |
| `InvitesTab` / `InviteCard` | Loading / error / empty; for global admin invites are **grouped by program** with the invitee name + a **Revoke** button; for members a flat list (Accept / Decline only). | programs/page.tsx:642-797 |
| `CreateProgramTab` | Name input + status `Select` (planned/active/completed) + start/end date inputs (defaults today / +3 months) → `Create Program`. | programs/page.tsx:799-882 |
| Account modal | 5 `AccountRow`s → `/program/profile`, `/program/password`, `/program/appearance`, `/program/privacy`, and **Sign Out** (opens confirm). | programs/page.tsx:321-391 |
| `EditProgramModal` | Name / status / start / end → `Save` (`updateProgram`). Admin-only entry (Edit on a manageable card). | programs/page.tsx:393-409, 884-981 |
| Delete-program confirm | `ConfirmDialog` "Delete Program?" → `deleteProgram` (soft-delete). | programs/page.tsx:411-426 |
| Sign-out confirm | `ConfirmDialog` "Sign Out" → `signOut()` → `/login`. | programs/page.tsx:428-439 |
| Decline-invite modal | "Decline Invitation" + a **Block future invites** checkbox → `respondToInvite(..., decline, block_future)`. | programs/page.tsx:441-493 |

**Data flow.** `programsQuery` (`fetchPrograms`) + `invitesQuery` (`fetchAllInvites` if global admin, else
`fetchMyInvites`) load on mount (`enabled: !!token`). Mutations (`updateMembership`, `respondToInvite`,
`createProgram`, `updateProgram`, `deleteProgram`) invalidate `["programs"]` and/or `["invites", isGlobalAdmin]`
on success. Selecting a card calls `saveActiveProgram({...})` then `router.push("/summary")`
(programs/page.tsx:153-165).

## 5. Components + features consumed

- **Ported-with-this-page (D-C2, verbatim):** `components/ui/{PageShell, GlassCard, Modal, ConfirmDialog,
  StatusBadge}.tsx` (all use the foundation `cn` from `lib/utils.ts`) and `lib/api/{programs, invites}.ts`
  (whole modules — later pages reuse `fetchProgramMembers` / `leaveProgram` / `fetchMembershipDetails` /
  `removeMembership`, unused here, F5).
- **Already-ported, reused:** `Select` (status dropdown), `useAuth` (`signOut`), **`useAuthGuard`** (D-C3),
  `saveActiveProgram` (`lib/storage.ts`), `formatDateRange` / `formatInviteDate` (`lib/format.ts`), the icon
  set, React Query.
- **Features:** [`programs`](../../../features/programs/SPEC.md), [`program-memberships`](../../../features/program-memberships/SPEC.md),
  [`invites`](../../../features/invites/SPEC.md), [`auth`](../../../features/auth/SPEC.md).

## 6. Data / API

| Call | Endpoint | Notes |
|------|----------|-------|
| `fetchPrograms(token)` | `GET /api/programs` | Returns the per-user shape (`my_role`, `my_status`, `total_members`, `active_members`, `progress_percent`, `admin_only_data_entry`). **Global admins get all programs; members get only their `active`/`invited`/`requested` ones** (backend filters — programs SPEC). |
| `fetchMyInvites(token)` / `fetchAllInvites(token)` | `GET /api/program-memberships/my-invites` · `/all-invites` | All-invites is **global-admin-only** server-side; the page picks by `isGlobalAdmin`. |
| `updateMembership(token, {program_id, member_id, status})` | `PUT /api/program-memberships` | Card Accept (`active`) / Decline·Cancel (`removed`) for programs where my_status is `invited`/`requested`. |
| `respondToInvite(token, {invite_id, action, block_future?})` | `PUT /api/program-memberships/invite-response` | Modal Accept / Decline / Revoke of `ProgramInvite` records. |
| `createProgram` / `updateProgram` / `deleteProgram` | `POST` / `PUT /:id` / `DELETE /:id` `/api/programs` | Create auto-enrolls creator as program admin; update/delete require program-admin (or global admin) server-side. |
| `saveProgramOrder(token, programIds)` (net-new 0.2.0) | `PUT /api/programs/order` | Sends the full display order (`{ program_ids }`) on drag end. Optimistic local order; on error an inline red line + `invalidateQueries(["programs"])` reverts to server order. `GET /api/programs` comes back in saved order (unordered programs trailing by start_date) — that's the whole cross-platform sync. |

Auth: every call sends the Supabase access JWT as `Authorization: Bearer` (via `apiRequest`); the backend
JWKS-verifies + maps `sub` → member and runs all authorization.

## 7. Role-based view rules

Roles derive from `session.user.globalRole` (client JWT, F1) + each program's `my_role` / `my_status`
(from `GET /api/programs`). Per-card gates (programs/page.tsx:224-227):
`canOpen = isGlobalAdmin || my_status == null || my_status == "active"`;
`canManage = isGlobalAdmin || (my_status == "active" && my_role == "admin")`.

| Role | Sees | Can do |
|------|------|--------|
| **global_admin** | **All** programs; invites tab = **"All Invites"** grouped by program, showing the invitee name. | Open any card; **Edit/Delete any** program; **Revoke** any invite; create programs; account menu. |
| **program admin** (`my_role=="admin"`, active) | Their programs; **"My Invites"**. | Open + **Edit/Delete their own** program; Accept/Decline own invites; create programs; account menu. |
| **logger / member** (active) | Their programs; **"My Invites"**. | Open active programs; Accept/Decline/Cancel own invites; create programs; account menu. **No Edit/Delete.** |
| **invited / requested** (not yet active) | The pending card (status text, no member counts). | Accept/Decline (or Cancel request) only; the card isn't openable (`canOpen=false`, dimmed) unless global admin. |

**`admin_only_data_entry`:** **not enforced on this page** — it's read from `GET /api/programs` and stored
into the active program (`saveActiveProgram`) so the *downstream* log pages can lock data entry for
non-admins (`isDataEntryLocked`). The hub shows/creates/edits programs regardless of the flag.

## 8. States & edge cases

- **Loading:** programs list shows "Loading programs…"; invites tab "Loading invites…".
- **Empty:** "No programs yet — Create a program to get started." (members with zero memberships).
- **Error:** programs/invites query errors render the error message inline (red); mutation errors render
  inside their modal/tab and keep it open.
- **Unauthenticated:** edge `middleware.ts` redirects to `/login?from=/programs` (D-C1); the page's
  `useAuthGuard` also pushes `/login` if bootstrap finishes with no token.
- **Expired token:** middleware passes through (D-C1); the API client's 401-retry coalesces a refresh, so a
  stale-but-refreshable session self-heals on the first `fetchPrograms` call.
- **Last-admin guard:** removing the last active admin is blocked server-side (400) — the membership/leave
  mechanics live in the `program-memberships` feature, surfaced here only via the mutation error.
- **Forward nav:** selecting a program → `/summary`, and the Account rows → `/program/*`, all **route to
  pages not yet built** (F2) — they 404 until those page specs land.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `rasifiters-webapp/src/app/programs/page.tsx`. `consumed_by = [web]`.** Cross-app: the iOS program-picker / admin-home renders the same hub concept natively; parity is audited at the iOS port. | `programs/page.tsx`; user answer (faithful). |
| **D-S1** | **Stance = faithful 1:1 port** of the legacy page (header + FABs, `ProgramCard`, the Actions/Account/Edit/Delete/SignOut/Decline modals, all queries + mutations + cache invalidation, `saveActiveProgram` → `/summary`) — verbatim except D-C3. | `programs/page.tsx:1-1022`; user answer (run 20). |
| **D-C1** | **Edge middleware (`src/middleware.ts`) = decode + expiry only — RESOLVES the standing HS256→ES256 open question.** The faithful HS256 verify can't validate Supabase **ES256** tokens (would redirect-loop every real session). The middleware is a **UX redirect gate**, not the security boundary: the Express backend JWKS-verifies (ES256) **every** API call and owns all authorization (CLAUDE.md auth model — not RLS). So the edge only decodes the token + checks `exp` (malformed → clear + bounce; expired → pass through for client refresh). No per-nav JWKS fetch; `JWT_SECRET` dependency dropped. | `apps/web/src/middleware.ts`; backend `middleware/auth.js`; CLAUDE.md auth model; user answer ("decode + expiry only"). |
| **D-C2** | **Dependency port = verbatim.** The page drags in 2 API modules (`lib/api/programs.ts`, `lib/api/invites.ts`) + 5 UI components (`ui/{PageShell,GlassCard,Modal,ConfirmDialog,StatusBadge}.tsx`) not in the foundation. Ported the **whole** api modules (shared infra later pages reuse) + **only the 5** UI components this page needs (not all 12 legacy `ui/` files — the rest belong to their own pages). Mirrors the foundation-port precedent; transitive dep `cn`/`format` already present. | our `apps/web` inventory; user answer ("port verbatim — whole api modules + needed UI"). |
| **D-C3** | **Reuse `useAuthGuard({ requireProgram: false })`** in place of the legacy inline login-redirect `useEffect`. The foundation already ships this guard; `requireProgram:false` because the hub is *where* you pick the active program (must not bounce to itself). Behavior-equivalent to the legacy redirect; removes ~7 lines of duplicated logic. | `apps/web/src/lib/hooks/use-auth-guard.ts`; `programs/page.tsx:51-55`; user answer ("faithful + reuse useAuthGuard"). |
| **D-N1** | **Net-new post-parity enhancement (user-requested 2026-07-05): drag-to-reorder + search.** Reorder via **framer-motion `Reorder.Group`/`Reorder.Item`** (already a dependency — no new package) with `dragListener={false}` + per-item `useDragControls`: drag ONLY by a ≡ grip handle (top-right, left of the StatusBadge; `touch-action: none` so mobile Safari drags instead of scrolling; pointer-down stopPropagation keeps card-tap intact). Order state is optimistic; `PUT /programs/order` fires on drag end with the full id list; error → inline message + invalidate (revert). Search is a client-side name filter; **reorder is disabled while searching** (handle hidden + `onReorder` guard) so filtered indices can never corrupt the full order. New programs land at the bottom (server: `NULLS LAST, start_date`). Cross-platform order sync is free — the server returns the saved order and clients render array order as-is. | programs feature SPEC 0.2.0 (D-N1); user decisions (grip handle · bottom placement). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side role from an unverified JWT decode** (`session.user.globalRole`) drives `canOpen`/`canManage`/the invites-tab variant — display/gating only; the backend re-verifies + re-authorizes every call. Same posture as the auth pages' F1. | `programs/page.tsx:39`, 224-227 | Kept (faithful) — not a security boundary. |
| **F2** | **Forward navigation to not-yet-built routes** — selecting a program → `/summary`; Account rows → `/program/{profile,password,appearance,privacy}`. These 404 until their page specs land. | `programs/page.tsx:164`, 349-376 | Kept (faithful) — targets ported in later runs. |
| **F3** | **Two distinct invite mechanisms** — the **card** Accept/Decline uses `PUT /program-memberships` (for programs whose `my_status` is `invited`/`requested`, surfaced in the programs list), while the **modal** uses `PUT /invite-response` on `ProgramInvite` records. Faithful legacy duality. | `programs/page.tsx:239-243` vs 284-301 | Kept (faithful) — two server-side invite representations. |
| **F4** | **Edge middleware does not verify the token signature** (D-C1, decode + expiry only). A forged/garbage token reaches the page, but every API call it makes 401s. | `apps/web/src/middleware.ts` (`verifyJwt`) | Kept (deliberate, D-C1) — the backend is the security boundary. |
| **F5** | **Vestigial-here api fns + an unused `Program` field.** The whole `programs.ts`/`invites.ts` modules are ported (D-C2) but this page uses only a subset; `Program.enrollments_closed` is in the type yet not returned by `GET /api/programs`. | `lib/api/programs.ts:12`, 45-154 | Kept — `enrollments_closed` is a legacy vestige; the extra fns light up on later pages. |
| **F6** | **No client-side rate limiting** on create/update/delete/invite actions (consistent with the auth pages' F4). | `programs/page.tsx` mutations | Kept (faithful) — throttling belongs server-side. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-05 | **Net-new post-parity (D-N1): per-member drag-to-reorder + program search.** Program cards reorder by a ≡ grip handle (framer-motion `Reorder`, `dragListener=false` + `useDragControls`; handle left of the StatusBadge), order persisted via `saveProgramOrder` → `PUT /api/programs/order` (optimistic, invalidate-on-error revert; last-write-wins). "Search programs" `GlassCard`/`input-shell` filter above the list (client-side, name `.includes`); reorder disabled while searching; "No programs match your search" state. Pairs with `programs` feature 0.2.0 and iOS `program-picker` 0.2.0. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 20) — the **sixth web page spec** and the **first protected route**. Documents the `/programs` hub: the `My Programs` list of `ProgramCard`s (status/progress/member-counts + invite Accept/Decline + admin Edit/Delete), the Program Actions modal (Invites + Create tabs), the Account modal (5 rows), and the Edit/Delete/SignOut/Decline confirm modals. Consumes `programs` + `program-memberships` + `invites` + `auth`. Decisions: **D-REF** (`consumed_by=[web]`; iOS hub mirrors later) · **D-S1** (faithful 1:1) · **D-C1** (edge middleware = decode + expiry only — **resolves the HS256→ES256 open question**; backend JWKS-verifies every call, so security unchanged) · **D-C2** (ported the dragged-in deps verbatim — whole `programs.ts`/`invites.ts` api modules + the 5 `ui/` components the page uses) · **D-C3** (reuse `useAuthGuard({requireProgram:false})` for the inline redirect). Flagged F1–F6 (client JWT-decode role; forward-nav to unbuilt routes; dual invite mechanisms; edge gate doesn't verify signatures; vestigial-here api fns + `enrollments_closed`; no client rate-limit). Ported `apps/web/src/app/programs/page.tsx` + `lib/api/{programs,invites}.ts` + `components/ui/{PageShell,GlassCard,Modal,ConfirmDialog,StatusBadge}.tsx`; rewrote `src/middleware.ts` (decode+expiry). `npm run build` ✓ (`/programs` prerendered, 11.3 kB; Middleware 27.2 kB active). |
