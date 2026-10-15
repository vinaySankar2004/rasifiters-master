# Page: `programs` (web) — the post-login programs hub

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.6.3 · **App:** `web` (Next.js App Router)
> **Route:** `/programs` — **the first protected route after login** (every auth page redirects here on
> success). **Not** a bottom-nav tab; it's the program-selector hub you land on before entering a program's
> tabbed workspace (`/summary` …).
> **Provenance (legacy, archived):** `rasifiters-webapp/src/app/programs/page.tsx`
> (+ ported deps `components/ui/{PageShell,GlassCard,Modal,ConfirmDialog,StatusBadge}.tsx`,
> `lib/api/{programs,invites}.ts`).
> **Consumes (features):** [`programs`](../../../features/programs/SPEC.md) (`fetchPrograms`, `createProgram`,
> `updateProgram`, `deleteProgram`, `updateMembership`), [`program-memberships`](../../../features/program-memberships/SPEC.md)
> + [`invites`](../../../features/invites/SPEC.md) (`fetchMyInvites` / `fetchAllInvites` / `respondToInvite`),
> [`notifications`](../../../features/notifications/SPEC.md) 0.7.0 (the Inbox, unread counts, mark-read — D-NP1;
> remove one + Clear all — D-NP2),
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
**invites** and **notifications** in the **Inbox** (0.4.0), **creates** a new program, and opens an **account** menu
(profile / Inbox / notifications / password / appearance / announcements for global admins / privacy / support / sign-out). Used by **every authenticated user**; what's listed and which controls appear vary by
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
  · `/program/notifications` · `/program/password` · `/program/appearance` · `/program/announcements` (global admins)
  · `/privacy-policy` and `/support` in a new browser tab (the Privacy row 0.6.1 — privacy-policy D-ONE; Support 0.5.0) · `/login` (Sign Out). **Reached also via** `/programs?open=inbox` (opens the
  Inbox, then `router.replace("/programs")`) and the `rf:open-inbox` event when already here (D-NP1).
  All `/summary` + `/program/*` targets were **forward dependencies** at port time (since ported — F2).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | "My Programs" / "Manage your fitness programs" + two FAB buttons (Account, Program actions). The actions FAB shows the **server `badge`** (0.4.0, D-NP1 — was the pending-invites count), `99+` above 99; aria `Program actions, <n> new`. | programs/page.tsx (header) |
