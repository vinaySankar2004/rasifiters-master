# Screen: `my-profile` (android) — account profile editor

> **Status:** 🏗️ built · **Version:** 0.1.0 · **App:** `android` (Compose) · **Thin port-note.**
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
