# HealthKit Submission Checklist (Apple Health auto-sync)

Manual steps for the [`apple-health`](../../specs/features/apple-health/SPEC.md) feature. Code + entitlements +
Info.plist ship in the repo; the items below are **user-run** (Xcode UI, Apple portals, DB) and cannot be done
by Claude via MCP.

---

## 0. Database (once)

- [ ] Run `apps/backend/sql/004_seed_healthkit_workout_types.sql` against the Supabase DB (SQL editor or
      `psql "$DATABASE_URL" -f …`). Idempotent (`ON CONFLICT DO NOTHING`). Until this runs, synced workouts
      whose name isn't yet in `workouts_library` land as per-program custom rows.

## 1. Xcode project (RaSi-Fiters-App target)

- [ ] **Signing & Capabilities** → add **HealthKit**, tick **Background Delivery**.
- [ ] Add **Background Modes** → tick **Background fetch**.
- [ ] Confirm `RaSi-Fiters-App.entitlements` has `com.apple.developer.healthkit` +
      `com.apple.developer.healthkit.background-delivery` (already committed).
- [ ] Confirm `Info.plist` has `NSHealthShareUsageDescription`, `NSHealthUpdateUsageDescription`,
      `UIBackgroundModes → fetch` (already committed).
- [ ] The new Swift files auto-join the target (filesystem-synchronized group) — verify they build.

## 2. Apple Developer Portal

- [ ] Certificates, Identifiers & Profiles → the RaSi Fiters App ID → enable **HealthKit**.
- [ ] Regenerate provisioning profiles if needed.

## 3. Privacy policy

Update the privacy policy to state the app:
- [ ] reads **workout data** (type, duration, date) from Apple Health;
- [ ] sends it to the RaSi Fiters backend to auto-log workouts to the user's programs;
- [ ] never uses health data for advertising/tracking/third parties, and does not store it in iCloud;
- [ ] can be disconnected in Settings; access is revocable via iOS Settings → Privacy & Security → Health.

## 4. App Store Connect

- [ ] **App Privacy** → add **Health & Fitness**, **Linked to User**, purpose **App Functionality**; NOT
      Tracking/Advertising.
- [ ] **App Review notes** — test steps:
      1. Sign in → account menu → **Apple Health** → **Connect to Apple Health** → grant read permission.
      2. Select a program under **Sync to Programs**.
      3. Record a workout in the Apple Workouts/Health app (or add manually).
      4. Return to RaSi Fiters (or tap **Sync Now**) → the workout appears in the program's logs.
- [ ] Provide a test account with at least one active program.

## 5. On-device verification (HealthKit does NOT work in the Simulator)

- [ ] Clean install on a physical iPhone.
- [ ] Connect + grant → select program(s) → Sync Now works.
- [ ] Record a workout → auto-sync on foreground; **local notification** shows the count.
- [ ] Record two same-type workouts on one day → one aggregated log.
- [ ] A day already logged manually is **skipped** (not overwritten).
- [ ] Sign out clears settings; Disconnect stops background delivery.
