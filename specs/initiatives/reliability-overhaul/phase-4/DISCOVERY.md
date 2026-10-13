# Phase 4 discovery — polish pick-list, notifications, People

> Read-only discovery (2026-10-13): 6 per-surface polish audits + notifications + People, synthesized. Raw agent output: [`discovery-raw.json`](discovery-raw.json). The user's notification direction (send-anytime, AI reports + email later) postdates this run — see DESIGN_BOARD §9 "Direction".

# Phase 4: walkthrough

*Built from six read-only audits (web, iPhone and Android, each split into account screens and program screens), plus the notification and People discovery briefs. Code references are in the Appendix.*

**Terms used below**
- **Kit** means the shared building blocks for loading, error and offline states: spinners, "Couldn't load · Retry", the offline banner.
- **Effort:** S is a few hours. M is about a day or two per app. L is bigger. These are rough.
- **Old apps** means the versions in the stores today: iPhone 1.4.2 and Android 1.0.0.

---

## 1. At a glance

Phase 4 has three parts.

| Part | What it is | Size |
|---|---|---|
| **Polish pass** | 45 fixes, merged from 89 audit findings. You pick which ones. | Mostly small |
| **Notifications redesign** | An inbox, on/off switches per category, and an optional daily reminder at each person's local time. | Medium (server + 3 apps) |
| **People** | See who's in your program, open their profile, give kudos, and a "Hide my activity" switch. | Medium (server + 3 apps) |

**Your iPhone complaint and what fixes it**

| What you saw | Fix |
|---|---|
| Airplane mode shows "Couldn't refresh" instead of "You're offline". | **#1**: already built on all three, not yet committed or tested |
| The offline banner never shows inside pop-up sheets or the widget forms. | **#2** |
| Members and Lifestyle spin for a long time. | **#5** |
| Tapping a widget shows nothing for up to 15 s. | **#7** |
| **Not covered yet:** Wi-Fi is connected but dead. Each request waits the full 15 s, then says "taking longer" instead of "offline". This is on purpose: a slow server isn't treated as offline. | Test this on the phone after #1, then decide. |

**Proposed order**

| Step | What | Why here | Store upload? |
|---|---|---|---|
| 1 | Polish quick wins **#1–#8**, the "it's just loading" set | It's what you asked for, it's small, and #1 is already built | No |
| 2 | **Privacy fix** (People S0) | Today any signed-in member can list every member and read anyone's email. Server-only and small. | No |
| 3 | **Notifications**: server N1–N2 → apps N3–N5 → reminders N6 | The server parts are safe to put live early | No |
| 4 | **People**: server S1 → apps S2–S4 | Kudos uses the notification categories | No |
| 5 | The rest of the polish items you pick | Can run alongside steps 3–4 | No |
| 6 | **One big store release** (iPhone + Android), then the app-icon badge (N7) | You decided this on 10-13 | **Yes** |

> The original Phase 4 plan put polish last. This order moves the small quick wins first because they're your current ask. Your call.
> Nothing in steps 1–5 needs an App Store or Play upload.

---

## 2. Polish pass: pick list

89 findings were merged into **45 rows**. When the same problem showed up on more than one app, it became one row that names every app. The list is ranked by benefit versus effort.

**Dropped 5:**
- Web metrics search flicker
- Workout-type colors differ between web and Android
- iPhone "Saved"/"Deleted" pop-ups after each edit
- iPhone "Switch Program" stacking screens
- Android long-list performance

These are cosmetic or invisible at today's scale (60 members, at most 30 per program).

**Moved 3:**
- Web "View invite" button and Android notification-settings button go to **Notifications**.
- "Program admins can't manage their own roster" goes to **People** (D-P11).

