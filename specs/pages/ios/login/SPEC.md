# Screen: `login` (ios) — the public sign-in screen + entry to auth-recovery

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.1.0 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `SplashView`'s "Sign in" CTA (`NavigationLink → LoginView()`).
> **Reference impl (legacy):** `../../../../../ios-mobile/RaSi-Fiters-App/Features/Auth/LoginView.swift`.
> **Web parity reference:** [`web login`](../../web/login/SPEC.md) — same identifier + password + the recovery link.
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — `APIClient.loginGlobal()`
> (`POST /auth/login/global`), `ProgramContext` session writes (`authToken`/`refreshToken`/`globalRole`/…),
> `loadLookupData()` + `persistSession()`.
> **Cross-app:** web `login/page.tsx` — same single "Username or Email" identifier + password + Show/Hide,
> same `/auth/login/global` call. **Web added a "Forgot password?" link; iOS now mirrors it (D-C2 — closes
> web login F3).**
> **Stance:** faithful 1:1 port of the legacy iOS `LoginView` **+ ONE web-parity deviation** (the recovery
> link, D-C2) **+ the real brand icon** (D-C1). Oddities flagged §10.

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
now also the **entry to password recovery** (the web-parity "Forgot your password?" link).

## 3. Route / location

- **App:** `ios`. **Reached via:** the splash "Sign in" CTA, or `CreateAccountView`'s back navigation.
- **Leaves to:** `ProgramPickerView` (on successful login — `navigateToProgramPicker`, **and** the root
  swaps once `authToken` is set, F4) · `CreateAccountView` (the sign-up link) · the **web recovery flow**
  `APIConfig.forgotPasswordURL` (external browser, D-C2) · `APIConfig.privacyPolicyURL` (external).

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Brand logo | **`BrandMark(size: 90)`** — the real `BrandIcon` asset (D-C1). **Was** the legacy placeholder. | legacy `LoginView.swift:128-144`; new `BrandMark.swift` |
| Heading + subheading | "Welcome Back" / "Login to access your fitness dashboard". | legacy `LoginView.swift:30-38` |
| Identifier input | `AppInputField("Username or Email")`. | legacy `LoginView.swift:42-45` |
| Password input + toggle | `AppInputField("Password", isSecure:)` + `AppPasswordToggleButton` (`isPasswordVisible`). | legacy `LoginView.swift:47-52` |
| Login button | "Login" / `ProgressView` (when `isLoading`); disabled while `isLoading \|\| identifier.isEmpty \|\| password.isEmpty`. | legacy `LoginView.swift:55-78` |
| **"Forgot your password?" link** | **WEB-PARITY ADDITION (not in legacy iOS)** — `Link → APIConfig.forgotPasswordURL` (opens `rasifiters.com/forgot-password` in the browser). | new; see D-C2 |
| Sign-up link | "New here? **Create an account**" → `NavigationLink → CreateAccountView()`. | legacy `LoginView.swift:80-92` |
| Footer | "Training hard? Login to track your progress." + a "Privacy Policy" `Link`. | legacy `LoginView.swift:94-104` |

**Submit flow** (`handleLogin()`, legacy `LoginView.swift:146-183`): guard `!isLoading` → read the stored
push token (`UserDefaults`, `PushTokenNotification.userDefaultsKey`) → `APIClient.loginGlobal(identifier,
password, pushToken, deviceId:nil)` → write `ProgramContext` session fields (role defaulted to `"standard"`
if blank) → `loadLookupData()` → `persistSession()` → `navigateToProgramPicker = true`. Errors caught →
`alertMessage` + `isShowingAlert` (a native `Alert`). `defer` clears `isLoading`.

## 5. Components + features consumed

- **Components:** `AppInputField` + `AppPasswordToggleButton`, **`BrandMark`** (new, D-DEPS),
  `AppGradient.background(for:)`, `adaptiveShadow`, `Link` (recovery + privacy). All foundation chrome
  ported (run 50) except `BrandMark` + the `BrandIcon` asset.
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
- The recovery **link** makes no API call from iOS — it opens the web `/forgot-password` page, which calls
  `POST /auth/forgot-password` itself.

## 7. Role-based view rules

**N/A at render — public, pre-auth.** No authenticated user (hence no role) exists while the login form
shows; the form, fields, and all links are identical for every visitor. A role is stamped onto
`ProgramContext.globalRole` only *after* a successful login (consumed by downstream screens, not here).

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Full login form + Forgot-password / Create-account / Privacy links. | Sign in · open web recovery · go to create-account. |
| Any authenticated role | Nothing — never reaches `LoginView` (`AppRootView` shows `ProgramPickerView`). | (root bifurcation only) |

`admin_only_data_entry` is irrelevant here (no data entry; program-scoped lock applied only after a program
is selected).

## 8. States & edge cases

- **Loading:** `isLoading` swaps the button label for a `ProgressView` and disables it.
- **Validation:** no inline error — the button is simply disabled until both fields are non-empty
  (identifier is intentionally username-or-email, resolved server-side, F5).
