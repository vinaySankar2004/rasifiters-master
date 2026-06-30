# Page: `program/profile` (web) — my profile (program-settings sub-route 3 of 6)

> **Status:** 🏗️ built (ported to `apps/web/`) · **Version:** 0.2.0 · **App:** `web` (Next.js App Router)
> **Route:** `/program/profile` — the logged-in user's **own "My Profile" account page** (first/last name +
> gender + **email view/change** + Delete Account), the third of the six deferred `/program/*` settings sub-routes (reached from the
> [`program`](../SPEC.md) hub's "My Account" row). **Despite living under `/program/*` it is NOT a
> program-admin setting** like [`edit`](../edit/SPEC.md)/[`roles`](../roles/SPEC.md) — it edits the *requester's
> own member record* and is therefore available to **every** role (no admin redirect).
> **Reference impl (legacy):** `../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx`.
> **Consumes (features):** [`members`](../../../../features/members/SPEC.md) (`fetchMemberProfile` → `GET
> /members/:id`; `updateMemberProfile` → `PUT /members/:id` — the backend service enforces the
> own-profile-or-global_admin 403 and partial-updates `first_name`/`last_name`/`gender`), and
> [`auth`](../../../../features/auth/SPEC.md) (`deleteAccount` → `DELETE /auth/account` — the cross-feature
> member-deletion cascade; plus `useAuthGuard` + `setSession`/`signOut`).
> **Cross-app:** the iOS **Settings → My Profile** screen renders the same form natively; parity audited at the
> iOS port.
> **Stance:** faithful 1:1 port **+ small cleanups** (D-C1 tokenize the success color; D-C2 clear the stale
> success/error message on field edit) **+ v0.2.0 deviations** (D-GENDER gender now uses the shared `Select`
> + a shared `GENDER_OPTIONS`, backed by a widened `members.gender` column; D-EMAIL net-new email view +
> password-confirmed direct change). Oddities flagged §10.

---

## 1. What it is + who uses it

The **personal account-profile form** for the signed-in member. It shows an avatar pill (initials), the
member's name, `@username`, and a role label; an editable **First name** / **Last name** pair and a **Gender**
picker (the shared `Select`); a **Save changes** button; an **Account email** block (current email +
password-confirmed **Change email** form); and — for everyone **except** a global admin — a **Delete Account**
section. Used by **any authenticated user** to edit their own profile; there is **no admin gate and no
redirect** ([profile/page.tsx:18-20](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L18)).
The backend `updateMember` independently enforces that you can only update your own profile (or global_admin
anyone).

## 2. Why it exists

To let each member maintain their own display name + gender and, if they choose, permanently delete their
account. It is the surface behind the hub's "My Account" row. The Delete path runs the same cross-feature
member-deletion cascade wired for `members DELETE /:id` / auth `DELETE /account` (destroy outbound invites +
actored notifications, `handleMemberExit` per membership, notify remaining members, destroy the member, then
best-effort Supabase `admin.deleteUser`).

## 3. Route / location

- **App:** `web`. **Route:** `/program/profile`. **Protected** — under the `middleware.ts` matcher (unauth edge
  request → `/login`). `useAuthGuard({ requireProgram: false })` — **no active program required** (you can edit
  your profile with no program selected); there is **no role redirect** (every role may edit own profile).
- **Reached via:** the [`program`](../SPEC.md) hub's "My Account" row, and the account menu elsewhere
  (`router.push("/program/profile")`).
- **Chrome:** `PageShell maxWidth="3xl"` + `PageHeader` (title "My Profile", `backHref = program?.id ?
  "/program" : "/programs"` — back to the hub if a program is active, else the programs list). No bottom nav
  (it is a sub-route, not a workspace tab).
- **Leaves to:** `/program` or `/programs` on Back; `/login` after a successful account deletion.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Header | `PageHeader` "My Profile" + Back → `/program` or `/programs`. | [profile/page.tsx:111-112](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L111) |
| Identity card | Avatar pill (`initials`), `First Last` (or `memberName`), `@username`, role label. | [profile/page.tsx:114-126](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L114) |
| Name fields | First name / Last name inputs (`input-shell`), 2-up on `sm`. | [profile/page.tsx:128-147](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L128) |
| Gender | Shared **`Select`** (D-GENDER) — "Select gender" placeholder + the shared `GENDER_OPTIONS` (`lib/genders.ts`). | [apps/web/src/app/program/profile/page.tsx](../../../../../../apps/web/src/app/program/profile/page.tsx) |
| Error / success | Inline `rf-danger` error line; **`rf-success`** "Profile updated successfully." (D-C1). | [apps/web/src/app/program/profile/page.tsx](../../../../../../apps/web/src/app/program/profile/page.tsx) |
| Save | "Save changes" (`bg-rf-accent text-black`); disabled unless both names present + not pending. | [apps/web/src/app/program/profile/page.tsx](../../../../../../apps/web/src/app/program/profile/page.tsx) |
| Account email (D-EMAIL) | Current email + **Change email** toggle → new-email + current-password inputs → "Update email" (`PUT /auth/email`). Inline `rf-danger`/`rf-success`. | [apps/web/src/app/program/profile/page.tsx](../../../../../../apps/web/src/app/program/profile/page.tsx) |
| Delete Account | **Hidden for global_admin.** Danger-outline button → `ConfirmDialog`. | [apps/web/src/app/program/profile/page.tsx](../../../../../../apps/web/src/app/program/profile/page.tsx) |

## 5. Components + consumed features

- **Shared UI:** `PageShell`, `PageHeader`, `GlassCard`, `ConfirmDialog`, **`Select`** (gender, D-GENDER) — all
  already ported. `roleLabel`/`userInitials` derivations stay co-located; the gender options are the shared
  `GENDER_OPTIONS` (`lib/genders.ts`, also consumed by create-account).
- **Hooks/state:** `useAuthGuard({ requireProgram: false })` (session/program/token); `useAuth` (`setSession`,
  `signOut`); `useQuery`/`useMutation`/`useQueryClient` (React Query); `initials` (`lib/format.ts`).
- **Consumed features:** [`members`](../../../../features/members/SPEC.md) (`fetchMemberProfile`,
  `updateMemberProfile`, `MemberProfile`), [`auth`](../../../../features/auth/SPEC.md) (`deleteAccount`,
  `useAuthGuard`, `setSession`, `signOut`).

## 6. Data / API

- **`GET /members/:id`** via `fetchMemberProfile(token, session.user.id)`
  ([lib/api/members.ts:86](../../../../../../apps/web/src/lib/api/members.ts#L86)) — the member record; the page
  splits `member_name` into first/last and seeds `gender`. **v0.2.0:** the response now also carries the
  primary **`email`** (resolved from `member_emails`, `is_primary`), shown read-only in the Account email block.
- **`PUT /members/:id`** via `updateMemberProfile(token, id, { first_name, last_name, gender })`
  ([lib/api/members.ts:90](../../../../../../apps/web/src/lib/api/members.ts#L90)). **Already mounted**
  ([apps/backend/routes/members.js:45](../../../../../../apps/backend/routes/members.js#L45) →
  `memberService.updateMember`). The service: 404 if missing → **403 unless own-profile or global_admin** →
  partial-updates the three provided keys → returns `{ message, member_name, first_name, last_name }`. On
  success the page mirrors the new `member_name` into both the `["account","profile",id]` cache and the
  auth-provider session.
- **`DELETE /auth/account`** via `deleteAccount(token)`
  ([lib/api/auth.ts:91](../../../../../../apps/web/src/lib/api/auth.ts#L91)). **Already mounted**
  ([apps/backend/routes/auth.js:112](../../../../../../apps/backend/routes/auth.js#L112)) — runs the
  single-sourced `utils/programMemberships.cascadeMemberDeletion` + best-effort Supabase `admin.deleteUser`.
  On success the page `signOut()`s and routes to `/login`.
- **`PUT /auth/email`** (net-new, D-EMAIL) via `changeEmail(token, newEmail, password)`
  ([lib/api/auth.ts](../../../../../../apps/web/src/lib/api/auth.ts)). Mounted at
  [apps/backend/routes/auth.js](../../../../../../apps/backend/routes/auth.js) → `authService.changeEmail`:
  re-auths the **current password** (Supabase `signInWithPassword`), rejects a no-op / in-use email, then does a
  **direct** change (Supabase `admin.updateUserById { email, email_confirm:true }` + the primary `member_emails`
  row, compensating-revert on DB failure). No verification email; the existing session JWT stays valid. On
  success the page invalidates the `["account","profile",id]` query so the displayed email refreshes.
- **Backend work this run** — `getMemberById` now returns `email`; net-new `PUT /auth/email`; `members.gender`
  column widened to `varchar(32)` (migration `apps/backend/sql/003_widen_gender_column.sql`). Feature bumps via
  `git-version` (`members` + `auth`).

## 7. Role-based view rules

| Role | Access | Notes |
|------|--------|-------|
| **global_admin** | Edits own profile. **Delete Account hidden.** | `roleLabel` = "Global Admin"; `!isGlobalAdmin` gate hides Delete ([profile/page.tsx:183](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L183)). |
| **program admin** | Edits own profile + Delete Account. | `roleLabel` = "Program Admin" (`program.my_role === "admin"`). |
| **logger** | Edits own profile + Delete Account. | `roleLabel` = "Member" (no logger-specific label). |
| **member** | Edits own profile + Delete Account. | `roleLabel` = "Member". |

- **No admin redirect** — unlike `edit`/`roles`, every role lands here and edits *their own* record; the backend
  403 only fires if a non-global_admin somehow targets a different member's id (not reachable from this UI,
  which always passes `session.user.id`).
- **`admin_only_data_entry` effect:** **N/A** — a personal-profile form is not a workout/health data-entry
  surface; the toggle (set on `/program/edit`) gates the log forms on the workspace tabs, not this page.
- The role label is derived from the decoded JWT (recurring F1); the **real** update authorization is the
  backend own-profile-or-global_admin 403.

## 8. States & edge cases

- **Loading:** the form renders immediately seeded from the auth session; the `GET /members/:id` query then
  hydrates first/last/gender via a `useEffect` (no skeleton — faithful).
- **Save disabled:** when either name is blank or a save is in flight (`canSave`).
- **Save success:** `rf-success` "Profile updated successfully." line; the identity card + session name update
  in place. The message is **cleared when the user next edits a field** (D-C2; legacy left it lingering).
- **Save error:** inline `rf-danger` line (`error.message` or fallback); also cleared on next field edit (D-C2).
- **Delete:** `ConfirmDialog` (danger) → `DELETE /auth/account` → `signOut()` → `/login`; an error surfaces in
  the same `rf-danger` line and the dialog can be retried/closed.
- **Single-word name:** the split yields an empty last name → Save stays disabled until a last name is entered
  (faithful, F3).
- **No active program:** allowed — `requireProgram: false`; Back then targets `/programs`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | `consumed_by = [web]` for this page spec; the iOS Settings → My Profile screen mirrors the same form and is audited at the iOS port. No cross-app divergence to resolve (web-only page spec). | legacy `program/profile/page.tsx`; iOS `Features/Settings/` |
| **D-SCOPE** | **This page only.** Port `/program/profile` faithful 1:1; the other three `/program/*` sub-routes (password/appearance/privacy) remain their own deferred rows. | per-page cadence; [`program` SPEC §3](../SPEC.md) |
| **D-DEPS** | **No new dependency** — `PageShell`/`PageHeader`/`GlassCard`/`ConfirmDialog`, `fetchMemberProfile`/`updateMemberProfile`, `deleteAccount`, `initials` are all already ported (the run-26-or-purer shape). The members api fns were ported "vestigial-here" with the `members` landing page (run 22); this page is their consumer. | [lib/api/members.ts](../../../../../../apps/web/src/lib/api/members.ts); `components/ui/` |
| **D-S1** | **Faithful 1:1** otherwise — same identity card, native gender `<select>`, name-split seed, own-id `PUT /members/:id`, session+cache mirror, global_admin-hides-Delete gate, and `ConfirmDialog` delete → `signOut` → `/login`. | [profile/page.tsx](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx) |
| **D-C1** | **Tokenize the success color** — `text-emerald-600` → `text-rf-success` (`#2fb861` light / `#36c56f` dark) so the success line is theme-aware and symmetric with the `rf-danger` error line. (The **avatar chip** `bg-amber-100`/`text-amber-600` + the amber role label have **no clean `rf` token** — amber-100 has no tint token and amber-600 ≠ `rf-accent`/`rf-warning` — so they stay faithful + flagged, F2.) | [profile/page.tsx:167](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L167); `globals.css` `--rf-success` |
| **D-C2** | **Clear the stale success/error message on field edit** — reset `showSuccess`/`errorMessage` when First name / Last name / Gender changes, so a prior "Profile updated successfully." doesn't linger over freshly-edited-but-unsaved fields. Legacy only cleared them at the *next* Save click ([profile/page.tsx:35,166,173-176](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L35)). | legacy lingering `showSuccess` |
| **D-GENDER** | **Gender uses the shared `Select` + a shared `GENDER_OPTIONS`** (`lib/genders.ts`, also adopted by create-account so the two pages can't drift), replacing the faithful native `<select>`. The user reported it "looked wrong" — the native control clashed with the styled inputs. Backed by **widening `members.gender` `varchar(10)` → `varchar(32)`** (migration 003): the legacy column couldn't store `"Prefer not to say"` (17 chars), so that option errored on save — a genuine latent bug fixed here. | user request; [Select.tsx](../../../../../../apps/web/src/components/Select.tsx); `sql/003_widen_gender_column.sql` |
| **D-EMAIL** | **Net-new email view + change** — has no legacy equivalent (email was fixed at registration). Chosen model: **direct** change (applies immediately, `email_confirm:true` — consistent with register/createMember; email delivery is limited per the auth-recovery work) and **password-confirmed** (re-auth the current password — a safeguard for a sensitive change). `getMemberById` returns the primary email; `PUT /auth/email` keeps Supabase `auth.users` + `member_emails` in sync. iOS `MyProfileView` port is a follow-up. | user request; [authService.changeEmail](../../../../../../apps/backend/services/authService.js); auth SPEC |

## 10. Flagged characteristics (kept as-is)

- **F1 — role label + Delete-gate from JWT-decoded role** ([profile/page.tsx:24-29,183](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L24)).
  `isGlobalAdmin`/`roleLabel` derive from the decoded JWT (`session.user.globalRole` + `program.my_role`); the
  Delete Account button is hidden for global_admin **client-side only**. Recurring across the rebuild. Kept
  (the authoritative update guard is the backend 403; see F4 for the delete side).
- **F2 — avatar chip + role label use literal Tailwind amber** ([profile/page.tsx:116,124](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L116)).
  `bg-amber-100 text-amber-600` (avatar) and `text-amber-600` (role label) are fixed light-palette colors with
  no clean `rf` token to map onto (unlike the success line, D-C1). Kept verbatim; rebuild-cleanup candidate if
  a branded-tint token is introduced.
- **F3 — name round-trips through a space-split heuristic** ([profile/page.tsx:47-50](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L47)).
  `first = parts[0]`, `last = parts.slice(1).join(" ")` — a single-word `member_name` yields an empty last name
  and `canSave` then blocks Save until one is typed; multi-word last names re-join correctly. Faithful.
- **F4 — Delete Account is gated only on the client; the backend `DELETE /auth/account` is `authenticateToken`
  only** ([profile/page.tsx:183](../../../../../../rasifiters-webapp/src/app/program/profile/page.tsx#L183);
  [auth.js:112](../../../../../../apps/backend/routes/auth.js#L112)).
  Hiding the button from a global_admin is a UI convention; the route itself would delete any authed caller's
  own account. Faithful (matches legacy + the auth SPEC's cascade design).
- **F5 — no client-side rate-limit / debounce** on Save or Delete beyond the `isPending` disable. Recurring
  across the rebuild. Kept.

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-06-30 | **Gender fix + net-new email view/change.** **D-GENDER**: gender now uses the shared `Select` + a shared `GENDER_OPTIONS` (`lib/genders.ts`, also adopted by create-account), replacing the native `<select>` that "looked wrong"; backed by widening `members.gender` `varchar(10)`→`varchar(32)` (migration `003`) so `"Prefer not to say"` (17 chars) stops erroring on save. **D-EMAIL**: net-new Account email block — `getMemberById` returns the primary email; password-confirmed **direct** `PUT /auth/email` (`authService.changeEmail`) keeps Supabase `auth.users` + `member_emails` in sync (`email_confirm:true`, no verification email, session stays valid). Backend bumps `members` + `auth` via `git-version`. iOS My Profile email-change port deferred. `npx tsc --noEmit` ✓. |
| 0.1.0 | 2026-06-29 | Initial SPEC authored via `question-asker` (run 27) — the **thirteenth web page spec**, the **third of the six deferred `/program/*` settings sub-routes**. The signed-in user's **own "My Profile" account page** (first/last name + gender + Delete Account) — **not** a program-admin setting (no admin redirect; available to every role; only Delete is hidden from global_admin). Decisions: **D-REF** (`consumed_by=[web]`; iOS Settings → My Profile mirrors later) · **D-SCOPE** (this page only; other 3 `/program/*` sub-routes deferred) · **D-DEPS** (no new dependency — purest shape, every dep already ported) · **D-S1** (faithful 1:1) · **D-C1** (tokenize success color → `rf-success`; avatar amber kept, F2) · **D-C2** (clear stale success/error on field edit). Flagged F1–F5 (client JWT-decode role label + delete gate; literal-amber avatar; name-split heuristic; client-only delete gate; no client throttle). Consumes `members` (`fetchMemberProfile`/`updateMemberProfile`) + `auth` (`deleteAccount`/`useAuthGuard`); **all endpoints already mounted, api modules already ported, no feature bump.** Ported `apps/web/src/app/program/profile/page.tsx`. `npm run build` ✓. |