| # | What's wrong | Fix | Benefit | Effort | Surfaces |
|---|---|---|---|---|---|
| 1 | Airplane mode or dead Wi-Fi shows a spinner or "Couldn't refresh", not "You're offline". The apps only check whether Wi-Fi or cell is switched on. | **Already built (uncommitted):** the first failed request flips the app to offline at once, and a quiet check every 10 s flips it back. Web still needs two hookups: sign-in errors use the new signal, and every screen and save does too. Then build and test on the phone. | **High**: your ask | S | Web · iOS · Android |
| 2 | The offline banner is hidden behind pop-up sheets and full-screen forms (the "+" sheet, widget forms, the Apple Health review). The Invites tab says "Couldn't refresh" instead. | Show the same banner on those screens, and reload invites when back online. | **High**: your ask | S | iOS · Android (sheet) |
| 3 | When the connection comes back, My Programs and Summary keep the error until you tap Retry. | Reload by themselves when back online if the last load failed. iPhone already does this. | **High** | S | Android |
| 4 | Saving with no connection shows "Saving…" forever. | One setting so an offline save fails at once with "Can't connect". | **High** | S | Web |
| 5 | The Members and Lifestyle tabs fetch 5–10 things one after another. On a bad connection that means a long spinner, or zeros. | Fetch them all at once, drop two duplicate fetches, and only show a spinner when nothing is on screen. | **High**: "just loading" | S | iOS · Android |
| 6 | On a stuck connection, the web shows "Loading…" for about 48 s before any error (3 tries × 15 s). | Show the error and Retry after the first failed try, and keep retrying quietly. | **High** | S | Web |
| 7 | Tapping a home-screen widget shows nothing for up to 15 s on weak Wi-Fi, because it waits for a version check first. | Open the form at once and run the check alongside. Android already caps the wait at 3 s. | Med-High | S | iOS |
| 8 | Error messages show tech jargon such as "Failed to fetch", "Unable to resolve host" and "Request failed (500)". This happens on most saves and on the password-reset page. | Send every error through the kit's plain-language message. Useful server messages like "name already exists" are kept. One line per place. | **High** | S | Web · iOS · Android |
| 9 | Some errors are invisible. On web pop-ups and Android's "add workout type" they're drawn behind the open form. On the iPhone workout-type list they're never shown. Deleting a type that has logs looks like nothing happened. | Show the error inside the open form or list. | **High** | S | Web · iOS · Android |
| 10 | After switching program or "View as" member, the cards show the previous one's numbers under the new name. That lasts until loading finishes, or forever if offline. | Clear the old data on switch and show placeholders. | **High**: wrong data | S | iOS · Android |
| 11 | The admin "Active Membership" checkbox silently removes the member. There's no confirm and no undo in the app. | Remove the checkbox. "Remove from program", which has a confirm, already covers this. | **High** | S | Web · iOS |
| 12 | A save that worked is reported as "failed" when the refresh after it fails. Retrying then makes a duplicate program, flips hide/show back, or says "already exists". | Judge success by the save itself and refresh in the background. | **High** | S | Android · iOS (create program) |
| 13 | iPhone: a left-edge swipe on Add workouts, Log health, timelines or Edit program leaves the whole program and loses the form. This is read from code; it needs a 30-second phone check. | Only leave the program from a tab's top screen. Anywhere else, swipe is a normal "back". | **High** | S | iOS |
| 14 | iPhone: the Apple Health first-sync review is full-screen with no way out. If confirming fails offline, you're stuck. | Add a "Later" button. Android's back button already does this. | **High** | S | iOS |
| 15 | Delete Account shows no progress, and a failure appears far up the page. It looks like nothing happened. | Show a spinner on the button and the error, in plain words, right under it. | **High**: store reviewers try it | S | Web · iOS · Android |
| 16 | Log forms say "No workout types available" or "No active members" when the list just failed to load. Widget forms open with empty pickers and never recover. | Say "Couldn't load · Retry", reload when back online, and add a hint to empty pickers. | **High**: main logging path | M | Web · iOS · Android |
| 17 | Sign-up shows "username taken" on the password step, and going Back clears the message. If sign-up worked but the automatic sign-in failed, retrying says "already exists". On iPhone you can also swipe past the checks. | Jump back to the username step with the message. A retry after a successful sign-up only signs in. | Med-High | S | Web · iOS · Android |
| 18 | My Profile shows "Google: Not linked" with a Link button while loading or offline. Web also shows blank name fields. | Show "—" with buttons disabled until loaded, and "Couldn't load · Retry" on failure. Web fills the name from the session. | Med | S | Web · iOS · Android |
| 19 | Refreshing the page or opening a bookmark (member history, streaks, edit program, roles…) bounces you to another page. | Wait for sign-in to restore before redirecting. | Med | S | Web |
| 20 | The widget's quick-add form reopens by itself after you rotate the phone or the nightly dark-mode switch happens. | Use the widget link only once. | Med | S | Android |
| 21 | After picking a Google account there's no spinner, so you can tap twice. On sign-up, Back wipes the whole form. An abandoned Google sign-up sticks until the app restarts. | Add a spinner and disable the button. Back goes to the previous step. Clear the pending Google sign-up when you leave. | Med | S | Android |
| 22 | On My Programs, deleting a program or cancelling a request fails silently. A new invite flips the "+" pop-up to Invites and loses what you typed. Accept and Decline show no progress. | Add one error banner (as on iPhone), pick the tab only when the pop-up opens, and show an "Accepting…" state. | Med | S | Web |
| 23 | After one network blip, "Continue with Google" stays dead until a full page reload. | Retry loading Google's button when back online. | Med | S | Web |
| 24 | Double-tapping Delete on a logged workout shows "Something went wrong" even though the delete worked. Save shows no progress. | Disable the buttons and show a spinner while it runs. | Med | S | Android |
| 25 | The Sign in button appears only after a ~6-second typing animation, every time you're signed out. | Show the button from the start and keep the animation as decoration. | Med | S | iOS · Android |
| 26 | Six chart screens don't scroll, so on smaller phones the bottom of the chart and the legend are cut off. | Make them scroll. | Med: "must fit" rule | S | Android |
| 27 | Apple Health and Health Connect settings say "No programs available" while loading. They also list invited programs that will never get data. | Add loading and error states, and list only programs you're active in. | Med | S | iOS · Android |
| 28 | Login is the only sign-in screen that doesn't scroll. On small iPhones or with large text, fields may hide under the keyboard. This is an estimate; check on a phone. | Use the same scroll setup as Create Account. | Med | S | iOS |
| 29 | Detail screens (timelines, member history, workouts, health, workout types…) show a blank page, raw text or "No data for this range" when loading fails. | Use the kit's error view with Retry (the Summary recipe) through one small shared helper. | Med-High | M | Web · iOS · Android |
| 30 | Summary shows 0%, "0 days" and "No workouts yet" while loading and under errors. iPhone can also show the previous program's totals. | Show "…" while loading and "—" when missing. Android already does this. | Med | S web · M iOS | Web · iOS |
| 31 | The Lifestyle tab shows fake "0", "N/A" and "No data" on failure. There's no Retry and no pull-to-refresh, and the admin view never refreshes. | Apply the Summary recipe and load in parallel. | Med | M | Web · iOS · Android |
| 32 | The Members tab says "No workouts logged yet" or shows a 0-day streak when data didn't load. There's no Retry and no pull-to-refresh. | Apply the Summary recipe. **Do it as People slice S5** so it's built only once. | Med | M | Web · iOS · Android |
| 33 | The Program tab and admin lists (roster, roles, workout types) show "0 active", "No admins" or an empty card on failure. Android has no pull-to-refresh there. | Add a spinner, error and Retry, an honest empty line, and pull-to-refresh. | Med | M | Web · Android |
| 34 | Quick W→M→Y taps can leave the old period's bars under the new label. Sorting a member's workouts also changes the Members-tab preview. | Each detail screen keeps its own results. | Med | M iOS · S Android | iOS · Android |
| 35 | Password managers can't fill or save sign-in details, and email fields lack the @ keyboard. On iPhone, Return doesn't submit login. On Android, usernames get autocorrected and "confirm password" isn't treated as a password. | Add autofill hints and keyboard types. Android uses its password field for "confirm password". | Med | S iOS · M Android | iOS · Android |
| 36 | Many tap targets are only 22–36 pt: the Back pill, row buttons, the password eye, ✕, role chips and invite buttons. Icon buttons and period selectors aren't labelled for screen readers. | Use a 44 pt / 48 dp minimum and add labels and a "selected" state. Shared components cover most of it. | Med | M | Web · iOS · Android |
| 37 | Pop-ups don't close with Escape and aren't announced as dialogs. Program cards can't be opened by keyboard. Form labels aren't linked to their fields. | One shared pop-up fix, make cards into buttons, and link the labels. | Med | S | Web |
| 38 | Create Program allows an end date before the start date, and the program then sits at 0% forever. | Copy Edit's date check. | Low-Med | S | iOS · Web |
| 39 | Performance Metrics sorted by "Avg Steps" shows the workout count as the big number. | Add the missing case. | Low-Med | S | Web |
| 40 | On My Programs, the red "+" badge also counts your own join requests, and the card menu has no "Edit". | Count invites only in the badge, and add Edit (the screen already exists). | Low-Med | S | Android |
| 41 | The account menu has no Support row and no "signed in as" row. Program-tab Sign Out has no "Are you sure?". | Add both rows and the same confirm the phones have. | Low-Med | S | Web |
| 42 | The "View as" picker cuts off rows slightly, and with a few members the last one is clipped. | Let the list size itself. | Low-Med: "must fit" rule | S | Android |
| 43 | Some colors are hard to read. Web sign-in pages show bright light-only boxes in dark mode. Some amber, green and white-on-blue numbers fail contrast. | Use the app's dark-aware styles and darker accent shades. | Low-Med | S | Web · iOS |
| 44 | Clearing gender on My Profile says "updated", but nothing is cleared. | Send an explicit empty value, as web does. | Low | S | Android · iOS |
| 45 | Copy slips: "RaSi Fit'ers" typo on Appearance, and the Health row says "Sync workouts" though it also syncs sleep and steps. | Two text edits. | Low | S | iOS · Android |