- **Auth error:** caught → a native `Alert` titled "Login" with `error.localizedDescription`.
- **Recovery:** the "Forgot your password?" `Link` opens the live web flow in the browser; the actual reset
  always completes in a browser anyway (Supabase emails a link to `rasifiters.com/reset-password`), so iOS
  does not duplicate it natively (D-C2).
- **Already authenticated:** not applicable — gated at the root (`AppRootView`).
- **Forward dependency:** `ProgramPickerView` (post-login target) remains a deferred stub; `CreateAccountView`
  is built this run.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Auth/LoginView.swift`; web parity = [`web login`](../../web/login/SPEC.md). `consumed_by = [ios]`.** | legacy `LoginView.swift:1-192`; web login SPEC. |
| **D-S1** | **Stance = faithful 1:1 port of the legacy iOS `LoginView`** — identifier+password, Show/Hide, the `canSubmit`-equivalent disable, `loginGlobal` + `ProgramContext` session writes + `loadLookupData`/`persistSession`, the `navigateToProgramPicker` push, the create-account + Privacy links, the native error `Alert`. Oddities → §10. | legacy `LoginView.swift`; user answer (match web; faithful iOS otherwise). |
| **D-C1** | **Real brand icon** — `BrandMark(size: 90)` replaces the legacy placeholder (same deviation as splash D-C1). | web login parity; user answer; [[ios-matches-web-not-just-legacy]]. |
| **D-C2** | **ONE web-parity addition — a "Forgot your password?" link → the web recovery flow.** A `Link → APIConfig.forgotPasswordURL` (`rasifiters.com/forgot-password`) opened in the browser, mirroring web's recovery entry (login D-C1). **Chose "open the web flow" over a native forgot-password screen** — the reset MUST finish in a browser regardless of client (Supabase emails a link to `rasifiters.com/reset-password`), the web request page already carries the `mailto:` fallback, and this keeps the run to 3 screens. Closes web login F3 (the iOS recovery gap). | web login F3 + D-C1/D-PLAN; user answer ("link opens web recovery"); auth SPEC D-C4/D-C5 (recovery live); `APIConfig.forgotPasswordURL`. |
| **D-DEPS** | **One new dependency — `BrandMark.swift` + the `BrandIcon.imageset`** (shared with splash D-DEPS) + a `forgotPasswordURL` added to `APIConfig`. Every other import was ported in the foundation (run 50). | foundation inventory (run 50); `Config/APIConfig.swift`. |

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Client reads the JWT only indirectly** — iOS stores `global_role` from the response body (not by decoding the JWT) for display/routing; trust rests on the backend re-verifying every authed call. | `LoginView.swift:159-164` | Kept (faithful) — not a security boundary (mirrors web F1). |
| **F2** | **No client-side rate limiting / lockout.** Repeated failed logins only surface the backend error. | `LoginView.swift:179-182` | Kept (faithful) — throttling belongs server-side (auth F4). |
| **F3** | **No inline field validation.** Empty fields only disable the button; no "email looks invalid" hint (identifier is dual-purpose username-or-email). | `LoginView.swift:78` | Kept (faithful) — mirrors web login F5. |
| **F4** | **Dual navigation on success — `navigateToProgramPicker` push AND the root `authToken` swap.** Setting `programContext.authToken` flips `AppRootView` to `ProgramPickerView`; the legacy `navigateToProgramPicker` `NavigationLink` push is thus redundant (the root swap wins). Faithful to legacy. | `LoginView.swift:20-26, 178`; `AppRootView.swift:11-21` | Kept (faithful) — benign; a rebuild could drop the redundant push. |
| **F5** | **Recovery is a browser hand-off, not native.** "Forgot your password?" opens the web `/forgot-password` page rather than a native request screen — the reset always completes in a browser anyway (D-C2). | `LoginView.swift` (the recovery `Link`) | Kept (deliberate) — revisit only if a fully-native recovery flow is ever desired. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **second iOS screen spec**. Documents the public `LoginView`: username-or-email + password + Show/Hide, `loginGlobal` → `ProgramContext` session + `loadLookupData`/`persistSession` → `ProgramPickerView`, create-account + Privacy links, native error `Alert`. Consumes `auth` (`APIClient.loginGlobal()` `POST /auth/login/global`, `ProgramContext+Auth`). Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS + web parity) · **D-S1** (faithful 1:1 port) · **D-C1** (real `BrandMark` replacing the placeholder) · **D-C2** (ONE web-parity addition — "Forgot your password?" link opening the live web recovery flow; closes web login F3) · **D-DEPS** (`BrandMark`/`BrandIcon` + `APIConfig.forgotPasswordURL`). Flagged F1–F5 (role from body not JWT decode; no client rate-limit; no inline validation; dual nav on success; recovery is a browser hand-off). Role rules N/A (public/pre-auth). Ported `apps/ios/.../Features/Auth/LoginView.swift`; added `forgotPasswordURL`. Build green-check owned by the user (Xcode). |
