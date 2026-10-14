# Screen: `my-profile` (ios) — the account-menu "My Profile" screen

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.4.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramMyAccountSection` (the Program tab's My Account section, run 57) →
> "My Profile" `NavigationLink → MyProfileView()`.
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Home/Settings/MyProfileView.swift`.
> **Web parity reference:** [`web program/profile`](../../web/program/profile/SPEC.md) — same own-profile
> editor; the net-new **email-change form** now mirrored.
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — `APIClient.changeEmail()` (new,
> `PUT /auth/email`) + `APIClient.deleteAccount()` (`DELETE /auth/account`); the `members` feature —
> `APIClient.updateMemberProfile()` (`PUT /members/:id`) + `fetchMemberById()` (`GET /members/:id`).
> **Stance:** faithful 1:1 port of the legacy iOS `MyProfileView` (first/last name + gender + delete)
> **+ the web-parity email-change form (D-C1)** the legacy iOS lacked **+ shared chrome components (D-C3)**.
> Oddities flagged §10.

---

## 1. What it is + who uses it

The **personal account profile screen** — where any signed-in user edits **their own** first name, last
name, gender, and (web-parity ADD) **email**, and (non-global-admins) deletes their account. Reached from
the Program tab's My Account section. Used by **every authenticated role**; it always edits the *caller's
own* record (no member targeting), so there is no admin-vs-member content split beyond the Delete gate.

## 2. Why it exists

To give a member native self-service over their profile, matching the built web `/program/profile`. Name +
gender save via `updateMemberProfile` (`PUT /members/:id`); the **net-new email change** is a direct,
password-confirmed flow (`PUT /auth/email`, no verification email — mirrors web D-EMAIL); account deletion
cascades server-side then signs out. The legacy iOS had **no email field at all**; this port closes that
web↔iOS gap toward web parity (memory [[ios-matches-web-not-just-legacy]]).

## 3. Route / location

- **App:** `ios`. **Reached via:** `ProgramMyAccountSection` → "My Profile".
- **Leaves to:** back to the Program tab (nav back) · `LoginView` (after a successful **delete** → automatic
  `signOut()` flips the root). No forward-nav targets.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Profile header | Initials circle (`appOrangeLight`/`appOrange`) + full name + `@username` + role badge ("Global Admin"/"Program Admin"/"Member"). | legacy `MyProfileView.swift:18-39` |