### Quick wins (S effort, clear benefit)

If you only take one batch, take **#1–#8**.

- **#1**: Finish and test the offline detection. It's your ask and it's already built.
- **#2**: The offline banner also shows on sheets and widget forms.
- **#3**: Android screens reload by themselves when the connection returns.
- **#4**: No more endless "Saving…" on web.
- **#5**: Members and Lifestyle load everything at once.
- **#6 / #7**: Web shows an error after about 15 s instead of 48 s, and the iPhone widget opens instantly.
- **#8**: Plain-language errors everywhere.
- **#10**: No more showing the previous program's or member's numbers.
- **#11**: Remove the checkbox that silently removes members.
- **#14**: A "Later" button on the Apple Health review.
- **#15**: Delete Account shows progress and errors.

---

## 3. Notifications redesign

**Today**
- Every notification is about programs: invites, joins, leaves and role changes. There were 105 in the last 90 days, mostly invites (46) and "member joined" (38).
- Each one is a pop-up you must dismiss, one at a time. Once dismissed it's gone, with no inbox and no history. 333 are still unread, and one member has 51 waiting, which means 51 pop-ups in a row.
- You can't choose what you get. The settings screens only show whether the phone allows notifications. Web has no settings page and no push.
- There are no reminders, streak nudges or digests. Nothing on the server sends on a schedule, and it doesn't know anyone's time zone.
- Only 22 of 60 members can get push (10 iPhones and 19 Android devices). iPhone never asks for permission at sign-in; Android does.

**Decisions**

| # | Question | Options | Recommendation |
|---|---|---|---|
| D-N1 | Which categories ship first? | (a) All 4: Program & invites, Activity, Reminders, Digest. (b) 3, with Activity waiting for People. (c) 2: Program & invites plus Reminders; Digest next; Activity with People. | **(c)**. No switches that control nothing. |
| D-N2 | What does turning a category off stop? | (a) Everything. (b) The phone alert and pop-up only; the inbox still keeps it. (c) Mixed: turning off Program & invites stops the alert but it stays in the inbox; turning off Reminders or Digest means they're never made. | **(c)**. Invites and membership facts never disappear. |
| D-N3 | How do new notifications appear in the app? | (a) Keep the blocking pop-up and add an inbox. (b) A small floating toast ("Role updated · View") plus the inbox and an unread badge. (c) A pop-up for invites only. | **(b)**. 51 pop-ups in a row is the problem. |
| D-N4 | Where is the inbox? | (a) A bell in the screen headers (breaks the header rule). (b) Grow the existing "My Invites" tab in the "+" sheet into "Inbox"; the badge counts unread + invites; add an Inbox row in the account menu. (c) A new bottom tab. | **(b)**. It reuses what all three apps already have. |
| D-N5 | What counts as "read"? | (a) Reuse today's "dismissed" flag. (b) Add a new separate flag. | **(a)**. Old apps stay correct. |
| D-N6 | How do we learn each member's time zone? | (a) Automatically from each new app or browser. (b) A picker in My Profile. (c) Guess from the country. | **(a)**. No extra UI, and it follows people who travel. |
| D-N7 | When is the reminder sent? | (a) A fixed 7 pm. (b) The member picks a time (default 7 pm). (c) A "smart" time the app learns. | **(b)**. This is what fitness apps normally do, and it's small. |
| D-N8 | What's the reminder rule? | (a) One reminder, only if nothing was logged today; it reads "Keep your N-day streak" when the streak is 2 or more. (b) Separate log and streak reminders. | **(a)**. One switch, at most one push a day. |
| D-N9 | What sends reminders on time? | (a) A 15-minute timer inside the existing server, with a "never send twice" key. (b) A Supabase scheduled job. (c) A separate Render cron service. | **(a)**. No new service, secret or bill. |
| D-N10 | Where are preferences stored? | (a) A small new table with one row per member. (b) A JSON field on members. (c) One row per member per category. | **(a)**. Simple, with sensible defaults. |
| D-N11 | How long do notifications live? | (a) Delete after 90 days, nightly. (b) Keep forever and show only 90 days. | **(a)**. It also clears 407 old unread ones. |
| D-N12 | When does iPhone ask for permission? | (a) As today: only from Settings or when connecting Apple Health. (b) Once after the first sign-in, like Android. (c) "Quiet" provisional permission. | **(b)**. Reminders stay off until switched on. |
| D-N13 | Turn on the "program updated/deleted" alerts that are switched off in code? | (a) Yes, to everyone, including the person who made the change. (b) Yes, but not to the person who made the change. (c) Leave them off. | **(b)** |
| D-N14 | Add an app-icon unread badge? | (a) Yes, but only after old iPhone apps are required to update. (b) No. | **(a)**, with that gate. |
| D-N15 | Which store release carries this? | **Already decided by you on 10-13:** one big release after all of Phase 4. The server parts still go live as soon as they're ready, and they're safe for old apps. | Done |

**Build slices**

| Slice | Where | Effort | What | Safe for old apps? |
|---|---|---|---|---|
| N1 | Server | S | Group types into categories, stack phone alerts per category, turn on "program updated/deleted" (not to the editor), and add the 90-day cleanup. | Yes |
| N2 | Server | M | Preferences, member time zone, the inbox list and "mark all read", and the "never send twice" key. | Yes; old routes are unchanged |
| N3 | Web | M | "My Invites" becomes Inbox, the badge counts unread + invites, a toast with "View" replaces the pop-up, and a new Notifications settings page with switches and a reminder time. | — |
| N4 | iPhone | M | The same Inbox plus an account-menu row, the toast, switches and a time picker, permission asked once after sign-in, and the badge cleared when the inbox opens. | Runs alongside N5 |
| N5 | Android | M | The same, plus a separate "Reminders" channel, a proper status-bar icon, and a real "Open Settings" button. | Runs alongside N4 |
| N6 | Server | S–M | The 15-minute reminder timer. | Yes; nothing sends until someone opts in |
| N7 | Server + 3 apps | S | The app-icon unread badge. | Only after old iPhone apps are required to update |
| N8 | Server + 3 apps | M | Optional weekly digest (Monday 9 am local, opt-in). | Yes |
| N9 | Later | — | The "Activity" category (kudos and activity from your people), together with People. | — |

