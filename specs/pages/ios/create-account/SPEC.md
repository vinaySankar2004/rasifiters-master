# Screen: `create-account` (ios) — the public sign-up screen

> **Status:** 🏗️ built (ported to `apps/ios/`) · **Version:** 0.2.2 · **App:** `ios` (SwiftUI)
> **Location:** pushed from `LoginView`'s "New here? Create an account" link (`NavigationLink → CreateAccountView()`).
> **Provenance (legacy, archived):** `ios-mobile/RaSi-Fiters-App/Features/Auth/CreateAccountView.swift`.
> **Web parity reference:** [`web create-account`](../../web/create-account/SPEC.md) — same field set +
> register-then-login; the 4 web cleanups now mirrored.
> **Consumes (features):** [`auth`](../../../features/auth/SPEC.md) — `APIClient.registerAccount()`
> (`POST /auth/register`) then `APIClient.loginGlobal()` (`POST /auth/login/global`), `ProgramContext`
> session writes + `loadLookupData()` + `persistSession()`.
> **Cross-app:** web `create-account/page.tsx` — same field set + register-then-auto-login.
> **Stance:** faithful 1:1 port of the legacy iOS `CreateAccountView` **+ 4 web-parity deviations**
> (D-C2…D-C5) **+ the real brand icon** (D-C1). The web "authed→redirect" cleanup is **N/A** (the iOS root
> handles it). Oddities flagged §10.

---

## 1. What it is + who uses it

The **public sign-up screen** — where a new visitor creates a RaSi Fiters account (first/last name,
username, email, optional gender, password + confirm). It's the end of the iOS public/auth path
(`splash → login → create-account`) and the only self-service way to become a member. Used by **everyone
pre-auth**; a signed-in user never reaches it (root bifurcation), so web's authed-redirect cleanup has no
iOS analogue (D-C-note).

## 2. Why it exists

To let a new member register and land signed-in. On submit it calls `registerAccount()` (creating the
Supabase Auth user + `members`/`member_emails` rows server-side), then — because `register` returns **no
session token** (auth SPEC §3) — immediately calls `loginGlobal()` with the same credentials, writes the
session into `ProgramContext`, loads lookup data, persists, and navigates to `ProgramPickerView`. This
register-then-auto-login is faithful to legacy.

## 3. Route / location

- **App:** `ios`. **Reached via:** `LoginView`'s "New here? **Create an account**" link.
- **Leaves to:** `ProgramPickerView` (on successful sign-up — `navigateToProgramPicker`, **and** the root
  swaps once `authToken` is set) · back to `LoginView` (the "Already have an account? Sign in" button →
  `dismiss()`) · `APIConfig.privacyPolicyURL` (external).

## 3a. Layout — 3-step paged wizard (v0.2.0, D-C6)

The single scrolling form is now a **paged `TabView`** (`.tabViewStyle(.page(indexDisplayMode:.never))`,
`selection: $step` — the same idiom as `ProgramActionsSheet`), with a **custom 3-dot indicator** + **Back /
Continue** capsules below the pager. The `BrandMark` + heading sit **above** the pager; each page holds one
field group. The whole form is wrapped in a **`ScrollView`** and the pager is pinned to a **measured height**
(see **Keyboard handling**, D-C10) so the keyboard never collapses or hides the fields:

- **Page 0** — First Name + Last Name (First Name `@FocusState` autoFocus, D-C5).
- **Page 1** — Username + gender `Menu` + Email (inline email-format hint, D-C2).
- **Page 2** — Password + Confirm + the live policy checklist (D-C3) + mismatch hint (D-C4).

Per-page validation gates **Continue** (page 0: both names; page 1: username + valid email; page 2: policy
+ match). The last page's Continue reads **"Create Account"** → `handleCreateAccount()`. **Back** appears
from page 1 on.

