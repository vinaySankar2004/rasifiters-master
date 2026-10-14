# Phase 4 — test checklist (user, on device)

> Everything is built, reviewed and committed. The server and web are live; People is dark on web until
> release day. The phones test from the store test channels: iOS **1.5.1 (59)** on TestFlight Internal, and Android
> **versionCode 6** on Play internal testing. Tick what passes and note anything odd. Your iPhone,
> your Pixel and the web are enough.

## 1. Notifications (all three)
- [ ] **Inbox:** the "+" sheet's first tab says **Inbox**. Invites sit at the top, notifications below, and the badge
      on "+" counts new items. The account menu has an **Inbox** row that shows "N new".
- [ ] **No pop-up queue:** a new notification shows a small banner at the top for 5 s, with **View** and **×**.
      View opens the right place: an invite opens Inbox, a role change opens that program.
- [ ] **Settings** (account menu → Notifications):
  - [ ] There are five switches. Reminders and the weekly digest start **off**.
  - [ ] Turn Reminders on and set the time 10–15 min ahead. With nothing logged today, one reminder arrives within
        about 15 min of that time. Nothing arrives if you already logged a workout today.
- [ ] **iPhone only:**
  - [ ] Permission is asked once after you sign in.
  - [ ] The app-icon badge clears when you open the Inbox.
- [ ] **Pixel only:**
  - [ ] The system notification settings list separate channels, Reminders included.
  - [ ] The status-bar icon is the plain white RaSi mark.
- [ ] **Composer** (web, global admin; account menu → Announcements):
  1. Target **chosen members → just you**, write a message with `{first_name}`, and check the preview.
  2. Send now. It arrives as a push on both phones and in every Inbox.
- [ ] **Old apps unaffected:** if anyone is still on the App Store / Play 1.x versions, they see the usual invite
      pop-ups and never the new types.

## 2. People (phones; web stays dark until release day)
- [ ] **People list:** Members tab → **People** header button (every role). "You" is first, everyone shows
      initials, and every row opens a profile.
- [ ] **Profile:** shows the current and longest streak, this month's active days, recent workouts and last
      active. Staff also get **Open full stats**.
- [ ] **Kudos:** give kudos to a co-member (a test account works). The count goes up and the button says
      "Kudos given"; tap again to undo. They get an Activity notification.
- [ ] **Hide my activity** (My Profile, above "Sign out everywhere"): turn it on. A co-member now sees you by
      name with "Activity hidden". Staff still see everything.
- [ ] **Visibility notice:** "Who can see your activity" shows once per account, and never over a form or the
      Apple Health review.

## 3. Quick wins + polish (spot checks)
- [ ] **Offline (airplane mode):**
  - [ ] The banner shows on the "+" sheet, the widget forms and the Apple Health / Health Connect review.
  - [ ] Saves fail at once with plain words.
  - [ ] Everything reloads by itself when you come back online.
- [ ] **Switching:** switching program or "View as" never shows the previous program's or member's numbers.
- [ ] **Widget:** the iPhone widget opens the form at once on weak Wi-Fi.
- [ ] **Charts (iPhone):** a tall-bar tooltip is fully visible.
- [ ] **CSV:** the Member Performance Metrics CSV is identical on all three for the same sort, filter and search.
- [ ] **iPhone:**
  - [ ] An edge swipe on detail screens goes back one screen. It never leaves the program.
  - [ ] The Apple Health review has **Later**.
  - [ ] Login fields stay above the keyboard with large text.
  - [ ] VoiceOver reads the W/M/Y/P period buttons as words. If not, tell me.
- [ ] **Pixel:**
  - [ ] Rotating or switching dark mode on a widget form doesn't reopen it.
  - [ ] Chart detail screens scroll vertically, and a sideways drag still scrubs the chart.
  - [ ] A password manager fills and saves on Login and Create Account. Check how the autofill tint looks.
  - [ ] Back during sign-up goes back one step.
  - [ ] **Edit** from a program card's ⋮ works.
  - [ ] The ⋮, ✕ and password-eye respond to taps at their edges.
- [ ] **Web:**
  - [ ] Refreshing a bookmarked page (member history, edit program) keeps you there.
  - [ ] Escape closes pop-ups.
  - [ ] Sign-in pages look right in dark mode.
  - [ ] The account menu has **Support** and a "signed in as" row.
  - [ ] Program-tab Sign Out asks first.
  - [ ] Creating a program with the end date before the start date is refused.

## 4. Release touch-ups (iOS 1.5.2 (60) · Android 1.2.0 (7) · web): the quick check before submitting
- [ ] **Inbox, remove one:**
  - iPhone: a left swipe on a notification shows **Remove**.
  - Pixel: swipe the card away, past about 40 % of its width. A short brush springs back.
  - Web: **×** on the row.
  - The "+" badge and "N new" update.
  - Invitations (Accept/Decline) can't be removed.
- [ ] **Inbox, Clear all:** **Clear all** sits on the Notifications heading. It asks first, then empties the
      notifications on every device. Invitations stay.
- [ ] **Offline:** remove or Clear all fails at once with plain words, and no confirm opens.
- [ ] **iPhone only:**
  - Tapping a notification still opens it.
  - A right swipe from the middle of a card still goes back, from the program shell and from the account row.
  - In the "+" sheet, swiping a card doesn't jump to Create.
- [ ] **Profile circle:** on Summary and Program, tap your initials circle. My Profile opens, and Back (button,
      swipe, system back, browser back) returns to the same tab.
- [ ] **iPhone edge swipe:** a tiny edge touch on a tab's top screen no longer leaves the program. A real swipe or
      a quick flick still does.

## 5. Known and accepted
- Returning from History / View Workouts on the iPhone Members tab shows placeholders once while it reloads.
- Routing a notification from inside a program on the iPhone takes about 1 s.
- On web, People stays hidden until release day (flip `PEOPLE_LIVE`).