**Moved here from the polish list**
- Web invite pop-up gets a "View invite" button. This becomes N3's toast "View".
- Android Notifications settings: the left-flush "Open Settings" text and the lack of an in-app permission request are fixed in N5.

**Watch-outs**
- Old apps show every new notification type as a pop-up. Reminders and the digest can only be switched on in new apps, so old-app users never get them.
- Run the 90-day cleanup before the inbox ships, or the first badges will show big numbers.
- Reminders must be opt-in with clear wording (App Store rule 4.5.4), and never "Time Sensitive".
- On web, a reminder only lands in the inbox because there's no web push. Reminders are mainly a phone feature.
- Inbox code goes in new files. Two existing files are already 1,000–1,500 lines.
- Both feature plans call their database change "migration 011". Whichever comes second becomes 012.

---

## 4. People tab

**Today**
- The Members tab is a stats dashboard for one person at a time, not a list of people. A roster exists, but only a global admin can tap a person in it.
- There are no profiles of other people, no activity feed, no kudos and no photos (initials only).
- **Privacy gap today:**
  - Any signed-in member can list all members and read anyone's email.
  - Any program's roster is readable by anyone signed in.
  - Co-members can see each other's sleep, diet and steps averages.
- The only blocking is "block future invites from this program". Two are in use, and there's no way to undo one.
- Scale: 23 programs and 60 members. The biggest program has 30 people. 14 people logged a workout in the last 7 days.

**Decisions**

| # | Question | Options | Recommendation |
|---|---|---|---|
| D-P1 | How wide is People in v1? | (a) The current program's members. (b) Everyone you share any program with. | **(a)** |
| D-P2 | Where does it live? | (a) An add-on: the roster becomes People, opened from a header button for every role, and the dashboard stays. (b) Rebuild the tab: you on top, people below, and tapping a person replaces "View as". (c) A new 5th tab. | **(a)** now, keeping the name "Members". Consider (b) later if People gets used. |
| D-P3 | What does a profile show? | (a) Workouts only: streaks, active days this month, the last ~10 workouts, last active. (b) (a) plus steps. (c) (a) plus sleep, diet and steps. (d) (a) plus a program-wide activity feed. | **(a)**. Sleep and diet stay staff-only. |
| D-P4 | Kudos in v1? | (a) None. (b) One tap per person per day, can be undone, a count only, no text. (c) Kudos plus comments or reactions. | **(b)**. No text means no App Store moderation duties. |
| D-P5 | What is a kudos attached to? | (a) A person's day. (b) One workout row, which breaks when edited or synced. (c) Add workout IDs first. | **(a)** |
| D-P6 | Is activity visible by default? | (a) Yes, with a "Hide my activity" switch. (b) Hidden until people opt in. | **(a)**. It matches today's server and the approved concept. |
| D-P7 | What does "Hide my activity" hide, and from whom? | (a) One switch for all programs. It hides your stats, workouts and kudos from plain co-members. You stay on the list by name, staff still see everything, and program totals still count you. (b) Same, but also hidden from staff. (c) One switch per program. | **(a)** |
| D-P8 | Close today's privacy gaps first? | (a) Yes, all of them (server-only, same response shapes). (b) Email only. (c) Leave them. | **(a)** |
| D-P9 | Person-to-person blocking? | (a) Nothing new: "Hide my activity" and leaving the program are enough, and the per-program invite block stays. (b) Block a person. (c) Mute kudos from someone. | **(a)**. Revisit if kudos ever gets text or photos. |
| D-P10 | Profile photos? | (a) Initials only. (b) Photo upload. | **(a)**. Photos bring moderation duties. |
| D-P11 | What can each role do on a profile? | (a) Everyone sees the summary, and staff also get "Open full stats"; editing memberships stays global-admin only. (b) Also let program admins edit or remove members from a profile. | **(a)** for v1. *Moved from polish:* today the person who creates a program can't remove anyone from it; only a global admin can. If that bothers you, pick **(b)**. The server already allows it. |

**Build slices**