| First / Last name inputs | Two `AppInputField`s (D-C3; were inline `systemGray6`/`cornerRadius` fields), `.givenName` / `.familyName` (D-REL1). Both required. | legacy `:45-65` |
| Gender menu | `Menu` of `["Male","Female","Non-binary","Prefer not to say"]` + **Clear**; placeholder "Select gender". Kept as a faithful `Menu` (matches create-account's gender picker). A Clear the user picked saves as `gender: null` (D-REL1). | legacy `:67-94` |
| Error line (conditional) | `appRed` footnote when name validation / save fails. | legacy `:97-101` |
| Save button | **`AppPrimaryButton`** "Save changes" / `ProgressView` (D-C3; was inline `appOrange`). | legacy `:103-120` |
| **Email section (web-parity ADD)** | A divider + read-only **current email** display + a **"Change email"/"Cancel"** toggle; (0.4.0) a failed email read adds `Couldn't load this` + a 44-pt **Retry** under the row; the collapsible form holds **New email** (`AppInputField`, regex-validated, `.emailAddress`) + **Current password** (secure `AppInputField`, `.password`) + an **Update email** `AppPrimaryButton`; a muted-`appRed` error line + an `appGreen` "Email updated successfully." line. | new; mirrors web `profile/page.tsx:223-298` |
| Sign-in methods | `SignInMethodsSection` (`MyProfileSections.swift`, 0.4.0): Google / Apple rows (Link / Unlink) + Password (`Enabled` / `Not set` + Add password, `.newPassword`). Rows read "—" with Link disabled and Add password hidden until the identities load; a failed load → `ErrorStateView` + Retry in place of the rows (D-REL1). | `MyProfileSections.swift` |
| Delete Account section | Non-global-admins only: divider + **`AppDestructiveButton`** "Delete Account" (D-C3; was an understated text link) + (0.4.0) the delete error directly under the button + caption. Now `DeleteAccountSection` (`MyProfileSections.swift`), owning its confirm alert + state. | legacy `:126-149` |

**Save flow** (`save()`, legacy `:202-235`): guard `loggedInUserId` → trim + require both names → `updateMemberProfile(memberId, first, last, gender?, clearGender:)` (`clearGender` = blank **and** the user edited gender → `"gender": null`; an untouched blank omits the key — D-REL1) → success `Alert`. **Email flow** (`changeEmail()`, new): guard `canSubmitEmail` (regex-valid email + non-empty password) → `programContext.changeEmail(newEmail, password)` → set `currentEmail`, hide the form, show success. **Delete flow** (`deleteAccount()`, legacy `:188-200`): confirm `Alert` → `deleteAccount()` → automatic `signOut()` → login.

## 5. Components + features consumed

- **Components:** `AppInputField` + `AppPasswordToggleButton`-free secure field, `AppPrimaryButton`,
  `AppDestructiveButton` (all D-C3), the inline gender `Menu`, `adaptiveBackground`, `Color.appOrange`/
  `appOrangeLight`/`appRed`/`appGreen`, `AppSpacing`/`AppCornerRadius`. **No new component** — all foundation
  chrome (run 50).
- **Features:** [`auth`](../../../features/auth/SPEC.md) — `changeEmail()` (new `APIClient+Auth`) +
  `deleteAccount()`; the `members` feature — `updateMemberProfile()` + `fetchMemberById()`
  (`APIClient+Members`). `ProgramContext.changeEmail()`/`deleteAccount()`/`updateMemberProfile()` wrappers.

## 6. Data / API

- **`GET /members/:id`** (via `fetchMemberById`) — read on appear to surface the **current email**
  (`MemberDTO.email`, newly added as optional — only this endpoint returns it). Name/gender still init from
  `ProgramContext` session state (faithful legacy).
- **`PUT /members/:id`** (via `updateMemberProfile`) — body `{ first_name, last_name, gender? }` (`gender: null`
  only when the user picked Clear — 0.4.0, members D-C5); backend enforces own-profile-or-global_admin (403).
- **`PUT /auth/email`** (via new `changeEmail`) — body `{ new_email, password }`; backend re-authenticates
  with the current password, validates + normalizes the email, updates Supabase (`email_confirm: true`) +
  `member_emails`. Returns `{ message?, email? }`. **Direct change, no verification email** (web D-EMAIL).
- **`DELETE /auth/account`** (via `deleteAccount`) — cascades member deletion + best-effort Supabase user
  delete; then client `signOut()`.

## 7. Role-based view rules

Available to **every authenticated role**; always edits the **caller's own** record. The only role-conditional
UI is **Delete Account**, hidden for `global_admin` (client gate; the backend `DELETE /auth/account` is
`authenticateToken`-only and deletes the caller's own account either way).

| Viewer | Sees | Can do |
|--------|------|--------|
| global_admin | Profile + email section; **no Delete** button. | Edit own name/gender/email. |
| program admin · logger · member | Profile + email section + Delete. | Edit own name/gender/email; delete own account. |

**`admin_only_data_entry` = N/A** — account settings, not workout/health *data entry*; the lock never gates
this screen (the read-vs-write-lock axis: the lock follows logging, not all writes).

## 8. States & edge cases

- **Loading:** `isSaving`/`isChangingEmail`/`isDeleting` swap each button for a `ProgressView` + disable it.
- **Name validation:** Save errors inline ("First name is required" / "Last name is required") before any call.
- **Email validation:** the Update-email button is disabled until the new email is regex-valid
  (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) and the current password is non-empty.
- **Email read failure:** ~~swallowed (faithful — web surfaces no read error either); the change form still works.~~
  *(v0.4.0, D-REL1: `Couldn't load this` + Retry under the email row, reloaded on reconnect; "Change email" stays
  usable.)*
- **Sign-in methods (D-REL1):** loading → every row "—", Link disabled, Add password hidden; failed → `ErrorStateView`
  + Retry, reload on reconnect; a Retry keeps loaded rows.
- **Save/email/delete error:** caught → the section's `appRed` line (or the name error line); the backend
  message surfaces (e.g. "Current password is incorrect.", "Email already in use"). The delete error sits directly
  under the Delete Account button, above its caption, with the button's spinner while it runs (D-REL1).
- **Delete success:** `deleteAccount()` calls `signOut()` automatically → the root swaps to `LoginView`.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Home/Settings/MyProfileView.swift`; web parity = [`web program/profile`](../../web/program/profile/SPEC.md). `consumed_by = [ios]`.** | legacy `MyProfileView.swift:1-243`; web profile SPEC. |
| **D-S1** | **Stance = faithful 1:1 port of the legacy iOS `MyProfileView`** (header, first/last name, gender `Menu`, name-required validation, Save via `updateMemberProfile`, Delete via `deleteAccount` gated `!isGlobalAdmin`) **+ the deviations below.** | legacy `MyProfileView.swift`; user answers. |
| **D-C1** | **Web-parity email-change ADD** — a collapsible read-only current-email + password-confirmed change form (`PUT /auth/email`), absent from legacy iOS entirely. Required a new `APIClient.changeEmail` + `ProgramContext.changeEmail` + an optional `MemberDTO.email` (surfaced via `fetchMemberById`). Mirrors web D-EMAIL (direct, no verification email). | web profile D-EMAIL; user answer; [[ios-matches-web-not-just-legacy]]. |
| **D-C3** | **Adopt the foundation's shared chrome components** — `AppInputField` (name + email + password fields), `AppPrimaryButton` (Save / Update email), `AppDestructiveButton` (Delete) — replacing the legacy hand-rolled `systemGray6`/`cornerRadius` fields + inline buttons. Matches the run-51 auth screens. | user answer; run-51 auth chrome. |
| **D-DEPS** | **One genuine new dependency at the API layer** — `APIClient.changeEmail` + `ChangeEmailResponse` + `ProgramContext.changeEmail` + the optional `MemberDTO.email` field (the email ADD). **No new view component** — all chrome is foundation (run 50). | foundation inventory (run 50); the email ADD. |
| **D-C4** | **Set-password rule 6 + message mapping (reliability Phase 3 C2).** Add password is never auto-retried (auth §3.1 rule 6): after a 503 / 5xx / 408 / timeout the line reads the shared "couldn't confirm" copy, and a same-password `400` on the manual retry means it landed (identities re-read, form closes). Success shows "Password set. Your other devices will be signed out." (green, A1). The email change (`PUT /auth/email`) sends a one-shot body (no silent CFNetwork replay). Link / unlink / email errors → `SessionCopy.credentialMessage` (server text for 400 / 401 / 409 / 422); profile save + set-password errors → kit copy (A8). Link / unlink no longer send `refresh_token` nor require one (auth D-C14c). | auth §3.1; Phase 3 client amendments (`specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md`) A1 / A8. |
| **D-C5** | **"Sign out everywhere" (auth §3.1 `POST /auth/logout-all`; amendment U3).** A row above Delete Account, for every role, in the screen's row idiom (red title "Sign out everywhere" + the hint "Signs you out on every device, including this one."), behind an alert "Sign out everywhere?" / "You'll be signed out on all your devices, including this one." / destructive "Sign out everywhere" + Cancel. `200` → the full teardown (→ sign-in); a failure keeps the session and shows the kit copy under the row. Same placement + copy on web and Android. | auth §3.1 + D-C14; Phase 3 client amendments (`specs/initiatives/reliability-overhaul/plans/phase-3-client-amendments.md`) U3 / A1. |
| **D-NP1** | **Hide my activity (0.3.0; people D-C13/D-C14, members D-C4; NP amendments R11).** `Settings/HideActivitySection.swift`, directly above "Sign out everywhere": a switch `Hide my activity` · `Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them.`; reads `hide_activity` from `GET /members/:id` (the section hides itself when the key is absent — e.g. before the server knew it), writes `PUT /members/:id { hide_activity }`; a 200 without the echo throws, the switch reverts and shows `Couldn't save. <kit message>`; a load failure shows `Couldn't load this` + Retry. Every role. | people D-C13; iOS plan step 28. |
| **D-REL1** | **Phase 4 polish (#15, #18, #35, #44).** #15 Delete Account (`DeleteAccountSection`): spinner on the button while it runs and the failure in its own slot directly under the button, above the caption — never the profile form's error line (auth **D-C19**; PA7). #18 sign-in methods (`SignInMethodsSection`, `LoadState<IdentitiesResponse>` instead of a swallowed fetch): "—" with Link disabled and Add password hidden until loaded, `ErrorStateView` + Retry on failure, reload on reconnect — never a false "Not linked" + Link; the email read gets `Couldn't load this` + Retry under the row (reload on reconnect, "Change email" not gated) (auth **D-C19**; PA8). #35 content types `.givenName` / `.familyName` / `.emailAddress` / `.password` / `.newPassword` (auth **D-C22**). #44 picking **Clear** sends an explicit `gender: null` (`clearGender`); an untouched blank gender is omitted, so a gender this device never loaded is never wiped (members **D-C5**). The sign-in + delete sections moved to the new `MyProfileSections.swift` (file size). | `05e185a`; polish amendments PA7, PA8 |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Role badge + Delete gate are client-side** (`isGlobalAdmin`/`isProgramAdmin`) — display/UI only; the backend re-verifies every call. | `MyProfileView.swift` header + delete gate | Kept (faithful) — mirrors web profile F1/F4. |
| **F2** | **Name round-trips through a space-split heuristic** (`first = parts[0]`, `last = rest`) to/from the single `member_name`. | `MyProfileView.swift` `onAppear` + `save()` | Kept (faithful) — mirrors web profile F3. |
| **F3** | **Email is fetched once on appear** (`fetchMemberById`); after a change it's set from the response/submitted value (no re-fetch). ~~Read errors swallowed.~~ *(v0.4.0, D-REL1: a read error shows Couldn't load + Retry, refetched on reconnect.)* | `MyProfileView.swift` `loadCurrentEmail()`/`changeEmail()` | Kept (faithful) — web re-fetches via query invalidation; behavior-equivalent. |
| **F4** | **`AppDestructiveButton` is a solid-red capsule** — more prominent than legacy iOS's understated text link and web's outline-danger button (the only shared destructive component). | `MyProfileView.swift` delete section | Kept (D-C3 consistency) — a softer destructive style is a rebuild option. |
| **F5** | **Name/gender init from `ProgramContext` session state** (not the `fetchMemberById` read) — only email comes from the fetch. | `MyProfileView.swift` `onAppear` vs `task` | Kept (faithful legacy) — web sources all three from one profile query. |
| **F6** | **No client-side rate-limit/debounce** beyond the `isSaving`/`isChangingEmail` disable. | `MyProfileView.swift` | Kept (faithful) — server-side (mirrors web profile F5). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.4.0 | 2026-10-13 | **D-REL1 — Phase 4 polish (`05e185a`).** #15 Delete Account spinner + error under the button (auth D-C19); #18 sign-in methods "—" until loaded / Couldn't load · Retry (replaces the rows) / reload on reconnect, email read error + Retry under the row (auth D-C19); #35 autofill content types; #44 Clear sends `gender: null` (members D-C5); sections split into `MyProfileSections.swift`. |
| 0.3.0 | 2026-10-13 | **D-NP1 — Hide my activity** (Phase 4 People, `198407c`): `HideActivitySection` above Sign out everywhere; missing echo = failure (revert + kit message). |
| 0.2.1 | 2026-10-13 | Phase 4 quick wins: the Delete Account error uses `SessionCopy.kitMessage` (frontend-kit D-KIT-19, #8). |
| 0.2.0 | 2026-10-13 | **reliability Phase 3 C2 (iOS 1.5.0).** D-C4: set-password rule 6 + A1 copy, credential vs kit messages, link / unlink without `refresh_token`. D-C5: "Sign out everywhere" row + confirm above Delete Account. |
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **My Profile account screen** (one of the 4-screen account/settings cluster, run 58). Documents the own-profile editor: header, first/last name + gender `Menu`, Save via `updateMemberProfile` (`PUT /members/:id`), Delete via `deleteAccount` (`DELETE /auth/account`, gated `!isGlobalAdmin`), **+ the web-parity email-change form** (`PUT /auth/email`). Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS + web parity) · **D-S1** (faithful 1:1 port) · **D-C1** (web-parity email-change ADD — new `APIClient.changeEmail` + `ProgramContext.changeEmail` + optional `MemberDTO.email`) · **D-C3** (adopt shared `AppInputField`/`AppPrimaryButton`/`AppDestructiveButton`) · **D-DEPS** (one new API-layer dep, no new view component). Flagged F1–F6 (client role gate; name space-split heuristic; email fetch-once; solid-red delete; name/gender from session not fetch; no client rate-limit). Role rules: every role edits own profile; Delete hidden for global_admin; `admin_only_data_entry` N/A. Ported `apps/ios/.../Features/Home/Settings/MyProfileView.swift`. Build green-check owned by the user (Xcode). |
