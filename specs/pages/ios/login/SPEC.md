# Screen: `login` (ios) — the public sign-in screen + entry to auth-recovery

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `SplashView`'s "Sign in" CTA (`NavigationLink → LoginView()`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Auth/LoginView.swift`.
> **Web parity reference:** [`web login`](../../web/login/SPEC.md) — same identifier + password + the recovery link.
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — `APIClient.loginGlobal()`
> (`POST /auth/login/global`), `ProgramContext` session writes (`authToken`/`refreshToken`/`globalRole`/…),
> `loadLookupData()` + `persistSession()`.
> **Cross-app:** web `login/page.tsx` — same single "Username or Email" identifier + password + Show/Hide,
> same `/auth/login/global` call. **Web added a "Forgot password?" link; iOS now mirrors it with a NATIVE
> request screen (D-C2, v0.1.1 — closes web login F3).**
> **Stance:** faithful 1:1 port of the legacy iOS `LoginView` **+ ONE web-parity deviation** (the recovery
> entry, D-C2) **+ the real brand icon** (D-C1). Oddities flagged §10.

---

## 1. What it is + who uses it

The **public sign-in screen** — where an unauthenticated visitor enters a **username-or-email** + password
to authenticate. It's the middle of the iOS public/auth path (`splash → login → create-account`) and the
only screen from which a returning member gets a session. Used by **everyone pre-auth**; a signed-in user
never reaches it (`AppRootView` shows `ProgramPickerView` at the root).

## 2. Why it exists

To authenticate returning members and funnel new ones into sign-up. On success it stores the session into
`ProgramContext` (`authToken`/`refreshToken`/`globalRole`/`loggedInUserId`/`loggedInUsername`/names), loads
lookup data, persists the session (Keychain + UserDefaults), and navigates to `ProgramPickerView`. It is
now also the **entry to password recovery** (the "Forgot your password?" link → the native `ForgotPasswordView`).

## 3. Route / location

- **App:** `ios`. **Reached via:** the splash "Sign in" CTA, or `CreateAccountView`'s back navigation.
- **Leaves to:** `ProgramPickerView` (on successful login — `navigateToProgramPicker`, **and** the root
  swaps once `authToken` is set, F4) · `CreateAccountView` (the sign-up link) · the **native
  `ForgotPasswordView`** (`NavigationLink`, D-C2) · `APIConfig.privacyPolicyURL` (external browser).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Brand logo | **`BrandMark(size: 90)`** — the real `BrandIcon` asset (D-C1). **Was** the legacy placeholder. | legacy `LoginView.swift:128-144`; new `BrandMark.swift` |
| Heading + subheading | "Welcome Back" / "Login to access your fitness dashboard". | legacy `LoginView.swift:30-38` |
| Identifier input | `AppInputField("Username or Email")`. | legacy `LoginView.swift:42-45` |
| Password input + toggle | `AppInputField("Password", isSecure:)` + `AppPasswordToggleButton` (`isPasswordVisible`). | legacy `LoginView.swift:47-52` |
| Login button | "Login" / `ProgressView` (when `isLoading`); disabled while `isLoading \|\| identifier.isEmpty \|\| password.isEmpty`. | legacy `LoginView.swift:55-78` |
| **"or" divider + social sign-in** | **NET-NEW (D-C3)** — an "or" divider, a **"Continue with Google"** outlined capsule (`ProgramContext.startGoogleSignIn` → `APIClient.socialSignIn(provider:"google")`), and a **native `SignInWithAppleButton`** (`.signInWithAppleButtonStyle` follows the color scheme; raw nonce → `request.nonce = SHA256(nonce)`; on completion → `socialSignIn(provider:"apple", nonce:, firstName:, lastName:)`). A `needs_profile` response pushes `CreateAccountView` in social mode; else `applyAuthResponse`. 409 email-collision surfaces in the existing `Alert`. | new; see D-C3 |
| **"Forgot your password?" link** | **WEB-PARITY ADDITION (not in legacy iOS)** — `NavigationLink → ForgotPasswordView()`, a **native** request screen (v0.1.1; was a browser `Link` to `rasifiters.com/forgot-password`). | new; see D-C2 |
| Sign-up link | "New here? **Create an account**" → `NavigationLink → CreateAccountView()`. | legacy `LoginView.swift:80-92` |
| Footer | "Training hard? Login to track your progress." + a "Privacy Policy" `Link`. | legacy `LoginView.swift:94-104` |