**Keyboard handling (D-C10, v0.2.2)** — the form is a `ScrollView` (`.scrollDismissesKeyboard(.interactively)`,
`.scrollBounceBehavior(.basedOnSize)`), and the paged `TabView` — which has **no intrinsic height** — is
pinned via a `PageContentHeightKey` `PreferenceKey` (max-reduce, the `HeaderHeightKey` idiom) to the tallest
page's **measured content height**. Without the pin the pager was the only flexible child, so the keyboard's
safe-area inset collapsed it to ~0 and hid the inputs with no way to scroll. Now the focused field scrolls
into view, the user can scroll to everything (incl. Back/Continue), swipe-down dismisses the keyboard, and the
pager grows to fit the live password checklist without clipping. Pages are top-aligned (measured content +
trailing spacer) so fields don't shift vertically between steps. Matches the web/Android keyboard behavior.

**Federated buttons on page 0 (D-C8; restyled D-C9, v0.2.1)** — the name page also carries the **same**
"or" divider + **custom dark-pill** "Continue with Google" + "Continue with Apple" section as `LoginView`
(the shared `FederatedSignInLabel`; Apple now via `ProgramContext.startAppleSignIn()` → our own
`ASAuthorizationController`, not the native widget). Email mode only — hidden once the wizard is in the
social branch.

**Social branch (D-C7)** — the view enters a 2-step social mode either (a) when pushed with a
`PendingSocial` (a `needs_profile` OAuth hand-off from `LoginView`), or (b) **in-place** when a Google/Apple
tap on THIS screen returns `needs_profile`. Both routes call `enterSocialMode(with:)`: set the local
`social` state, prefill First/Last (**editable**) + Email from the provider and **lock** the Email field
(`.disabled`), and drop the password page (**pages 0–1 only**, 2 dots). Because this IS `CreateAccountView`,
the in-place route **does not push another CreateAccountView** — it transitions the current view. The
last-page Continue calls `APIClient.completeSocialRegistration()` (`POST /auth/oauth/complete`, pending
access_token as Bearer + re-sent refresh_token) → `ProgramContext.applyAuthResponse` → `ProgramPickerView`.
An existing-member OAuth result (no `needs_profile`) → `applyAuthResponse` → `navigateToProgramPicker`;
409 email-collision → the existing `Alert`.

## 4. Contents / sections

| Block | What | Reference `file:line` |
|-------|------|------------------------|
| Brand logo | **`BrandMark(size: 90)`** — the real `BrandIcon` asset (D-C1). **Was** the legacy placeholder. | legacy `CreateAccountView.swift:150-166`; new `BrandMark.swift` |
| Heading + subheading | "Create Account" / "Start tracking your fitness journey". | legacy `CreateAccountView.swift:39-48` |
| First / Last name inputs | Two `AppInputField`s; **First Name `@FocusState` autoFocus** (D-C5). | legacy `:51-52` |
| Username input | `AppInputField("Username")`. | legacy `:53` |
| Email input + inline hint | `AppInputField("Email")`; **a muted "Enter a valid email address." hint** when typed-but-invalid (D-C2, new). | legacy `:54` |
| Gender menu (optional) | `Menu` of `genderOptions` (`["Female","Male","Non-binary","Prefer not to say"]`); placeholder "Gender (optional)"; sent as-is. | legacy `:168-189` |
| Password + Confirm (+ toggles) | Two secure `AppInputField`s, each with its own `AppPasswordToggleButton`. | legacy `:57-69` |
| **Live password checklist** | **REPLACES the legacy static hint line (D-C3)** — a ✓/○ list (≥8 · uppercase · lowercase · number) that appears on the first keystroke and greens (`appGreen`) per satisfied rule. | legacy static line `:71-75`; new `policyRow` |
| Confirm-mismatch hint (conditional) | **Muted "Passwords don't match." (D-C4)** — was legacy's `appRed` text. | legacy red `:77-82` |
| Create-account button | "Create Account" / `ProgressView`; disabled while `!canSubmit \|\| isLoading`. | legacy `:86-109` |
| Privacy footer | "By creating an account, you accept our **Privacy Policy**" → `Link`. | legacy `:111-119` |
| Sign-in button | "Already have an account? **Sign in**" → `dismiss()`. | legacy `:121-126` |