| Search (net-new 0.2.0, slimmed 0.2.1, D-N1) | Collapsed by default — a third `fab-button` circle (SearchIcon) in the header toggles an animated floating `input-shell` pill ("Search programs", autofocus, Esc closes) between the header and the list; closing clears the query. Client-side name filter (trimmed, case-insensitive `.includes`); page layout is unchanged while collapsed. No-match filter shows "No programs match your search"; an order-save error renders as a red line below. | programs/page.tsx (header search button + `AnimatePresence` pill + `visiblePrograms`) |
| Programs list | Loading / error / empty (`No programs yet`) states, then a `Reorder.Group` (framer-motion) of `ReorderableProgramRow`s — **drag-to-reorder by grip handle**, persisted per-member (D-N1). | programs/page.tsx (list section) |
| `ProgramCard` | Name + date range (stored days parsed as local days — D-C4) + **grip handle (net-new 0.2.0)** + `StatusBadge` (handle sits left of the badge, top-right); either invite/request status text (a `requested` card keeps its **Cancel request** button; an `invited` card has no actions — D-REL5) or `N members` (`1 member` at one — D-C4), then — on every card — a status-colored **time bar** (`progress_percent` — days in ÷ total days, D-BAR); **Edit/Delete** when `canManage`. Whole card clickable → select (when `canOpen`); the program name is also a real `<button>` inside the `h3` (the keyboard / screen-reader way in, disabled when `!canOpen`; the card div itself gets no role — D-REL7); drag ONLY by the handle (a 44 px grip). | programs/page.tsx (`ReorderableProgramRow` + `ProgramCard`) |
| Program Actions modal | A `Modal` ("Program Actions" · `Done`) with a segmented control: **`Inbox`** + **`Create`** (0.4.0, D-NP1 — was Invites / Create). Opens on Inbox if the badge > 0, else Create; picked when counts settle if they hadn't, unless the member already tapped a tab. | programs/page.tsx (actions modal) |
| Inbox tab (0.4.0) | `InvitesTab` first — `Invitations` (global admins `All invitations`, grouped by program with `To: …` + **Revoke**); an empty invite list renders nothing (the old empty box is gone) — then `InboxList` (`Notifications`: rows with an unread dot per visit, `Load more` / `Loading…`, empty `No notifications yet` · `Program updates, kudos, reminders and announcements show up here.`, relative times). The invites ErrorView is hidden while the list itself failed (one ErrorView). A failed Accept / Decline / Revoke shows its kit message as a red line above the list (D-REL3). While one runs its button reads `Accepting…` / `Declining…` / `Revoking…` and every invite button is disabled (D-REL7). 0.6.0: each notification row is a bordered card with two sibling buttons — open and a 44 px × (Remove notification); the Notifications heading carries Clear all while a notification is listed (ConfirmDialog kept open while it runs, Clearing…, a refusal inside it); offline / remove failures show under the heading (D-NP2). | programs/page.tsx (`InvitesTab`) + `components/notifications/InboxList.tsx` + `components/notifications/InboxItemRow.tsx` |
| `CreateProgramTab` | Name input + status `Select` (planned/active/completed) + start/end date inputs (defaults today / +3 months in the browser's **local** calendar day — D-C4; labels linked to their inputs) → `Create Program`. Start ≥ end shows `End date must be after the start date.` under the dates and disables the button; the server rejects it on create too (400, same copy — D-REL7). | programs/page.tsx:799-882 |
| Account modal | `AccountRow`s → `/program/profile` (0.5.0: titled with the member name, subtitle `@username`, the initials as its icon — D-REL7), **`Inbox`** (0.4.0: `<n> new` or `Invites and notifications`, a red count pill — opens the Inbox tab), **`Notifications`** (`/program/notifications`), `/program/password`, `/program/appearance`, **`Announcements`** (global admins, `/program/announcements`), **Privacy Policy** (`/privacy-policy` in a new tab, 0.6.1), **`Support`** (`Get help or contact us` — opens `/support` in a new tab, 0.5.0, D-REL7), and **Sign Out** (opens confirm). | programs/page.tsx (account modal) |
| `EditProgramModal` | Name / status / start / end → `Save` (`updateProgram`). Admin-only entry (Edit on a manageable card). Start ≥ end shows `End date must be after the start date.` and disables Save; a failed save stays in the modal with its message (D-REL7). | programs/page.tsx:393-409, 884-981 |
| Delete-program confirm | `ConfirmDialog` "Delete Program?" → `deleteProgram` (soft-delete); a failure shows in the floating action-error banner (D-REL7). | programs/page.tsx:411-426 |
| Sign-out confirm | `ConfirmDialog` "Sign Out" → `signOut()` → `/login`. | programs/page.tsx:428-439 |
| Decline-invite modal | "Decline Invitation" + a **Block future invites** checkbox → `respondToInvite(..., decline, block_future)`. A failed decline keeps the modal open with the kit message as a red line (D-REL3). | programs/page.tsx:441-493 |

**Data flow.** `programsQuery` (`fetchPrograms`) + `invitesQuery` (`fetchAllInvites` if global admin, else
`fetchMyInvites`) + (0.4.0) the unread counts (`["notifications","unread"]`) load on mount (`enabled: !!token`); `["programs"]` is first seeded from the per-member launch
cache (D-REL2). Mutations (`updateMembership`, `createProgram`, `updateProgram`, `deleteProgram`) invalidate
`["programs"]` on success; `respondToInvite` refreshes `["invites", isGlobalAdmin]` after every attempt (and
`["programs"]` after a successful accept — D-REL3). Selecting a card calls `saveActiveProgram({...})` then `router.push("/summary")`
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
| `updateMembership(token, {program_id, member_id, status})` | `PUT /api/program-memberships` | Card **Cancel request** (`removed`) on a `requested` card only. The card Accept / Decline for `invited` rows is retired (D-REL5). |
| `respondToInvite(token, {invite_id, action, block_future?})` | `PUT /api/program-memberships/invite-response` | Modal Accept / Decline / Revoke of `ProgramInvite` records. After a successful accept / decline (not revoke) the page marks that program's cached unread `program.invite_received` items read (`POST /notifications/inbox/read {ids}`, ≤ 100), else re-reads the counts (D-NP1). |
| `fetchUnreadCounts` / `fetchInbox` / `markInboxRead` (0.4.0) | `GET /api/notifications/inbox/unread-count` · `GET /inbox?limit&before` · `POST /inbox/read` | The badge + account-row count; the Inbox list (marks all read once its first fresh page shows; later arrivals by id) — notifications §3.5 / §3.9. |
| `removeInboxItem` / `clearInbox` (0.6.0) | `DELETE /api/notifications/inbox/:id` · `/inbox/all` | Optimistic (`useRemoveInboxItem` / `useClearInbox`; snapshot → restore); 404 = removed; counts → badge; both re-read the inbox when settled, and the mark-all waits while one runs (it never decides from a cached page whose read the edit cancelled) — notifications D-C32. |
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
| **global_admin** | **All** programs; Inbox tab = **"All invitations"** grouped by program, showing the invitee name, then their own notifications. **Badge = their own invites + unread notifications only** (0.4.0 — deliberate change; was every system invite). The `Announcements` account row. | Open any card; **Edit/Delete any** program; **Revoke** any invite; create programs; account menu. |
| **program admin** (`my_role=="admin"`, active) | Their programs; Inbox (**"Invitations"** + notifications). | Open + **Edit/Delete their own** program; Accept/Decline own invites; create programs; account menu. |
| **logger / member** (active) | Their programs; Inbox (**"Invitations"** + notifications). | Open active programs; Accept/Decline/Cancel own invites; create programs; account menu. **No Edit/Delete.** |
| **invited / requested** (not yet active) | The pending card (status text, no member counts). | Status text only; a `requested` card keeps **Cancel request**, an `invited` one is answered in Program Actions → Inbox (D-REL5). The card isn't openable (`canOpen=false`, dimmed) unless global admin. |

**`admin_only_data_entry`:** **not enforced on this page** — it's read from `GET /api/programs` and stored
into the active program (`saveActiveProgram`) so the *downstream* log pages can lock data entry for
non-admins (`isDataEntryLocked`). The hub shows/creates/edits programs regardless of the flag.

## 8. States & edge cases

- **Loading:** "Loading programs…" shows only while loading with nothing cached (a cached list renders at once
  and refreshes — D-REL2); invites tab "Loading invites…".
- **Empty:** "No programs yet — Create a program to get started." (members with zero memberships) — only on
  loaded data, never after a failure.
- **Error (D-REL1):** a programs failure with nothing to show → kit `ErrorView` ("Couldn't load this" + the kit
  message + Retry). A refresh failure over a shown (cached) list → the floating "Couldn't refresh · Retry" banner,
  hidden while the global offline banner shows. The invites tab uses `ErrorView`, never a banner. Invite responses
  show their kit message (D-REL3); ~~other mutation errors render inside their modal/tab and keep it open~~
  *(superseded at v0.5.0 by D-REL7)* — a failed **delete program** or **cancel request** shows in a dismissable
  floating error banner (priority: action error > stale); create / edit errors still render inside their tab /
  modal and keep it open.
- **Unauthenticated:** edge `middleware.ts` redirects to `/login?from=/programs` (D-C1); the page's
  `useAuthGuard` also pushes `/login` if bootstrap finishes with no token.
- **Expired token:** middleware passes through (D-C1); the API client refreshes first (token within 60 s of
  expiry) or after a 401, so a refreshable session self-heals on the first call. A failed refresh keeps the session
  (the cached list + stale banner); only `/auth/refresh` → `401 session_invalid` signs out, landing on
  `/login?reason=expired` (auth §3.1).
- **Last-admin guard:** removing the last active admin is blocked server-side (400) — the membership/leave
  mechanics live in the `program-memberships` feature, surfaced here only via the mutation error.
- **Forward nav:** selecting a program → `/summary`, and the Account rows → `/program/*` — all deferred at
  port time and **since built** (F2).
- Remove / Clear all offline → the failure line at once with the kit's offline words; no request, no dialog.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `rasifiters-webapp/src/app/programs/page.tsx`. `consumed_by = [web]`.** Cross-app: the iOS program-picker / admin-home renders the same hub concept natively; parity is audited at the iOS port. | `programs/page.tsx`; user answer (faithful). |
| **D-S1** | **Stance = faithful 1:1 port** of the legacy page (header + FABs, `ProgramCard`, the Actions/Account/Edit/Delete/SignOut/Decline modals, all queries + mutations + cache invalidation, `saveActiveProgram` → `/summary`) — verbatim except D-C3. | `programs/page.tsx:1-1022`; user answer (run 20). |
| **D-C1** | **Edge middleware (`src/middleware.ts`) = decode + expiry only — RESOLVES the standing HS256→ES256 open question.** The faithful HS256 verify can't validate Supabase **ES256** tokens (would redirect-loop every real session). The middleware is a **UX redirect gate**, not the security boundary: the Express backend JWKS-verifies (ES256) **every** API call and owns all authorization (CLAUDE.md auth model — not RLS). So the edge only decodes the token + checks `exp` (malformed → clear + bounce; expired → pass through for client refresh). No per-nav JWKS fetch; `JWT_SECRET` dependency dropped. | `apps/web/src/middleware.ts`; backend `middleware/auth.js`; CLAUDE.md auth model; user answer ("decode + expiry only"). |
| **D-C2** | **Dependency port = verbatim.** The page drags in 2 API modules (`lib/api/programs.ts`, `lib/api/invites.ts`) + 5 UI components (`ui/{PageShell,GlassCard,Modal,ConfirmDialog,StatusBadge}.tsx`) not in the foundation. Ported the **whole** api modules (shared infra later pages reuse) + **only the 5** UI components this page needs (not all 12 legacy `ui/` files — the rest belong to their own pages). Mirrors the foundation-port precedent; transitive dep `cn`/`format` already present. | our `apps/web` inventory; user answer ("port verbatim — whole api modules + needed UI"). |
| **D-C3** | **Reuse `useAuthGuard({ requireProgram: false })`** in place of the legacy inline login-redirect `useEffect`. The foundation already ships this guard; `requireProgram:false` because the hub is *where* you pick the active program (must not bounce to itself). Behavior-equivalent to the legacy redirect; removes ~7 lines of duplicated logic. | `apps/web/src/lib/hooks/use-auth-guard.ts`; `programs/page.tsx:51-55`; user answer ("faithful + reuse useAuthGuard"). |
| **D-REL1** | **Kit states (reliability Phase 3 C1, frontend-kit §5/§6).** `fromQuery` drives the list: "Loading programs…" only while loading; failed → `ErrorView` + Retry; stale (cached data, refresh failed) → floating "Couldn't refresh · Retry" banner (with bottom scroll room while it shows), hidden while the global offline banner shows (offline wins); "No programs yet" only on loaded data. The invites tab uses `ErrorView`, never a banner. | frontend-kit SPEC §5–§6; Phase 3 C1 plan step 23. |
| **D-REL2** | **Instant open.** `["programs"]` is seeded from the per-member launch cache (`lib/cache/launch-cache.ts`, schema v1) after auth bootstrap, then refreshed by the normal query. Invites stay live (a cached invite would 404 on accept). | DESIGN_BOARD §6.5 (D-9); C1 step 23; amendments A14. |
| **D-REL3** | **Invite responses.** `respondToInvite` refreshes the inbox after every attempt (`onSettled`) and `["programs"]` after a successful accept. A failed accept / decline / revoke shows `toAppError(error).message` as a red line in the invites tab and in the decline modal (the decline `mutateAsync` is caught; the modal stays open); cleared on the next attempt or when the inbox / decline modal opens. | invites §3.1; amendments A10 (parity P#8). |
| **D-REL4** | **Sign Out** (Account modal) calls `POST /auth/logout` for THIS device only (outcome ignored — only the user's own Sign out does; forced sign-out and logout-all don't), then runs the auth teardown: the store and active program are cleared (unless the shared store already holds another account), the launch cache is cleared and the query cache is emptied. | auth §3.1 rule 1; C1 step 7. |
| **D-REL5** | **F3 card actions retired for `invited` (invites D-C8).** An `invited` card shows its status text, dimmed, with no actions — invites are answered only in Program Actions → My Invites. A `requested` card keeps its **Cancel request** (`updateMembership` → `removed`), the same on all three surfaces. Invisible in prod (no such rows exist; nothing creates them). | invites D-C8; amendments A10. |
| **D-REL6** | **Offline = link + reachability (polish-1).** With nothing to show while offline (`useOnlineStatus` = `navigator.onLine` && not proven offline), the list shows the kit's offline `ErrorView` + Retry — never "Loading programs…", and a timeout reads offline. When the combined value comes back, failed reads (programs + invites) refetch (`useRefetchOnReconnect`). | polish-1 rules 5–6; frontend-kit D-KIT-13. |
| **D-REL7** | **Phase 4 polish (#22, #36, #37, #38, #41).** #22 card-action errors (delete program, cancel request) show in a dismissable `FloatingBanner variant="error"` (iOS parity; priority action error > stale; cleared on the next attempt); Accept / Decline / Revoke read `Accepting…` / `Declining…` / `Revoking…` with every invite button disabled while one runs, the decline modal reads `Declining…` (invites **D-C11**); the "+" `aria-label` is `Program actions` / `Program actions, N new`. #36 44 px targets (Done / Close / Cancel / Save, Edit / Delete, Cancel request, invite buttons, the grip; tab buttons `aria-pressed`) (frontend-kit **D-KIT-22**). #37 `Modal` dialog semantics / Escape / focus (frontend-kit **D-KIT-24**); the program name is a real `<button>` inside the `h3` (the card div gets no role / tabIndex; `stopPropagation` avoids a double select); create / edit labels linked by `htmlFor`. #38 the Create Program and Edit Program forms reject start ≥ end (`End date must be after the start date.`, button disabled); the server also answers 400 on create (programs **D-C4**). #41 Account modal: the profile row shows the member name + `@username` (signed-in-as), and a **Support** row (`Get help or contact us`) opens `/support` in a new tab (the phones open it externally). | `ec13107` + backend `b23f90c`; polish amendments PA1, PA12 |
| **D-N1** | **Net-new post-parity enhancement (user-requested 2026-07-05): drag-to-reorder + search.** Reorder via **framer-motion `Reorder.Group`/`Reorder.Item`** (already a dependency — no new package) with `dragListener={false}` + per-item `useDragControls`: drag ONLY by a ≡ grip handle (top-right, left of the StatusBadge; `touch-action: none` so mobile Safari drags instead of scrolling; pointer-down stopPropagation keeps card-tap intact). Order state is optimistic; `PUT /programs/order` fires on drag end with the full id list; error → inline message + invalidate (revert). Search is a client-side name filter; **reorder is disabled while searching** (handle hidden + `onReorder` guard) so filtered indices can never corrupt the full order. New programs land at the bottom (server: `NULLS LAST, start_date`). Cross-platform order sync is free — the server returns the saved order and clients render array order as-is. | programs feature SPEC 0.2.0 (D-N1); user decisions (grip handle · bottom placement). |
| **D-NP1** | **The Inbox replaces the invites tab (0.4.0; reliability-overhaul Phase 4 Pass A — notifications D-C30, invites D-C10).** Tabs `Inbox` / `Create`; the Inbox = invitations first (empty → nothing), then `InboxList`; one ErrorView when the list failed (R12). **Badge** = `unreadQuery.data?.badge ?? (isGlobalAdmin ? 0 : invites.length)` for every role, `99+` cap (W4 — a **deliberate change for global admins**, whose badge counted every system invite). Tab picked at open (W13): Inbox if badge > 0, else Create; deferred until the badge settles unless the member already tapped a tab. `?open=inbox` / `rf:open-inbox` open the Inbox (W5; the push / toast / Program-tab Inbox target). After answering an invite its notifications are marked read (C7.7). Account rows: `Inbox` with `<n> new` + count pill (W18), `Notifications`, `Announcements` (global admins). | notifications §3.5 / §3.9; NP amendments R1, R4, R7, R12; web plan W4, W5, W9, W13, W18. |
| **D-NP2** | Remove one + Clear all (notifications 0.7.0 D-C32, §3.9 rule 11) — × per row (web idiom; phones swipe), Clear all + ConfirmDialog (closeOnConfirm=false), optimistic with rollback, 404 = removed, offline at once; invitations untouched. | touch-up (a) plan rev 2; amendments (option A, item 3). |
| **D-BAR** | **The card bar = time elapsed** — the server's `progress_percent` (days in ÷ total days, 0–100; programs §4), the same source Android has read since its port. Until 0.6.2 it was `active_members / total_members`, faithful to the legacy, but the backend counts both the same way (programs F2), so the bar was always full. A deliberate fix of a legacy bug, not a restyle — the member-count text line is unchanged *(that line changed at v0.6.3 — D-C4)*. | `programs/page.tsx` (`ProgramCard`); programs F2; Android program-picker; user report 2026-10-14. |
| **D-C4** | **Parity sweep (2026-10-14; METHODOLOGY R9).** (a) **"N members" (sweep D3):** the card's member line reads `N members` (`1 member` at one) from `total_members` — was `{active} active / {total} total members`, two numbers the backend always returns equal ([programs](../../../features/programs/SPEC.md) F2); the same copy on iOS + Android. (b) **Local days (A1):** `formatDateRange` → `formatShortDate` parses a stored `YYYY-MM-DD` as that local day (`parseLocalDay`, `lib/format.ts`) — `new Date("2026-10-12")` is UTC midnight and read as Oct 11 west of UTC. (c) **Local today (A9):** Create Program's default start / end use `todayLocalISO()` / `toLocalISODate(+3 months)` — `toISOString()` gave the UTC date, tomorrow on a US evening; iOS + Android already default to the device's local day. (The `setMonth(+3)` month overflow stays.) | `programs/page.tsx` (`ProgramCard`, `CreateProgramTab`); `lib/format.ts`; parity-sweep plan D3 / A1 / A9. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client-side role from an unverified JWT decode** (`session.user.globalRole`) drives `canOpen`/`canManage`/the invites-tab variant — display/gating only; the backend re-verifies + re-authorizes every call. Same posture as the auth pages' F1. | `programs/page.tsx:39`, 224-227 | Kept (faithful) — not a security boundary. |
| ~~**F2**~~ **RESOLVED** | Forward navigation to then-unbuilt routes — selecting a program → `/summary`; Account rows → `/program/{profile,password,appearance,privacy}`. **All since ported; nothing 404s.** | `programs/page.tsx:164`, 349-376 | Closed — targets ported in later runs. |
| ~~**F3**~~ **RETIRED (web, C1)** | **Two distinct invite mechanisms** — the **card** Accept/Decline used `PUT /program-memberships` (for programs whose `my_status` is `invited`/`requested`), while the **modal** uses `PUT /invite-response` on `ProgramInvite` records. | `programs/page.tsx` (`ProgramCard`) vs the invites modal | Retired by D-REL5 (invites D-C8): the card Accept/Decline is gone; only the `requested` Cancel request remains on the card. |
| **F4** | **Edge middleware does not verify the token signature** (D-C1, decode + expiry only). A forged/garbage token reaches the page, but every API call it makes 401s. | `apps/web/src/middleware.ts` (`verifyJwt`) | Kept (deliberate, D-C1) — the backend is the security boundary. |
| **F5** | **Vestigial-here api fns + an unused `Program` field.** The whole `programs.ts`/`invites.ts` modules are ported (D-C2) but this page uses only a subset; `Program.enrollments_closed` is in the type yet not returned by `GET /api/programs`. | `lib/api/programs.ts:12`, 45-154 | Kept — `enrollments_closed` is a legacy vestige; the extra fns light up on later pages. |
| **F6** | **No client-side rate limiting** on create/update/delete/invite actions (consistent with the auth pages' F4). | `programs/page.tsx` mutations | Kept (faithful) — throttling belongs server-side. |
| **F7** | `components/notifications/InboxList.tsx` ~215 lines (> ~200) after 0.6.0 — the row + time label already moved to InboxItemRow.tsx; accepted. | `components/notifications/InboxList.tsx` | Accepted. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.6.3 | 2026-10-14 | **D-C4 — parity sweep (METHODOLOGY R9; web `88ea9ff`).** The card's member line reads `N members` / `1 member` (D3); stored dates parse as local days (A1); Create Program defaults to the local today / +3 months (A9). §4 + §9. |
| 0.6.2 | 2026-10-14 | **D-BAR — the card bar shows time elapsed** (`progress_percent`, Android parity) instead of `active / total` members, which the backend always returns equal (a permanently full bar, faithful to the legacy). Found by the user; §4 + §9. |
| 0.6.1 | 2026-10-13 | **Privacy Policy row → the public page** (privacy-policy D-ONE): opens `/privacy-policy` in a new tab, like Support and the phones; the in-app `/program/privacy` copy is retired. |
| 0.6.0 | 2026-10-13 | **D-NP2 — Phase 4 touch-up (a): remove one + Clear all** (notifications 0.7.0, D-C32). Each notification row is a bordered card with an open button and a sibling 44 px × (`Remove notification`, new `InboxItemRow.tsx`, which also takes the time label); `Clear all` on the Notifications heading while a notification is listed → `ConfirmDialog` (`Clear all notifications?`, kept open while it runs, `Clearing…`, a refusal inside it). Both optimistic with rollback (`useRemoveInboxItem` / `useClearInbox`), 404 = removed, the server's counts feed the badge, both re-read the inbox when settled; the mark-all waits while an edit runs. Offline fails at once (no request, no dialog); failures under the heading. Invitations untouched. §4/§6/§8/§9/§10 (F7) updated. |
| 0.5.0 | 2026-10-13 | **D-REL7 — Phase 4 polish (`ec13107`).** #22 delete-program / cancel-request errors in a dismissable floating banner (supersedes the §8 "inside their modal" line for those two), `Accepting…` / `Declining…` / `Revoking…` with invite buttons locked, "+" label `Program actions, N new`; #36 44 px targets; #37 dialog semantics, the program name a real button, linked labels; #38 create + edit date check (server 400 on create); #41 signed-in-as `@username` profile row + Support row (new tab). |
| 0.4.0 | 2026-10-13 | **D-NP1 — Phase 4 Notifications (Pass A, `b2ea09b`, live).** The Program Actions modal's tabs are `Inbox` / `Create` (invitations first, then the notification list; the empty-invites box removed); the FAB badge is the server `badge` for every role (deliberate change for global admins) with the deferred tab pick; `?open=inbox` / `rf:open-inbox`; answering an invite marks its notifications read; account rows `Inbox` (count), `Notifications`, `Announcements` (global admins). §1/§3/§4/§6/§7 updated. |
| 0.3.2 | 2026-10-13 | Phase 4 quick wins: the list fails after the first try and Retry (list + invites tab) uses the kit `retryNow`, so it works mid-retry (D-KIT-18, #6); the invites tab reads offline while offline; create / edit / order errors go through `toAppError` — "Couldn't save program order. <kit message>" (D-KIT-19, #8). |
| 0.3.1 | 2026-10-13 | Polish-1 — D-REL6 (offline with no data → kit offline `ErrorView`, never a spinner; failed reads refetch when the combined online value returns). |
| 0.3.0 | 2026-10-13 | Reliability Phase 3 C1 — D-REL1 (kit states: `ErrorView`, stale banner, offline wins, "No programs yet" only on loaded data, invites tab `ErrorView`) · D-REL2 (instant open from the per-member launch cache; invites live) · D-REL3 (invite responses refresh the inbox `onSettled`; accept / decline / revoke errors shown) · D-REL4 (Sign Out = teardown + `/auth/logout` this device) · D-REL5 (F3 retired for `invited` cards; `requested` keeps Cancel request). §4/§6/§7/§8 updated; F3 marked retired. |
| 0.2.1 | 2026-07-05 | **Search UI slimmed (user feedback):** the always-visible `GlassCard` search block is replaced by a collapsed header magnifier (`fab-button` circle, matching the existing FABs) that expands an animated floating `input-shell` pill (framer-motion `AnimatePresence`; autofocus; Esc/toggle closes + clears). The page renders identically to pre-0.2.0 while search is collapsed. Filter/reorder-disable semantics unchanged. |
| 0.2.0 | 2026-07-05 | **Net-new post-parity (D-N1): per-member drag-to-reorder + program search.** Program cards reorder by a ≡ grip handle (framer-motion `Reorder`, `dragListener=false` + `useDragControls`; handle left of the StatusBadge), order persisted via `saveProgramOrder` → `PUT /api/programs/order` (optimistic, invalidate-on-error revert; last-write-wins). "Search programs" `GlassCard`/`input-shell` filter above the list (client-side, name `.includes`); reorder disabled while searching; "No programs match your search" state. Pairs with `programs` feature 0.2.0 and iOS `program-picker` 0.2.0. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 20) — the **sixth web page spec** and the **first protected route**. Documents the `/programs` hub: the `My Programs` list of `ProgramCard`s (status/progress/member-counts + invite Accept/Decline + admin Edit/Delete), the Program Actions modal (Invites + Create tabs), the Account modal (5 rows), and the Edit/Delete/SignOut/Decline confirm modals. Consumes `programs` + `program-memberships` + `invites` + `auth`. Decisions: **D-REF** (`consumed_by=[web]`; iOS hub mirrors later) · **D-S1** (faithful 1:1) · **D-C1** (edge middleware = decode + expiry only — **resolves the HS256→ES256 open question**; backend JWKS-verifies every call, so security unchanged) · **D-C2** (ported the dragged-in deps verbatim — whole `programs.ts`/`invites.ts` api modules + the 5 `ui/` components the page uses) · **D-C3** (reuse `useAuthGuard({requireProgram:false})` for the inline redirect). Flagged F1–F6 (client JWT-decode role; forward-nav to unbuilt routes; dual invite mechanisms; edge gate doesn't verify signatures; vestigial-here api fns + `enrollments_closed`; no client rate-limit). Ported `apps/web/src/app/programs/page.tsx` + `lib/api/{programs,invites}.ts` + `components/ui/{PageShell,GlassCard,Modal,ConfirmDialog,StatusBadge}.tsx`; rewrote `src/middleware.ts` (decode+expiry). `npm run build` ✓ (`/programs` prerendered, 11.3 kB; Middleware 27.2 kB active). |
