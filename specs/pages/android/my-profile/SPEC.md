# Screen: `my-profile` (android) — account profile editor

> **Status:** 🏗️ built · **Version:** 0.3.0 · **App:** `android` (Compose) · **Thin port-note.**
> Full behavior = iOS `Features/Home/Settings/MyProfileView.swift` + web `/program/profile`.
> **Location:** `ui/shell/AppScaffold.kt` route `Routes.PROGRAM_PROFILE` (`MyProfileScreen`).
> **Files:** `ui/program/ProfileScreen.kt`.

## Parity (iOS 1:1)

- Header: initials avatar + name + `@username` + role label (Global Admin / Program Admin / Member).
- Editable **First name** / **Last name** (`AppTextField`) + **Gender** (`AppDropdownField`, options
  Male / Female / Non-binary / Prefer not to say + **Clear**). **Save changes** (white `PillButton`) →
  `PUT /members/:id` (`updateMemberProfile`); empty first/last blocked inline.
- **Email** section: current email (from `GET /members/:id`) + a collapsible **Change email** form
  (new email + current password → `PUT /auth/email`, password-confirmed, no verification email).
- **Delete Account** (red, hidden for global-admins) → confirm dialog → `DELETE /auth/account`; on success
  the session clears and the root swaps to the auth graph.

## Android-idiom notes

- Name seeded by splitting the cached display name; gender + email come from the `GET /members/:id` read
  (iOS seeds gender from the membership roster). Gender **Clear** sends no gender field (unchanged
  server-side, matching iOS).
- Success/error surface inline (green success text / red error footnote) instead of iOS `.alert` dialogs.

## Reliability Phase 3 decisions (C3, 0.2.0)

- **D-REL3-1 (Sign out everywhere — auth §3.1, U3, A1):** a row under the Password row and **above Delete Account**,
  shown for **every role**: title **"Sign out everywhere"**, hint **"Signs you out on every device, including this
  one."**, a red **"Sign out"** text button → confirm dialog **"Sign out everywhere?"** / **"You'll be signed out on all
  your devices, including this one."** / **"Sign out everywhere"** + Cancel → `POST /auth/logout-all`. 200 → the one
  sign-out teardown (the root swaps to the auth graph); a failure shows the kit copy under the row.
- **D-REL3-2 (link Google):** Link uses the nonce flow (`GetSignInWithGoogleOption`; the raw nonce goes to
  `POST /auth/link`; link / unlink no longer send `refresh_token`, auth D-C14c); Credential Manager failures show the
  mapped human message (linking is not a sign-in → no `auth.sign_in_failed`).
- **D-REL3-3 (set password — auth §3.1 rule 6, A9):** the write is never retried automatically (one-shot body); a 401
  re-sends once (the write never ran). After a timeout / dropped connection / 408 / 5xx it says **"We couldn't confirm
  your password change. It may have gone through, so try signing in with your new password."**; a manual retry
  answered "must be different" counts as done (identities re-read). Success shows **"Password set. Your other devices
  will be signed out."**
- **D-REL3-4 (error copy, A8):** link / unlink / email-change errors show the server's text for 400 / 409 / 422 and the
  kit copy otherwise — a 401 on these authenticated routes is the session, never "Invalid token."; profile-save errors
  map through the kit.

## Phase 4 (0.3.0)

- **D-NP1 (Hide my activity — people D-C13/D-C14, R11):** `ui/program/HideActivitySection.kt`, placed directly above
  "Sign out everywhere" in `ProfileScreen.kt`: a switch `Hide my activity` · `Hides your workouts, streaks and kudos from
  other members of your programs. Program admins and loggers still see them.`; disabled until `GET /members/:id`
  answers; `PUT /members/:id { hide_activity }`; a 200 without the echo is a failure (`AppErrorKind.SERVER`) — the switch
  rolls back and shows the error. Every role. The screen is a toast form route (`program/profile`, both graphs).

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.3.0 | 2026-10-13 | **D-NP1 — Hide my activity** (Phase 4 People, `d528f75`): `HideActivitySection` above Sign out everywhere; missing echo = failure with rollback. |
| 0.2.1 | 2026-10-13 | Phase 4 quick wins: the Sign-out-everywhere and Delete Account errors go through `toAppError()` (frontend-kit D-KIT-19, #8). |
| 0.2.0 | 2026-10-13 | **Reliability Phase 3 C3.** D-REL3-1 Sign out everywhere (every role, above Delete Account); D-REL3-2 link nonce + mapped errors; D-REL3-3 set-password rule 6 + 401 re-send + success copy; D-REL3-4 credential / kit error mapping. Compile-checked green (`assembleDebug`). |
| 0.1.0 | 2026-07-08 | Initial Android port (Phase G). |