**Submit flow** (`handleCreateAccount()`, legacy `:208-246`): guard `!isLoading` → `registerAccount(first,
last, username, email, password, gender)` → `loginGlobal(username, password)` → write `ProgramContext`
session → `loadLookupData()` → `persistSession()` → `navigateToProgramPicker = true`. Errors → native
`Alert`; `defer` clears `isLoading`. **`canSubmit`** requires all names + username non-empty, a
**format-valid email** (D-C2; was legacy's non-empty-only), the password meeting policy, and
`password == confirmPassword`.

## 5. Components + features consumed

- **Components:** `AppInputField` + `AppPasswordToggleButton`, **`BrandMark`** (new, D-DEPS), the inline
  `genderPicker` `Menu`, `policyRow` (new inline helper), `AppGradient.background(for:)`, `adaptiveShadow`,
  `Color.appGreen`. All foundation chrome ported (run 50) except `BrandMark` + the `BrandIcon` asset.
- **Features:** [`auth`](../../../features/auth/SPEC.md) — `APIClient.registerAccount()` + `loginGlobal()`
  (`APIClient+Auth.swift:93, 50`), the `ProgramContext` session writes + `loadLookupData()`/`persistSession()`.

## 6. Data / API

- **`POST /auth/register`** (via `registerAccount(...)`) — body `{ first_name, last_name, username, email,
  password, gender? }`; the backend **requires + normalizes + format-validates email** and enforces the
  password policy (≥8 + upper + lower + number), creates the Supabase Auth user + `members` + primary
  `member_emails` rows, returns `{ message, member_id, username, member_name }` — **no token**.
- **`POST /auth/login/global`** (via `loginGlobal(username, password)`) — called immediately after a
  successful register to obtain the session JWT (auto-login). Same contract as the login screen.
- Session persisted by `ProgramContext.persistSession()` (Keychain + UserDefaults).

## 7. Role-based view rules

**N/A at render — public, pre-auth.** No authenticated user (hence no role) exists while the sign-up form
shows; the form and links are identical for every visitor. A role is stamped onto `ProgramContext.globalRole`
only *after* the post-register auto-login.

| Viewer | Sees | Can do |
|--------|------|--------|
| Unauthenticated (any visitor) | Full sign-up form + Sign-in / Privacy links. | Create an account · go to login. |
| Any authenticated role | Nothing — never reaches `CreateAccountView` (root bifurcation). | (root bifurcation only) |

`admin_only_data_entry` is irrelevant here (no program context).

## 8. States & edge cases

- **Loading:** `isLoading` swaps the button for a `ProgressView` and disables it.
- **Validation:** the button is disabled until all required fields are filled, the email is format-valid
  (D-C2), the password meets policy (live checklist, D-C3), and the two passwords match. The email hint +
  checklist appear only after the user types (no flash of errors on a blank form).
- **Register/login error:** caught → a native `Alert` titled "Create Account" (e.g. "Username already
  exists", "Email already exists", a password-policy message).
- **Auto-login after register:** if `register` succeeds but `loginGlobal` throws (rare — same just-created
  credentials), no session is set; the account exists and the user can sign in via `LoginView` (F2).
- **Already authenticated:** N/A — gated at the root (`AppRootView`); the web's authed→redirect cleanup
  (web create-account D-C2) has **no iOS analogue**.
- **autoFocus:** First Name focuses ~350 ms after appear (D-C5) so the form is immediately typeable.
- **Keyboard:** the form scrolls (D-C10) — the focused field scrolls above the keyboard, the user can scroll
  to any field + the Back/Continue buttons, and swiping down dismisses the keyboard. The pager can't collapse
  under the keyboard's safe-area inset, and it grows to fit the live password checklist without clipping.
- **Forward dependency:** `ProgramPickerView` (post-signup target) remains a deferred stub.

## 9. Decisions made

| ID | Decision | Rests on |
|----|----------|----------|
| **D-REF** | **Reference impl = legacy `.../Features/Auth/CreateAccountView.swift`; web parity = [`web create-account`](../../web/create-account/SPEC.md). `consumed_by = [ios]`.** | legacy `CreateAccountView.swift:1-255`; web create-account SPEC. |
| **D-S1** | **Stance = faithful 1:1 port of the legacy iOS `CreateAccountView` + the 4 deviations below.** The field set, the register-then-auto-login flow, the gender `Menu`, the Show/Hide toggles, the sign-in (`dismiss()`) + Privacy links, and `ProgramPickerView` on success are ported verbatim. | legacy `CreateAccountView.swift`; user answers. |
| **D-C1** | **Real brand icon** — `BrandMark(size: 90)` replaces the legacy placeholder (same deviation as splash/login D-C1). | web parity; user answer; [[ios-matches-web-not-just-legacy]]. |
| **D-C2** | **Inline email-format validation (web D-C1).** `canSubmit` now requires a regex-valid email (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) + a muted "Enter a valid email address." hint when typed-but-invalid. Legacy iOS checked non-empty only. Forward-only — the backend already requires + format-validates email. | web create-account D-C1; user answer; auth `register` email-required. |
| **D-C3** | **Live password-policy checklist (web D-C3)** replacing the legacy static hint line. A ✓/○ list (≥8 · uppercase · lowercase · number) appears on the first keystroke and greens (`appGreen`) per satisfied rule, mirroring the server `validatePassword` policy. | web create-account D-C3; legacy static line `:71-75`; user answer. |
| **D-C4** | **Muted confirm-mismatch hint (web D-C4)** ("Passwords don't match.", `secondaryLabel`) instead of legacy's `appRed` "Passwords do not match." | web create-account D-C4; legacy `:77-82`; user answer. |
| **D-C5** | **`autoFocus` the First Name field (web D-C5)** via `@FocusState` set ~350 ms after appear. | web create-account D-C5; user answer. |
| **D-C6** | **3-step paged wizard (v0.2.0).** The single scrolling form → a paged `TabView(.page)` with a `@State step`, a custom 3-dot indicator, and Back/Continue capsules; per-page validation gates Continue; the final Continue = "Create Account" → the unchanged `handleCreateAccount()`. Field set, validators, and the register-then-auto-login flow are byte-for-byte the same — only the layout is paged. | user request; `ProgramActionsSheet` paged idiom; web parity. |
| **D-C7** | **Federated social branch (v0.2.0).** Social mode is driven by a local `social: PendingSocial?` state, entered via `enterSocialMode(with:)` from either the `pendingSocial` init param (set by `LoginView` on a `needs_profile` OAuth response) **or** an in-place Google/Apple tap on this screen. It puts the view in a **2-step** flow: prefill First/Last (editable) + Email (locked) from the provider, drop the password page, and finish via `APIClient.completeSocialRegistration()` (`POST /auth/oauth/complete`) → `applyAuthResponse` → `ProgramPickerView`. | landed `/auth/oauth/complete`; login D-C3; `ProgramContext.applyAuthResponse`. |
| **D-C8** | **Federated buttons on create-account too (parity, v0.2.0).** The name page carries the same "Continue with Google" + native `SignInWithAppleButton` section as `LoginView` (email mode only). A `needs_profile` result transitions THIS view into the social branch **in-place** (no second `CreateAccountView` push) via `enterSocialMode`; an existing member → `applyAuthResponse`; 409 → the existing `Alert`. | user parity decision (2026-07-10); login D-C3; mirrors `LoginView.socialSignInSection`. |
| **D-C9** | **Federated buttons restyled to custom dark pills + Apple via a standalone controller (v0.2.1)** — mirrors login D-C4. Both name-page buttons use the shared `FederatedSignInLabel` dark pill (input-surface capsule matching `AppInputField`; multicolor `GoogleG` for Google, `apple.logo` for Apple). Apple's tap calls `ProgramContext.startAppleSignIn()` (our own `ASAuthorizationController`) instead of the native `SignInWithAppleButton`; the `socialSignIn` call, the in-place `enterSocialMode` on `needs_profile`, and `applyAuthResponse` are unchanged. App-Store-4.8-compliant custom SIWA button. | user request (2026-07-10 — web parity); login D-C4; `FederatedSignInLabel`, `ProgramContext.startAppleSignIn`. |
| **D-C10** | **Keyboard-avoidance fix (v0.2.2).** The form is wrapped in a `ScrollView` (`.scrollDismissesKeyboard(.interactively)` + `.scrollBounceBehavior(.basedOnSize)`) and the paged `TabView` is pinned to its tallest page's **measured content height** via a new `PageContentHeightKey` `PreferenceKey` (max-reduce). Fixes the keyboard collapsing the pager / hiding the fields with no scroll. Field set, validators, and the register-then-auto-login flow are unchanged — **layout-interaction only** (corrects §3a's former "no inner scroll"). User live-verified on device. | user report (2026-07-11); `ForgotPasswordView` `ScrollView` idiom; `HeaderHeightKey` measure idiom; web/Android parity. |
| **D-DEPS** | **One new dependency — `BrandMark.swift` + the `BrandIcon.imageset`** (shared with splash/login). The checklist (`policyRow`) + email regex are inline view helpers (no new module). v0.2.1 uses the shared `GoogleG.imageset` (added by login D-DEPS). Every other import was ported in the foundation (run 50). | foundation inventory (run 50). |

> **D-C-note — the web "already-authed → redirect" cleanup (web create-account D-C2) is N/A on iOS.** The
> iOS root (`AppRootView`) already bifurcates on `authToken`, so an authed user never reaches this screen;
> there is no per-screen redirect to add (the structural mirror of web's `useEffect` redirect).

## 10. Flagged characteristics kept as-is

| ID | Characteristic | Where | Rebuild-cleanup candidate? |
|----|----------------|-------|----------------------------|
| **F1** | **Role from response body, not a JWT decode** (post-register auto-login) — display/routing only; the backend re-verifies every authed call. | `CreateAccountView.swift:224-228` | Kept (faithful) — not a security boundary (mirrors login F1). |
| **F2** | **Two-call register-then-login with no rollback on the login leg.** If `register` succeeds but `loginGlobal` throws, no session is set; the account exists and the user can sign in via `LoginView`. Faithful to legacy. | `CreateAccountView.swift:213-245` | Kept (faithful) — recoverable; a rebuild could surface "account created — please sign in" (mirrors web F2). |
| **F3** | **No client-side rate limiting** on repeated sign-up attempts. | `CreateAccountView.swift:208-246` | Kept (faithful) — server-side (mirrors web F4 / auth F4). |
| **F4** | **No username-format rules client-side** — username only checked non-empty; uniqueness + rules enforced server-side (400 "Username already exists"). | `CreateAccountView.swift` `canSubmit` | Kept (faithful) — server is authority (mirrors web F5). |
| **F5** | **`gender` sent as-is (possibly empty string)** — legacy passes `gender` straight to `registerAccount` with no "send only when non-empty" guard (unlike web, which omits it when blank). | `CreateAccountView.swift:220` | Kept (faithful) — the backend treats blank gender as absent; harmonize with web only if it ever matters. |

## 11. Changelog

| Version | Date | Change |
|---------|------|--------|
| 0.2.2 | 2026-07-11 | **Keyboard-avoidance fix (D-C10).** Wrapped the sign-up form in a `ScrollView` (`.scrollDismissesKeyboard(.interactively)` + `.scrollBounceBehavior(.basedOnSize)`) and pinned the paged `TabView` to its tallest page's **measured content height** via a new `PageContentHeightKey` `PreferenceKey` (max-reduce, the `HeaderHeightKey` idiom). Root cause: the pager had no intrinsic height and was the only flexible child, so the keyboard's safe-area inset collapsed it to ~0 — the inputs vanished with nothing to scroll. Now the focused field scrolls into view, the user can scroll to every field + Back/Continue, swipe-down dismisses the keyboard, and the pager grows to fit the live password checklist without clipping; pages are top-aligned so fields don't jump between steps. Field set, validators, and the register-then-auto-login flow are byte-for-byte unchanged (layout-interaction only); corrects §3a's former "no inner scroll". User live-verified on device; compile green via `xcodebuild` device destination (xcode MCP absent this session). `apps/ios/.../Features/Auth/CreateAccountView.swift`. |
| 0.2.1 | 2026-07-10 | **Federated buttons restyled to custom dark pills + Apple via a standalone controller (D-C9).** The name-page "Continue with Google" + "Continue with Apple" buttons now use the shared `FederatedSignInLabel` dark pill (input-surface capsule = `AppInputField`'s `systemGray3` hairline, no fill, geometry mirroring the primary CTA; 18pt logo + 8pt gap + body-semibold primary-label text) — multicolor `GoogleG` asset for Google, `apple.logo` SF Symbol for Apple, matching web/login. The native `SignInWithAppleButton` is removed; Apple runs through `ProgramContext.startAppleSignIn()` → our own `ASAuthorizationController`. The `socialSignIn` call, the in-place `enterSocialMode` on `needs_profile`, and `applyAuthResponse` routing are unchanged; user-cancel stays silent. iOS compile is USER-run (Xcode). `apps/ios/.../Features/Auth/CreateAccountView.swift` (+ shared `ProgramContext+Auth.swift`, `LoginView.swift`'s `FederatedSignInLabel`, `GoogleG.imageset`). |
| 0.2.0 | 2026-07-10 | **Federated buttons on create-account too + in-place social transition (D-C8, follow-up).** The name page now shows the same "Continue with Google" + native `SignInWithAppleButton` section as `LoginView` (email mode only). A `needs_profile` tap here transitions THIS view into the social branch **in-place** (`enterSocialMode`; no second `CreateAccountView` push); an existing-member result → `applyAuthResponse` → `ProgramPickerView`; 409 → the existing `Alert`. Social mode is now a settable local `social: PendingSocial?` state (entered from the init param OR in-place); `isSocial` is a computed `social != nil`. `apps/ios/.../Features/Auth/CreateAccountView.swift`. |
| 0.2.0 | 2026-07-10 | **Paged 3-step wizard + federated social branch (D-C6, D-C7).** The single scrolling form became a paged `TabView(.page)` (`@State step`, custom 3-dot indicator, Back/Continue capsules, per-page gating) — page 0 names, page 1 username/gender/email, page 2 password/confirm/checklist; final Continue = "Create Account" → the unchanged `handleCreateAccount()` (field set + validators + register-then-auto-login byte-for-byte identical, now routed through the extracted `ProgramContext.applyAuthResponse`). New `pendingSocial: PendingSocial?` init param drives a 2-step social mode (from `LoginView`'s `needs_profile` OAuth hand-off): prefill First/Last (editable) + Email (locked), no password page, finish via `APIClient.completeSocialRegistration()` (`POST /auth/oauth/complete`) → `applyAuthResponse` → `ProgramPickerView`. iOS compile is USER-run (Xcode + xcode MCP). `apps/ios/.../Features/Auth/CreateAccountView.swift`. |
| 0.1.0 | 2026-06-30 | Initial SPEC authored via `question-asker` — the **third iOS screen spec** (closing the iOS public/auth path: splash → login → create-account). Documents the public `CreateAccountView`: first/last name + username + email + optional gender (`Menu`) + password + confirm, register-then-auto-login → `ProgramPickerView`, sign-in (`dismiss()`) + Privacy links. Consumes `auth` (`registerAccount()` `POST /auth/register` + `loginGlobal()`, `ProgramContext+Auth`). Decisions: **D-REF** (`consumed_by=[ios]`; legacy iOS + web parity) · **D-S1** (faithful 1:1 port + 4 deviations) · **D-C1** (real `BrandMark`) · **D-C2** (inline email-format validation + muted hint, web D-C1) · **D-C3** (live password checklist replacing the static hint, web D-C3) · **D-C4** (muted mismatch hint, web D-C4) · **D-C5** (autoFocus First Name, web D-C5); **D-C-note** (web's authed-redirect cleanup is N/A — the iOS root handles it). Flagged F1–F5 (role from body; register-then-login no-rollback; no client rate-limit; no client username rules; gender sent as-is). Role rules N/A (public/pre-auth). Ported `apps/ios/.../Features/Auth/CreateAccountView.swift`. Build green-check owned by the user (Xcode). |