**Submit flow** (`handleLogin()`, legacy `LoginView.swift:146-183`): guard `!isLoading` → read the stored
push token (`UserDefaults`, `PushTokenNotification.userDefaultsKey`) → `APIClient.loginGlobal(identifier,
password, pushToken, deviceId:nil)` → write `ProgramContext` session fields (role defaulted to `"standard"`
if blank) → `loadLookupData()` → `persistSession()` → `navigateToProgramPicker = true`. Errors caught →
`alertMessage` + `isShowingAlert` (a native `Alert`). `defer` clears `isLoading`.

## 5. Components + features consumed

- **Components:** `AppInputField` + `AppPasswordToggleButton`, **`BrandMark`** (new, D-DEPS),
  `AppGradient.background(for:)`, `adaptiveShadow`, `NavigationLink` (native recovery push), `Link` (privacy).
  All foundation chrome ported (run 50) except `BrandMark` + the `BrandIcon` asset. The native recovery
  screen is **`ForgotPasswordView`** (`Features/Auth/ForgotPasswordView.swift`, v0.1.1).
- **Features:** [`auth`](../../../features/auth/SPEC.md) — `APIClient.loginGlobal()` (`APIClient+Auth.swift:50`),
  the `ProgramContext` session writes + `loadLookupData()`/`persistSession()` (`ProgramContext+Auth.swift`).
  Push-token capture-on-login is owned by `notifications` (the call site only reads the stored token).

## 6. Data / API

- **`POST /auth/login/global`** (via `APIClient.loginGlobal(identifier, password, pushToken, deviceId)`) —
  body `{ identifier, password, push_token?, device_id? }`; response `AuthResponse` `{ token, refresh_token?,
  member_id?, username, member_name?, global_role?, user? }`. The backend resolves `identifier` → member →
  primary email, then Supabase `signInWithPassword` (auth SPEC §3). The push token piggybacks on login
  (mobile-only — auth SPEC §4 / `loginGlobal` upsert).
- No other endpoint. Session is persisted by `ProgramContext.persistSession()` (Keychain access/refresh
  tokens via `SessionStore` + user metadata in `UserDefaults`).
- The recovery **link** makes no API call from `LoginView` itself — it pushes the native `ForgotPasswordView`,
  which calls `APIClient.requestPasswordReset(email:)` → `POST /auth/forgot-password` (privacy-safe generic
  200) from the app. The reset email's link still opens `rasifiters.com/reset-password` in the browser to
  set the new password (that page is client-neutral — see web reset-password SPEC D-C5).

## 7. Role-based view rules

**N/A at render — public, pre-auth.** No authenticated user (hence no role) exists while the login form
shows; the form, fields, and all links are identical for every visitor. A role is stamped onto
`ProgramContext.globalRole` only *after* a successful login (consumed by downstream screens, not here).

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Full login form + Forgot-password / Create-account / Privacy links. | Sign in · open native recovery · go to create-account. |
| Any authenticated role | Nothing — never reaches `LoginView` (`AppRootView` shows `ProgramPickerView`). | (root bifurcation only) |

`admin_only_data_entry` is irrelevant here (no data entry; program-scoped lock applied only after a program
is selected).

## 8. States & edge cases

- **Loading:** `isLoading` swaps the button label for a `ProgressView` and disables it.
- **Validation:** no inline error — the button is simply disabled until both fields are non-empty
  (identifier is intentionally username-or-email, resolved server-side, F5).
- **Auth error:** caught → a native `Alert` titled "Login" with `error.localizedDescription`.
- **Recovery:** the "Forgot your password?" `NavigationLink` pushes the native `ForgotPasswordView` (the
  request step is in-app, v0.1.1). Only the **set-new-password** step stays on the web — the reset email's
  link opens `rasifiters.com/reset-password` in the browser (Supabase implicit-flow token in the fragment),
  so iOS does not duplicate that step natively (D-C2).