| Slice | Where | Effort | What | Safe for old apps? |
|---|---|---|---|---|
| S0 | Server | S | Close the privacy gaps:<br>• email only to yourself or a global admin<br>• the all-members list for global admins only<br>• rosters only for program members<br>• others' sleep, diet and steps hidden from plain members | Yes, after checking every caller in today's apps |
| S1 | Server | M | The "Hide my activity" switch, kudos, the People list and profile, one shared visibility check on every per-person read, and a kudos notification. | Yes |
| S2 | Web | M | The Members list becomes the People list ("You" on top, every row opens a profile), a profile page with kudos, the switch in My Profile, and a People button for every role. | — |
| S3 | iPhone | M | The same. | Runs alongside S4 |
| S4 | Android | M | The same. | Runs alongside S3 |
| S5 | All 3 | S | Move the Members-tab dashboard onto the kit (polish #32). | — |
| S6 | Docs | S | A new People spec and updated feature and page specs. | — |
| S7 | Later, optional | L | Rebuild the Members tab per D-P2(b). Only if People gets used. | — |

**Watch-outs**
- "Hide my activity" must cover every place per-person data comes out (about 8 server routes), or the switch lies. That needs one shared check plus a test that lists every route.
- Showing synced Apple Health and Health Connect workouts to other people needs updated consent wording, an updated privacy policy and updated store data-safety answers.
- "Current streak" doesn't reset when you skip today, so co-members would see stale streaks. Fixing it changes every streak number, which needs its own decision.
- Kudos needs the notification categories and member time zones, so keep Notifications first.
- At this scale, no paging or caching is needed.

---

## 5. Screen inventory

✓ means the screen is on the kit. ✗ means it loads data but handles errors and offline its own way. – means there's no data to load, or it uses another screen's data.

**Web: 7 ✓ · 23 ✗**

| Screen | Kit | Note |
|---|---|---|
| Landing (/) | – | Static |
| Splash (/splash) | – | Unlinked |
| Login | ✓ | Light-only boxes in dark mode |
| Create account | ✓ | "Taken" shown on the wrong step |
| Forgot password | ✗ | Own fixed message (fine) |
| Reset password | ✗ | Raw errors |
| My Programs | ✓ | List only; actions not |
| Account menu | – | No Support row |
| "+" pop-up: Invites / Create / Edit | ✓ | Create/edit show raw errors |
| My Profile | ✗ | Saves ✓, loads ✗ |
| Change password | ✓ | |
| Appearance · Privacy · Policy · Support · Delete account | – | Static |
| Notifications | – | No page; pop-up only |
| Summary | ✓ | Fake zeros while loading |
| Activity timeline | ✗ | |
| Distribution by day | ✗ | |
| Workout types (Summary) | ✗ | |
| Log workout | ✗ | Endless "Saving…" offline |
| Log daily health | ✗ | Same |
| Bulk log workout | – | No such page; the spec still lists it |
| Members tab | ✗ | No error handling |
| Members list | ✗ | |
| Member detail (admin) | ✗ | |
| Invite member | ✓ | |
| Performance metrics | ✗ | |
| Workout history | ✗ | |
| Streaks | ✗ | |
| View workouts | ✗ | No error branch |
| View health | ✗ | No error branch |
| Lifestyle tab | ✗ | |
| Lifestyle timeline | ✗ | |
| Steps timeline | ✗ | |
| Workout types manager | ✗ | |
| Program tab | ✗ | |
| Edit program | ✗ | |
| Manage roles | ✗ | |

**iPhone: 6 ✓ · 23 ✗**

| Screen | Kit | Note |
|---|---|---|
| Splash | – | Sign in appears after ~6 s |
| Login | ✓ | Doesn't scroll |
| Create account | ✓ | Can swipe past checks |
| Forgot password | ✗ | Own fixed message (fine) |
| My Programs | ✓ | |
| Account menu (2 copies) | – | Copy drift |
| My Profile | ✗ | Saves partly ✓; delete shows raw text |
| Change password | ✓ | |
| Appearance | – | Typo |
| Notifications settings | – | Replaced by the redesign |
| Apple Health settings | ✗ | |
| Apple Health first-sync review | ✗ | No way out |
| "+" sheet: Invites | ✓ | Offline banner hidden |
| "+" sheet: Create program | ✗ | Raw errors; no date check |
| Edit program | ✗ | Raw errors |
| Widget: add workouts form | ✗ | Silent empty pickers |
| Widget: daily health form | ✗ | Same |
| Home-screen widgets | – | Static tiles |
| Program tabs (shell) | – | Edge-swipe issue |
| Summary | ✓ | Fake zeros / previous program |
| Activity timeline / member history | ✗ | Error never shown |
| Distribution · Workout types (Summary) | – | Use Summary's data |
| Add workouts | ✗ | Raw save errors |
| Log daily health | ✗ | Same |
| Members tab | ✗ | Errors swallowed; loads one by one |
| Member metrics | ✗ | |
| Member workouts | ✗ | |
| Member health | ✗ | |
| Member streaks | ✗ | |
| Lifestyle tab | ✗ | Errors swallowed; loads one by one |
| Lifestyle timeline | ✗ | |
| Steps timeline | ✗ | |
| Program tab | ✗ | |
| Members list / member editor / invite | ✗ | Invite uses kit wording |
| Manage roles | ✗ | |
| Workout types list | ✗ | Errors invisible |

**Android: 9 ✓ · 24 ✗**

| Screen | Kit | Note |
|---|---|---|
| Splash | – | Offline banner shows; ~6 s wait for the button |
| Login | ✓ | No Google spinner |
| Create account | ✓ | Back wipes the form |
| Forgot password | ✗ | Fixed message; hard-coded red |
| My Programs | ✓ | No reload on reconnect |
| Account menu (2 copies) | – | |
| "+" sheet: Invites / Create | ✓ | Create shows raw errors |
| My Profile | ✗ | |
| Change password | ✓ | Confirm field isn't a password field |
| Appearance | – | Typo |
| Notifications settings | – | Replaced by the redesign |
| Notification pop-up | – | Fine |
| Health Connect settings | ✗ | False "No programs" |
| Health sync first-time review | ✗ | |
| Widget: workout form | ✗ | Stays empty after offline |
| Widget: daily health form | ✗ | Same |
| Home-screen widgets | – | Form reopens after rotation |
| Update required | ✓ | |
| Program tabs (shell) | ✓ | Offline banner |
| Summary | ✓ | No reload on reconnect |
| Activity | ✗ | Doesn't scroll |
| Distribution · Workout types (Summary) | – | Use Summary's data |
| Log workout | ✗ | |
| Log daily health | ✗ | |
| Members tab | ✗ | |
| Member metrics | ✗ | |
| Member history | ✗ | |
| Member streaks | ✗ | |
| Member workouts | ✗ | Double-delete issue |
| Member health | ✗ | |
| Invite member | ✓ | |
| Roster | ✗ | |
| Member editor | ✗ | |
| Lifestyle tab | ✗ | |
| Lifestyle timeline | ✗ | |
| Steps timeline | ✗ | |
| Workout types manager | ✗ | |
| Program tab | ✗ | |
| Edit program | ✗ | |
| Manage roles | ✗ | |

---

## 6. Appendix: evidence

**Path prefixes**
- web = `apps/web/src/`
- iOS = `apps/ios/RaSi-Fiters-App/` (file names are unique)
- Android = `apps/android/app/src/main/java/com/app/rasifiters/`
- backend = `apps/backend/`

Line numbers come from the audits and may shift slightly in files that have uncommitted edits.

| id | file:line |
|---|---|
| #1 | `specs/initiatives/reliability-overhaul/plans/polish-1-offline-detection.md` rules 1–6 · `specs/initiatives/reliability-overhaul/HANDOFF.md:68-69` (airplane mode "Couldn't refresh") · iOS `NetworkMonitor.swift`, `APIClient.swift` (working tree, uncommitted) · web `lib/kit/use-online-status.ts`, `lib/api/client.ts`, `app/providers.tsx` (working tree) · web still link-only: `lib/kit/app-error.ts:153`; no `onlineManager` anywhere in web src · dead-Wi-Fi gap: polish-1 rule 2 (timeouts ≠ offline), web `lib/api/client.ts:50` (15 s) |
| #2 | iOS `AppRootView.swift:47-51, 122-136, 146-154`; `InvitesTabView.swift:105-115` · Android `ui/programs/ProgramActionsSheet.kt:98`; `ui/RootScreen.kt:244-252` |
| #3 | Android `ui/programs/ProgramPickerScreen.kt:140, 157-160, 206`; `ui/summary/SummaryScreen.kt:81, 89, 95` · iOS (has it) `ProgramPickerView.swift:89-90`; `AdminSummaryTab.swift:104-105` · frontend-kit D-KIT-13 |
| #4 | web `app/providers.tsx:32`; `components/forms/LogWorkoutsForm.tsx:535`; `components/forms/LogDailyHealthForm.tsx:608` |
| #5 | iOS `StandardMembersTab.swift:161-197, 175-187`; `StandardWorkoutTypesTab.swift:117-137`; `AdminWorkoutTypesTab.swift:100-106, 135-149`; `AdminMembersTab.swift:131-139`; `MemberCards.swift:249-253` · Android `ui/members/MembersScreen.kt:103-112, 160-174`; `core/ProgramContext.kt:1267-1281` |
| #6 | web `lib/api/client.ts:50`; `app/providers.tsx:11-24`; `lib/kit/async-state.ts:33-36`; `app/programs/page.tsx:317-321` · iOS `ProgramPickerView.swift:532-539` (one 15 s try) |
| #7 | iOS `AppRootView.swift:72-76, 80-86, 110-121` · Android `ui/RootScreen.kt:181-191` (3 s cap) |
| #8 | web `app/reset-password/page.tsx:105-107`; `app/summary/page.tsx:317, 336`; `app/summary/log-workout/page.tsx:59`; `app/programs/page.tsx:186, 451, 543`; `lib/api/client.ts:136-139` · iOS `AddWorkoutsDetailView.swift:463-467`; `AddDailyHealthDetailView.swift:516-521`; `MemberRecentDetail.swift:422, 824`; `MemberHealthDetail.swift:457, 968`; `MyProfileView.swift:453`; `CreateProgramTabView.swift:152`; `EditProgramInfoView.swift:223`; `ProgramCards.swift:92` · Android `core/ProgramContext.kt:1458`; `net/ApiException.kt:28`; `ui/summary/LogWorkoutScreen.kt:204`; `ui/summary/LogHealthScreen.kt:230`; `ui/programs/ProgramActionsSheet.kt:339`; `ui/summary/QuickAddWorkoutWidgetScreen.kt:221`; `ui/program/EditProgramScreen.kt:158` |
| #9 | web `app/members/workouts/page.tsx:162, 204, 247, 399-475`; `app/members/health/page.tsx:166, 262-270, 317, 504-593`; `app/lifestyle/workouts/page.tsx:82, 94, 147, 189-258` · iOS `WorkoutTypesSection.swift:134, 253, 290-326, 376` · Android `ui/lifestyle/WorkoutTypesListScreen.kt:92-95, 122-125` · backend `services/workoutService.js:215` |
| #10 | Android `core/ProgramContext.kt:547, 988, 1435-1455`; `ui/members/MembersScreen.kt:164-165` · iOS `AdminMembersTab.swift:123-139`; `MemberOverviewPicker.swift:85, 105-113, 138`; `MemberCards.swift:23, 46, 69-70, 136-143, 249-250`; `ProgramPickerView.swift:458-470` |
| #11 | web `app/members/detail/page.tsx:132-142`; `app/members/list/page.tsx:97-101` · backend `services/membershipService.js:150, 221-223, 328-345` · program-member-management SPEC:52, 68 |
| #12 | Android `core/ProgramContext.kt:480-488, 540-544, 1308-1340`; `ui/programs/ProgramActionsSheet.kt:336-340` · iOS `ProgramContext+ProgramManagement.swift:98-108` · backend `services/workoutService.js:126-141, 152` · web (safe) `app/programs/page.tsx:140-142` |
| #13 | iOS `Shared/Components/EdgeSwipeToReturn.swift:73-84, 101-126`; `AdminSummaryTab.swift:202-207` |
| #14 | iOS `AppRootView.swift:146-154`; `HealthSyncConfirmationView.swift:50-59, 141-143` · Android `ui/health/HealthSyncConfirmationScreen.kt:74, 117` |
| #15 | web `components/ui/ConfirmDialog.tsx:42-45`; `app/program/profile/page.tsx:208, 296, 498` · iOS `MyProfileView.swift:63-67, 88-91, 453` · Android `ui/program/ProfileScreen.kt:182, 390, 440-442` |
| #16 | web `components/forms/LogWorkoutsForm.tsx:147-158, 315-320`; `components/forms/LogDailyHealthForm.tsx:174-175, 368` · Android `ui/summary/LogWorkoutScreen.kt:143-149, 246-248`; `ui/summary/LogHealthScreen.kt:162-165`; `ui/summary/QuickAddWorkoutWidgetScreen.kt:126-141`; `ui/summary/QuickAddHealthWidgetScreen.kt:117-128`; `ui/summary/DetailChrome.kt:192-213` · iOS `QuickAddWorkoutWidgetEntryView.swift:474, 488-497, 557-564`; `QuickAddHealthWidgetEntryView.swift:522, 538, 598-603`; `SearchablePickerSheet.swift:18-35` |
| #17 | backend `services/authService.js:187, 190` · web `app/create-account/page.tsx:183-206, 436-439` · iOS `CreateAccountView.swift:80-87, 389-401, 425-433, 440-459` · Android `ui/auth/CreateAccountScreen.kt:95-101` |
| #18 | web `app/program/profile/page.tsx:73-83, 136-143, 227-229, 400`; web page SPEC program/profile §8 (:134) · iOS `MyProfileView.swift:33-34, 131-138, 271-287, 293-295, 411-420` · Android `ui/program/ProfileScreen.kt:94-95, 115-122, 217, 264-303, 313` |
| #19 | web `lib/auth/auth-provider.tsx:53, 211-226`; `app/members/history/page.tsx:37-42`; `app/members/streaks/page.tsx:27-32`; `app/members/workouts/page.tsx:70-75`; `app/members/health/page.tsx:85-90`; `app/members/detail/page.tsx:32-36`; `app/members/invite/page.tsx:21-25`; `app/program/edit/page.tsx:34-38`; `app/program/roles/page.tsx:28-32`; `app/summary/log-workout/page.tsx:26-30` |
| #20 | Android `MainActivity.kt:22-23`; `apps/android/app/src/main/AndroidManifest.xml:38-42`; `ui/RootScreen.kt:181-191` |
| #21 | Android `ui/auth/GoogleCredential.kt:96-106`; `ui/auth/LoginScreen.kt:115-124`; `ui/auth/CreateAccountScreen.kt:56-57, 159, 178-184`; `core/ProgramContext.kt:271, 335, 1428`; `ui/RootScreen.kt:288` |
| #22 | web `components/ui/ConfirmDialog.tsx:42-45`; `app/programs/page.tsx:91-105, 197-201, 368-370, 567-570, 981-999, 1020-1023` · iOS `ProgramPickerView.swift:10, 348, 446, 492, 513`; `ProgramActionsSheet.swift:70-77`; `InvitesTabView.swift:211` |
| #23 | web `components/GoogleSignInButton.tsx:27-31, 107-109, 141` |
| #24 | Android `ui/members/MemberRecentDetailScreen.kt:203-209, 377`; `ui/members/MemberHealthDetailScreen.kt:203-209, 392` · backend `services/logService.js:497-498` |
| #25 | iOS `SplashView.swift:11-12, 37, 44, 62, 110, 133-136` · Android `ui/auth/SplashScreen.kt:46-64, 117` |
| #26 | Android `ui/summary/ActivityDetailScreen.kt:62-67`; `ui/summary/DistributionDetailScreen.kt:39-44`; `ui/members/MemberSimpleDetails.kt:59-63, 143-147`; `ui/lifestyle/LifestyleTimelineDetailScreen.kt:80-84`; `ui/lifestyle/StepsTimelineDetailScreen.kt:78-82`; `ui/shell/AppScaffold.kt:140` |
| #27 | Android `ui/health/HealthConnectSettingsScreen.kt:92, 306-315` · backend `services/healthSyncService.js:155` · iOS `AppleHealthSettingsView.swift:92-97, 189` |
| #28 | iOS `LoginView.swift:20-138`; `ForgotPasswordView.swift:24`; `CreateAccountView.swift:53-54` |
| #29 | web `app/summary/activity/page.tsx:39-45`; `app/summary/distribution/page.tsx:52-54`; `app/summary/workout-types/page.tsx:39-41`; `app/members/history/page.tsx:58-60`; `app/members/workouts/page.tsx:249-253`; `app/members/health/page.tsx:319-323`; `app/lifestyle/timeline/page.tsx:63-67`; `app/lifestyle/workouts/page.tsx:149`; `app/members/detail/page.tsx:98` · Android `ui/summary/ActivityDetailScreen.kt:48-56`; `ui/members/MemberSimpleDetails.kt:123-132`; `ui/lifestyle/LifestyleTimelineDetailScreen.kt:66-75`; `ui/lifestyle/StepsTimelineDetailScreen.kt:65-73`; `ui/members/MemberRecentDetailScreen.kt:143`; `ui/members/MemberHealthDetailScreen.kt:145` · iOS `ActivityTimelineDetailView.swift:20, 96-101, 245-246`; `LifestyleTimelineDetailView.swift:109, 283`; `StepsTimelineDetailView.swift:89`; `MemberMetricsDetailView.swift:147` |
| #30 | web `app/summary/page.tsx:235, 387-440, 432, 620-621` · iOS `AdminSummaryTab.swift:168-170, 242-256`; `ProgramContext+Analytics.swift:58-74`; `ProgramPickerView.swift:459-466` · Android (does it right) `ui/summary/SummaryScreen.kt:147-188` |
| #31 | web `app/lifestyle/page.tsx:238-282, 403-407, 495-499, 560-562` · iOS `AdminWorkoutTypesTab.swift:12, 103-105, 135-148`; `StandardWorkoutTypesTab.swift:11, 135`; `WorkoutTypesCards.swift:56, 91-99` · Android `ui/lifestyle/LifestyleScreen.kt:48`; `core/ProgramContext.kt:1229, 1267-1281, 1480`; `ui/lifestyle/LifestyleCards.kt:107-130, 208-213, 348-355` |
| #32 | web `app/members/page.tsx:68-198, 291, 341, 345-346, 579-581, 728, 758` · iOS `StandardMembersTab.swift:9, 163`; `MemberOverviewPicker.swift:110, 399, 417`; `MemberCards.swift:69-70, 137`; `AdminMembersTab.swift:70-72` · Android `ui/members/MembersScreen.kt:63`; `ui/members/MemberCards.kt:230, 365-376, 447-448` |
| #33 | web `app/program/page.tsx:154, 188-192, 233-237, 297` · Android `ui/members/MemberManagementScreens.kt:158, 185`; `ui/program/ManageRolesScreen.kt:57, 77`; `ui/lifestyle/WorkoutTypesListScreen.kt:85, 138`; `ui/program/ProgramSections.kt:173, 198, 264`; `ui/program/ProgramScreen.kt:71-77` · iOS (has pull-to-refresh) `MemberManagementSection.swift:106`; `WorkoutTypesSection.swift:145`; `RoleManagementSection.swift:221` |
| #34 | iOS `ActivityTimelineDetailView.swift:216, 231`; `LifestyleTimelineDetailView.swift:273`; `StepsTimelineDetailView.swift:240`; `MemberMetricsDetailView.swift:166`; `MemberRecentDetail.swift:199-201, 388`; `MemberHealthDetail.swift:428`; `MemberCards.swift:136-143` · Android `ui/summary/ActivityDetailScreen.kt:59, 110`; `ui/members/MemberRecentDetailScreen.kt:89` |
| #35 | iOS `Shared/Components/AppInputField.swift:19-20`; `CreateAccountView.swift:204`; `MyProfileView.swift:204-205` · web (has hints) `app/login/page.tsx:171, 184` · Android `ui/auth/AuthComponents.kt:156-165`; `apps/android/gradle/libs.versions.toml:7`; `ui/program/ChangePasswordScreen.kt:84, 95` |
| #36 | web `components/BackButton.tsx:9`; `app/programs/page.tsx:398-403, 478-484, 688, 981-998, 1114`; `components/ui/PeriodSelector.tsx:24-31`; `app/members/page.tsx:816, 828` · iOS `AppInputField.swift:40-47`; `AddWorkoutsDetailView.swift:228-234`; `AddDailyHealthDetailView.swift:217-223`; `RoleManagementSection.swift:236-245`; `ProgramPickerView.swift:327-338, 380-385, 896-900`; `WidgetQuickAddComponents.swift:37-47` · Android `ui/auth/AuthComponents.kt:209-216`; `ui/programs/InviteInbox.kt:102-107`; `ui/members/MemberRecentDetailScreen.kt:256`; `ui/summary/LogWorkoutScreen.kt:345`; `ui/summary/DetailChrome.kt:244-252`; `ui/program/AppearanceScreen.kt:124, 152`; `ui/health/HealthConnectSettingsScreen.kt:318-335` |
| #37 | web `components/ui/Modal.tsx:28-35`; `components/NotificationModal.tsx:33-35`; `app/programs/page.tsx:732-735, 1030-1031`; `components/ui/GlassCard.tsx:24`; `app/program/profile/page.tsx:254, 268`; `app/program/password/page.tsx:78, 101` |
| #38 | iOS `CreateProgramTabView.swift:21-23`; `EditProgramInfoView.swift:38-41` · Android (has it) `ui/programs/ProgramActionsSheet.kt:295` · backend `services/programService.js:93-107` · web `app/programs/page.tsx:1022-1081` |
| #39 | web `app/members/metrics/page.tsx:28, 242-263` |
| #40 | Android `ui/programs/ProgramPickerScreen.kt:154, 411-425` · iOS `ProgramPickerView.swift:25-26` · web `app/programs/page.tsx:195, 368` |
| #41 | web `app/programs/page.tsx:487-534, 573-584`; `app/program/page.tsx:454-525, 516-519` · iOS `ProgramPickerView.swift:605-613, 685-689`; `ProgramCards.swift:431` · Android `ui/programs/AccountMenuSheet.kt:99, 112`; `ui/program/ProgramAccountSection.kt:47, 106` |
| #42 | Android `ui/members/MembersScreen.kt:342, 373-378`; `ui/summary/DetailChrome.kt:195` |
| #43 | web `app/login/page.tsx:150-154, 196`; `app/create-account/page.tsx:437`; `app/forgot-password/page.tsx:91, 118`; `app/reset-password/page.tsx:136, 141, 200`; `app/globals.css:14, 159-180`; `app/lifestyle/page.tsx:216, 270, 351, 359-366`; `app/summary/page.tsx:475-484` · iOS `WorkoutTypesCards.swift:39, 148` |
| #44 | Android `ui/program/ProfileScreen.kt:178-179, 196`; `net/Network.kt:25` · backend `services/memberService.js:131` · iOS `Shared/Services/APIClient+Members.swift:337` · web `app/program/profile/page.tsx:158` |
| #45 | iOS `AppearanceSettingsView.swift:17`; `ProgramPickerView.swift:662`; `ProgramCards.swift:365`; `AppleHealthSettingsView.swift:107` · Android `ui/program/AppearanceScreen.kt:57`; `ui/programs/AccountMenuSheet.kt:108`; `ui/program/ProgramAccountSection.kt:93` |
| Dropped | Metrics search flicker: web `app/members/metrics/page.tsx:121-131, 213` · Colors: web `app/lifestyle/page.tsx:712-733`, Android `core/theme/Color.kt:31-36` · iOS success pop-ups: `MemberRecentDetail.swift:171, 188-197, 420` · Switch Program stacking: iOS `AdminProgramTab.swift:51-54`; `ProgramCards.swift:129, 262` · Android long lists: `ui/members/MemberRecentDetailScreen.kt:143`, backend `services/memberAnalyticsService.js:400-401` |
| Moved | Web "View invite": `components/NotificationModal.tsx:38-45`; `components/NotificationsGate.tsx:118-121` · Android notification settings: `ui/program/NotificationsScreen.kt:113-128`; `ui/RootScreen.kt:84-92`; iOS reference `NotificationsSettingsView.swift:51-78` · Program admins' roster: web `app/members/list/page.tsx:64, 107`; `app/members/detail/page.tsx:32-36`; backend `services/membershipService.js:183-192, 304-313` |
| N-1 | Emit + push: backend `utils/notifications.js:43-96`; `utils/pushNotifications.js:58-90, 86`; `utils/push/apns.js:58-66`; `utils/push/fcm.js:10-17, 54` |
| N-2 | Routes: backend `routes/notifications.js:24-53, 104-138, 140-160, 162-188` |
| N-3 | Types: backend `services/inviteSendService.js:74`; `services/inviteService.js:171, 212`; `services/membershipService.js:266, 331, 414`; `utils/programMemberships.js:79, 116, 131, 215` · stub `services/programService.js:20-23, 176, 210` |
| N-4 | Schema / time zone / scheduler: backend `sql/001_schema.sql:24-39, 214-236`; `sql/010` (prunes only push_deliveries and tokens); `utils/clientInfo.js:4-10`; `middleware/requestLog.js:41`; `package.json` (no cron) |
| N-5 | Blocking pop-up queue: web `components/NotificationsGate.tsx:51-307`, `app/shell.tsx:60` · iOS `AppRootView.swift:32-41`, `ProgramContext+Notifications.swift` · Android `ui/RootScreen.kt:129-136`, `core/ProgramContext.kt:560-664` |
| N-6 | Permission asks: iOS `NotificationsSettingsView.swift:159-170`; `HealthKitSyncNotifier.swift:16-21` · Android `ui/RootScreen.kt:79-90` |
| N-7 | Badges / channels / icon: iOS `AppDelegate.swift:61-65` · web `app/programs/page.tsx:254-257` · Android `App.kt:21-37`; `push/RaSiFirebaseMessagingService.kt:51`; `AndroidManifest.xml:85-88` |
| N-8 | Prod numbers (512 total, 105 in the last 90 days, 333 unread, max 51, 22/60 with a device, 7 push_deliveries): read-only prod query, 2026-10-13 (notifications discovery) · D-N15 already decided: `HANDOFF.md:72` |
| P-1 | Members tab by role: web `app/members/page.tsx:44-49, 262, 281, 363, 411` · iOS `AdminHomeView.swift:73-75`; `StandardMembersTab.swift:70-79` · Android `ui/members/MembersScreen.kt:79-83, 147-182` |
| P-2 | Roster taps for global admins only: web `app/members/list/page.tsx:64` · iOS `MemberManagementSection.swift:65-96` · Android `ui/members/MemberManagementScreens.kt:153-188` |
| P-3 | Data model: backend `sql/001_schema.sql:24-34, 110-119`; migrations 006, 009 (:88-91) · streaks `services/memberAnalyticsService.js:28-48` |
| P-4 | Privacy gaps: backend `routes/members.js:12-32` (any signed-in user); `services/memberService.js:16-23, 25-45` (all members; email) · `services/memberAnalyticsService.js:6-26, 115-124, 215-220` · `services/logService.js:735-738` · `routes/analytics.js:102-121` · `services/membershipService.js:122-172` · `services/analyticsService.js:198-205, 253` |
| P-5 | Plain-member apps already download everyone's metrics: iOS `StandardMembersTab.swift:175-184` · Android `ui/members/MembersScreen.kt:164-165` · old-app caller to re-check: iOS `ProgramContext+Members.swift:20-24` |
| P-6 | Blocking: backend `services/inviteService.js:234-235`; `services/inviteSendService.js:50-53` |
| P-7 | Prod scale (23 programs, 60 members, max 30, 166 memberships, 14 active in 7 days): read-only prod query, 2026-10-13 (People discovery) |
