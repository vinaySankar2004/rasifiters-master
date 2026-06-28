# Product: rasifiters / ios (L2)

The RaSi Fiters iOS app. Pure SwiftUI. Consumes the `backend` API. Built after `web`.

**Reference implementation:** `../../../ios-mobile` (the legacy iOS app). Faithful 1:1 rebuild; the only
intended change is the auth path (Supabase-issued tokens via the backend proxy).

## Stack
- SwiftUI (no UIKit) · Swift 5 · iOS 18.6 target · zero third-party deps (native frameworks only)
- Architecture: MVVM via one central `ProgramContext` ObservableObject (extended by feature categories)
- Tokens in **Keychain**; session metadata in UserDefaults
- Real-time: Server-Sent Events stream; Push: APNs
- Bundle id: `com.vinayaksankaranarayanan.RaSi-Fiters-App` · URL scheme `rasifiters://`

## Targets
- **RaSi-Fiters-App** — the main app (~79 Swift files in the legacy app).
- **RaSi-Fiters-App-Widgets** — home-screen widgets: quick-add workout (`rasifiters://quick-add-workout`)
  + quick-add health (`rasifiters://quick-add-health`).

## Surface (screens, from the legacy app)
Splash · Login · CreateAccount · ProgramPicker · AdminHome (Summary / Members / Lifestyle / Program tabs,
admin + standard variants) · member detail/metrics/streaks/history · Settings (profile / password /
appearance / notifications) · widget entry views · notification modal.

## Auth (client side)
- **Leaning:** keep the existing Keychain + APIClient networking and have the **backend proxy** issue
  Supabase tokens (clients change minimally) rather than embedding `supabase-swift`. Confirm + lock in the
  iOS `auth` SPEC (open follow-up in `ICM.md`).

## Deploy
Xcode → TestFlight → App Store. App config (`min_ios_version`) served by the backend `/app-config`.

## Status
📄 not built — last in the build order (after `web` proves the auth path).