- **Already authenticated:** not applicable — gated at the root (`AppRootView`).
- **Forward dependency:** `ProgramPickerView` (post-login target) remains a deferred stub; `CreateAccountView`
  is built this run.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Auth/LoginView.swift`; web parity = [`web login`](../../web/login/SPEC.md). `consumed_by = [ios]`.** | legacy `LoginView.swift:1-192`; web login SPEC. |
| **D-S1** | **Stance = faithful 1:1 port of the legacy iOS `LoginView`** — identifier+password, Show/Hide, the `canSubmit`-equivalent disable, `loginGlobal` + `ProgramContext` session writes + `loadLookupData`/`persistSession`, the `navigateToProgramPicker` push, the create-account + Privacy links, the native error `Alert`. Oddities → §10. | legacy `LoginView.swift`; user answer (match web; faithful iOS otherwise). |
| **D-C1** | **Real brand icon** — `BrandMark(size: 90)` replaces the legacy placeholder (same deviation as splash D-C1). | web login parity; user answer; [[ios-matches-web-not-just-legacy]]. |
| **D-C2** | **ONE web-parity addition — a "Forgot your password?" link → a NATIVE request screen.** A `NavigationLink → ForgotPasswordView()` (v0.1.1). **Superseded the original browser hand-off** (`Link → APIConfig.forgotPasswordURL`): the request step (enter email → `POST /auth/forgot-password`) is now native, mirroring the web `/forgot-password` page (incl. its inline email validation, generic no-enumeration confirmation, and `mailto:` contact fallback via `APIConfig.supportMailtoURL`). Only the **set-new-password** step stays on the web (the email link → `rasifiters.com/reset-password`); a fully-native reset would need Universal Links + Supabase redirect config. Closes web login F3 (the iOS recovery gap). | User request (2026-06-30 — "make the reset page native, send the reset link from there"); web login F3 + D-C1/D-PLAN; auth SPEC D-C4/D-C5 (recovery live); `Features/Auth/ForgotPasswordView.swift`. |
| **D-C3** | **Federated sign-in — Google + Apple (v0.2.0).** An "or" divider under the Login capsule, a "Continue with Google" button (`GoogleSignIn-iOS` SPM; `GIDClientID` in Info.plist; `GIDSignIn.signIn(withPresenting:)` → id token → `POST /auth/oauth`), and a native `SignInWithAppleButton` (`AuthenticationServices`; Sign-in-with-Apple capability; raw nonce via `SecRandomCopyBytes`, `request.nonce = SHA256(nonce)` via `CryptoKit`; the credential's `fullName` first-auth hints forwarded to `socialSignIn(firstName:lastName:)` — Apple returns the name **only** on first auth). Existing member → `applyAuthResponse` → `ProgramPickerView`; brand-new social user (`needs_profile:true`) → push `CreateAccountView` in the 2-step social branch (`/auth/oauth/complete`). 409 email-collision ("…Sign in with your password.") → the existing `Alert`. **Apple sign-in is required by App Store Review Guideline 4.8** whenever a third-party (Google) sign-in is offered. | landed `/auth/oauth` + `/auth/oauth/complete`; `ProgramContext+Auth` (`applyAuthResponse`/`startGoogleSignIn`/`AppleSignInCoordinator`/`AuthPresenter`); `APIClient+Auth.socialSignIn`/`completeSocialRegistration`; App Store Guideline 4.8. |
| **D-DEPS** | **One new dependency — `BrandMark.swift` + the `BrandIcon.imageset`** (shared with splash D-DEPS). v0.2.0 adds the **GoogleSignIn-iOS SPM package** + the **Sign in with Apple capability** (USER-added in Xcode), `GIDClientID` + a reversed-client-id URL scheme in Info.plist, and `com.apple.developer.applesignin` in the entitlements. v0.1.1: the `forgotPasswordURL` originally added to `APIConfig` was **removed** (the browser hand-off is gone); `APIConfig.supportEmail`/`supportMailtoURL` were added for the native screen's contact fallback, and `APIClient.requestPasswordReset(email:)` for the request call. Every other import was ported in the foundation (run 50). | foundation inventory (run 50); `Config/APIConfig.swift`; `Shared/Services/APIClient+Auth.swift`. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client reads the JWT only indirectly** — iOS stores `global_role` from the response body (not by decoding the JWT) for display/routing; trust rests on the backend re-verifying every authed call. | `LoginView.swift:159-164` | Kept (faithful) — not a security boundary (mirrors web F1). |
| **F2** | **No client-side rate limiting / lockout.** Repeated failed logins only surface the backend error. | `LoginView.swift:179-182` | Kept (faithful) — throttling belongs server-side (auth F4). |
| **F3** | **No inline field validation.** Empty fields only disable the button; no "email looks invalid" hint (identifier is dual-purpose username-or-email). | `LoginView.swift:78` | Kept (faithful) — mirrors web login F5. |
| **F4** | **Dual navigation on success — `navigateToProgramPicker` push AND the root `authToken` swap.** Setting `programContext.authToken` flips `AppRootView` to `ProgramPickerView`; the legacy `navigateToProgramPicker` `NavigationLink` push is thus redundant (the root swap wins). Faithful to legacy. | `LoginView.swift:20-26, 178`; `AppRootView.swift:11-21` | Kept (faithful) — benign; a rebuild could drop the redundant push. |
| **F5** | **Recovery *request* is native; only the set-new-password step is a browser hand-off** (v0.1.1). "Forgot your password?" pushes the native `ForgotPasswordView`; the reset itself still completes in a browser (Supabase emails a link to `rasifiters.com/reset-password`) — D-C2. | `LoginView.swift` (the recovery `NavigationLink`); `ForgotPasswordView.swift` | Kept (deliberate) — a fully-native reset (deep-link the recovery token) remains a future option. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.0 | 2026-07-10 | **Federated sign-in added (D-C3, D-DEPS).** Below the Login capsule: an "or" divider, a "Continue with Google" button, and a native `SignInWithAppleButton` (color-scheme-styled). Google → `GIDSignIn.signIn(withPresenting:)` → `POST /auth/oauth`; Apple → raw nonce (`SecRandomCopyBytes`) + `request.nonce = SHA256(nonce)` (`CryptoKit`), first-auth `fullName` hints forwarded to the backend. Existing member → `ProgramContext.applyAuthResponse` (the extracted 1:1 session-write path now shared by login/sign-up/social) → `ProgramPickerView`; new social user (`needs_profile`) → push `CreateAccountView`'s 2-step social branch (`POST /auth/oauth/complete`). 409 email-collision → the existing `Alert`. New: Info.plist `GIDClientID` + reversed-client-id URL scheme, entitlements `com.apple.developer.applesignin`; **USER Xcode steps: add the GoogleSignIn-iOS SPM package + the Sign in with Apple capability, fill the real client-id values.** Apple sign-in required by App Store Guideline 4.8. iOS compile is USER-run (Xcode + xcode MCP). `apps/ios/.../Features/Auth/LoginView.swift`, `Shared/Models/ProgramContext+Auth.swift`, `Shared/Services/APIClient+Auth.swift`, `Shared/Models/AuthResponse.swift`, `Info.plist`, `RaSi-Fiters-App.entitlements`. |
| 0.1.1 | 2026-06-30 | **Recovery request step made native** (D-C2, D-DEPS, F5). "Forgot your password?" now pushes a native `ForgotPasswordView` (`NavigationLink`) instead of opening `rasifiters.com/forgot-password` in the browser. The new screen mirrors the web `/forgot-password` page: inline email validation, `POST /auth/forgot-password` via the new `APIClient.requestPasswordReset(email:)`, generic no-enumeration confirmation, and a `mailto:` contact fallback (`APIConfig.supportMailtoURL`). Removed the now-unused `APIConfig.forgotPasswordURL`; the set-new-password step still completes on the (client-neutral) web `reset-password` page. Compiles clean (xcode MCP `BuildProject`, 0 errors). `apps/ios/.../Features/Auth/{ForgotPasswordView.swift (new),LoginView.swift}`, `Config/APIConfig.swift`, `Shared/Services/APIClient+Auth.swift`. |
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **second iOS screen spec**. Documents the public `LoginView`: username-or-email + password + Show/Hide, `loginGlobal` → `ProgramContext` session + `loadLookupData`/`persistSession` → `ProgramPickerView`, create-account + Privacy links, native error `Alert`. Consumes `auth` (`APIClient.loginGlobal()` `POST /auth/login/global`, `ProgramContext+Auth`). Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS + web parity) · **D-S1** (faithful 1:1 port) · **D-C1** (real `BrandMark` replacing the placeholder) · **D-C2** (ONE web-parity addition — "Forgot your password?" link opening the live web recovery flow; closes web login F3) · **D-DEPS** (`BrandMark`/`BrandIcon` + `APIConfig.forgotPasswordURL`). Flagged F1–F5 (role from body not JWT decode; no client rate-limit; no inline validation; dual nav on success; recovery is a browser hand-off). Role rules N/A (public/pre-auth). Ported `apps/ios/.../Features/Auth/LoginView.swift`; added `forgotPasswordURL`. Build green-check owned by the user (Xcode). |
