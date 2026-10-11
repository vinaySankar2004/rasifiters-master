# W5 — Android Google sign-in · Phase 0 discovery brief

> 2026-10-11 · read-only · repo @ `20e014f` · evidence from the user's Pixel 7 (`2C151FDH20037A`) and the
> pulled `base.apk` of the installed Play build 1.0.0 (4). Suspect ruled on: **S5**.

## 1. Summary

- **The dialog text does not come from our code.** "No credentials available" is not in the APK's dex or in
  backend/web/iOS. It is the message Android's framework Credential Manager sends (AOSP `GetRequestSession`,
  `TYPE_NO_CREDENTIAL`) when **every provider returns zero entries**. Here that provider is GMS
  `credman.service.GoogleIdService`. The failure happens **on the device, before any network call**, so
  the backend and Supabase are not involved.
- **The shipped config is correct:** compiled `serverClientId` = repo = ENV_RUNBOOK §7 = Supabase audience;
  APK signer SHA-1 = the recorded Play App Signing SHA-1. **The device rules out the easy causes:** one
  Google account, GMS 26.36.66, GMS credential providers registered and enabled.
- **S5 is partly confirmed, with a different mechanism.** The client ID is fine. The defect is that the
  explicit button uses the **bottom-sheet** option `GetGoogleIdOption` with no fallback. Google documents
  that this option excludes accounts that need re-authentication and is suppressed by the account's
  "Sign-in prompts" setting.
- **The root cause is not proven yet.** The failing tap (2026-10-10 12:26) has already rotated out of
  logcat. Next steps: the live capture in §9, a web sign-in with the same account, and the GCP checklist.

## 2. How it works today

| Step | Where (verified) |
|---|---|
| Button composable; tap → `scope.launch`. No in-flight guard, and callers never pass `enabled` | `apps/android/.../ui/auth/GoogleCredential.kt:48-107`, `:69-70`; `LoginScreen.kt:113-122`, `CreateAccountScreen.kt:177-185` |
| Request: `GetGoogleIdOption.Builder().setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID).setFilterByAuthorizedAccounts(false)`. No `setAutoSelectEnabled`, **no `setNonce`**, a single option, no `GetSignInWithGoogleOption` | `GoogleCredential.kt:73-79` |
| `getCredential` → `GoogleIdTokenCredential.createFrom(...)` (the `CustomCredential.type` is not checked) | `GoogleCredential.kt:80-81` |
| Errors: cancellation is silent. **Any other exception → `onError(e.message)`** with no type mapping, retry, fallback or telemetry | `GoogleCredential.kt:83-86` |
| UI: an `AlertDialog` titled **"Login"** shows the raw message, which is exactly the reported "Login / No credentials available" | `LoginScreen.kt:51-58` |
| Account-settings Link uses the same option, so the same failure applies | `GoogleCredential.kt:114-123` ← `ProfileScreen.kt:277`, errors `:282-286` |
| `serverClientId` source | `apps/android/app/build.gradle.kts:55` (debug), `:71` (release) |
| Libraries: credentials 1.3.0, googleid 1.1.1 (confirmed in the APK; play-services-auth 21.1.1) | `gradle/libs.versions.toml:19-20` |
| Exchange: `socialSignIn` → `OAuthRequest(provider="google", idToken, pushToken)`, no nonce | `core/ProgramContext.kt:219-241`, `net/Dtos.kt:74-80` |
| Backend `POST /auth/oauth` → `signInWithIdToken`; a rejection is logged and returns 401; 409 on email collision; otherwise `needs_profile` | `apps/backend/routes/auth.js:90-103`; `services/authService.js:405`, `:417-428`, `:458`, `:484` |
| Supabase Auth config (Management API, read-only token): Google enabled; client IDs = web `…9vhk5o43…`, iOS `…if8tb588…`, Android `…9env4iu…`; `skip_nonce_check=false`; signups enabled | — |

## 3. Device + build evidence

