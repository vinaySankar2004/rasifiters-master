# Page: `members/invite` (web) — program-admin invite-by-username form (members sub-route 3 of 8)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.1.0 · **App:** `web` (Next.js App Router)
> **Route:** `/members/invite` — the **invite-a-member form** reached by the `/members` landing's "Invite Member"
> pill (program-admin / global_admin only). A single `@`-prefixed username `<input>` + privacy info-banner →
> `sendProgramInvite`. **3rd** of the eight deferred `/members` sub-routes
> (`list`/`detail`/`invite`/`metrics`/`history`/`streaks`/`workouts`/`health`); does **not** close the group.
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/members/invite/page.tsx` (97 lines).
> **Consumes (features):** [`invites`](../../../../features/invites/SPEC.md)
> (`POST /program-memberships/invite` — `authenticateToken`; already mounted) via the already-ported
> `lib/api/members.ts` `sendProgramInvite`; [`auth`](../../../../features/auth/SPEC.md) (`useAuthGuard`).
> **Cross-app:** `consumed_by = [web]` — iOS sends invites natively; parity audited at the iOS port.
> **Stance:** faithful 1:1 port **+ 2 cleanups** (D-C1 tokenize the success box color; D-C2 clear stale error on
> field edit). **No new dependency, zero backend work, no feature bump.** The privacy-safe **swallow-errors-as-
> success** behavior is kept (load-bearing intent) and flagged §10. Oddities flagged §10.

---

## 1. What it is + who uses it

The **invite-by-username form** for the signed-in user's active program — a single `@`-prefixed username `<input>`,
a privacy info-banner, and a "Send Invitation" button that calls `sendProgramInvite`. **program-admin /
global_admin only** — every other role is redirected to `/members` on mount (`members/invite/page.tsx:20-24`). It
is the form behind the `/members` landing's "Invite Member" pill (gated identically — `canInvite = isProgramAdmin`,
`members/page.tsx:48`).

## 2. Why it exists

The only web surface where a program admin grows the program — type an existing user's exact username and send a
program invitation (the invitee later accepts via their own pending-invites surface). It is the entry point of the
`invites` feature's accept/decline lifecycle.

## 3. Route / location

- **App:** `web` (Next.js 14 App Router).
- **Path:** `/members/invite` (`apps/web/src/app/members/invite/page.tsx`). No `force-dynamic` (no search params —
  faithful).
- **Reached from:** the `/members` landing's "Invite Member" pill — **program-admin / global_admin only**
  (`members/page.tsx:48`, `:243`).
- **Back:** `PageHeader backHref="/members"`.
- **Leaves to:** stays on the page after a send (shows the success box in place); `/members` on the non-admin
  redirect.

## 4. Contents / sections

1. **`PageHeader`** — title "Invite Member", subtitle "Enter the exact username to send a program invitation.",
   `backHref="/members"` (`members/invite/page.tsx:52-56`).
2. **Form card** (`modal-surface rounded-3xl p-6`, `:58`):
   - **Username field** — a `field-shell` row with a leading `@` glyph + an `<input>` bound to `username`
     (`:59-71`).
   - **Privacy info-banner** (`info-banner`, `:73-76`) — "The user must already have an account. Invitations are
     privacy-safe, so we won't confirm whether a username exists."
   - **Error line** — `errorMessage` in `text-rf-danger` (only network errors reach here, F1) (`:78`).
   - **Success box** (`:80-84`) — "Invitation sent." — **D-C1** tokenized `bg-rf-success/10 text-rf-success`
     (legacy `bg-green-50 text-green-600`).
   - **Send Invitation** button (`bg-rf-accent`, `disabled` while `!canSubmit || isSending`) → `handleSend`
     (`:86-93`).

## 5. Components + which shared features it consumes

- **Chrome (all already ported):** `PageShell`, `PageHeader` (→ `BackButton`) — landed with earlier runs; the
  username field / banner / buttons are plain markup using existing `globals.css` classes (`modal-surface`,
  `field-shell`, `info-banner`).
- **New dep:** **none** — `sendProgramInvite` already lives in `lib/api/members.ts:204` (ported with the `/members`
  landing run 22, "vestigial-here"); this page is its belated consumer. The sweep ports only the page file. (Run-39
  found the read fn in a *different* family's module; here the fn is in this page's **own** members family — the
  import path is still the source of truth, sized per-function.)
- **Hooks/api:** `useAuthGuard` (`auth`), `sendProgramInvite` (`lib/api/members.ts`) — all already ported.

## 6. Data / API

- **`POST /api/program-memberships/invite`** ← `sendProgramInvite(token, programId, username.trim())`, body
  `{ program_id, username }` (`members.ts:204-210`). No React Query — a one-shot imperative call inside `handleSend`
  with local `isSending`/`errorMessage`/`showSuccess` state (no mutation hook — faithful).
- **Zero backend work, NO feature bump** — the route is already mounted (`server.js:69`, `authenticateToken`-only)
  and the program-admin / global_admin / self authz + the live `program.invite` notification emit live in
  `inviteService.sendInvite` (`:16-26`), shipped with [`invites`](../../../../features/invites/SPEC.md). The api fn
  already ported.

## 7. Role-based view rules

`useAuthGuard()` default (`requireProgram: true`) — no token → `/login`, no active program → `/programs`. **Plus a
program-admin / global_admin mount redirect** (`:20-24`): `if (!isProgramAdmin) router.push("/members")`, where
`isProgramAdmin = program?.my_role === "admin" || session?.user.globalRole === "global_admin"`.

| Role | What they see / can do |
|------|------------------------|
| **global_admin** | The full form — type a username, send an invitation. |
| **program admin** (`my_role==="admin"`) | The full form — same as global_admin. |
| **logger** | **Redirected to `/members`** on mount — no access (client gate, F2). |
| **member** | **Redirected to `/members`** — no access. |

**`admin_only_data_entry`: N/A** — inviting members is **role-gated** (program admin / global_admin), not
workout/health **data entry**; the lock gates the `/summary` log forms, not this form (run-31/40 read-vs-write-lock
axis: the lock follows whether the page does *logging*, not whether it writes).

**Entry-path consistency (not an asymmetry):** the landing's "Invite Member" pill is gated identically
(`canInvite = isProgramAdmin`, `members/page.tsx:48`) — so the pill and the page's redirect agree (unlike run-39's
`members/list`, where the pill showed for `!canViewAs` roles the page then degraded).

## 8. States & edge cases

- **Idle** — empty username; Send button `disabled` (`!canSubmit`, where `canSubmit = username.trim().length > 0 &&
  !!programId`).
- **Sending** — `isSending` true: button reads "Sending…" and is `disabled`; re-entrancy guarded
  (`if (!canSubmit || isSending) return`).
- **Success** — `showSuccess` true: the green "Invitation sent." box shows; `username` cleared. Stays on the page
  (no nav).
- **Network error** — only an error message containing "network" surfaces "Network error. Please try again."
  (`:39-40`).
- **Any other error → shown as SUCCESS (F1)** — a 4xx/5xx (username not found, already invited, blocked, 403) is
  **swallowed and rendered as "Invitation sent."** with the field cleared (`:42-43`). Deliberate privacy-safety
  (matches the info-banner) — kept faithful.
- **Stale error** — cleared on field edit (D-C2) or the next send.
- **Non-admin** — redirected to `/members` before the form is usable (F2).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | Faithful 1:1 port of legacy `members/invite/page.tsx` (97 lines). `consumed_by = [web]` — iOS invites natively. | `rasifiters-webapp/src/app/members/invite/page.tsx` |
| **D-SCOPE** | This page only — **3rd of the 8 deferred `/members` sub-routes**; does **not** close the group (`metrics`/`history`/`streaks`/`workouts`/`health` still deferred). | `COVERAGE.md` `/members` row |
| **D-DEPS** | **No new dependency** — `sendProgramInvite` (`lib/api/members.ts:204`) + all chrome already ported; the sweep ports only the page file. Sized per-function: the fn is in this page's own members family (cf. run-39's cross-family draw). | `apps/web/src/lib/api/members.ts:204` |
| **D-S1** | **Faithful otherwise** — same `isProgramAdmin` gate + mount redirect, same `canSubmit`, same imperative `handleSend` (local state, no React Query), same privacy-safe catch (F1), same markup/`globals.css` classes. | `members/invite/page.tsx:13-93` |
| **D-C1** | **Tokenize the success box** — `bg-green-50 text-green-600` → `bg-rf-success/10 text-rf-success` (the lone untokenized color; the error line already uses `rf-danger`). Theme-aware; matches `members/list` run-39 D-C1 / `members/detail` run-40 D-C2 selective-tokenize. | `members/invite/page.tsx:81`; `tailwind.config.ts:20` |
| **D-C2** | **Clear stale error on field edit** — the `onChange` clears `showSuccess` but not `errorMessage`; also clear `errorMessage` so a prior network error doesn't linger until the next send (matches runs 27/28/40 D-C3). | `members/invite/page.tsx:64-67` |
| **D-STANCE** | Faithful 1:1 **+ D-C1, D-C2**. No backend work, no feature bump (route + api fn already shipped). | user, this run |

## 10. Open questions / flagged characteristics (kept as-is)

- **F1 — swallow-errors-as-success (load-bearing privacy intent).** The catch block (`:37-44`) surfaces an error
  **only** when the message contains "network"; **every other failure** (username not found, already a member,
  already invited, blocked, a 403) is silently rendered as "Invitation sent." with the field cleared. This is
  deliberate — the page won't confirm whether a username exists (the info-banner states it). Kept faithful; a
  rebuild-cleanup candidate only if the privacy guarantee is ever relaxed.
- **F2 — client redirect is the only client gate.** The program-admin / global_admin redirect (`:20-24`) is a
  client JWT-decode + `program.my_role` check; the backend `inviteService.sendInvite` independently enforces the
  403 "Admin privileges required for this program." (`inviteService.js:21-26`) — the real authorization boundary.
  Faithful.
- **F3 — no inline username validation / no existence check.** The only client gate on send is non-empty +
  `programId` present; format/existence are not checked client-side (by design — F1's privacy posture). Faithful.
- **F4 — one-shot imperative call, no React Query.** Unlike the read sub-routes, the send is a plain `await` with
  local `isSending`/`errorMessage`/`showSuccess` — no mutation hook, no cache invalidation (there's no member list
  on this page to refresh). Faithful.
- **F5 — stays on the page after success.** No `router.push`/`router.back` on success (the success box shows in
  place); the only nav off the page is the `PageHeader` back link or the non-admin redirect — so **no nav cleanup**
  (already deterministic; cf. run-40 F: nothing to clean). Faithful.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-29 | Initial faithful port of `members/invite` (members sub-route 3 of 8) — invite-by-username form + privacy-safe send; D-C1 tokenize success box, D-C2 clear stale error on edit. No new dependency, zero backend work, no feature bump. |
