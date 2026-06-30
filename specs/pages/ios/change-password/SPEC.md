# Screen: `change-password` (ios) — the account-menu "Change Password" screen

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `ProgramMyAccountSection` (run 57) → "Change Password"
> `NavigationLink → ChangePasswordView()`.
> **Reference impl (legacy):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Home/Settings/ChangePasswordView.swift`.
> **Web parity reference:** [`web program/password`](../../web/program/password/SPEC.md) — same new+confirm
> form; the **5-rule live checklist** now mirrored.
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — `APIClient.changePassword()`
> (`PUT /auth/change-password`) via `ProgramContext.changePassword()`.
> **Stance:** faithful 1:1 port of the legacy iOS `ChangePasswordView` **+ the web-parity 5-rule live policy
> checklist (D-C2)** (replacing the legacy 6-char hint) **+ shared chrome components (D-C3)**. Oddities §10.

---

## 1. What it is + who uses it

The **change-password screen** — where any signed-in user sets a **new password** (new + confirm, with a
Show/Hide toggle on the new field). Reached from the Program tab's My Account section. Always acts on the
**caller's own** account (`req.user.id`); no role-conditional UI at all.

## 2. Why it exists

To let a member rotate their password natively. On submit it calls `changePassword(newPassword)`
(`PUT /auth/change-password`) against the caller's own Supabase user; on success a confirmation `Alert`
dismisses the screen. The legacy iOS only enforced a 6-char minimum client-side; this port adopts the
**web's 5-rule live checklist** (≥8 + upper + lower + number + match — the real backend policy) so the iOS
hint matches both the web sibling and the run-51 create-account screen.

## 3. Route / location

- **App:** `ios`. **Reached via:** `ProgramMyAccountSection` → "Change Password".
- **Leaves to:** back to the Program tab — on success the confirmation `Alert`'s OK calls `dismiss()`.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Heading + subheading | "Change Password" / "Enter your new password". | legacy `ChangePasswordView.swift:21-28` |
| New password input | Secure `AppInputField` (D-C3) with an `AppPasswordToggleButton` accessory (eye toggle on the **new** field only). | legacy `:31-50` |
| Confirm password input | Secure `AppInputField` (always masked — no toggle, faithful). | legacy `:52-59` |
| **Live policy checklist** | **REPLACES the legacy 6-char hint line (D-C2)** — a ✓/○ list (≥8 · uppercase · lowercase · number) appearing on the first keystroke, greening (`appGreen`) per satisfied rule. | legacy hint `:61-65`; new `policyRow` |
| Mismatch hint (conditional) | "Passwords do not match" (`appRed`) when confirm is non-empty and differs. Kept faithful (legacy already showed it red). | legacy `:67-71` |
| Error line (conditional) | `appRed` footnote on a save failure. | legacy `:74-78` |
| Update button | **`AppPrimaryButton`** "Update Password" / `ProgressView` (D-C3; was inline `appOrange`/`systemGray3`); disabled until `isValid`. | legacy `:80-97` |

**Submit flow** (`save()`, legacy `:111-123`): `changePassword(newPassword)` → success `Alert` → `dismiss()`.
**`isValid`** = the password meets policy (≥8 + upper + lower + number) **and** `new == confirm` **and**
confirm non-empty.

## 5. Components + features consumed

- **Components:** `AppInputField` + `AppPasswordToggleButton`, `AppPrimaryButton` (all D-C3), `policyRow`
  (inline helper, shared shape with create-account), `adaptiveBackground`, `Color.appGreen`/`appRed`.
  **No new component** — all foundation (run 50).
- **Features:** [`auth`](../../../features/auth/SPEC.md) — `APIClient.changePassword()`
  (`APIClient+Auth.swift:152`) via `ProgramContext.changePassword()` (`ProgramContext+Auth.swift:154`).

## 6. Data / API

- **`PUT /auth/change-password`** (via `changePassword(newPassword)`) — body `{ new_password }`, Bearer
  token; the backend **re-validates the policy** (≥8 + upper + lower + number) and updates the caller's own
  Supabase user. Returns `{ message }`. Does **not** re-issue the session JWT (the bearer stays valid).

## 7. Role-based view rules

**No role-conditional UI** — the form is byte-identical for every authenticated role and only ever touches
`req.user.id`. The absence of role logic is the finding.

| Viewer | Sees | Can do |
|--------|------|--------|
| Every authenticated role | The same new+confirm form. | Change own password. |

**`admin_only_data_entry` = N/A** — not workout/health data entry; the lock never gates this screen.

## 8. States & edge cases

- **Loading:** `isSaving` swaps the button for a `ProgressView` + disables it.
- **Validation:** the button is disabled until the live checklist is fully satisfied and the two passwords
  match; the checklist + mismatch hint appear only after the user types.
- **Save error:** caught → the `appRed` error line (e.g. a backend policy message).
- **Success:** a "Password Updated" `Alert`; OK → `dismiss()` back to the Program tab. Faithful: the session
  JWT is **not** re-issued (web password F4).

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Home/Settings/ChangePasswordView.swift`; web parity = [`web program/password`](../../web/program/password/SPEC.md). `consumed_by = [ios]`.** | legacy `ChangePasswordView.swift:1-124`; web password SPEC. |
| **D-S1** | **Stance = faithful 1:1 port of the legacy iOS `ChangePasswordView`** (new+confirm fields, Show/Hide on the new field only, mismatch hint, `changePassword` submit, success-`Alert`-then-`dismiss`) **+ the deviations below.** | legacy `ChangePasswordView.swift`; user answers. |
| **D-C2** | **Web-parity 5-rule live policy checklist** replacing the legacy `count >= 6` hint — a ✓/○ list (≥8 · uppercase · lowercase · number) greening per satisfied rule, with `isValid` requiring policy + match. Matches `/program/password` AND run-51 create-account AND the real backend `validatePassword`. | web password D-C1; run-51 create-account D-C3; backend `authService.validatePassword`; user answer. |
| **D-C3** | **Adopt the foundation's shared chrome components** — `AppInputField` (+ `AppPasswordToggleButton`) for the fields, `AppPrimaryButton` for the CTA — replacing the legacy hand-rolled `systemGray6`/`cornerRadius` fields + inline button. Matches the run-51 auth screens. | user answer; run-51 auth chrome. |
| **D-DEPS** | **No new dependency** — every component was ported in the foundation (run 50); `policyRow` is an inline helper (shared shape with create-account). | foundation inventory (run 50). |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client `passwordMeetsPolicy` mirrors the server policy** — both can drift; the client is a hint, the backend authorizes. | `ChangePasswordView.swift` `passwordMeetsPolicy` | Kept (faithful) — mirrors web password F1 / auth. |
| **F2** | **Show/Hide reveals only the New field** — Confirm stays masked. | `ChangePasswordView.swift:31-59` | Kept (faithful) — mirrors web password F3. |
| **F3** | **No current-password challenge** — the screen changes the password using only the session bearer (the backend doesn't require the old password here). | `ChangePasswordView.swift` + `PUT /auth/change-password` | Kept (faithful) — matches legacy + web. |
| **F4** | **No JWT re-issue after change** — the existing bearer stays valid. | `PUT /auth/change-password` | Kept (faithful) — mirrors web password F4. |
| **F5** | **No client-side rate-limit/debounce** beyond the `isSaving`/`isValid` disable. | `ChangePasswordView.swift` | Kept (faithful) — server-side (mirrors web password F2). |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **Change Password account screen** (one of the 4-screen account/settings cluster, run 58). Documents the own-password form: new + confirm (Show/Hide on new only), submit via `changePassword` (`PUT /auth/change-password`), success-`Alert`-then-`dismiss`. Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS + web parity) · **D-S1** (faithful 1:1 port) · **D-C2** (web-parity 5-rule live checklist replacing the legacy 6-char hint — matches web + run-51 + backend policy) · **D-C3** (adopt shared `AppInputField`/`AppPasswordToggleButton`/`AppPrimaryButton`) · **D-DEPS** (no new dependency). Flagged F1–F5 (client policy mirror; Show/Hide on new only; no old-password challenge; no JWT re-issue; no client rate-limit). Role rules: same for every role (no role-conditional UI); `admin_only_data_entry` N/A. Ported `apps/ios/.../Features/Home/Settings/ChangePasswordView.swift`. Build green-check owned by the user (Xcode). |