| Command (adb = `-s 2C151FDH20037A`) | Result |
|---|---|
| `getprop ro.build.version.release / .sdk / ro.build.fingerprint` | Android **17**, SDK 37, `CP3A.260905.009` |
| `dumpsys package com.app.rasifiters` | versionCode 4, versionName 1.0.0, installer `com.android.vending`, installed 2026-09-28 |
| `pm path` → `adb pull base.apk` → `apksigner verify --print-certs` | SHA-1 `e83ad5500f0532809fe39a97ffb598625e7a4901` (= ENV_RUNBOOK's Play App Signing `E8:3A:…:49:01`), SHA-256 `0bb3aede…9369731e`, Google-issued DN, Play Source Stamp present |
| `strings classes*.dex \| grep googleusercontent` | Only `938606130476-9vhk5o43c2g0ib4a167l1o4mmnt52f9b` (the web client) |
| `aapt2 dump resources` | `default_web_client_id` = the same web client; `project_id` = `rasi-fiters` |
| `strings classes*.dex` + `grep -rn` of the apps for "No credentials" | No match, so the text is not app-authored |
| `dumpsys package com.google.android.gms / com.android.vending` | GMS **26.36.66**; Play Store 53.4.34 |
| `cmd package query-services -a android.service.credentials.system.CredentialProviderService` | GMS `GoogleIdService` + `RemoteService`; user provider = GMS `PasswordAndPasskeyService` (`settings get secure credential_service`); no credman component disabled |
| `dumpsys account` (counts only) | **1** `com.google` account |
| `dumpsys usagestats` | App last used 2026-10-10 12:26 (the failure session) |
| `logcat -g`; `logcat -d -b all` grep | 256 KiB rings: main ≈10 min, system ≈20 min, events ≈2 h. **No** CredentialManager, GoogleId, DEVELOPER_ERROR or `[28xxx]` lines; the failure is gone |
| `dumpsys credential` | Empty (no dump implementation) |
| local `google-services.json` (jq, non-secret fields only) | `oauth_client` has only the web client (type 3) and iOS (type 2). **No `client_type: 1` Android client or cert hash** |

## 4. Ranked root-cause hypotheses

**H1 — The bottom sheet suppresses this account on this device (most likely).** `GetGoogleIdOption` is the
bottom-sheet flow, so GMS returns no entry when any of these is true:

- (a) The account needs re-authentication. Docs: "The bottom sheet excludes accounts that require
  re-authentication".
- (b) "Sign-in prompts" is off under Google Account Settings > Sign in with Google, which suppresses the
  sheet for all accounts.
- (c) A cooldown after the user dismissed the prompt. This is documented for legacy One Tap but not for
  Credential Manager, so it is unconfirmed.

Zero entries produce the framework's "No credentials available".

- *For:* the message's origin. The binary config is verified correct. The code is unchanged since Play
  testers succeeded (`GoogleCredential.kt` last changed 2026-07-10, before builds 3 and 4). It also fits the
  report: the user's own account, on a phone first set up 2026-09-28.
- *Against:* the setting and re-auth state have not been observed.
- *Confirm:* run §9. Check the "Sign-in prompts" setting. Check Settings → Passwords & accounts for
  "action required". Sign in on rasifiters.com with the same account.

**H2 — The GCP Android OAuth client regressed or is missing for the Play key.** Each Android client holds
**one** package + SHA-1 (the Google codelab says a debug-SHA client works only for debug builds). ENV_RUNBOOK
§7 records the SHA-1s as **Firebase fingerprints**, not as OAuth clients.

- *For:* `google-services.json` lists no Android OAuth client. The SHA-1 of `…9env4iu…` (render.yaml) is
  unrecorded. Since June 2025, Google auto-deletes OAuth clients after 6 months without token activity
  (restorable for 30 days).
- *Against:* Play testers worked after 2026-07-11, and 3 months is under 6.
- *Confirm:* §9 console steps 3 and 5. A second Play user failing would make it project-wide.

**H3 — The consent screen went back to Testing and the Pixel's account is not an owner or test user.**

- *For:* this is the same symptom as July.
- *Against:* it is "the user's own account". If that account is the GCP owner, Testing doesn't block it.
- *Confirm:* the Audience page, plus the web sign-in test. The web uses the same consent screen, so it would
  show "Access blocked".

**H4 — An Android 17 or GMS 26.36 behavior change on the framework path.** There is no evidence either
way; the logcat capture decides.

**Ruled out:** wrong/rotated client ID (APK = repo = Supabase); non-Play signing key (SHA-1 matches);
`filterByAuthorizedAccounts(true)` (it is `false` at `:75`/`:118`); no Google account; the GMS
multi-account bug (fixed in 24.40; device is single-account on 26.36); a missing provider dependency;
backend/Supabase (the failure precedes any network call).

**Secondary code defects** (not this symptom): no nonce (replayable id_token); raw exception text shown;
no double-tap guard; `catch (e: Exception)` also catches coroutine cancellation; no telemetry (this
failure was invisible until a screenshot).

## 5. Verdict — S5

**Partially confirmed.** The location (`GoogleCredential.kt:73`) is right. The client-ID half is
**refuted**: the ID is correct everywhere and the APK is Play-signed with the recorded SHA-1.

The code-level defect is binding `GetGoogleIdOption` to an explicit button with no fallback, so any
bottom-sheet suppression becomes an unrecoverable "No credentials available"; Google specifies
`GetSignInWithGoogleOption` for buttons. Regression vs third cause: evidence leans to a **third,
account-level cause (H1)**; H2/H3 stay open until the console checklist + logcat capture.

## 6. Cross-surface divergences

- **Web:** a custom button runs a GSI `initCodeClient` popup (`openid email profile`) →
  `apps/web/src/components/GoogleSignInButton.tsx:88-94`. The backend exchanges the code
  (`authService.js:264-286`). It is always interactive and doesn't depend on device accounts.
- **iOS:** `GIDSignIn.signIn(withPresenting:hint:additionalScopes:nonce:)` with a SHA-256 nonce; the raw
  nonce is forwarded (`Shared/Models/ProgramContext+Auth.swift:253-261`). Client `…if8tb588…`
  (`Info.plist:13-14`). It is always interactive.
- **Android** is the only surface that uses a passive, suppressible primitive for its button, and the only
  one that sends no nonce. The backend contract is identical across surfaces (SPEC F8).

## 7. Target contract (industry standard)

1. **Button → `GetSignInWithGoogleOption(serverClientId = WEB)` + nonce.** This flow is interactive,
   includes accounts that need re-auth, is not suppressed by "Sign-in prompts", and lets the user add an
   account ([About SiwG](https://developer.android.com/identity/sign-in/credential-manager-siwg),
   [Implement SiwG](https://developer.android.com/identity/sign-in/credential-manager-siwg-implementation)).
2. **Optional passive sheet** when the screen opens: `GetGoogleIdOption` with
   `filterByAuthorizedAccounts(true)` and `setAutoSelectEnabled(true)`. Retry with `false` on
   `NoCredentialException`. It is never the only path (Implement SiwG).
3. **A nonce for every request.** Pass SHA-256(raw) to Google and send the raw nonce to `/auth/oauth`;
   GoTrue re-hashes it and compares (the same as iOS). The server verifies it.
4. **Typed error mapping:** cancellation → silent; `NoCredential` from the sheet → fall through to the
   button flow; `NoCredential` from the button → "add a Google account"; `ProviderConfiguration` → "update
   Google Play services"; `Interrupted` → retry once; else → a human message. Every non-cancel failure is
   reported (type + message, no PII) via W6's client error channel
   ([Troubleshooting](https://developer.android.com/identity/sign-in/credential-manager-troubleshooting-guide)).
5. **Config:** one Android OAuth client per signing cert (Play App Signing is required for Play installs,
   plus the upload key and each machine's debug key), in the same project as the web client. Consent screen
   In production. The web client stays the Supabase audience
   ([codelab](https://codelabs.developers.google.com/sign-in-with-google-android)).
6. **One in-flight request per button.**

## 8. Live-binary constraints

- 1.0.0 (4) is live on Play production and closed testing; some testers may still be on (3). It hard-codes
  `GetGoogleIdOption`, web client `…9vhk5o43…` and no nonce.
- A code fix needs versionCode ≥ 5 plus Play review. **Console fixes (H2/H3) reach the live binary
  immediately.**
- Never delete or rotate the web client, or remove it from Supabase's list. Never delete the Android or iOS
  clients. The nonce must stay **optional** in `/auth/oauth`.

## 9. Live-capture recipe + GCP checklist

```sh
ADB="$HOME/Library/Android/sdk/platform-tools/adb"; S=2C151FDH20037A
OUT=/private/tmp/claude-501/-Users-vinayaksankaranarayanan-Developer-rasifiters-master/9597ef9d-f5c4-4a1f-91de-0ec959c8e048/scratchpad/w5-capture.txt
T0="$("$ADB" -s $S shell "date '+%m-%d %H:%M:%S.000'" | tr -d '\r')"   # quoted, or date splits
# USER: RaSi Fiters → Login → tap "Continue with Google" → wait for the dialog (repeat once after ~10 s)
"$ADB" -s $S logcat -t "$T0" -b main,system,crash,events -v threadtime > "$OUT"   # since T0; no buffer clear
grep -iE 'CredentialManager|credman|GoogleIdService|RemoteService|GetGoogleId|SignInWithGoogle|GetCredential|NoCredential|No credentials|BeginSignIn|IdentityCredential|GoogleAuthUtil|ApiException|statusCode|DEVELOPER_ERROR|developer console|\[28[0-9]{3}\]|reauth|canceled sign-in|sign-in prompt|consent|signature|rasifiters' "$OUT"
PIDS=$("$ADB" -s $S shell pidof com.google.android.gms com.google.android.gms.persistent com.google.android.gms.unstable com.android.credentialmanager system_server | tr -s ' \r\n' '|' | sed 's/|$//')
grep -E "^[0-9-]+ [0-9:.]+ +($PIDS) " "$OUT" | grep -iE 'auth|cred|google ?id|sign' | head -200
```

Run it within ~5 minutes of the tap (the main ring holds ~10 minutes); the `T0` quoting was dry-run-verified.

**Differential tests (user, no code):** (a) Continue with Google on rasifiters.com with the same account;
(b) Google Account Settings > Sign in with Google > **Sign-in prompts** is on; (c) Settings → Passwords &
accounts shows no re-auth prompt on the Google account; (d) a second Play user tries.

**GCP console checklist (project `rasi-fiters`, #938606130476):**

1. IAM: is the Pixel's account an **Owner**?
2. Google Auth Platform → **Audience**: publishing status = **In production**, user type External, and the
   test-user list.
3. Google Auth Platform → **Clients**:
   - The web client `…9vhk5o43…` exists.
   - List **every** Android client with its package + SHA-1. One must be `com.app.rasifiters` +
     `E8:3A:D5:50:0F:05:32:80:9F:E3:9A:97:FF:B5:98:62:5E:7A:49:01`.
   - Record the SHA-1 of `…9env4iu…`.
   - Check each client's "last used" date and any deleted-client or restore notice.
   - The iOS client exists.
4. **Branding** has no warnings. **Data Access** has only `openid`/`email`/`profile`.
5. Firebase → Android app → SHA fingerprints. If `E8:3A…` is here but has no matching OAuth client in
   step 3, that is H2.
6. Play Console → App integrity → App signing: confirm the SHA-1 is still `E8:3A…`.
7. Inbox: look for any Google Cloud email about OAuth client inactivity or deletion.

## 10. Open questions

- Has Google sign-in **ever** succeeded on this Pixel, or on any production Play install since 2026-08-06?
  There is no server record of Android Google sign-ins: Render has no request logs, and `socialSignIn`
  logs only rejections.
- What device was the July "user live-tested → works" check on: the emulator debug build or a Play build?
- Is the Pixel's account the GCP owner (this decides H3)?
- Will W6's client error reporting carry the Credential Manager exception type plus the GMS status?
