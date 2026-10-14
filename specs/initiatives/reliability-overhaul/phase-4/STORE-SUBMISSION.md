# Phase 4 store submission (2026-10-13): iOS 1.5.2 (60) + Android 1.2.0 (7)

> Claude drives the consoles in the browser pane. **Each change gets the user's yes.** The user types no secrets.
> Source for the privacy answers: `plans/phase-4-p-server/plan.md` §"Privacy, consent and store disclosures" C.
> **Status: both submitted 2026-10-13; Android published the same night** (`RELEASES.md`). Not done, the user's call: Play step 5 and the optional Play
> title tweak (`../plans/phase-4-seo.md`).

## What's new (same text on both stores; Play allows ≤ 500 characters)
```
• Inbox: all your notifications in one place. Remove one, or clear them all.
• Reminders and a weekly digest, on your schedule (off until you turn them on).
• People: see who's in your programs, their streaks, and send kudos. Hide your activity any time in My Profile.
• Faster, more reliable sign-in and sync, with clear messages when you're offline.
• Tap your initials to open your profile.
• Lots of fixes and polish.
```

## App Store Connect: iOS 1.5.2 (60)
1. Add a new version 1.5.2 → build 60. Paste the What's new text.
2. **App Review notes**: keep the demo login (`ava.rivera`), then append:
   > People (Members → People): members of a program see each other's workouts and streaks and can send kudos (a
   > count, no text). Synced Apple Health workouts are included; members are told this in a one-time notice and can
   > hide their activity in My Profile → Hide my activity.
3. **App Privacy** (check; change only what's missing):
   - Health & Fitness → **Health** and **Fitness**: Collected, Linked to the user, App Functionality, no tracking.
   - Identifiers → **Device ID** (the install id): Linked, App Functionality.
   - Diagnostics → **Other diagnostic data** (`app_events`: sign-in and sync events): Linked, Analytics + App
     Functionality.
   - Time zone: stored only to schedule reminders at local time. It isn't an Apple category, so make no change unless
     the form asks.
4. Submit for review with **manual release**, so the People flag on web flips only once the store version is out.

## Play Console: Android 1.2.0 (7)
1. Internal testing: upload the AAB (the user clicks Upload; Claude does the rest). Release notes = What's new.
2. Promote 7 to **closed testing** (this reaches the Pixel) and to **production**. Send for review together (managed
   publishing ON — each approval waits for the user's Publish click).
3. **Data safety** (check):
   - Health and fitness → Fitness info (workouts, steps) + Health info (sleep): Collected, App functionality. If the
     form counts showing workouts to co-members as sharing, mark Fitness info Shared = Yes.
   - Device or other IDs (the install id): Collected, App functionality.
   - App info and performance → Diagnostics (`app_events`): Collected, Analytics + App functionality.
4. *(Not changed on 2026-10-13 — review it if Play asks.)* **Health Connect declaration**:
   - ExerciseSession READ: "Workouts are logged to the user's fitness programs and shown to the other members of
     those programs after the user is told so in the app; the user can hide them with Hide my activity."
   - SleepSession + Steps READ: "Shown only to the user and their program's admins and loggers."
5. *(Not done — user's call.)* Store settings → Contact details → Website = `https://rasifiters.com` (SEO).

## After approval
The remaining go-live steps (the App Store Release, `LATEST_IOS_VERSION`) live in
[`../HANDOFF.md`](../HANDOFF.md) "Next action".
