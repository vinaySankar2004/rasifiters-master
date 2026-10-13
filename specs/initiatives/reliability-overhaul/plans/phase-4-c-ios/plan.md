# PLAN: Phase 4 Track C, iOS client for Notifications (N4 + iOS parts of N7/N8) and People (S3 + S5 = polish #32), revision 2

**Brief accepted**: yes. 38 files: 25 modified (including `project.pbxproj`) and 13 new. Docs are listed separately and belong to the orchestrator. Every file is inside the brief.

**Feature/version prediction** (git-version):
- The iOS track lands as one no-bump `feat(ios)` commit.
- The orchestrator's single docs commit for all three client tracks then bumps (one bump per feature across web, iOS and Android):
  - **notifications**: next MINOR above the server landing. `reference_impl` gains the client files and a client D-rule is added.
  - **people**: MINOR. `consumed_by` gains ios.
  - **invites**: MINOR. Invitations now live inside the Inbox, with target routing (newly documented client behaviour).
  - **member-analytics**: MINOR. The S5 Members-tab states are newly documented client behaviour.
  - **frontend-kit**: PATCH. D-KIT-17 wording changes: "Inbox + Create" tabs, and the root Inbox sheet carries `.offlineBanner()`.
  - **members, observability, apple-health**: PATCH each.
- No app version bump: the repo stays at 1.5.1 (59).

**Surfaces in scope**: [ios] only. Backend, web and Android are parallel tracks with disjoint files.

**Base and anchors**: All iOS paths below are relative to `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App/`.
- Apply on top of the **committed Wave A state** (commit `53f2e5d`; the working tree is clean).
- Match anchors on the quoted text.
- Where a whole function or file is given, it replaces the Wave A version and keeps that version's stated intents.

**Files shared with quick-wins (already committed; compose, never revert):**
- `App/AppRootView.swift`: keep it ≤ ~200 lines (QA7).
- `ProgramActions/ProgramActionsSheet.swift` and `ProgramActions/InvitesTabView.swift`: keep `.offlineBanner()` and the D-KIT-17 116-pt rule.
- `Tabs/StandardMembersTab.swift` and `Tabs/AdminMembersTab.swift`: keep #5 (parallel reads, no all-member download) and #10 (never another program's numbers).
- `Shared/Models/ProgramContext+Members.swift`
- `ProgramManagement/MemberManagementSection.swift`, `Settings/MyProfileView.swift` and `Tabs/ProgramCards.swift`.

## Changes since revision 1 (adversary objections)

| # | Objection | Resolution |
|---|---|---|
| 1 BLOCKING | Offline, the "+" sheet's Inbox tab lost the 116-pt band (D-KIT-17). | `InboxView(reservesOfflineBand:)` is true only in the "+" sheet's paged TabView, giving 116 pt while offline. Every other host gets the band from a safe-area inset. Steps 17 and 19. |
| 2 BLOCKING | The Member Performance Metrics preview showed another program's or session's rows. | The card keeps its own `loadedProgramId` and runs `.task(id: program\|refresh)`. Rows show only after this card's own successful load for the program on screen. A failure with nothing of its own shows "Couldn't load this". Step 36(b). |
| 3 BLOCKING | "Open full stats" leaked that member's numbers into the Members tab. | The `memberCardsOwner` token replaces the borrowed flag. Any owner mismatch resets the cards to placeholders and sets `.loading` **before** reloading. This applies on both Members tabs **and** on `MemberFullStatsView` (the reverse case, a tab switch). Steps 8, 27, 32, 33 and 35. |
| 4 | The toast or push "View" popped the open program. | `openTarget(_:)`: `inbox`/`invites` targets open a **root Inbox sheet** over whatever is on screen, so the program stays open. If something is already presented, the picker fallback (TC10) runs. Steps 9, 10, 14 and 16. |
| 5 | The second header button breaks the standing "never add buttons to iOS custom headers" rule. | TC1 now adds **no** header button on the Admin tab. Admins open People from the Program tab's People row, which is today's roster entry ("existing entry per role", D-P2). The header-button option goes to the user (UA-1). |
| 6 | The two new sections skipped kit rules. | Both sections reload on reconnect. The preferences section shows an inline "Couldn't refresh · Retry" row over kept data. Steps 23 and 29. |
| 7 | "Hide my activity" could report a success that didn't happen. | A PUT response without `hide_activity` now throws. A failed "Hide" from the notice shows an alert. Steps 5 and 28. |
| 8 | Items could be marked read without being seen. | Live reloads run only while the inbox is visible (`isVisible`). Mark-all runs only after this visit's list loaded. Step 19. |
| 9 | File sizes. | `InboxFeed` moves to `InboxRow.swift`, which the brief allows. The remaining overages are recorded in TC14. |
| 10 | Too many prompts at launch. | The notice shows only after the awaited system prompt, and only when nothing is presented or pending (`canPresentRootAlert`); otherwise it waits for the next session start. Step 9. |
| 11 | D-N12 and D-N14 reinterpreted without asking. | Raised to the user as UA-2 and UA-3. |
| 12 | Smaller items. | Accept closes the sheet before the read mark. A profile that 404s goes back. The comment cites D-C10. The file count is corrected to 25 + 13. |

## User decisions needed at plan approval
The implementer builds the **default** unless the user picks the alternative.

| ID | Question | Default (built) | Alternative |
|---|---|---|---|
| **UA-1** (TC1) | Should the Admin Members tab get a People header button? | **No.** Admins open People from the Program tab's "People" row, which is today's roster entry. This honours "never add buttons to iOS custom headers". | Step 32 header becomes `HStack(spacing: 12) { NavigationLink { PeopleListView() } label: { GlassButton(icon: "person.2") }.accessibilityLabel(PeopleCopy.title); <the existing Invite NavigationLink> }`, and the "Members" `Text` gains `.lineLimit(1).minimumScaleFactor(0.7)`. |
| **UA-2** (TC4 / D-N12) | When does iOS ask for notification permission? | **Once per install, at the first session start (sign-in or session restore)**, only while `.notDetermined`. Users of 1.5.0 restore their session and never sign in again, so strictly "after sign-in" would never ask them. | Ask only after an interactive sign-in. Existing users are then never prompted, though Settings → Enable still works. The orchestrator re-plans only `preparePushOnSessionStart` (step 9). |
| **UA-3** (D-N14) | The app-icon badge ships in this release. | **Yes.** It is per-device: the server badges only installations that sent `inbox: true` (server D1). Old iPhones never get a badge they can't clear, which is D-N14's intent, with no forced update needed. | Hold the badge. This is a server change (D1). On iOS, drop the `setAppBadge(counts.badge)` call in step 9 and keep `setAppBadge(0)` on sign-out. |
| People U-1/U-2/U-3 | Pending in the People plan. | Built for U-1 (b) (TC8). | Per TC8. |

## Decisions for this track (binding)

| # | Decision | Why |
|---|---|---|
| TC1 | No new header button. **Standard and logger**: the Members-tab header `person.2` button opens People, replacing the roster. **Admins**: the Program tab "People" row (today's "View Members"). (UA-1) | D-P2 "opened from the existing roster entry, per role"; follows the header rule. |
| TC2 | A visit **whose list loaded** marks everything read (`{all:true}`). Unread dots stay for that visit. The app badge is set from the response. Live items reload (and are marked read) only while the inbox is **visible**. | Read only what was really seen. |
| TC3 | The tab label is "Inbox" for every role. The invitations header is "All invitations" plus Revoke for global admins (A10), else "Invitations". | One label everywhere. |
| TC4 | Ask for permission once per install, at the first session start, while `.notDetermined` (UA-2). | Live users restore their session and never sign in again. |
| TC5 | `ProgramContext.memberCardsOwner` (not published) records who last loaded the shared Members-card state: `MemberCardsOwner.membersTab`, or one `MemberFullStatsView` (its own UUID). A screen that finds another owner shows **placeholders** and reloads its own member. | Another member's numbers never show, even offline. |
| TC6 | The toast is notifications-local (`Shared/Views/NotificationToast.swift`) and sits at the **top**, under the status bar. It uses FloatingBanner chrome, lasts 5 s, and dismisses with × or a swipe up. | Top placement is the iOS idiom (**platform divergence**); the bottom band already holds the FABs and banner. |
| TC7 | Every string lives in `InboxCopy`, `NotificationPrefsCopy`, `PeopleCopy`, `ActivityVisibilityNotice` and the kit. The copy table below is iOS-binding; the orchestrator reconciles it across surfaces. | One edit point. |
| TC8 | Built for U-1 (b) with `ActivityVisibilityNotice.swift`. Under (a): delete that file, its two `.activityVisibilityNotice` call sites (steps 12 and 24), `PeopleListView`'s `showVisibilityNotice` state and its `onAppear`, the notice block in `preparePushOnSessionStart`, and the `showActivityVisibilityNotice` property and its reset. Under (c): swap in the People plan's (c) copy. | Contained. |
| TC9 | People replaces the roster at every entry, and `ProgramMembersListView` is deleted. Global admins reach `MemberDetailEditView` from a profile (D-P11). | One list. |
| TC10 | Routing goes through `ProgramContext.openTarget(_:)`. **Supersedes U2's `openInvitesRequested`.** | A program never pops just to show the inbox. |

**TC10 routing rules:**
- **`inbox` / `invites`**:
  - If the Inbox sheet is already open, bump `inboxRevision` so it reloads.
  - Else, if nothing is presented over the root (checked through UIKit, `presentedViewController == nil`), open the **root Inbox sheet**. The open program stays.
  - Else fall back: `inboxRoute`, consumed by `ProgramPickerView`, opens the "+" sheet on its Inbox tab (U2's proven path).
- **`program` / `programs` / `log_workout`**: `inboxRoute`, consumed by the picker.

| # | Decision | Why |
|---|---|---|
| TC11 | `DeviceRegistry`'s 12-h memo is also keyed by `CFBundleVersion`. `PUT /device` sends `"inbox": true`. | The capability lands once per build. |
| TC12 | The S5 recipe (below). | Same as the Summary (A13). |
| TC13 | Launch order: the system permission prompt (awaited) comes first. The root visibility notice follows only if `canPresentRootAlert`; otherwise it is retried at the next session start. | Prompts never stack. |
| TC14 | Files over ~200 lines are not split here: `MemberCards.swift` ≈ 420 (was 272), `MemberOverviewPicker.swift` ≈ 545 (was 527), `PeopleListView.swift` ≈ 245, `PersonProfileView.swift` ≈ 255, `ProgramContext+Inbox.swift` ≈ 215, `StandardMembersTab.swift` ≈ 215. | Splitting needs files outside the brief. The deviation is recorded. |

**TC12, the S5 recipe on the Members tabs:**
- `LoadState<String>` keyed by program (Standard) or program|member (Admin and Full stats).
- Each card gets a `MemberCardState`: `.loading` shows a placeholder (streak tiles show "…"); `.failed` shows "Couldn't load this" (streak tiles show "—").
- If every card failed: `ErrorStateView` + Retry. A partial failure, or a failure over kept data: "Couldn't refresh · Retry".
- Pull-to-refresh, and reload on reconnect.
- The self-loading cards (Metrics preview, Health) own their state:
  - placeholder while loading;
  - "Couldn't load this" when they have nothing of their own;
  - their own rows kept on a failed refresh;
  - reload on reconnect.
- Every Retry and pull-to-refresh bumps their `refreshToken`.

**Sanctioned iOS divergences:**
- The app-icon badge (Android uses OS launcher dots; web has none).
- The system permission prompt.
- The top toast.
- The root Inbox sheet (the platform's modal idiom).
- No composer on iOS.

### Copy (iOS constants, TC7)

**Inbox (`InboxCopy`)**
| Element | Text |
|---|---|
| Title | `Inbox` |
| Subtitle | `Your notifications and invitations` |
| Section headers | `Invitations` / `All invitations` / `Notifications` |
| Empty state | `No notifications yet` · `Program updates, kudos and reminders will show up here.` |
| Account row subtitle | `<n> new`, or `Notifications and invitations` |
| Toast action | `View` |
| Invite error alert | `Unable to update invitation` |
| Relative times | `Just now` · `5m ago` · `3h ago` · `Yesterday` · `Oct 12` · `Oct 12, 2025` |

**Notification preferences (`NotificationPrefsCopy`)**
- Screen subtitle: `Choose what RaSi Fiters notifies you about. What you get also shows up in your Inbox.`
- Section: `Notify me about`

| Category | Explanation |
|---|---|
| `Program & invites` | `Invitations, role changes and updates to your programs.` |
| `Activity` | `Kudos from people in your programs.` |
| `Reminders` | `One nudge at your chosen time if you haven't logged a workout that day.` |
| `Weekly digest` | `A Monday morning recap of your week.` |
| `Announcements` | `News and messages from the RaSi Fiters team.` |

- `Reminder time` · `Uses your phone's current time zone.`
- Footnote: `Reminders and the weekly digest are off until you turn them on. Turning off Program & invites or Announcements stops the alerts, but those still appear in your Inbox.`
- Save failure: `Couldn't save. <kit message>`
- Stale row: `Couldn't refresh` · `Retry` (kit).

**People (`PeopleCopy`)**
| Element | Text |
|---|---|
| Title and search | `People` · `Search people` |
| Pills | `You` · `Admin` · `Logger` |
| Last-active line | `Active today` / `Active yesterday` / `Active Oct 12` · `No workouts yet` · `Activity hidden` |
| Hidden member | `This member keeps their activity private.` |
| Stat tiles | `Current streak` · `Longest streak` · `Active days this month` · `Last active` |
| Workouts card | `Recent workouts` · `No workouts logged yet.` |
| Kudos | `Kudos` · `<n> kudos received` · `Give kudos` / `Kudos given` · `Tap again to undo.` |
| Staff rows | `Open full stats` / `Workout history, streaks and health logs` · `Edit membership` / `Joined date, active status or remove` |
| Hide switch | `Hide my activity` · `Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them.` |
| Empty list | `No one in this program yet.` · `No one matches your search.` |

**Visibility notice (`ActivityVisibilityNotice`)**
- Title, body and buttons: verbatim from People Privacy §B.
- New failure alert: `Couldn't hide your activity`, message `<kit message> You can turn on Hide my activity in My Profile.`

**Apple Health**
- Footnote: `Synced workouts are visible to members of your programs unless you turn on Hide my activity in My Profile.`
- Purpose string: `RaSi Fiters reads your workouts, sleep, and steps from Apple Health to log them in your programs. Members of your programs can see your workouts unless you turn on Hide my activity.`

## Steps — backend
None. Tracks N-SRV and S1 cover it.

## Steps — web
None. This is a parallel track.

## Steps — android
None. This is a parallel track.

## Steps — ios

### A. API layer

1. **`Shared/Services/APIClient+Session.swift`**: in `identityHeaders`, replace the doc comment and body:
```swift
    /// The observability §4.1 identity headers + `X-Time-Zone` (observability 0.4.0 / notifications C1 — the IANA zone
    /// the server stores for reminders, the digest and kudos days). The SSE client sends them too.
    static var identityHeaders: [String: String] {
        let info = Bundle.main.infoDictionary
        return ["X-App-Platform": "ios",
                "X-App-Version": info?["CFBundleShortVersionString"] as? String ?? "0",
                "X-App-Build": info?["CFBundleVersion"] as? String ?? "0",
                "X-Time-Zone": TimeZone.current.identifier]
    }
```

2. **`Shared/Services/APIClient+Auth.swift`**: replace `registerDevice`, from its `/// PUT /notifications/device` doc line through its closing brace:
```swift
    /// PUT /notifications/device (notifications §3.1 + 0.6.0 C7.4): Bearer + `{ push_token, platform: "ios", device_id,
    /// inbox: true }` — `inbox` tells the server this build has the inbox (app-icon badge + push routing, D-C26).
    func registerDevice(pushToken: String, deviceId: String?) async throws {
        var request = authorizedRequest("notifications/device", method: "PUT")
        var body: [String: Any] = ["push_token": pushToken, "platform": "ios", "inbox": true]
        if let deviceId { body["device_id"] = deviceId }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await data(for: request)
    }
```

3. **`Shared/Services/APIClient+Notifications.swift`**: replace the whole file:
```swift
import Foundation

extension APIClient {

    /// One notification — an SSE frame and a GET /notifications/inbox item (notifications C3). `category`, `target` and
    /// `read_at` arrive from 0.6.0 (`?inbox=1` streams + the inbox); a pre-0.6.0 frame decodes without them
    /// (ProgramContext+Inbox resolves the C2 defaults). The legacy GET /unacknowledged + POST /:id/acknowledge calls are
    /// retired here (C7.3 — read = POST /notifications/inbox/read).
    struct NotificationDTO: Decodable, Identifiable {
        let id: String
        let type: String
        let title: String
        let body: String
        let programId: String?
        let actorMemberId: String?
        let createdAt: String?
        let category: String?
        let target: String?
        let readAt: String?

        enum CodingKeys: String, CodingKey {
            case id, type, title, body, category, target
            case programId = "program_id"
            case actorMemberId = "actor_member_id"
            case createdAt = "created_at"
            case readAt = "read_at"
        }
    }
}
```

4. **NEW `Shared/Services/APIClient+Inbox.swift`**:
```swift
import Foundation

/// notifications 0.6.0 client calls (API CONTRACT C4): the inbox, its counts + read marks, and the per-member
/// preferences. Every call takes the authenticated path (`data(for:)` — refresh on 401, kit errors). JSON is snake_case.
extension APIClient {

    struct InboxPageDTO: Decodable {
        let items: [NotificationDTO]
        let nextCursor: String?
        enum CodingKeys: String, CodingKey {
            case items
            case nextCursor = "next_cursor"
        }
    }

    /// `badge` = unread excluding invite items + pending invites (each invite once) — the "+" badge and the app-icon badge.
    struct InboxCountsDTO: Decodable, Equatable {
        let unread: Int
        let pendingInvites: Int
        let badge: Int
        enum CodingKeys: String, CodingKey {
            case unread, badge
            case pendingInvites = "pending_invites"
        }
    }

    /// Category keys: program · activity · reminders · digest · announcements (C2). `reminderTime` = "HH:MM", 24-hour.
    struct NotificationPreferencesDTO: Decodable, Equatable {
        var categories: [String: Bool]
        var reminderTime: String
        let timeZone: String?
        enum CodingKeys: String, CodingKey {
            case categories
            case reminderTime = "reminder_time"
            case timeZone = "time_zone"
        }
    }

    /// `authorizedRequest` + query items (a "?" in the path would be escaped by appendingPathComponent).
    func authorizedRequest(_ path: String, method: String, query: [URLQueryItem]) -> URLRequest {
        var request = authorizedRequest(path, method: method)
        if !query.isEmpty, let url = request.url { request.url = url.appending(queryItems: query) }
        return request
    }

    /// GET /notifications/inbox — newest first, last 90 days; `before` = the previous page's opaque `next_cursor`.
    func fetchInbox(before cursor: String? = nil, limit: Int = 30) async throws -> InboxPageDTO {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor { query.append(URLQueryItem(name: "before", value: cursor)) }
        let data = try await data(for: authorizedRequest("notifications/inbox", method: "GET", query: query))
        return try JSONDecoder().decode(InboxPageDTO.self, from: data)
    }

    /// GET /notifications/inbox/unread-count.
    func fetchInboxCounts() async throws -> InboxCountsDTO {
        let data = try await data(for: authorizedRequest("notifications/inbox/unread-count", method: "GET"))
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }

    /// POST /notifications/inbox/read { ids } (1–100; idempotent) → fresh counts.
    func markInboxRead(ids: [String]) async throws -> InboxCountsDTO {
        try await postInboxRead(["ids": Array(ids.prefix(100))])
    }

    /// POST /notifications/inbox/read { all: true } → fresh counts.
    func markAllInboxRead() async throws -> InboxCountsDTO {
        try await postInboxRead(["all": true])
    }

    /// GET /notifications/preferences (also stores this device's X-Time-Zone server-side).
    func fetchNotificationPreferences() async throws -> NotificationPreferencesDTO {
        let data = try await data(for: authorizedRequest("notifications/preferences", method: "GET"))
        return try JSONDecoder().decode(NotificationPreferencesDTO.self, from: data)
    }

    /// PUT /notifications/preferences — partial: only what's passed changes; answers the full preferences.
    func updateNotificationPreferences(categories: [String: Bool]? = nil,
                                       reminderTime: String? = nil) async throws -> NotificationPreferencesDTO {
        var body: [String: Any] = [:]
        if let categories { body["categories"] = categories }
        if let reminderTime { body["reminder_time"] = reminderTime }
        var request = authorizedRequest("notifications/preferences", method: "PUT")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(NotificationPreferencesDTO.self, from: data)
    }

    private func postInboxRead(_ body: [String: Any]) async throws -> InboxCountsDTO {
        var request = authorizedRequest("notifications/inbox/read", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data = try await data(for: request)
        return try JSONDecoder().decode(InboxCountsDTO.self, from: data)
    }
}
```

5. **NEW `Shared/Services/APIClient+People.swift`**:
```swift
import Foundation

/// people 0.1.0 client calls (People API CONTRACT §B–§F): the People list, a person's profile, kudos give / undo, and
/// the member's own "Hide my activity" (GET / PUT /members/:id `hide_activity`). JSON is snake_case.
extension APIClient {

    struct PeopleListDTO: Decodable {
        let programId: String
        let viewer: PeopleViewerDTO
        let people: [PersonDTO]
        enum CodingKeys: String, CodingKey {
            case viewer, people
            case programId = "program_id"
        }
    }

    struct PeopleViewerDTO: Decodable {
        let memberId: String
        let isStaff: Bool
        enum CodingKeys: String, CodingKey {
            case memberId = "member_id"
            case isStaff = "is_staff"
        }
    }

    /// One People row. `lastActive` ("YYYY-MM-DD") is nil when there is none or the activity is hidden from the viewer.
    struct PersonDTO: Decodable, Identifiable {
        let memberId: String
        let memberName: String
        let initials: String
        let username: String
        let programRole: String
        let isYou: Bool
        let activityVisible: Bool
        let lastActive: String?
        var id: String { memberId }
        enum CodingKeys: String, CodingKey {
            case initials, username
            case memberId = "member_id"
            case memberName = "member_name"
            case programRole = "program_role"
            case isYou = "is_you"
            case activityVisible = "activity_visible"
            case lastActive = "last_active"
        }
    }

    /// A profile. Activity hidden from this viewer → `stats`, `recentWorkouts` and `kudos` are nil (render the name only).
    struct PersonProfileDTO: Decodable {
        let programId: String
        let memberId: String
        let memberName: String
        let initials: String
        let username: String
        let programRole: String
        let isYou: Bool
        let activityVisible: Bool
        let canOpenFullStats: Bool
        let stats: PersonStatsDTO?
        let recentWorkouts: [PersonWorkoutDTO]?
        let kudos: KudosSummaryDTO?
        enum CodingKeys: String, CodingKey {
            case initials, username, stats, kudos
            case programId = "program_id"
            case memberId = "member_id"
            case memberName = "member_name"
            case programRole = "program_role"
            case isYou = "is_you"
            case activityVisible = "activity_visible"
            case canOpenFullStats = "can_open_full_stats"
            case recentWorkouts = "recent_workouts"
        }
    }

    struct PersonStatsDTO: Decodable {
        let currentStreak: Int
        let longestStreak: Int
        let activeDaysThisMonth: Int
        let lastActive: String?
        enum CodingKeys: String, CodingKey {
            case currentStreak = "current_streak"
            case longestStreak = "longest_streak"
            case activeDaysThisMonth = "active_days_this_month"
            case lastActive = "last_active"
        }
    }

    struct PersonWorkoutDTO: Decodable {
        let workoutType: String
        let date: String?
        let durationMinutes: Int
        enum CodingKeys: String, CodingKey {
            case date
            case workoutType = "workout_type"
            case durationMinutes = "duration_minutes"
        }
    }

    /// `count` = all-time received (every program); `givenToday` = the viewer's kudos on the recipient's current day.
    struct KudosSummaryDTO: Decodable, Hashable {
        var count: Int
        var givenToday: Bool
        let canGive: Bool
        enum CodingKeys: String, CodingKey {
            case count
            case givenToday = "given_today"
            case canGive = "can_give"
        }
    }

    /// POST …/kudos → `kudos` (201 new · 200 already given today).
    struct KudosResultDTO: Decodable {
        let count: Int
        let givenToday: Bool
        enum CodingKeys: String, CodingKey {
            case count
            case givenToday = "given_today"
        }
    }

    /// DELETE …/kudos → `kudos` — no count (people §E); the caller decrements its own when `removed`.
    struct KudosUndoDTO: Decodable {
        let givenToday: Bool
        let removed: Bool
        enum CodingKeys: String, CodingKey {
            case removed
            case givenToday = "given_today"
        }
    }

    private struct KudosEnvelope<Kudos: Decodable>: Decodable {
        let kudos: Kudos
    }

    private struct HideActivityField: Decodable {
        let hideActivity: Bool?
        enum CodingKeys: String, CodingKey { case hideActivity = "hide_activity" }
    }

    /// GET /people?programId — the current program's active members (people §B).
    func fetchPeople(programId: String) async throws -> PeopleListDTO {
        let request = authorizedRequest("people", method: "GET", query: [URLQueryItem(name: "programId", value: programId)])
        let data = try await data(for: request)
        return try JSONDecoder().decode(PeopleListDTO.self, from: data)
    }

    /// GET /people/:memberId?programId (people §C).
    func fetchPersonProfile(memberId: String, programId: String) async throws -> PersonProfileDTO {
        let request = authorizedRequest("people/\(memberId)", method: "GET",
                                        query: [URLQueryItem(name: "programId", value: programId)])
        let data = try await data(for: request)
        return try JSONDecoder().decode(PersonProfileDTO.self, from: data)
    }

    /// POST /people/:memberId/kudos { program_id } — idempotent per recipient-local day (people §D).
    func giveKudos(memberId: String, programId: String) async throws -> KudosResultDTO {
        var request = authorizedRequest("people/\(memberId)/kudos", method: "POST")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["program_id": programId])
        let data = try await data(for: request)
        return try JSONDecoder().decode(KudosEnvelope<KudosResultDTO>.self, from: data).kudos
    }

    /// DELETE /people/:memberId/kudos — undo today's kudos (people §E).
    func undoKudos(memberId: String) async throws -> KudosUndoDTO {
        let data = try await data(for: authorizedRequest("people/\(memberId)/kudos", method: "DELETE"))
        return try JSONDecoder().decode(KudosEnvelope<KudosUndoDTO>.self, from: data).kudos
    }

    /// GET /members/:id → `hide_activity` (self / global admin only — people §F). nil = this server predates people 0.1.0.
    func fetchHideActivity(memberId: String) async throws -> Bool? {
        let data = try await data(for: authorizedRequest("members/\(memberId)", method: "GET"))
        return try JSONDecoder().decode(HideActivityField.self, from: data).hideActivity
    }

    /// PUT /members/:id { hide_activity } (own profile only; strict boolean) → the saved value. A response WITHOUT the
    /// field (a server before people 0.1.0 ignores it and answers 200) throws — never report a save that didn't happen.
    func updateHideActivity(memberId: String, hide: Bool) async throws -> Bool {
        var request = authorizedRequest("members/\(memberId)", method: "PUT")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["hide_activity": hide])
        let data = try await data(for: request)
        guard let saved = try JSONDecoder().decode(HideActivityField.self, from: data).hideActivity else {
            throw AppError(kind: .unknown)
        }
        return saved
    }
}
```

6. **`Shared/Services/NotificationStreamClient.swift`**:
   - (a) Replace the first two header doc lines with these three. The old lines are `/// notifications §3.3 SSE client. Frames: … \`event:` and `/// notification\` + the 7-field payload. EVERY close or error is reported through \`onClose\` and the owner reconnects`.
```swift
/// notifications §3.3 SSE client, opened with `?inbox=1` (0.6.0 C7.2). Frames: `event: ready` (opened) · `event: ping`
/// (25 s keepalive) · `event: notification` + a C3 inbox item (the 7 legacy fields + category, target, read_at — every
/// type). EVERY close or error is reported through `onClose` and the owner reconnects
```
   - (b) Replace `var request = URLRequest(url: baseURL.appendingPathComponent("notifications/stream"))` with:
```swift
        var request = URLRequest(url: baseURL.appendingPathComponent("notifications/stream")
            .appending(queryItems: [URLQueryItem(name: "inbox", value: "1")]))
```

7. **`Shared/Services/DeviceRegistry.swift`**:
   - (a) Replace the header line ``/// Cadence (amendment A12): `PUT /device` at most once per 12 h for the same token, and one unregister per denial.`` with:
```swift
/// Cadence (amendment A12 + notifications C7.4): `PUT /device` at most once per 12 h for the same token AND build — a new
/// build re-registers once, so its `inbox: true` capability lands at once — and one unregister per denial.
```
   - (b) After `private static let registeredAtKey = "push.registeredAt"`, insert:
```swift
    private static let registeredBuildKey = "push.registeredBuild"
    private static var currentBuild: String { Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0" }
```
   - (c) In `register(pushToken:)`, replace the code from `if defaults.string(forKey: Self.registeredTokenKey) == pushToken,` through the `enqueue { … }` closing brace:
```swift
        if defaults.string(forKey: Self.registeredTokenKey) == pushToken,
           defaults.string(forKey: Self.registeredBuildKey) == Self.currentBuild,
           let registeredAt = defaults.object(forKey: Self.registeredAtKey) as? Date,
           Date().timeIntervalSince(registeredAt) < Self.registerInterval { return }
        enqueue {
            guard SessionStore.shared.accessToken != nil else { return }
            guard (try? await APIClient.shared.registerDevice(pushToken: pushToken, deviceId: self.installId)) != nil else { return }
            defaults.set(pushToken, forKey: Self.registeredTokenKey)
            defaults.set(Date(), forKey: Self.registeredAtKey)
            defaults.set(Self.currentBuild, forKey: Self.registeredBuildKey)
        }
```
   - (d) In `unregister()`, after `UserDefaults.standard.removeObject(forKey: Self.registeredAtKey)`, insert `UserDefaults.standard.removeObject(forKey: Self.registeredBuildKey)`.

### B. State

8. **`Shared/Models/ProgramContext.swift`**:
   - (a) Replace the block from `// Pending program invites` (line 115) through `@Published var returnToMyPrograms: Bool = false` (line 123) with:
```swift
    // Pending program invites (the Inbox's first section — notifications D-N4)
    @Published var pendingInvites: [APIClient.PendingInviteDTO] = []

    // Notifications inbox (notifications 0.6.0 — D-N3 / D-N4; logic in ProgramContext+Inbox.swift)
    /// Server counts (C4) — nil until GET /inbox/unread-count first answers (the "+" badge then falls back to invites).
    @Published var inboxCounts: APIClient.InboxCountsDTO?
    /// The floating toast's item (D-N3) — the newest live item whose category is switched on.
    @Published var toastItem: APIClient.NotificationDTO?
    /// Bumped by every live item / foreground push — a VISIBLE InboxView reloads (and marks it read).
    @Published var inboxRevision = 0
    /// Cached GET /notifications/preferences — gates the toast (C7.5) and seeds the settings screen.
    @Published var notificationPreferences: APIClient.NotificationPreferencesDTO?
    /// A target only the program picker can open (C2; TC10 — supersedes U2's `openInvitesRequested`).
    @Published var inboxRoute: InboxTarget?
    /// The root Inbox sheet (NotificationToast.swift) — an `inbox` / `invites` target over whatever is on screen (TC10).
    @Published var showInboxSheet = false
    /// People U-1 (b): "Who can see your activity", presented once per device from AppRootView.
    @Published var showActivityVisibilityNotice = false
    @Published var widgetRoute: WidgetRoute?
    @Published var returnToMyPrograms: Bool = false
```
   - (b) Replace the block from `var notificationStreamClient: NotificationStreamClient?` (line 153) through `let notificationDateFormatter = ISO8601DateFormatter()` (line 159) with:
```swift
    var notificationStreamClient: NotificationStreamClient?
    var streamReconnectTask: Task<Void, Never>?
    var streamAttempt = 0
    /// The toast's 5-s auto-dismiss (ProgramContext+Inbox.swift).
    var toastDismissTask: Task<Void, Never>?
    /// Who last loaded the shared Members-card state (selectedMemberOverview · memberHistory · memberStreaks ·
    /// memberRecent): `MemberCardsOwner.membersTab` or one MemberFullStatsView (its UUID). A screen that finds another
    /// owner shows placeholders and reloads its own member — never another member's numbers (people OQ5 / TC5).
    /// Not published: it must never re-render a screen by itself.
    var memberCardsOwner: String?
```

9. **NEW `Shared/Models/ProgramContext+Inbox.swift`**:
```swift
import Foundation
import UIKit
import UserNotifications

/// Where a notification opens (notifications C2 targets). An unknown / missing target opens the inbox — except a
/// pre-0.6.0 invite push (no `target`), which keeps opening the invitations (U2).
enum InboxTarget: Equatable {
    case invites
    case program(String)
    case programs
    case logWorkout
    case inbox

    init(target: String?, type: String?, programId: String?) {
        switch target {
        case "invites": self = .invites
        case "program": self = programId.map { .program($0) } ?? .programs
        case "programs": self = .programs
        case "log_workout": self = .logWorkout
        case "inbox": self = .inbox
        default: self = type == "program.invite_received" ? .invites : .inbox
        }
    }

    /// Shown by the Inbox itself (the root Inbox sheet / the "+" sheet's Inbox tab).
    var isInbox: Bool { self == .inbox || self == .invites }
}

extension APIClient.NotificationDTO {
    /// C2: an item without a category (a pre-0.6.0 frame) counts as `program`.
    var resolvedCategory: String { category ?? "program" }
    var resolvedTarget: InboxTarget { InboxTarget(target: target, type: type, programId: programId) }
    var isUnread: Bool { readAt == nil }
    /// Opens somewhere other than the inbox itself (a program, the programs list, the workout log).
    var opensElsewhere: Bool { !resolvedTarget.isInbox }
    /// `created_at` — ISO-8601 with or without fractional seconds.
    var createdDate: Date? {
        guard let createdAt else { return nil }
        return Self.fractionalISO.date(from: createdAt) ?? Self.plainISO.date(from: createdAt)
    }
    private static let fractionalISO: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private static let plainISO = ISO8601DateFormatter()
}

/// The inbox state behind the "+" badge, the app-icon badge, the toast and push / toast routing (notifications 0.6.0 —
/// D-N3 · D-N4 · D-N5 · D-N12 · D-N14; client rules C7.1–C7.8; TC2 · TC4 · TC10 · TC13).
extension ProgramContext {
    /// D-N2 / C2 defaults until GET /preferences answers (reminders + digest are opt-in).
    static let defaultNotificationCategories: [String: Bool] = [
        "program": true, "activity": true, "reminders": false, "digest": false, "announcements": true
    ]
    private static let permissionAskedKey = "push.permissionAsked"

    /// The "+" badge (D-N4): the server's `badge`; until it first answers, today's invite count.
    var inboxBadgeCount: Int { inboxCounts?.badge ?? pendingInvites.count }

    func isCategoryEnabled(_ category: String) -> Bool {
        notificationPreferences?.categories[category] ?? Self.defaultNotificationCategories[category] ?? true
    }

    // MARK: Counts + read

    /// GET /inbox/unread-count → the "+" badge + the app-icon badge (C7.8). Silent on failure (badges keep their value).
    func refreshInboxCounts() async {
        guard authToken != nil, let counts = try? await APIClient.shared.fetchInboxCounts() else { return }
        applyInboxCounts(counts)
    }

    /// POST /inbox/read { ids } (idempotent) → fresh counts; no ids → just refresh the counts.
    func markInboxRead(ids: [String]) async {
        guard authToken != nil else { return }
        guard !ids.isEmpty else { return await refreshInboxCounts() }
        guard let counts = try? await APIClient.shared.markInboxRead(ids: ids) else { return }
        applyInboxCounts(counts)
    }

    /// A visit that loaded the inbox reads everything (D-N5, TC2) — the app-icon badge drops to the pending invites (D-N14).
    func markAllInboxRead() async {
        guard authToken != nil, let counts = try? await APIClient.shared.markAllInboxRead() else { return }
        applyInboxCounts(counts)
    }

    private func applyInboxCounts(_ counts: APIClient.InboxCountsDTO) {
        guard authToken != nil else { return }                          // an answer landing after sign-out
        inboxCounts = counts
        setAppBadge(counts.badge)
    }

    /// The app-icon badge (D-N14 / N7, UA-3). This build registers `inbox: true`, so the server's pushes carry aps.badge too.
    func setAppBadge(_ count: Int) {
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(max(count, 0)) }
    }

    // MARK: Preferences cache (C7.5)

    func loadNotificationPreferences() async throws -> APIClient.NotificationPreferencesDTO {
        let preferences = try await APIClient.shared.fetchNotificationPreferences()
        if authToken != nil { notificationPreferences = preferences }
        return preferences
    }

    func refreshNotificationPreferences() async {
        _ = try? await loadNotificationPreferences()
    }

    // MARK: Toast (D-N3) + routing (C2 / C7.5 / C7.6 — TC10)

    func showToast(_ item: APIClient.NotificationDTO) {
        toastItem = item
        toastDismissTask?.cancel()
        toastDismissTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard !Task.isCancelled else { return }
            self?.toastItem = nil
        }
    }

    func dismissToast() {
        toastDismissTask?.cancel()
        toastDismissTask = nil
        toastItem = nil
    }

    /// The toast's "View" / an inbox row: mark it read, then open its target. From inside the inbox only targets
    /// elsewhere route (InboxView.open closes its host); `inbox` / `invites` are already on screen.
    func openInboxItem(_ item: APIClient.NotificationDTO, fromInbox: Bool) {
        if item.isUnread { Task { await markInboxRead(ids: [item.id]) } }
        if fromInbox {
            if item.opensElsewhere { inboxRoute = item.resolvedTarget }
            return
        }
        dismissToast()
        openTarget(item.resolvedTarget)
    }

    /// TC10: `inbox` / `invites` → the root Inbox sheet over whatever is on screen (an open program stays open; an
    /// already-open sheet just reloads). When something else is presented — and for every other target — the program
    /// picker routes it (`inboxRoute`, ProgramPickerView.openInboxRoute).
    func openTarget(_ target: InboxTarget) {
        if target.isInbox {
            if showInboxSheet {
                inboxRevision += 1
                return
            }
            if !Self.isPresentingModal {
                showInboxSheet = true
                return
            }
        }
        inboxRoute = target
    }

    /// A sheet, cover or alert is already up over the root — a root presentation would silently not show.
    static var isPresentingModal: Bool {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController?
            .presentedViewController != nil
    }

    /// TC13: nothing over the root and no root cover about to present (Apple Health review, widget form, forced update).
    private var canPresentRootAlert: Bool {
        !Self.isPresentingModal && pendingSyncConfirmation == nil && widgetRoute == nil && !isUpdateRequired
    }

    // MARK: Permission (D-N12, TC4) + the visibility notice (people U-1 b, TC13)

    /// Once per install, at the first session start (sign-in or restore) while undecided. An authorized device
    /// re-requests its APNs token, so PUT /device carries `inbox: true` right after a sign-in (C7.4). Then — only after the
    /// system prompt was answered, and never over another presentation — the one-time "Who can see your activity" notice
    /// on a phone syncing Apple Health workouts (else it waits for the next session start).
    func preparePushOnSessionStart() async {
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        switch status {
        case .notDetermined:
            if !UserDefaults.standard.bool(forKey: Self.permissionAskedKey) {
                UserDefaults.standard.set(true, forKey: Self.permissionAskedKey)
                if (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) == true {
                    DeviceRegistry.shared.notificationPermission(granted: true)
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        default:
            break
        }
        if authToken != nil, isHealthKitEnabled, !ActivityVisibilityNotice.isSeen, canPresentRootAlert {
            showActivityVisibilityNotice = true
        }
    }

    /// The sign-out teardown's inbox half (ProgramContext+Session.clearInMemorySession).
    func resetInboxState() {
        dismissToast()
        inboxCounts = nil
        notificationPreferences = nil
        inboxRoute = nil
        showInboxSheet = false
        inboxRevision = 0
        showActivityVisibilityNotice = false
        setAppBadge(0)
    }
}
```

10. **`Shared/Models/ProgramContext+Notifications.swift`**: replace the whole file:
```swift
import Foundation

extension ProgramContext {
    // MARK: - Real-time stream (notifications §3.3; 0.6.0 C7): foreground only, opened with `?inbox=1` so every type
    // arrives as a C3 inbox item. Every close reconnects with a fresh token — exponential backoff + full jitter (1 s base,
    // ×2, 30 s cap), paused while offline (A4). Every `ready` resets the backoff and refreshes the unread counts: C7.3
    // retires A4's /unacknowledged re-fetch and the blocking modal queue (D-N3).

    @MainActor
    func startNotificationStreamIfNeeded() {
        guard authToken != nil, isOnline, notificationStreamClient == nil, streamReconnectTask == nil else { return }
        streamReconnectTask = Task { @MainActor [weak self] in
            let token = await APIClient.shared.validAccessToken()      // refreshed when it expires within 60 s
            guard let self, !Task.isCancelled else { return }          // backgrounded meanwhile (C2#9)
            self.streamReconnectTask = nil
            guard let token, self.authToken != nil else { return }
            let client = NotificationStreamClient()
            client.onReady = { [weak self] in
                self?.streamAttempt = 0
                Task { await self?.refreshInboxCounts() }
            }
            client.onNotification = { [weak self] item in self?.receiveInboxItem(item) }
            client.onClose = { [weak self] status in self?.streamClosed(status: status) }
            self.notificationStreamClient = client
            client.connect(token: token)
        }
    }

    @MainActor
    private func streamClosed(status: Int?) {
        notificationStreamClient = nil
        guard authToken != nil, isOnline else { return }               // offline: resumes when the link is back (A4)
        streamAttempt += 1
        let delay = Double.random(in: 0...min(30, pow(2, Double(streamAttempt - 1))))
        streamReconnectTask = Task { @MainActor [weak self] in
            if status == 401 { _ = try? await APIClient.shared.refreshAccessToken() }   // a session_invalid → teardown
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            self.streamReconnectTask = nil
            self.startNotificationStreamIfNeeded()
        }
    }

    /// Backgrounded / offline: close the stream (it resumes on foreground / reconnect).
    @MainActor
    func suspendNotificationStream() {
        streamReconnectTask?.cancel()
        streamReconnectTask = nil
        notificationStreamClient?.disconnect()
        notificationStreamClient = nil
        streamAttempt = 0
    }

    /// Sign-out teardown: close it (the inbox state is reset by `resetInboxState`).
    @MainActor
    func stopNotificationStream() {
        suspendNotificationStream()
    }

    /// C7.5: a live item → fresh counts, a visible InboxView reloads, a toast when its category is switched on, and an
    /// invite / membership item refreshes what it is about.
    @MainActor
    private func receiveInboxItem(_ item: APIClient.NotificationDTO) {
        inboxRevision += 1
        Task { await refreshInboxCounts() }
        if isCategoryEnabled(item.resolvedCategory) { showToast(item) }
        Task { await refreshData(forType: item.type) }
    }

    /// C7.6: a tapped push is marked read, then opens its target (TC10 — `openTarget`).
    @MainActor
    func handlePushTap(notificationId: String, type: String?, target: String?, programId: String?) {
        guard authToken != nil else { return }
        Task { await markInboxRead(ids: [notificationId]) }
        openTarget(InboxTarget(target: target, type: type, programId: programId))
        Task { await refreshData(forType: type ?? "") }
    }

    /// A remote push shown while the app is in front (AppDelegate.willPresent): counts, a visible inbox, and invites.
    @MainActor
    func foregroundPushReceived(type: String?) {
        inboxRevision += 1
        Task { await refreshInboxCounts() }
        Task { await refreshData(forType: type ?? "") }
    }

    @MainActor
    private func refreshData(forType type: String) async {
        if type == "program.invite_received" {          // invites §3.1: the invitations are always GET /my-invites
            try? await loadPendingInvites()
            await loadLookupData()
            return
        }
        if ["program.role_changed", "program.member_removed", "program.member_left", "program.member_joined",
            "program.admin_transferred", "program.updated", "program.deleted"].contains(type) {
            await loadLookupData()
            if programId != nil { await loadMembershipDetails() }
        }
    }
}
```

11. **`Shared/Models/ProgramContext+Session.swift`**:
   - (a) In `clearInMemorySession()`, replace:
```swift
        pendingInvites = []
        openInvitesRequested = false
        acknowledgedNotificationIds = [:]
        stopNotificationStream()
```
   with:
```swift
        pendingInvites = []
        memberCardsOwner = nil                  // people OQ5 / TC5
        stopNotificationStream()
        resetInboxState()                       // counts, toast, prefs cache, routes, Inbox sheet, notice; app badge → 0
```
   - (b) In `sessionDidBecomeActive(_:)`, after `Task { await reloadSessionData() }`, insert:
```swift
        Task { await refreshInboxCounts() }                       // notifications C7.8: "+" badge + app-icon badge
        Task { await refreshNotificationPreferences() }           // C7.5: the toast's category gate
        if trigger == .launch { Task { await preparePushOnSessionStart() } }   // D-N12 / TC4 (+ people U-1 b notice)
```

### C. App shell

12. **`App/AppRootView.swift`**:
   - (a) Delete the whole `if let notification = programContext.notificationQueue.first { NotificationModalView( … ) }` block (lines 35–44). The `ZStack` keeps only the `Group`.
   - (b) After the `.floatingBanner { if !programContext.isOnline { FloatingBanner(variant: .offline) } }` block, insert:
```swift
        // notifications 0.6.0 (D-N3): the floating toast replaces the blocking pop-up queue (top, 5 s) + the root Inbox
        // sheet (TC10 — an `inbox` / `invites` target over whatever is on screen).
        .notificationToast(programContext)
        // people U-1 (b): "Who can see your activity", once per device (ProgramContext.preparePushOnSessionStart).
        .activityVisibilityNotice(isPresented: $programContext.showActivityVisibilityNotice, context: programContext)
```
   - (c) Replace:
```swift
        .onReceive(NotificationCenter.default.publisher(for: PushNotificationTapped.inviteReceived)) { _ in
            Task { try? await programContext.loadPendingInvites() }
        }
```
   with:
```swift
        .onReceive(NotificationCenter.default.publisher(for: PushNotificationTapped.remoteReceived)) { note in
            programContext.foregroundPushReceived(type: note.object as? String)      // counts, a visible inbox, invites
        }
```
   - (d) In `handlePendingPushTap()`, replace `programContext.handlePushTap(notificationId: tap.id, type: tap.type)` with:
```swift
        programContext.handlePushTap(notificationId: tap.id, type: tap.type, target: tap.target, programId: tap.programId)
```

13. **`App/AppDelegate.swift`**: replace the whole file:
```swift
import UIKit
import UserNotifications

/// The stored APNs device token (DeviceRegistry re-sends it with every sign-in's registration ride-along).
enum PushTokenNotification {
    static let userDefaultsKey = "rf_push_device_token"
}

/// Push hand-offs to AppRootView: a tap (notification_id + type + target + program_id — notifications C5) and any remote
/// push shown in the foreground (counts / a visible inbox / invites refresh).
enum PushNotificationTapped {
    static let notificationName = Notification.Name("RaSiFitersPushNotificationTapped")
    static let remoteReceived = Notification.Name("RaSiFitersRemotePushReceived")
    static let notificationIdKey = "notification_id"
    static let typeKey = "type"
    static let targetKey = "target"
    static let programIdKey = "program_id"
    /// The last tap not yet handled — on a cold launch AppRootView may not be listening yet, so it also drains this
    /// at launch (a tap must still open its target).
    static var pendingTap: (id: String, type: String?, target: String?, programId: String?)?
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // health-sync §8 rule 1 (W3 F1): observers + background delivery register at launch, every launch — a HealthKit
        // background launch has no scene. Before the first unlock nothing is readable: both retry once data is available.
        HealthSyncPrefs.migrateLegacyIfNeeded()
        HealthSyncEngine.shared.registerObservers()
        NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification,
                                               object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                HealthSyncPrefs.migrateLegacyIfNeeded()
                HealthSyncEngine.shared.registerObservers()
            }
        }
        Task { await ClientEventQueue.shared.flush() }
        NetworkMonitor.shared.start()   // frontend-kit §5: started once, at launch
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        DeviceRegistry.shared.register(pushToken: tokenString)       // notifications §3.1: rotation → the registry queue
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Simulator or misconfiguration; token will not be available.
    }

    /// Foreground: a remote push shows only its badge while the SSE stream is open — the in-app toast already shows it
    /// (amendment A5); local notifications (Apple Health sync results) keep their banner. Every remote push refreshes the
    /// counts / a visible inbox / invites (AppRootView → ProgramContext.foregroundPushReceived).
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let isRemote = notification.request.trigger is UNPushNotificationTrigger
        if isRemote {
            NotificationCenter.default.post(name: PushNotificationTapped.remoteReceived,
                                            object: notification.request.content.userInfo[PushNotificationTapped.typeKey] as? String)
        }
        if isRemote, NotificationStreamClient.isConnected {
            completionHandler([.badge])
        } else {
            completionHandler([.banner, .sound, .badge])
        }
    }

    /// Tap → mark read + open its target (AppRootView → ProgramContext.handlePushTap; notifications C7.6).
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        if let notificationId = userInfo[PushNotificationTapped.notificationIdKey] as? String, !notificationId.isEmpty {
            PushNotificationTapped.pendingTap = (notificationId,
                                                 userInfo[PushNotificationTapped.typeKey] as? String,
                                                 userInfo[PushNotificationTapped.targetKey] as? String,
                                                 userInfo[PushNotificationTapped.programIdKey] as? String)
            NotificationCenter.default.post(name: PushNotificationTapped.notificationName, object: nil)
        }
        completionHandler()
    }
}
```

14. **NEW `Shared/Views/NotificationToast.swift`**:
```swift
import SwiftUI

/// The in-app notification toast (notifications 0.6.0 — D-N3; replaces the blocking NotificationModalView queue): the
/// newest live item as "<title> · View" at the top, under the status bar, for 5 s. View → mark read + open its target
/// (C7.5 / C2 / TC10); × or a swipe up dismisses it. Notifications-local, not a frontend-kit primitive (kit §10); the
/// chrome is FloatingBanner's. A root overlay sits under sheets — the "+" badge and the inbox cover that case.
struct NotificationToast: View {
    let item: APIClient.NotificationDTO
    let onView: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: AppSpacing.smd) {
            Image(systemName: NotificationCategoryStyle.icon(item.resolvedCategory))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(NotificationCategoryStyle.color(item.resolvedCategory))
                .frame(width: 24)
                .accessibilityHidden(true)
            Text(item.title)
                .font(AppTypography.footnote)
                .foregroundColor(Color(.label))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, AppSpacing.xs)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onView) {
                Text(InboxCopy.toastAction)
                    .font(AppTypography.footnote)
                    .fixedSize()
                    .foregroundColor(.rfAccent)
                    .padding(.horizontal, AppSpacing.sm)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(KitCopy.dismiss)
        }
        .padding(.leading, AppSpacing.lg)
        .padding(.trailing, AppSpacing.xxs)
        .padding(.vertical, AppSpacing.xxs)
        .frame(minHeight: 52)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
        .gesture(DragGesture(minimumDistance: 12).onEnded { value in
            if value.translation.height < -20 { onDismiss() }
        })
        .onAppear { UIAccessibility.post(notification: .announcement, argument: item.title) }
    }
}

/// The category's glyph + tint (notifications C2) — the toast and the inbox rows.
enum NotificationCategoryStyle {
    static func icon(_ category: String) -> String {
        switch category {
        case "program": return "person.2.fill"
        case "activity": return "hands.clap.fill"
        case "reminders": return "alarm.fill"
        case "digest": return "chart.bar.fill"
        case "announcements": return "megaphone.fill"
        default: return "bell.fill"
        }
    }

    static func color(_ category: String) -> Color {
        switch category {
        case "program": return .appBlue
        case "reminders": return .appPurple
        case "digest": return .appGreen
        default: return .appOrange
        }
    }
}

private struct NotificationToastOverlay: ViewModifier {
    @ObservedObject var context: ProgramContext

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if context.authToken != nil, let item = context.toastItem {
                    NotificationToast(
                        item: item,
                        onView: { context.openInboxItem(item, fromInbox: false) },
                        onDismiss: { context.dismissToast() }
                    )
                    .adaptiveColumn(max: AdaptiveLayout.formMaxWidth)
                    .padding(.horizontal, AppSpacing.lg)
                    .padding(.top, AppSpacing.sm)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .id(item.id)
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: context.toastItem?.id)
            // TC10: the Inbox over whatever is on screen — an open program stays open (ProgramContext.openTarget presents
            // it only when nothing else is up). It carries the offline banner like every presentation (D-KIT-17).
            .sheet(isPresented: $context.showInboxSheet) {
                InboxSheet(onClose: { context.showInboxSheet = false })
                    .offlineBanner()
                    .environmentObject(context)
            }
    }
}

/// The root Inbox sheet's chrome — the "+" sheet's background + Done (ProgramActionsSheet parity).
private struct InboxSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            InboxView(onAcceptedInvite: onClose)
                .background(AppGradient.sheetBackground(for: colorScheme).ignoresSafeArea())
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Done", action: onClose)
                            .foregroundColor(Color(.label))
                    }
                }
        }
    }
}

extension View {
    /// AppRootView: the app-wide notification toast + the root Inbox sheet (one per app, like the offline banner).
    func notificationToast(_ context: ProgramContext) -> some View {
        modifier(NotificationToastOverlay(context: context))
    }
}
```

15. **`Shared/Views/NotificationModalView.swift`**:
   - Delete `struct NotificationModalView: View { … }` (lines 3–44, plus the blank line after it).
   - Replace the trailing `#Preview { NotificationModalView( … ) }` with:
```swift
#Preview {
    ForcedUpdateModalView(minimumVersion: "1.5.1")
}
```
   - **Keep `ForcedUpdateModalView` byte-for-byte.** `AppRootView` and `WidgetCoverView` use it.

16. **`Features/Home/ProgramPickerView.swift`** (minimal edits):
   - (1) Delete `private var pendingInvitesCount: Int { programContext.pendingInvites.count }` (3 lines, :25–27). In `floatingProgramActionsButton`, replace `if pendingInvitesCount > 0 {` with `if programContext.inboxBadgeCount > 0 {`, and `Text("\(pendingInvitesCount)")` with `Text("\(programContext.inboxBadgeCount)")`.
   - (2) Replace (:83–88):
```swift
        .onAppear {
            if programContext.openInvitesRequested { openInvitesInbox() }
        }
        .onChange(of: programContext.openInvitesRequested) { _, requested in
            if requested { openInvitesInbox() }
        }
```
   with:
```swift
        .onAppear {
            if let route = programContext.inboxRoute { openInboxRoute(route) }
        }
        .onChange(of: programContext.inboxRoute) { _, route in
            if let route { openInboxRoute(route) }
        }
```
   - (3) In `.navigationDestination(item: $accountDestination)`, after `case .appleHealth: AppleHealthSettingsView()`, add:
```swift
            case .inbox:
                InboxView(onAcceptedInvite: { accountDestination = nil })
                    .navigationTitle(InboxCopy.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .adaptiveBackground(topLeading: true)
```
   - (4) In `programRow(for:)`, replace `let canOpen = programContext.isGlobalAdmin || membershipStatus == nil || membershipStatus == "active"` with `let canOpen = isOpenable(program)`.
   - (5) In `load()`, replace `let invites = Task<Void, Never> { _ = try? await programContext.loadPendingInvites() }   // the badge — silent on failure` with:
```swift
        let invites = Task<Void, Never> { _ = try? await programContext.loadPendingInvites() }   // the Inbox's invitations
        let counts = Task<Void, Never> { await programContext.refreshInboxCounts() }           // the "+" badge (D-N4)
```
   and replace the final `await invites.value` with:
```swift
        await invites.value
        await counts.value
```
   - (6) Replace the `/// Amendment U2: an invite push tap opens the invite inbox …` doc comment and `private func openInvitesInbox() { … }` (:544–559) with:
```swift
    /// A target only the picker can open (notifications C2; TC10 — supersedes U2's invite-only flag): close what's open
    /// here (incl. the root Inbox sheet), then open it. `invites` / `inbox` arrive here only when something else was
    /// presented — the "+" sheet on its Inbox tab (an open program pops, U2's behavior).
    private func openInboxRoute(_ route: InboxTarget) {
        programContext.inboxRoute = nil
        programContext.showInboxSheet = false
        programToEdit = nil
        accountDestination = nil
        showAccountMenu = false
        showProgramActions = false
        if case .program(let id) = route, programToOpen?.id == id, programContext.programId == id { return }   // already open
        if route != .logWorkout { programToOpen = nil }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            // ≥ a sheet's dismissal (the "+" / account / root Inbox sheet). A full-screen cover (widget quick-add, Apple
            // Health review, forced update) would swallow a sheet and leave `showProgramActions` stuck true — a dead "+"
            // button. Skip it; the badge still shows what's new.
            guard !isFullScreenCoverUp else { return }
            switch route {
            case .invites, .inbox:
                programActionsTab = 0
                showProgramActions = true
            case .program(let id):
                Task {
                    if !programContext.programs.contains(where: { $0.id == id }) { await load() }   // a cold-launch tap
                    guard let program = programContext.programs.first(where: { $0.id == id }), isOpenable(program) else { return }
                    applyProgram(program)
                    programToOpen = program
                }
            case .logWorkout:
                programContext.widgetRoute = .quickAddWorkout
            case .programs:
                break
            }
        }
    }

    /// The card-tap rule: global admins open anything; members open active (or unknown-status) programs.
    private func isOpenable(_ program: APIClient.ProgramDTO) -> Bool {
        let status = program.my_status?.lowercased()
        return programContext.isGlobalAdmin || status == nil || status == "active"
    }
```
   - (7) In `private enum AccountDestination`, add `case inbox` after `case appleHealth`.
   - (8) In `AccountMenuSheet`, directly after the profile `Button { onSelectDestination(.profile) } label: { ProfileRow(…) } .buttonStyle(.plain)` (:610–619), insert:
```swift

                            Button {
                                onSelectDestination(.inbox)
                            } label: {
                                AccountRow(
                                    icon: "tray.fill",
                                    color: .appOrange,
                                    title: InboxCopy.title,
                                    subtitle: InboxCopy.rowSubtitle(badge: programContext.inboxBadgeCount)
                                )
                            }
                            .buttonStyle(.plain)
```

### D. Inbox UI

17. **`Features/Home/ProgramActions/ProgramActionsSheet.swift`**: replace the whole file:
```swift
import SwiftUI

// MARK: - Program Actions Sheet (Tabbed)
// notifications 0.6.0 (D-N4): tab 0 ("My Invites" / "All Invites") grew into "Inbox" for every role — InboxView:
// invitations first, then notifications.

struct ProgramActionsSheet: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    /// 0 = Inbox (a picker-routed push / toast — notifications C2); nil = Inbox when anything is new or pending, else Create.
    var initialTab: Int? = nil
    let onDismiss: () -> Void

    @State private var selectedTab: Int = 0

    private var hasInboxActivity: Bool {
        programContext.inboxBadgeCount > 0 || !programContext.pendingInvites.isEmpty
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Tab picker
                Picker("", selection: $selectedTab) {
                    Label(InboxCopy.title, systemImage: "tray.fill")
                        .tag(0)
                    Label("Create", systemImage: "plus")
                        .tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 20)
                .padding(.top, 16)
                .padding(.bottom, 8)

                // Tab content
                TabView(selection: $selectedTab) {
                    // D-KIT-17: a paged TabView page clears the offline band itself (reservesOfflineBand).
                    InboxView(isActive: selectedTab == 0, reservesOfflineBand: true, onAcceptedInvite: {
                        dismiss()
                        onDismiss()
                    })
                    .tag(0)

                    CreateProgramTabView(onCreated: {
                        dismiss()
                        onDismiss()
                    })
                    .tag(1)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
            }
            .background(
                AppGradient.sheetBackground(for: colorScheme)
                    .ignoresSafeArea()
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                        onDismiss()
                    }
                    .foregroundColor(Color(.label))
                }
            }
        }
        .onAppear {
            if let initialTab {
                selectedTab = initialTab
            } else if hasInboxActivity {
                selectedTab = 0
            } else {
                selectedTab = 1
            }
        }
        .offlineBanner()
    }
}
```

18. **`Features/Home/ProgramActions/InvitesTabView.swift`**: keep `struct DeclineInviteDialog: View { … }` (from :239 to EOF) byte-for-byte. Replace everything above it with:
```swift
import SwiftUI

// MARK: - Inbox · invitations section (notifications 0.6.0, D-N4)

/// The Inbox's first section: pending invitations with their actions — Accept / Decline (+ Block future invites) for the
/// invitee, every pending invite + Revoke for global admins (amendment A10). Presentational: InboxView loads the
/// invites (GET /my-invites | /all-invites) and runs the actions. Hidden while there's nothing to show.
struct InboxInvitesSection: View {
    let invites: [APIClient.PendingInviteDTO]
    let isGlobalAdmin: Bool
    /// The last invites load failed (labeled) — the kit error view, only when there's no list to show.
    let loadError: AppError?
    /// An accept / decline / revoke is in flight.
    let isBusy: Bool
    let onRetry: () -> Void
    let onAccept: (APIClient.PendingInviteDTO) -> Void
    let onDecline: (APIClient.PendingInviteDTO) -> Void
    let onRevoke: (APIClient.PendingInviteDTO) -> Void

    var body: some View {
        if !invites.isEmpty || loadError != nil {
            VStack(alignment: .leading, spacing: 12) {
                Text(isGlobalAdmin ? InboxCopy.allInvitationsHeader : InboxCopy.invitationsHeader)
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.label))
                    .padding(.horizontal, 20)
                if invites.isEmpty, let loadError {
                    // W7 i10: a failed load is never "no invitations".
                    ErrorStateView(error: loadError, onRetry: onRetry)
                        .padding(.horizontal, 20)
                } else if isGlobalAdmin {
                    adminInvitesList
                } else {
                    standardInvitesList
                }
            }
            .disabled(isBusy)
            .opacity(isBusy ? 0.6 : 1)
        }
    }

    private var standardInvitesList: some View {
        VStack(spacing: 12) {
            ForEach(invites) { invite in
                InviteCard(
                    invite: invite,
                    isAdmin: false,
                    onAccept: { onAccept(invite) },
                    onDecline: { onDecline(invite) },
                    onRevoke: nil
                )
            }
        }
        .padding(.horizontal, 20)
    }

    private var adminInvitesList: some View {
        VStack(spacing: 16) {
            // Grouped by program
            let groupedInvites = Dictionary(grouping: invites) { $0.program_name ?? "Unknown Program" }
            ForEach(groupedInvites.keys.sorted(), id: \.self) { programName in
                if let programInvites = groupedInvites[programName] {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(programName)
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                            .padding(.horizontal, 20)
                        ForEach(programInvites) { invite in
                            InviteCard(
                                invite: invite,
                                isAdmin: true,
                                onAccept: { onAccept(invite) },
                                onDecline: { onDecline(invite) },
                                onRevoke: { onRevoke(invite) }
                            )
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
        }
    }
}

```

19. **NEW `Features/Home/Inbox/InboxView.swift`**:
```swift
import SwiftUI

/// The notification inbox (notifications 0.6.0 — D-N3 · D-N4 · D-N5 · D-N14; specs/pages/ios/inbox/SPEC.md): pending
/// invitations first with their actions (A10), then notifications newest first, paged by `next_cursor`. A visit whose
/// list loaded marks everything read (POST /inbox/read {all:true}; the unread dots stay for this visit — TC2), which
/// brings the app-icon badge down to the pending-invite count. Hosts: the "+" sheet's Inbox tab, both account-menu
/// Inbox rows and the root Inbox sheet (NotificationToast.swift — TC10).
struct InboxView: View {
    @EnvironmentObject private var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    /// false while the "+" sheet shows Create — nothing loads or is marked read until the Inbox is on screen.
    var isActive = true
    /// true ONLY in the "+" sheet's paged TabView, which the sheet's offline inset doesn't reach (frontend-kit D-KIT-17):
    /// the page clears the 116-pt offline band itself. Every other host gets the band from a safe-area inset.
    var reservesOfflineBand = false
    /// After an accepted invite: the host closes (the sheet dismisses / the account-menu push pops); nil = stay.
    var onAcceptedInvite: (() -> Void)? = nil

    @StateObject private var feed = InboxFeed()
    /// On screen right now — a pushed inbox stays alive under another tab and must not mark live items read (TC2).
    @State private var isVisible = false
    @State private var invitesError: AppError?
    @State private var isResponding = false
    @State private var respondError: String?
    @State private var inviteToDecline: APIClient.PendingInviteDTO?
    @State private var blockFutureInvites = false

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(InboxCopy.title)
                            .font(.title2.weight(.bold))
                            .foregroundColor(Color(.label))
                        Text(InboxCopy.subtitle)
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)

                    InboxInvitesSection(
                        invites: programContext.pendingInvites,
                        isGlobalAdmin: programContext.isGlobalAdmin,
                        loadError: invitesError,
                        isBusy: isResponding,
                        onRetry: { Task { await reload() } },
                        onAccept: { invite in Task { await respond(invite, action: "accept") } },
                        onDecline: { invite in inviteToDecline = invite },
                        onRevoke: { invite in Task { await respond(invite, action: "revoke") } }
                    )

                    notificationsSection

                    // A6 / D-KIT-17: neither the offline banner nor the stale banner ever covers the last row.
                    Spacer(minLength: reservesOfflineBand && !programContext.isOnline ? 116 : (isBannerShowing ? 104 : 40))
                }
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await reload() }

            if let invite = inviteToDecline {
                DeclineInviteDialog(
                    programName: invite.program_name ?? "this program",
                    blockFutureInvites: $blockFutureInvites,
                    onDecline: { Task { await respond(invite, action: "decline", blockFuture: blockFutureInvites) } },
                    onCancel: {
                        inviteToDecline = nil
                        blockFutureInvites = false
                    }
                )
                .transition(.opacity)
            }
        }
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false }
        .task(id: isActive) {                                        // also on every re-appearance (tab switch / pop)
            if isActive { await reload() }
        }
        .onChange(of: programContext.inboxRevision) { _, _ in
            // Only an inbox on screen takes a live item (and marks it read); a hidden one reloads when it reappears.
            if isActive, isVisible { Task { await reload() } }
        }
        .onChange(of: programContext.isOnline) { _, online in
            // D-KIT-13: back online after a failed load → reload by itself.
            if online, isActive, isVisible, feed.state.error != nil || invitesError != nil { Task { await reload() } }
        }
        .alert(InboxCopy.respondFailedTitle, isPresented: Binding(
            get: { respondError != nil },
            set: { if !$0 { respondError = nil } }
        )) {
            Button("OK") { respondError = nil }
        } message: {
            Text(respondError ?? "")
        }
        // Hidden while offline (ScreenBanner) — the host's offline banner wins (A6).
        .floatingBanner { ScreenBanner(banner: staleBanner) }
    }

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(InboxCopy.notificationsHeader)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            switch feed.state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 24)
            case .failed(let error):
                ErrorStateView(error: error, onRetry: { Task { await reload() } })
            case .loaded(let items, _, _), .stale(let items, _, _):
                if items.isEmpty {
                    InboxEmptyState()
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(items) { item in
                            InboxRow(item: item, onOpen: item.opensElsewhere ? { open(item) } : nil)
                                .onAppear {
                                    if item.id == items.last?.id { Task { await feed.loadMore() } }
                                }
                        }
                        if feed.isLoadingMore {
                            ProgressView().padding(.vertical, 8)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 20)
    }

    /// Kept data whose refresh failed (the list or the invitations) → "Couldn't refresh" + Retry (frontend-kit §6).
    private var staleBanner: FloatingBanner? {
        var listStale = false
        if case .stale = feed.state { listStale = true }
        let invitesStale = invitesError != nil && !programContext.pendingInvites.isEmpty
        guard listStale || invitesStale else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await reload() } })
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// Invitations + the first page in parallel; then — only when this visit's list really loaded — everything is read.
    private func reload() async {
        async let invites: Void = refreshInvites()
        let listLoaded = await feed.reload(online: programContext.isOnline)
        await invites
        guard listLoaded, !Task.isCancelled else { return }
        let hasUnread = feed.state.value?.contains(where: \.isUnread) ?? false
        if hasUnread || (programContext.inboxCounts?.unread ?? 0) > 0 { await programContext.markAllInboxRead() }
    }

    private func refreshInvites() async {
        do {
            try await programContext.loadPendingInvites()
            invitesError = nil
        } catch {
            if let appError = AppError(error) { invitesError = appError.labeled(online: programContext.isOnline) }
        }
    }

    /// A row whose target is elsewhere: mark read + route (ProgramPickerView), then close this host.
    private func open(_ item: APIClient.NotificationDTO) {
        programContext.openInboxItem(item, fromInbox: true)
        dismiss()
    }

    private func respond(_ invite: APIClient.PendingInviteDTO, action: String, blockFuture: Bool = false) async {
        isResponding = true
        defer {
            isResponding = false
            inviteToDecline = nil
            blockFutureInvites = false
        }
        // C7.7: that program's invite notifications are read once the answer lands (usually already — a visit marks all).
        let inviteItemIds = action == "revoke" ? [] : feed.inviteItemIds(programId: invite.program_id)
        do {
            _ = try await programContext.respondToInvite(inviteId: invite.invite_id, action: action, blockFuture: blockFuture)
            if action == "accept" { onAcceptedInvite?() }                // close first — the read mark never delays it
            let context = programContext
            Task { await context.markInboxRead(ids: inviteItemIds) }    // no ids → just fresh counts (pending changed)
        } catch {
            respondError = SessionCopy.kitMessage(for: error)            // kit copy (a 400 keeps the server's text)
        }
    }
}
```

20. **NEW `Features/Home/Inbox/InboxRow.swift`**:
```swift
import SwiftUI

/// One inbox item (notifications C3): category glyph, title, body (never clamped), relative time, an unread dot. A row
/// whose target is elsewhere (a program, the programs list, the workout log) is a button with a chevron; `inbox` /
/// `invites` rows are plain (they're already on screen).
struct InboxRow: View {
    let item: APIClient.NotificationDTO
    /// nil = not tappable.
    let onOpen: (() -> Void)?

    var body: some View {
        if let onOpen {
            Button(action: onOpen) { content(showsChevron: true) }
                .buttonStyle(.plain)
        } else {
            content(showsChevron: false)
        }
    }

    private func content(showsChevron: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(NotificationCategoryStyle.color(item.resolvedCategory).opacity(0.14))
                    .frame(width: 40, height: 40)
                Image(systemName: NotificationCategoryStyle.icon(item.resolvedCategory))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(NotificationCategoryStyle.color(item.resolvedCategory))
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.title)
                        .font(.subheadline.weight(item.isUnread ? .bold : .semibold))
                        .foregroundColor(Color(.label))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(InboxCopy.timeLabel(for: item.createdDate))
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                        .fixedSize()
                }
                Text(item.body)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            VStack(spacing: 8) {
                if item.isUnread {
                    Circle().fill(Color.appOrange).frame(width: 8, height: 8)
                }
                if showsChevron {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }
            }
            .padding(.top, 4)
            .accessibilityHidden(true)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.systemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(item.isUnread ? "Unread" : "")
    }
}

/// The inbox's empty notifications state (only on loaded data — never on a failure).
struct InboxEmptyState: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundColor(Color(.tertiaryLabel))
            Text(InboxCopy.emptyTitle)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text(InboxCopy.emptyDetail)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 20)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.systemGray6)))
    }
}

/// The inbox list's paging state (GET /notifications/inbox — C4): the first page on open / refresh, then older pages by
/// `next_cursor` as the last row appears. A reload supersedes a page still in flight (generation).
final class InboxFeed: ObservableObject {
    @Published private(set) var state: LoadState<[APIClient.NotificationDTO]> = .idle
    @Published private(set) var isLoadingMore = false
    private var nextCursor: String?
    private var generation = 0

    /// true when THIS call loaded the first page (InboxView marks read only then — TC2).
    @discardableResult
    func reload(online: Bool) async -> Bool {
        generation += 1
        let current = generation
        state = state.refreshing()
        do {
            let page = try await APIClient.shared.fetchInbox()
            guard current == generation else { return false }
            nextCursor = page.nextCursor
            state = .fresh(page.items)
            return true
        } catch {
            guard current == generation, let appError = AppError(error) else { return false }
            state = state.failing(with: appError.labeled(online: online))
            return false
        }
    }

    func loadMore() async {
        guard !isLoadingMore, let cursor = nextCursor, let items = state.value else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let current = generation
        guard let page = try? await APIClient.shared.fetchInbox(before: cursor), current == generation else { return }
        nextCursor = page.nextCursor
        let known = Set(items.map(\.id))
        state = .fresh(items + page.items.filter { !known.contains($0.id) })
    }

    /// C7.7: the loaded invite notifications of one program (an accept / decline marks them read).
    func inviteItemIds(programId: String) -> [String] {
        (state.value ?? []).filter { $0.type == "program.invite_received" && $0.programId == programId }.map(\.id)
    }
}

/// Inbox copy — one table for web / iOS / Android (OQ7: reconcile across surfaces before shipping).
enum InboxCopy {
    static let title = "Inbox"
    static let subtitle = "Your notifications and invitations"
    static let notificationsHeader = "Notifications"
    static let invitationsHeader = "Invitations"
    static let allInvitationsHeader = "All invitations"
    static let emptyTitle = "No notifications yet"
    static let emptyDetail = "Program updates, kudos and reminders will show up here."
    static let respondFailedTitle = "Unable to update invitation"
    static let toastAction = "View"

    /// The account-menu Inbox row's subtitle.
    static func rowSubtitle(badge: Int) -> String {
        badge > 0 ? "\(badge) new" : "Notifications and invitations"
    }

    /// Just now · 5m ago · 3h ago · Yesterday · Oct 12 · Oct 12, 2025.
    static func timeLabel(for date: Date?, now: Date = Date()) -> String {
        guard let date else { return "" }
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 { return "Just now" }
        if seconds < 3600 { return "\(Int(seconds / 60))m ago" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "\(Int(seconds / 3600))h ago" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return calendar.isDate(date, equalTo: now, toGranularity: .year)
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
    }
}
```

21. **`Features/Home/Tabs/ProgramCards.swift`** (`ProgramMyAccountSection`): directly before the `// Change Password` comment (:317), after the My Profile `NavigationLink { MyProfileView() } … .buttonStyle(.plain)`, insert:
```swift
                // Inbox (notifications 0.6.0, D-N4) — the same InboxView as the "+" sheet's Inbox tab
                NavigationLink {
                    InboxView()
                        .navigationTitle(InboxCopy.title)
                        .navigationBarTitleDisplayMode(.inline)
                        .adaptiveBackground(topLeading: true)
                } label: {
                    settingsRow(
                        icon: "tray.fill",
                        color: .appOrange,
                        title: InboxCopy.title,
                        subtitle: InboxCopy.rowSubtitle(badge: programContext.inboxBadgeCount)
                    )
                }
                .buttonStyle(.plain)

```

### E. Notifications settings

22. **`Features/Home/Settings/NotificationsSettingsView.swift`**:
   - (a) Above `struct NotificationsSettingsView: View {`, add:
```swift
/// Notifications settings: this device's permission card (+ Enable / Open Settings) and the per-member preferences
/// (notifications 0.6.0 — NotificationPreferencesSection).
```
   - (b) Replace `Text("Get notified when your program is updated, roles change, or members join or leave.")` with `Text("Choose what RaSi Fiters notifies you about. What you get also shows up in your Inbox.")`.
   - (c) Insert `NotificationPreferencesSection()` between the `.padding(.top, 8)` that closes the `VStack(spacing: 12)` permission block (:84) and the `Spacer()` that follows it (:86).

23. **NEW `Features/Home/Settings/NotificationPreferencesSection.swift`**:
```swift
import SwiftUI

/// The per-member notification switches + the daily-reminder time (notifications 0.6.0 — D-N1 · D-N2 · D-N7 · D-N10;
/// C2 / C4). Server-side, so they follow the member to every device and to web. Each change is a partial
/// PUT /notifications/preferences that reverts on failure; Reminders + Weekly digest are opt-in (App Store 4.5.4).
/// Kit: loading / error view / inline "Couldn't refresh · Retry" over kept settings / reload on reconnect.
struct NotificationPreferencesSection: View {
    @EnvironmentObject private var programContext: ProgramContext
    @State private var state: LoadState<APIClient.NotificationPreferencesDTO> = .idle
    @State private var reminderDate = NotificationPreferencesSection.date(from: "19:00")
    @State private var reminderSave: Task<Void, Never>?
    @State private var saveError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(NotificationPrefsCopy.sectionTitle)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            switch state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
            case .failed(let error):
                ErrorStateView(error: error, onRetry: { Task { await load() } })
            case .loaded(let preferences, _, _), .stale(let preferences, _, _):
                switches(preferences)
            }
            // Kept settings whose refresh failed (kit §6) — inline: a floating banner would cover the permission card.
            if case .stale = state, programContext.isOnline {
                HStack(spacing: 8) {
                    Text(KitCopy.bannerStale)
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                    Spacer(minLength: 8)
                    Button(KitCopy.retry) { Task { await load() } }
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appOrange)
                        .frame(minHeight: 44)
                }
            }
            if let saveError {
                Text(saveError)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(NotificationPrefsCopy.footnote)
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await load() }
        .onChange(of: reminderDate) { _, date in scheduleReminderSave(date) }
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }          // D-KIT-13: refetch on reconnect
        }
    }

    private func switches(_ preferences: APIClient.NotificationPreferencesDTO) -> some View {
        VStack(spacing: 0) {
            ForEach(NotificationPrefsCopy.categories, id: \.key) { category in
                Toggle(isOn: binding(for: category.key)) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(category.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(Color(.label))
                        Text(category.detail)
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .adaptiveTint()
                .padding(14)
                if category.key == "reminders", preferences.categories["reminders"] == true {
                    reminderTimeRow
                }
                if category.key != NotificationPrefsCopy.categories.last?.key {
                    Divider().padding(.leading, 14)
                }
            }
        }
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.systemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1))
    }

    private var reminderTimeRow: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(NotificationPrefsCopy.reminderTime)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Text(NotificationPrefsCopy.reminderTimeDetail)
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            DatePicker(NotificationPrefsCopy.reminderTime, selection: $reminderDate, displayedComponents: .hourAndMinute)
                .labelsHidden()
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
    }

    private func binding(for key: String) -> Binding<Bool> {
        Binding(
            get: { state.value?.categories[key] ?? ProgramContext.defaultNotificationCategories[key] ?? false },
            set: { value in Task { await save(categories: [key: value]) } }
        )
    }

    private func load() async {
        if state.value == nil, let cached = programContext.notificationPreferences {
            state = .loaded(cached, fetchedAt: Date(), refreshing: true)      // instant from the session cache
            reminderDate = Self.date(from: cached.reminderTime)
        }
        state = state.refreshing()
        do {
            let preferences = try await programContext.loadNotificationPreferences()
            state = .fresh(preferences)
            reminderDate = Self.date(from: preferences.reminderTime)
        } catch {
            if let appError = AppError(error) { state = state.failing(with: appError.labeled(online: programContext.isOnline)) }
        }
    }

    /// Optimistic partial PUT; a failure restores the previous values + says why.
    private func save(categories: [String: Bool]? = nil, reminderTime: String? = nil) async {
        guard let previous = state.value else { return }
        var next = previous
        categories?.forEach { next.categories[$0.key] = $0.value }
        if let reminderTime { next.reminderTime = reminderTime }
        state = .fresh(next)
        saveError = nil
        do {
            let saved = try await APIClient.shared.updateNotificationPreferences(categories: categories, reminderTime: reminderTime)
            state = .fresh(saved)
            programContext.notificationPreferences = saved
        } catch {
            state = .fresh(previous)
            reminderDate = Self.date(from: previous.reminderTime)
            saveError = "\(NotificationPrefsCopy.saveFailed) \(SessionCopy.kitMessage(for: error))"
        }
    }

    /// The time wheel moves continuously — save once it rests (0.6 s).
    private func scheduleReminderSave(_ date: Date) {
        let time = Self.timeFormatter.string(from: date)
        guard let current = state.value, time != current.reminderTime else { return }
        reminderSave?.cancel()
        reminderSave = Task {
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            await save(reminderTime: time)
        }
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    private static func date(from time: String) -> Date {
        timeFormatter.date(from: time) ?? timeFormatter.date(from: "19:00") ?? Date()
    }
}

/// Notification-preferences copy — one table for web / iOS / Android (OQ7). Labels = notifications C2.
enum NotificationPrefsCopy {
    struct Category {
        let key: String
        let title: String
        let detail: String
    }

    static let categories: [Category] = [
        Category(key: "program", title: "Program & invites", detail: "Invitations, role changes and updates to your programs."),
        Category(key: "activity", title: "Activity", detail: "Kudos from people in your programs."),
        Category(key: "reminders", title: "Reminders", detail: "One nudge at your chosen time if you haven't logged a workout that day."),
        Category(key: "digest", title: "Weekly digest", detail: "A Monday morning recap of your week."),
        Category(key: "announcements", title: "Announcements", detail: "News and messages from the RaSi Fiters team.")
    ]
    static let sectionTitle = "Notify me about"
    static let reminderTime = "Reminder time"
    static let reminderTimeDetail = "Uses your phone's current time zone."
    static let footnote = "Reminders and the weekly digest are off until you turn them on. Turning off Program & invites or Announcements stops the alerts, but those still appear in your Inbox."
    static let saveFailed = "Couldn't save."
}
```

### F. People

24. **NEW `Features/Home/People/PeopleListView.swift`**:
```swift
import SwiftUI

/// People (people 0.1.0 — D-P1 · D-P2 · D-P10; specs/pages/ios/people/SPEC.md): the current program's active members, for
/// every role — "You" first, initials, last active; every row opens the profile. Replaces the roster
/// (ProgramMembersListView) at both entries: the Standard Members-tab header button and the Program tab's People row
/// (TC1). A member who hides their activity shows by name, "Activity hidden" (D-P7).
struct PeopleListView: View {
    @EnvironmentObject private var programContext: ProgramContext
    @State private var state: LoadState<APIClient.PeopleListDTO> = .idle
    @State private var searchText = ""
    @State private var showVisibilityNotice = false

    var body: some View {
        List {
            switch state {
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            case .failed(let error):
                ErrorStateView(error: error, onRetry: { Task { await load() } })
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            case .loaded(let list, _, _), .stale(let list, _, _):
                let people = filtered(list.people)
                if people.isEmpty {
                    Text(searchText.isEmpty ? PeopleCopy.empty : PeopleCopy.noMatches)
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(people) { person in
                        NavigationLink {
                            PersonProfileView(memberId: person.memberId, programId: list.programId, name: person.memberName)
                        } label: {
                            PersonRow(person: person)
                        }
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if isBannerShowing { Color.clear.frame(height: 76) }          // A6: the stale banner never covers a row
        }
        // Container cap (large-screen column rules) + a matching backdrop beside the capped List on iPad / Mac.
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
        .frame(maxWidth: .infinity)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .searchable(text: $searchText, prompt: PeopleCopy.searchPrompt)
        .navigationTitle(PeopleCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task(id: programContext.programId) { await load() }
        .onAppear { if !ActivityVisibilityNotice.isSeen { showVisibilityNotice = true } }    // people U-1 (b)
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }       // D-KIT-13: refetch on reconnect
        }
        .floatingBanner { ScreenBanner(banner: staleBanner) }
        .activityVisibilityNotice(isPresented: $showVisibilityNotice, context: programContext)
    }

    private func filtered(_ people: [APIClient.PersonDTO]) -> [APIClient.PersonDTO] {
        let query = searchText.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return people }
        return people.filter {
            $0.memberName.localizedCaseInsensitiveContains(query) || $0.username.localizedCaseInsensitiveContains(query)
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = state else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await load() } })
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    private func load() async {
        guard let programId = programContext.programId else { return }
        state = state.refreshing()
        do {
            state = .fresh(try await APIClient.shared.fetchPeople(programId: programId))
        } catch {
            if let appError = AppError(error) { state = state.failing(with: appError.labeled(online: programContext.isOnline)) }
        }
    }
}

private struct PersonRow: View {
    let person: APIClient.PersonDTO

    var body: some View {
        HStack(spacing: 12) {
            InitialsAvatar(initials: person.initials, highlighted: person.isYou)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(person.memberName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                        .fixedSize(horizontal: false, vertical: true)
                    if person.isYou { PeoplePill(text: PeopleCopy.you) }
                    if let role = PeopleCopy.roleLabel(person.programRole) { PeoplePill(text: role) }
                }
                Text(PeopleCopy.lastActiveLine(person))
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 4)
    }
}

/// Initials only (people D-P10) — the server computes them, so every surface shows the same letters.
struct InitialsAvatar: View {
    let initials: String
    var size: CGFloat = 44
    var highlighted = false

    var body: some View {
        ZStack {
            Circle()
                .fill(highlighted ? Color.appOrangeLight : Color(.systemGray5))
                .frame(width: size, height: size)
            Text(initials)
                .font(size >= 60 ? .title3.weight(.semibold) : .subheadline.weight(.semibold))
                .foregroundColor(highlighted ? .appOrange : Color(.label))
        }
        .accessibilityHidden(true)
    }
}

/// A small capsule label — "You", "Admin", "Logger".
struct PeoplePill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .foregroundColor(.appOrange)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.appOrangeLight))
            .fixedSize()
    }
}

/// The People cards' chrome (profile sections, kudos).
struct PeopleCardBackground: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color(.systemBackground))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1))
    }
}

/// People copy — one table for web / iOS / Android (OQ7: reconcile across surfaces before shipping).
enum PeopleCopy {
    static let title = "People"
    static let searchPrompt = "Search people"
    static let you = "You"
    static let empty = "No one in this program yet."
    static let noMatches = "No one matches your search."
    static let activityHidden = "Activity hidden"
    static let hiddenLine = "This member keeps their activity private."
    static let noWorkoutsYet = "No workouts yet"
    static let currentStreak = "Current streak"
    static let longestStreak = "Longest streak"
    static let activeDaysThisMonth = "Active days this month"
    static let lastActive = "Last active"
    static let recentWorkouts = "Recent workouts"
    static let noWorkoutsLogged = "No workouts logged yet."
    static let openFullStats = "Open full stats"
    static let openFullStatsDetail = "Workout history, streaks and health logs"
    static let editMembership = "Edit membership"
    static let editMembershipDetail = "Joined date, active status or remove"
    static let kudos = "Kudos"
    static let giveKudos = "Give kudos"
    static let kudosGiven = "Kudos given"
    static let kudosUndoHint = "Tap again to undo."
    static let hideActivity = "Hide my activity"
    static let hideActivityDetail = "Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them."
    static let saveFailed = "Couldn't save."

    static func roleLabel(_ role: String) -> String? {
        switch role {
        case "admin": return "Admin"
        case "logger": return "Logger"
        default: return nil
        }
    }

    static func lastActiveLine(_ person: APIClient.PersonDTO) -> String {
        guard person.activityVisible else { return activityHidden }
        guard let date = person.lastActive else { return noWorkoutsYet }
        return "Active \(dayLabel(date))"
    }

    static func days(_ count: Int) -> String { count == 1 ? "1 day" : "\(count) days" }

    static func kudosCount(_ count: Int) -> String { "\(count) kudos received" }

    static func duration(_ minutes: Int) -> String {
        let hours = minutes / 60, rest = minutes % 60
        if hours == 0 { return "\(rest)m" }
        return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
    }

    /// A "YYYY-MM-DD" log date against this device's calendar: today · yesterday · Oct 12 · Oct 12, 2025.
    static func dayLabel(_ ymd: String, capitalized: Bool = false) -> String {
        guard let date = ymdFormatter.date(from: ymd) else { return ymd }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return capitalized ? "Today" : "today" }
        if calendar.isDateInYesterday(date) { return capitalized ? "Yesterday" : "yesterday" }
        return calendar.isDate(date, equalTo: Date(), toGranularity: .year)
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    private static let ymdFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}
```

25. **NEW `Features/Home/People/PersonProfileView.swift`**:
```swift
import SwiftUI

/// A person's profile (people 0.1.0 — D-P3 · D-P4 · D-P7 · D-P11; specs/pages/ios/people/SPEC.md): workouts only — current
/// + longest streak, active days this month, last active, the last 10 workouts — and kudos. A member who hides their
/// activity shows by name with one honest line. Staff get "Open full stats" (the member's Members cards); global admins
/// also get the membership editor (D-P11 — editing stays global-admin). A person no longer in the program → back.
struct PersonProfileView: View {
    @EnvironmentObject private var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    let memberId: String
    let programId: String
    let name: String
    @State private var state: LoadState<APIClient.PersonProfileDTO> = .idle

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                switch state {
                case .idle, .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 40)
                case .failed(let error):
                    ErrorStateView(error: error, onRetry: { Task { await load() } })
                case .loaded(let profile, _, _), .stale(let profile, _, _):
                    content(profile)
                }
            }
            .padding(20)
            .padding(.bottom, isBannerShowing ? 64 : 0)               // A6: the stale banner never covers the last card
            .frame(maxWidth: AdaptiveLayout.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }                                        // also after returning from the editor / full stats
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }
        }
        .floatingBanner { ScreenBanner(banner: staleBanner) }
    }

    @ViewBuilder
    private func content(_ profile: APIClient.PersonProfileDTO) -> some View {
        header(profile)
        if profile.activityVisible {
            if let stats = profile.stats { statsGrid(stats) }
            if let kudos = profile.kudos {
                KudosButton(memberId: profile.memberId, programId: profile.programId, kudos: kudos,
                            onHidden: { Task { await load() } })
                    .id(kudos)                                        // a re-fetch resets its local count
            }
            recentWorkouts(profile.recentWorkouts ?? [])
        } else {
            Text(PeopleCopy.hiddenLine)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(PeopleCardBackground())
        }
        if profile.canOpenFullStats {
            NavigationLink {
                MemberFullStatsView(member: memberDTO(profile))
            } label: {
                settingsRow(icon: "chart.bar.xaxis", color: .appBlue,
                            title: PeopleCopy.openFullStats, subtitle: PeopleCopy.openFullStatsDetail)
            }
            .buttonStyle(.plain)
        }
        if programContext.isGlobalAdmin,
           let membership = programContext.membershipDetails.first(where: { $0.member_id == profile.memberId }) {
            NavigationLink {
                MemberDetailEditView(membership: membership)
            } label: {
                settingsRow(icon: "person.crop.circle.badge.checkmark", color: .appGreen,
                            title: PeopleCopy.editMembership, subtitle: PeopleCopy.editMembershipDetail)
            }
            .buttonStyle(.plain)
        }
    }

    private func header(_ profile: APIClient.PersonProfileDTO) -> some View {
        HStack(spacing: 14) {
            InitialsAvatar(initials: profile.initials, size: 64, highlighted: profile.isYou)
            VStack(alignment: .leading, spacing: 4) {
                Text(profile.memberName)
                    .font(.title3.weight(.bold))
                    .foregroundColor(Color(.label))
                    .fixedSize(horizontal: false, vertical: true)
                if !profile.username.isEmpty {
                    Text("@\(profile.username)")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                HStack(spacing: 6) {
                    if profile.isYou { PeoplePill(text: PeopleCopy.you) }
                    if let role = PeopleCopy.roleLabel(profile.programRole) { PeoplePill(text: role) }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private func statsGrid(_ stats: APIClient.PersonStatsDTO) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                statTile(PeopleCopy.currentStreak, PeopleCopy.days(stats.currentStreak), "flame.fill", .appOrange)
                statTile(PeopleCopy.longestStreak, PeopleCopy.days(stats.longestStreak), "trophy.fill", .appYellow)
            }
            .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 12) {
                statTile(PeopleCopy.activeDaysThisMonth, "\(stats.activeDaysThisMonth)", "calendar", .appBlue)
                statTile(PeopleCopy.lastActive, stats.lastActive.map { PeopleCopy.dayLabel($0, capitalized: true) } ?? "—",
                         "clock.fill", .appGreen)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func statTile(_ title: String, _ value: String, _ icon: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(color)
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func recentWorkouts(_ workouts: [APIClient.PersonWorkoutDTO]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(PeopleCopy.recentWorkouts)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            if workouts.isEmpty {
                Text(PeopleCopy.noWorkoutsLogged)
                    .font(.footnote)
                    .foregroundColor(Color(.secondaryLabel))
            } else {
                ForEach(Array(workouts.enumerated()), id: \.offset) { _, workout in
                    HStack(spacing: 10) {
                        Circle()
                            .fill(Color.appOrangeLight)
                            .frame(width: 10, height: 10)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(workout.workoutType)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text(workout.date.map { PeopleCopy.dayLabel($0, capitalized: true) } ?? "—")
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        Text(PeopleCopy.duration(workout.durationMinutes))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(Color(.label))
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PeopleCardBackground())
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = state else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await load() } })
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// The shared Members cards take a MemberDTO — the profile's identity fields are enough.
    private func memberDTO(_ profile: APIClient.PersonProfileDTO) -> APIClient.MemberDTO {
        APIClient.MemberDTO(id: profile.memberId, member_name: profile.memberName, username: profile.username,
                            gender: nil, date_of_birth: nil, date_joined: nil, email: nil)
    }

    private func load() async {
        state = state.refreshing()
        do {
            state = .fresh(try await APIClient.shared.fetchPersonProfile(memberId: memberId, programId: programId))
        } catch {
            guard let appError = AppError(error) else { return }
            // Removed from the program meanwhile (e.g. via Edit membership): back to People, which reloads on appear.
            if appError.kind == .notFound, state.value != nil {
                dismiss()
                return
            }
            state = state.failing(with: appError.labeled(online: programContext.isOnline))
        }
    }
}
```

26. **NEW `Features/Home/People/KudosButton.swift`**:
```swift
import SwiftUI

/// Kudos on a profile (people 0.1.0 — D-P4 · D-P5): one per person per their local day, undoable, a count only (no text).
/// POST answers the count; DELETE answers only `removed` (people §E — no count), so an undo decrements locally.
struct KudosButton: View {
    let memberId: String
    let programId: String
    /// 403 activity_hidden: the member hid their activity meanwhile — the profile re-fetches.
    let onHidden: () -> Void
    @State private var kudos: APIClient.KudosSummaryDTO
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(memberId: String, programId: String, kudos: APIClient.KudosSummaryDTO, onHidden: @escaping () -> Void) {
        self.memberId = memberId
        self.programId = programId
        self.onHidden = onHidden
        _kudos = State(initialValue: kudos)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(PeopleCopy.kudos)
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text(PeopleCopy.kudosCount(kudos.count))
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer(minLength: 8)
                if kudos.canGive { toggleButton }
            }
            if kudos.canGive, kudos.givenToday {
                Text(PeopleCopy.kudosUndoHint)
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PeopleCardBackground())
    }

    private var toggleButton: some View {
        Button {
            Task { await toggle() }
        } label: {
            HStack(spacing: 6) {
                if isSaving {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: kudos.givenToday ? "hands.clap.fill" : "hands.clap")
                }
                Text(kudos.givenToday ? PeopleCopy.kudosGiven : PeopleCopy.giveKudos)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundColor(kudos.givenToday ? .appOrange : Color(.systemBackground))
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(Capsule().fill(kudos.givenToday ? Color.appOrangeLight : Color(.label)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isSaving)
        .accessibilityHint(kudos.givenToday ? PeopleCopy.kudosUndoHint : "")
    }

    private func toggle() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            if kudos.givenToday {
                let result = try await APIClient.shared.undoKudos(memberId: memberId)
                if result.removed { kudos.count = max(kudos.count - 1, 0) }
                kudos.givenToday = result.givenToday
            } else {
                let result = try await APIClient.shared.giveKudos(memberId: memberId, programId: programId)
                kudos.count = result.count
                kudos.givenToday = result.givenToday
            }
        } catch let error as APIHTTPError where error.code == "activity_hidden" {
            onHidden()
        } catch {
            errorMessage = SessionCopy.kitMessage(for: error)
        }
    }
}
```

27. **NEW `Features/Home/People/MemberFullStatsView.swift`**:
```swift
import SwiftUI

/// Staff "Open full stats" from a profile (people D-P11, OQ5): the member's Members cards — overview, workout history,
/// streaks, recent workouts, health — with their detail screens, on the same S5 recipe as the Members tabs. The cards
/// read ProgramContext's shared member state, so this screen OWNS it while it loads (TC5): whenever it (re)appears and
/// someone else loaded that state (a Members tab), it shows placeholders and reloads — never the other member's numbers.
struct MemberFullStatsView: View {
    @EnvironmentObject private var programContext: ProgramContext
    let member: APIClient.MemberDTO
    @State private var ownerId = UUID().uuidString
    @State private var loadState: LoadState<String> = .idle
    @State private var cards = MemberCardsState()
    @State private var refreshCount = 0

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 16) {
                if case .failed(let error) = loadState {
                    ErrorStateView(error: error, onRetry: retry)
                } else {
                    MemberOverviewCard(member: member, state: cards.overview)
                    MemberHistoryCard(selectedMember: member, state: cards.history)
                    MemberStreakCard(selectedMember: member, state: cards.streaks)
                    MemberRecentCard(selectedMember: member, state: cards.recent)
                    MemberHealthCard(selectedMember: member, refreshToken: refreshCount)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)
            .padding(.bottom, isBannerShowing ? 88 : 24)
            .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
            .frame(maxWidth: .infinity)
        }
        .refreshable {
            refreshCount += 1
            await load()
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle(member.member_name)
        .navigationBarTitleDisplayMode(.inline)
        .floatingBanner { ScreenBanner(banner: staleBanner) }
        .task { await load() }                                            // every appearance (pop back / tab switch)
        .onChange(of: programContext.isOnline) { _, online in
            if online, loadState.error != nil { Task { await load() } }
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState else { return nil }
        return FloatingBanner(variant: .stale, onRetry: retry)
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    private func retry() {
        refreshCount += 1
        Task { await load() }
    }

    private func load() async {
        guard let programId = programContext.programId else { return }
        let key = "\(programId)|\(member.id)"
        // Another screen loaded its member into the shared card state (TC5), or a first load: placeholders.
        if loadState.value != key || programContext.memberCardsOwner != ownerId {
            cards = MemberCardsState()
            loadState = .loading
        } else {
            loadState = loadState.refreshing()
        }
        programContext.memberCardsOwner = ownerId
        let result = await programContext.loadMemberCards(memberId: member.id)
        guard !Task.isCancelled, programContext.programId == programId else { return }
        cards = loadState.value == key ? cards.merging(result.cards) : result.cards
        loadState = loadState.applying(cards: cards, error: result.error, key: key, online: programContext.isOnline)
    }
}
```

28. **NEW `Features/Home/People/ActivityVisibilityNotice.swift`** (U-1 (b)):
```swift
import SwiftUI

/// "Who can see your activity" (people U-1 (b), people D-C12): a one-time notice, per device, before People first shows
/// other people (PeopleListView) and once after the update on a phone that already syncs Apple Health workouts
/// (ProgramContext.preparePushOnSessionStart, TC13). Keep visible / Hide my activity (PUT /members/:id
/// { hide_activity: true }). Seen only once the choice really landed — a failed Hide says so and asks again next time.
enum ActivityVisibilityNotice {
    static let title = "Who can see your activity"
    static let message = "Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or Health Connect. Sleep, diet and steps stay private to you and your program's staff."
    static let keepVisible = "Keep visible"
    static let hide = "Hide my activity"
    static let saveFailedTitle = "Couldn't hide your activity"
    static let saveFailedHint = "You can turn on Hide my activity in My Profile."
    private static let seenKey = "people.activityVisibilityNoticeSeen"

    static var isSeen: Bool { UserDefaults.standard.bool(forKey: seenKey) }
    static func markSeen() { UserDefaults.standard.set(true, forKey: seenKey) }
}

private struct ActivityVisibilityNoticeModifier: ViewModifier {
    @Binding var isPresented: Bool
    let context: ProgramContext
    @State private var failureMessage: String?

    func body(content: Content) -> some View {
        content
            .alert(ActivityVisibilityNotice.title, isPresented: $isPresented) {
                Button(ActivityVisibilityNotice.keepVisible, role: .cancel) { ActivityVisibilityNotice.markSeen() }
                Button(ActivityVisibilityNotice.hide) { Task { await hideActivity() } }
            } message: {
                Text(ActivityVisibilityNotice.message)
            }
            .alert(ActivityVisibilityNotice.saveFailedTitle, isPresented: Binding(
                get: { failureMessage != nil },
                set: { if !$0 { failureMessage = nil } }
            )) {
                Button("OK") { failureMessage = nil }
            } message: {
                Text(failureMessage ?? "")
            }
    }

    private func hideActivity() async {
        guard let memberId = context.loggedInUserId else { return }
        do {
            _ = try await APIClient.shared.updateHideActivity(memberId: memberId, hide: true)
            ActivityVisibilityNotice.markSeen()
        } catch {
            failureMessage = "\(SessionCopy.kitMessage(for: error)) \(ActivityVisibilityNotice.saveFailedHint)"
        }
    }
}

extension View {
    func activityVisibilityNotice(isPresented: Binding<Bool>, context: ProgramContext) -> some View {
        modifier(ActivityVisibilityNoticeModifier(isPresented: isPresented, context: context))
    }
}
```

29. **NEW `Features/Home/Settings/HideActivitySection.swift`**:
```swift
import SwiftUI

/// My Profile → "Hide my activity" (people 0.1.0 — D-P6 · D-P7; members `hide_activity`). One switch for every program:
/// hides this member's workouts, streaks and kudos from plain co-members; program admins and loggers still see them.
/// GET /members/:id reads it (self only); PUT /members/:id { hide_activity } saves it and reverts on failure (a response
/// without the field is a failure — APIClient+People). Hidden when the server doesn't return the field (before people
/// 0.1.0) — never a switch that controls nothing. Reloads on reconnect after a failed load (D-KIT-13).
struct HideActivitySection: View {
    @EnvironmentObject private var programContext: ProgramContext
    @State private var state: LoadState<Bool> = .idle
    @State private var isSupported = true
    @State private var isSaving = false
    @State private var saveError: String?

    var body: some View {
        if isSupported {
            VStack(alignment: .leading, spacing: 12) {
                Divider()
                if let hidden = state.value {
                    Toggle(isOn: Binding(get: { hidden }, set: { value in Task { await save(value) } })) { labels }
                        .adaptiveTint()
                        .disabled(isSaving)
                } else if case .failed = state {
                    labels
                    HStack {
                        Text(KitCopy.errorViewTitle)
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                        Spacer(minLength: 8)
                        Button(KitCopy.retry) { Task { await load() } }
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appOrange)
                            .frame(minHeight: 44)
                    }
                } else {
                    HStack(alignment: .firstTextBaseline) {
                        labels
                        Spacer(minLength: 8)
                        ProgressView()
                    }
                }
                if let saveError {
                    Text(saveError)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.appRed)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .task { await load() }
            .onChange(of: programContext.isOnline) { _, online in
                if online, state.error != nil { Task { await load() } }
            }
        }
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(PeopleCopy.hideActivity)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text(PeopleCopy.hideActivityDetail)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func load() async {
        guard let memberId = programContext.loggedInUserId else { return }
        state = state.refreshing()
        do {
            guard let hidden = try await APIClient.shared.fetchHideActivity(memberId: memberId) else {
                isSupported = false
                return
            }
            state = .fresh(hidden)
        } catch {
            if let appError = AppError(error) { state = state.failing(with: appError.labeled(online: programContext.isOnline)) }
        }
    }

    private func save(_ hide: Bool) async {
        guard let memberId = programContext.loggedInUserId, let previous = state.value else { return }
        state = .fresh(hide)
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            state = .fresh(try await APIClient.shared.updateHideActivity(memberId: memberId, hide: hide))
        } catch {
            state = .fresh(previous)
            saveError = "\(PeopleCopy.saveFailed) \(SessionCopy.kitMessage(for: error))"
        }
    }
}
```

30. **`Features/Home/Settings/MyProfileView.swift`**: directly after the line `signInMethodsSection` (:77) and before the comment `// auth §3.1 / amendment U3: …`, insert:
```swift

                // people 0.1.0 (D-P6 / D-P7): "Hide my activity" — one switch for every program.
                HideActivitySection()
```

31. **`Features/Home/ProgramManagement/MemberManagementSection.swift`**:
   - (a) After the header comment's last line (`// than the backend, … boundary). Cleanups (run 62): clear-stale-error-on-edit + tokenize bare colors.`), add:
```swift
// people 0.1.0 (OQ9 / TC1 / TC9): the roster list (ProgramMembersListView) is retired — this row, the admins' entry,
// opens PeopleListView; MemberDetailEditView stays (global admins reach it from a person's profile, D-P11).
```
   - (b) Replace the `// View Members - everyone can see the list` NavigationLink block (:23–33, through its `.buttonStyle(.plain)`) with:
```swift
                // People — the admins' entry (people D-P2 / TC1; replaces the roster list)
                NavigationLink {
                    PeopleListView()
                } label: {
                    settingsRow(
                        icon: "person.3.fill",
                        color: .appGreen,
                        title: PeopleCopy.title,
                        subtitle: "\(programContext.members.count) enrolled"
                    )
                }
                .buttonStyle(.plain)
```
   - (c) Delete `struct ProgramMembersListView: View { … }` entirely, from `struct ProgramMembersListView` (:65) through its closing brace and the blank line before `struct MemberDetailEditView`. After step 33, a grep of the app target for `ProgramMembersListView` must return 0 hits.

32. **`Features/Home/Tabs/AdminMembersTab.swift`**: replace the whole file. Per UA-1, the header is unchanged (Invite only):
```swift
import SwiftUI

// MARK: - Members Tab (program-admin + global-admin variant)
// Ported faithfully from legacy Features/Home/Tabs/AdminOtherTabs.swift (the AdminMembersTab struct).
// people 0.1.0 (TC1): admins open People from the Program tab's People row (today's roster entry); this header keeps
// Invite only. polish #32 (people S5): the View-as cards on the kit's Summary recipe — placeholders while loading,
// "Couldn't load this" per failed card, ErrorStateView + Retry when nothing loaded, "Couldn't refresh · Retry" over kept
// data, pull-to-refresh, reload on reconnect; never another member's / program's numbers (#10, TC5). polish #5 kept: the
// reads run in parallel; the preview + health cards load themselves.

struct AdminMembersTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var showMemberPicker = false
    @State private var selectedMember: APIClient.MemberDTO?
    /// "<program>|<member>" whose cards are on screen (frontend-kit §5).
    @State private var loadState: LoadState<String> = .idle
    @State private var cards = MemberCardsState()
    /// Bumped by pull-to-refresh / Retry — the self-loading preview + health cards reload too.
    @State private var refreshCount = 0
    private var canViewAs: Bool { programContext.isProgramAdmin }

    private var viewAsLabel: String {
        if let selectedMember {
            return selectedMember.member_name
        }
        if programContext.isGlobalAdmin {
            return "None"
        }
        return programContext.loggedInUserName ?? "Member"
    }

    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Members")
                                .font(.largeTitle.weight(.bold))
                                .foregroundColor(Color(.label))
                            Text(programContext.name)
                                .font(.headline.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        NavigationLink {
                            InviteMemberView()
                        } label: {
                            GlassButton(icon: "envelope.badge.person.crop")
                        }
                    }
                    .padding(.top, 24)

                    NavigationLink {
                        MemberMetricsDetailView()
                    } label: {
                        MemberMetricsPreviewCard(refreshToken: refreshCount)
                    }
                    .buttonStyle(.plain)

                    if canViewAs {
                        viewAsSelector
                        if let member = selectedMember {
                            memberCards(member)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, isBannerShowing ? 88 : 24)          // A6: the stale banner never covers the last card
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .refreshable {
                refreshCount += 1
                if let selectedMember { await loadMemberData(for: selectedMember) }
            }
            .adaptiveBackground(topLeading: true)
            .navigationBarBackButtonHidden(true)
            .floatingBanner { ScreenBanner(banner: staleBanner) }
            .onAppear {
                // Back from People → "Open full stats" (TC5): the shared card state holds that member — placeholders,
                // then our View-as member again.
                guard let owner = programContext.memberCardsOwner, owner != MemberCardsOwner.membersTab,
                      let selectedMember else { return }
                cards = MemberCardsState()
                loadState = .loading
                Task { await loadMemberData(for: selectedMember) }
            }
        }
        .task {
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.programId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
            }
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.members.count) { _, _ in
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
            }
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.isOnline) { _, online in
            // D-KIT-13: back online after a failed load → reload by itself.
            if online, loadState.error != nil, let selectedMember { Task { await loadMemberData(for: selectedMember) } }
        }
    }

    @ViewBuilder
    private func memberCards(_ member: APIClient.MemberDTO) -> some View {
        if case .failed(let error) = loadState {
            ErrorStateView(error: error, onRetry: retry)
        } else {
            MemberOverviewCard(member: member, state: cards.overview)
            MemberHistoryCard(selectedMember: member, state: cards.history)
            MemberStreakCard(selectedMember: member, state: cards.streaks)
            MemberRecentCard(selectedMember: member, state: cards.recent)
            MemberHealthCard(selectedMember: member, refreshToken: refreshCount)
        }
    }

    private var viewAsSelector: some View {
        Button {
            showMemberPicker = true
        } label: {
            HStack {
                Text("View as")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                Text(viewAsLabel)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showMemberPicker) {
            MemberPickerView(
                members: programContext.members,
                selected: selectedMember,
                showNoneOption: programContext.isGlobalAdmin,
                onSelect: { member in
                    applySelection(member)
                }
            )
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState, selectedMember != nil else { return nil }
        return FloatingBanner(variant: .stale, onRetry: retry)
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// Retry (error view / banner): the View-as cards + the self-loading preview and health cards.
    private func retry() {
        refreshCount += 1
        if let selectedMember { Task { await loadMemberData(for: selectedMember) } }
    }

    private func applySelection(_ member: APIClient.MemberDTO?) {
        selectedMember = member
        showMemberPicker = false
        Task {
            await loadMemberData(for: member)
        }
    }

    @MainActor
    private func loadMemberData(for member: APIClient.MemberDTO?) async {
        guard let member, let programId = programContext.programId else {
            loadState = .idle
            cards = MemberCardsState()
            programContext.selectedMemberOverview = nil
            programContext.memberHistory = []
            programContext.memberStreaks = nil
            programContext.memberRecent = []
            programContext.memberHealthLogs = []
            return
        }
        let pc = programContext
        let key = "\(programId)|\(member.id)"
        // Another member / program, or "Open full stats" loaded someone else into the shared state (TC5): placeholders.
        if loadState.value != key || pc.memberCardsOwner != MemberCardsOwner.membersTab {
            cards = MemberCardsState()
            loadState = .loading
        } else {
            loadState = loadState.refreshing()
        }
        pc.memberCardsOwner = MemberCardsOwner.membersTab
        let result = await pc.loadMemberCards(memberId: member.id)
        // Superseded (another selection / program, or the view went away): the newer load owns the cards.
        guard !Task.isCancelled, selectedMember?.id == member.id, pc.programId == programId else { return }
        cards = loadState.value == key ? cards.merging(result.cards) : result.cards
        loadState = loadState.applying(cards: cards, error: result.error, key: key, online: pc.isOnline)
    }

    private func applyDefaultSelectionIfNeeded() {
        guard !programContext.isGlobalAdmin else { return }
        guard selectedMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        applySelection(member)
    }
}
```

33. **`Features/Home/Tabs/StandardMembersTab.swift`**: replace the whole file:
```swift
import SwiftUI

// MARK: - Standard Members Tab (for non-admin users)
// Ported faithfully from legacy Features/Home/Tabs/StandardMembersTab.swift.
// people 0.1.0 (D-P2): the header button opens People (was the roster list). polish #32 (people S5): the cards run on the
// kit's Summary recipe — placeholders while loading, "Couldn't load this" per failed card, ErrorStateView + Retry when
// nothing loaded, "Couldn't refresh · Retry" over kept data, pull-to-refresh, reload on reconnect; never another
// program's or member's numbers (#10, TC5). polish #5 kept: every read in parallel; the self metric row IS the overview
// row (no all-member download, member-analytics D-C10); a logger's Recent + Health follow the View-as member (QA2).

struct StandardMembersTab: View {
    @EnvironmentObject var programContext: ProgramContext
    /// The program whose cards are on screen (frontend-kit §5).
    @State private var loadState: LoadState<String> = .idle
    @State private var cards = MemberCardsState()
    /// Bumped by pull-to-refresh / Retry — the self-loading health card reloads too.
    @State private var refreshCount = 0
    @State private var loggedInUserMetrics: APIClient.MemberMetricsDTO?
    @State private var loggerViewAsMember: APIClient.MemberDTO?
    @State private var showLoggerMemberPicker = false

    private var isLogger: Bool {
        programContext.loggedInUserProgramRole == "logger"
    }

    private var loggedInMember: APIClient.MemberDTO? {
        guard let userId = programContext.loggedInUserId else { return nil }
        return programContext.members.first { $0.id == userId }
    }

    /// Recent + Health: the logger's View-as member; everyone else sees themself.
    private var logsMember: APIClient.MemberDTO? {
        isLogger ? (loggerViewAsMember ?? loggedInMember) : loggedInMember
    }

    private var loggerViewAsLabel: String {
        loggerViewAsMember?.member_name ?? programContext.loggedInUserName ?? "Member"
    }

    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Members")
                                .font(.largeTitle.weight(.bold))
                                .foregroundColor(Color(.label))
                            Text(programContext.name)
                                .font(.headline.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        // People — the standard / logger entry (people D-P2; replaces the roster list)
                        NavigationLink {
                            PeopleListView()
                        } label: {
                            GlassButton(icon: "person.2")
                        }
                        .accessibilityLabel(PeopleCopy.title)
                    }
                    .padding(.top, 24)

                    if case .failed(let error) = loadState {
                        ErrorStateView(error: error, onRetry: retry)
                    } else {
                        MemberOverviewCard(member: loggedInMember, state: cards.overview)
                        // The self metric row — needs a concrete row, so it keeps its own gate.
                        if let metrics = loggedInUserMetrics {
                            MemberMetricsCard(metric: metrics, hero: .active_days)
                        }
                        // History and Streak: always the signed-in member (standard and logger).
                        MemberHistoryCard(selectedMember: loggedInMember, state: cards.history)
                        MemberStreakCard(selectedMember: loggedInMember, state: cards.streaks)
                        if isLogger {
                            loggerViewAsSelector                          // right above the two log cards only
                        }
                        MemberRecentCard(selectedMember: logsMember, state: cards.recent)
                        MemberHealthCard(selectedMember: logsMember, refreshToken: refreshCount)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, isBannerShowing ? 88 : 24)              // A6: the stale banner never covers the last card
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .refreshable {
                refreshCount += 1
                await loadUserData()
            }
            .adaptiveBackground(topLeading: true)
            .navigationBarBackButtonHidden(true)
            .floatingBanner { ScreenBanner(banner: staleBanner) }
            .onAppear {
                // Back from People → "Open full stats" (TC5): the shared card state holds that member — placeholders,
                // then our own member again.
                guard let owner = programContext.memberCardsOwner, owner != MemberCardsOwner.membersTab else { return }
                cards = MemberCardsState()
                loadState = .loading
                Task { await loadUserData() }
            }
        }
        .task {
            await loadUserData()
        }
        .onChange(of: programContext.programId) { _, _ in
            Task { await loadUserData() }
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            Task { await loadUserData() }
        }
        .onChange(of: programContext.members.count) { _, _ in
            if isLogger {
                applyDefaultLoggerSelectionIfNeeded()
            }
        }
        .onChange(of: programContext.isOnline) { _, online in
            if online, loadState.error != nil { Task { await loadUserData() } }      // D-KIT-13: refetch on reconnect
        }
    }

    private var loggerViewAsSelector: some View {
        Button {
            showLoggerMemberPicker = true
        } label: {
            HStack {
                Text("View as")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                Text(loggerViewAsLabel)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showLoggerMemberPicker) {
            MemberPickerView(
                members: programContext.members,
                selected: loggerViewAsMember,
                showNoneOption: false,
                onSelect: { member in
                    showLoggerMemberPicker = false
                    guard let m = member else {
                        loggerViewAsMember = loggedInMember
                        return
                    }
                    loggerViewAsMember = m
                    Task {
                        await loadLoggerLogsData(memberId: m.id)
                    }
                }
            )
        }
    }

    private var staleBanner: FloatingBanner? {
        guard case .stale = loadState else { return nil }
        return FloatingBanner(variant: .stale, onRetry: retry)
    }

    private var isBannerShowing: Bool { programContext.isOnline && staleBanner != nil }

    /// Retry (error view / banner): the tab's cards + the self-loading health card.
    private func retry() {
        refreshCount += 1
        Task { await loadUserData() }
    }

    private func applyDefaultLoggerSelectionIfNeeded() {
        guard isLogger else { return }
        guard loggerViewAsMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        loggerViewAsMember = member
    }

    @MainActor
    private func loadLoggerLogsData(memberId: String) async {
        // MemberHealthCard loads its own preview (.task(id:)) — only Recent is tab-level state.
        cards.recent = .loading
        let error = await programContext.loadMemberRecent(memberId: memberId, limit: 10)
        guard !Task.isCancelled else { return }
        cards.recent = error == nil ? .loaded : .failed
    }

    @MainActor
    private func loadUserData() async {
        guard let userId = programContext.loggedInUserId, let programId = programContext.programId else { return }
        let pc = programContext
        // A new program, or "Open full stats" loaded another member into the shared card state (TC5): placeholders —
        // never those numbers. Otherwise keep the cards and refresh under them.
        if loadState.value != programId || pc.memberCardsOwner != MemberCardsOwner.membersTab {
            cards = MemberCardsState()
            loadState = .loading
        } else {
            loadState = loadState.refreshing()
        }
        pc.memberCardsOwner = MemberCardsOwner.membersTab
        let lookup: Task<Void, Never>? = isLogger && (pc.members.isEmpty || pc.membersProgramId != programId)
            ? Task { await pc.loadLookupData() } : nil
        // A logger's Recent follows the View-as member, so it never shows the logger's own rows under another name.
        let recentId = (isLogger ? loggerViewAsMember?.id : nil) ?? userId
        let result = await pc.loadMemberCards(memberId: userId, recentMemberId: recentId)
        await lookup?.value
        // Superseded (a program switch, or the tab went away): the newer load owns the cards.
        guard !Task.isCancelled, pc.programId == programId else { return }
        cards = loadState.value == programId ? cards.merging(result.cards) : result.cards
        loadState = loadState.applying(cards: cards, error: result.error, key: programId, online: pc.isOnline)
        // The self metric row IS the overview row (same memberId-scoped /member-metrics DTO) — no all-member download.
        loggedInUserMetrics = pc.selectedMemberOverview?.member_id == userId ? pc.selectedMemberOverview : nil
        if isLogger, loggerViewAsMember == nil, let member = loggedInMember {
            loggerViewAsMember = member
        }
    }
}
```

### G. S5: the Members cards on the kit

34. **`Shared/Models/ProgramContext+Members.swift`**:
   - (a) Apply these edits to **each** of `loadMemberMetrics` (:48), `loadMemberOverview` (:87), `loadMemberHistory` (:126), `loadMemberStreaks` (:150) and `loadMemberRecent` (:169):
     - Put `@discardableResult` directly above `@MainActor`. `loadMemberOverview` already has it; replace its two `/// \`true\` only when…` doc lines with `/// nil when it loaded; else the failure (cancellation → nil). polish #32 (S5).`
     - Change the signature's `) async {` (or `) async -> Bool {`) to `) async -> AppError? {`.
     - Change `guard let token = authToken, !token.isEmpty else { return }` (or `{ return false }`) to `… else { return nil }`.
     - In `guard let pid = programId else { errorMessage = "…"; return }`, replace the `return` (or `return false`) with `return AppError(kind: .unknown)`.
     - Make the last statement inside `do { … }` `return nil`, replacing `return true` in `loadMemberOverview`.
     - Replace the catch block with:
```swift
        } catch {
            let appError = AppError(error)
            if let message = appError?.message { errorMessage = message }
            return appError
        }
```
   - (b) Directly after `loadMemberRecent`'s closing brace (:204), insert:
```swift

    /// polish #32 (people S5): the four Members-card reads in parallel (polish #5) — each card's outcome + the first
    /// failure. A cancelled read reports nil (callers check `Task.isCancelled`).
    @MainActor
    func loadMemberCards(memberId: String, recentMemberId: String? = nil) async -> (cards: MemberCardsState, error: AppError?) {
        async let overview = loadMemberOverview(memberId: memberId)
        async let history = loadMemberHistory(memberId: memberId, period: "week")
        async let streaks = loadMemberStreaks(memberId: memberId)
        async let recent = loadMemberRecent(memberId: recentMemberId ?? memberId, limit: 10)
        let errors = await [overview, history, streaks, recent]
        let state: (AppError?) -> MemberCardState = { $0 == nil ? .loaded : .failed }
        return (MemberCardsState(overview: state(errors[0]), history: state(errors[1]),
                                 streaks: state(errors[2]), recent: state(errors[3])),
                errors.compactMap { $0 }.first)
    }
```
   - (c) Grep the app target for `loadMemberOverview(` and `loadMemberMetrics(`. Their results may be consumed only by `loadMemberCards` and `MemberMetricsPreviewCard.loadTop`. Every other call (ActivityTimelineDetailView, MemberRecentDetail, MemberMetricsDetailView) is a statement call and stays valid because of `@discardableResult`.

35. **`Features/Home/Tabs/MemberCards.swift`**: replace the whole file:
```swift
import SwiftUI

// MARK: - Member list cards (the inline NavigationLink cards rendered by the Members tabs)
// Ported faithfully from legacy Features/Home/Detail/MemberCards.swift.
// polish #32 (people S5): every card takes its load state — a placeholder while loading, "Couldn't load this" when its
// read failed — never a fake zero or "No workouts logged yet." on a failure (frontend-kit §5; the Summary recipe, A13).

private func formatDuration(_ totalMinutes: Int) -> String {
    let h = totalMinutes / 60
    let m = totalMinutes % 60
    if h == 0 { return "\(m)m" }
    if m == 0 { return "\(h)h" }
    return "\(h)h \(m)m"
}

/// The owner token of the shared Members-card state for both Members tabs (ProgramContext.memberCardsOwner — TC5).
/// MemberFullStatsView uses its own UUID.
enum MemberCardsOwner {
    static let membersTab = "members-tab"
}

/// One Members card's load state (polish #32).
enum MemberCardState: Equatable {
    case loading
    case loaded
    case failed
}

/// The four ProgramContext-backed Members cards (overview · history · streaks · recent — loaded together by
/// `ProgramContext.loadMemberCards`). MemberHealthCard and MemberMetricsPreviewCard load themselves.
struct MemberCardsState: Equatable {
    var overview = MemberCardState.loading
    var history = MemberCardState.loading
    var streaks = MemberCardState.loading
    var recent = MemberCardState.loading

    var allFailed: Bool { [overview, history, streaks, recent].allSatisfy { $0 == .failed } }

    /// A failed refresh keeps a card that already shows data (W7-D2: keep the data + "Couldn't refresh").
    func merging(_ next: MemberCardsState) -> MemberCardsState {
        func keep(_ old: MemberCardState, _ new: MemberCardState) -> MemberCardState {
            new == .failed && old == .loaded ? .loaded : new
        }
        return MemberCardsState(overview: keep(overview, next.overview), history: keep(history, next.history),
                                streaks: keep(streaks, next.streaks), recent: keep(recent, next.recent))
    }
}

extension LoadState where Value == String {
    /// The Summary recipe (A13) for one Members-cards load of `key` (the program / member on screen): no error → fresh;
    /// every card failed with nothing kept → failed (ErrorStateView + Retry); otherwise stale (the cards that loaded or
    /// were kept + "Couldn't refresh · Retry").
    func applying(cards: MemberCardsState, error: AppError?, key: String, online: Bool) -> LoadState<String> {
        guard let error else { return .fresh(key) }
        let labeled = error.labeled(online: online)                              // polish-1 rule 6
        return cards.allFailed ? .failed(labeled) : .stale(key, fetchedAt: Date(), error: labeled)
    }
}

/// A Members card's loading placeholder — a redacted block, never a zero.
struct MemberCardPlaceholder: View {
    var height: CGFloat = 60

    var body: some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color(.systemGray5))
            .frame(height: height)
            .redacted(reason: .placeholder)
            .accessibilityLabel("Loading")
    }
}

/// A Members card whose read failed — the kit's title; the tab's banner / error view / pull-to-refresh retries it.
struct MemberCardFailure: View {
    var body: some View {
        Text(KitCopy.errorViewTitle)
            .font(.footnote)
            .foregroundColor(Color(.secondaryLabel))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MemberHistoryCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    var state: MemberCardState = .loaded

    private var memberId: String? {
        selectedMember?.id ?? programContext.selectedMemberOverview?.member_id
    }

    private var memberPoints: [APIClient.ActivityTimelinePoint] {
        memberTimelinePoints(from: programContext.memberHistory)
    }

    var body: some View {
        let capturedMemberId = memberId  // Capture value directly
        return NavigationLink {
            ActivityTimelineDetailView(
                initialPeriod: .week,
                memberId: capturedMemberId,
                showActiveSeries: false
            )
            .navigationTitle("Workout History")
            .navigationBarTitleDisplayMode(.inline)
        } label: {
            if state == .loaded {
                ActivityTimelineCardSummary(points: memberPoints, showActive: false)
            } else {
                // The chart card's chrome + height, so nothing jumps when it loads.
                CardShell(background: Color(.systemBackground).opacity(0.95),
                          strokeColor: Color(.systemGray4).opacity(0.5), height: 280) {
                    VStack(alignment: .leading, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Workout Activity Timeline")
                                .font(.headline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text("Workouts")
                                .font(.subheadline)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        if state == .failed {
                            MemberCardFailure()
                        } else {
                            MemberCardPlaceholder(height: 180)
                        }
                    }
                }
            }
        }
    }
}

struct MemberStreakCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    var state: MemberCardState = .loaded

    private var streaks: APIClient.MemberStreaksResponse? { programContext.memberStreaks }

    var body: some View {
        NavigationLink {
            MemberStreakDetail()
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Streak Stats")
                            .font(.headline.weight(.semibold))
                        Text("Current and longest")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                HStack(spacing: 12) {
                    streakTile(title: "Current", value: streakValue(streaks?.currentStreakDays), icon: "flame.fill", color: .appOrange)
                    streakTile(title: "Longest", value: streakValue(streaks?.longestStreakDays), icon: "trophy.fill", color: .appYellow)
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }

    /// "…" while loading, "—" when the read failed or has no value (the Summary recipe) — never a fake "0 days".
    private func streakValue(_ days: Int?) -> String {
        switch state {
        case .loading: return "…"
        case .failed: return "—"
        case .loaded: return days.map { "\($0) days" } ?? "—"
        }
    }

    private func streakTile(title: String, value: String, icon: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .foregroundColor(color)
                    .font(.subheadline.weight(.bold))
                Text(title)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            Text(value)
                .font(.title3.weight(.bold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

struct MemberRecentCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    var state: MemberCardState = .loaded

    private var memberId: String? {
        selectedMember?.id ?? programContext.loggedInUserId
    }

    var body: some View {
        NavigationLink {
            MemberRecentDetail(memberId: memberId, memberName: selectedMember?.member_name ?? programContext.loggedInUserName)
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("View Workouts")
                            .font(.headline.weight(.semibold))
                        Text("All workouts")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                switch state {
                case .loading:
                    MemberCardPlaceholder(height: 60)
                case .failed:
                    MemberCardFailure()
                case .loaded:
                    if programContext.memberRecent.isEmpty {
                        Text("No workouts logged yet.")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(programContext.memberRecent.prefix(3)) { item in
                                HStack(spacing: 10) {
                                    Circle()
                                        .fill(Color.appOrangeLight)
                                        .frame(width: 10, height: 10)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.workoutType)
                                            .font(.subheadline.weight(.semibold))
                                        Text(item.workoutDate)
                                            .font(.caption)
                                            .foregroundColor(Color(.secondaryLabel))
                                    }
                                    Spacer()
                                    Text(formatDuration(item.durationMinutes))
                                        .font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
    }
}

struct MemberHealthCard: View {
    @EnvironmentObject var programContext: ProgramContext
    let selectedMember: APIClient.MemberDTO?
    /// Bumped by the host's pull-to-refresh / Retry (polish #32).
    var refreshToken = 0

    @State private var previewLogs: [APIClient.DailyHealthLogItem] = []
    /// "<program>|<member>" the rows belong to — another program or member blanks them at once.
    @State private var previewKey: String?
    @State private var state: MemberCardState = .loading

    private var memberId: String? {
        selectedMember?.id ?? programContext.loggedInUserId
    }

    private var memberName: String? {
        selectedMember?.member_name ?? programContext.loggedInUserName
    }

    var body: some View {
        NavigationLink {
            MemberHealthDetail(memberId: memberId, memberName: memberName)
                .environmentObject(programContext)
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("View Health")
                            .font(.headline.weight(.semibold))
                        Text("Daily health logs")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }

                switch state {
                case .loading:
                    MemberCardPlaceholder(height: 60)
                case .failed:
                    MemberCardFailure()
                case .loaded:
                    if previewLogs.isEmpty {
                        Text("No daily health logs yet.")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(previewLogs.prefix(3)) { item in
                                HStack(spacing: 10) {
                                    Circle()
                                        .fill(Color.appBlueLight)
                                        .frame(width: 10, height: 10)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.logDate)
                                            .font(.subheadline.weight(.semibold))
                                        Text("Sleep \(sleepLabel(item.sleepHours)) · Diet \(foodLabel(item.foodQuality)) · Steps \(stepsLabel(item.steps))")
                                            .font(.caption)
                                            .foregroundColor(Color(.secondaryLabel))
                                    }
                                    Spacer()
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
            )
            .adaptiveShadow(radius: 8, y: 4)
        }
        .buttonStyle(.plain)
        .task(id: "\(programContext.programId ?? "")|\(memberId ?? "")|\(refreshToken)") {
            await loadPreview()
        }
        .onChange(of: programContext.isOnline) { _, online in
            if online, state == .failed { Task { await loadPreview() } }      // D-KIT-13
        }
    }

    /// Its own 10-row preview. Another member / program blanks it at once (never the previous rows); a refresh keeps the
    /// rows; a failure with nothing of its own → "Couldn't load this" (polish #32).
    private func loadPreview() async {
        let key = "\(programContext.programId ?? "")|\(memberId ?? "")"
        if previewKey != key {
            previewLogs = []
            state = .loading
            previewKey = key
        }
        guard let memberId, let programId = programContext.programId, let token = programContext.authToken else {
            state = .loaded                                     // identity unresolved → the existing empty line
            return
        }
        do {
            let items = try await APIClient.shared.fetchDailyHealthLogs(
                token: token, programId: programId, memberId: memberId, limit: 10
            ).items
            guard previewKey == key else { return }
            previewLogs = items
            state = .loaded
        } catch {
            guard AppError(error) != nil, previewKey == key else { return }   // cancelled / superseded
            if previewLogs.isEmpty { state = .failed }
        }
    }

    private func sleepLabel(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "%.1f hrs", value)
    }

    private func foodLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        return "\(value)/5"
    }

    private func stepsLabel(_ value: Int?) -> String {
        guard let value else { return "—" }
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }
}
```

36. **`Features/Home/Tabs/MemberOverviewPicker.swift`**:
   - (a) `MemberOverviewCard`:
     - After `let member: APIClient.MemberDTO?` (:83), add `var state: MemberCardState = .loaded`.
     - In `body`, replace the `if let m = overview { … } else { Text("No workouts logged yet.") … }` block (:105–113) with:
```swift
            switch state {
            case .loading:
                MemberCardPlaceholder(height: 120)
            case .failed:
                MemberCardFailure()
            case .loaded:
                if let m = overview {
                    topRow(for: m)
                    statsGrid(for: m)
                    progress(for: m)
                } else {
                    Text("No workouts logged yet.")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
```
   - (b) Replace the whole `struct MemberMetricsPreviewCard: View { … }` (:386–516, up to the line before `func memberTimelinePoints`) with:
```swift
struct MemberMetricsPreviewCard: View {
    @EnvironmentObject var programContext: ProgramContext
    /// Bumped by the Admin Members tab's pull-to-refresh / Retry (polish #32).
    var refreshToken = 0
    /// This card's own state (polish #32): rows show only after THIS card loaded the program on screen — the shared
    /// `memberMetrics` may still hold another program's or a previous session's rows (A13 / #10).
    @State private var state: MemberCardState = .loading
    @State private var loadedProgramId: String?
    @State private var sortField: SortField = .active_days
    @State private var sortDirection: SortDirection = .desc

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Member Performance Metrics")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                    Text(state == .loaded ? "\(memberCount) members" : "—")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.tertiaryLabel))
            }

            switch state {
            case .loading:
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray5))
                    .frame(height: 120)
                    .redacted(reason: .placeholder)
            case .failed:
                MemberCardFailure()
            case .loaded:
                if let top = programContext.memberMetrics.first {
                    topPreview(top)
                } else {
                    Text("No members to display")
                        .font(.footnote)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.95))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
        .adaptiveShadow(radius: 10, y: 6)
        .task(id: "\(programContext.programId ?? "")|\(refreshToken)") { await loadTop() }
        .onChange(of: programContext.isOnline) { _, online in
            if online, state == .failed { Task { await loadTop() } }        // D-KIT-13
        }
    }

    private var memberCount: Int {
        programContext.memberMetricsTotal > 0 ? programContext.memberMetricsTotal : programContext.memberMetrics.count
    }

    private func topPreview(_ metric: APIClient.MemberMetricsDTO) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                HStack(spacing: 6) {
                    Image(systemName: "star.fill")
                        .foregroundColor(.appOrange)
                        .font(.caption)
                    Text(metric.member_name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.label))
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(heroValue(metric))
                        .font(.title3.weight(.bold))
                        .foregroundColor(.appOrange)
                    Text("\(sortField.label)")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            HStack(spacing: 12) {
                miniTile(title: "Active Days", value: "\(metric.active_days)")
                miniTile(title: "Workouts", value: "\(metric.workouts)")
                miniTile(title: "Types", value: "\(metric.workout_types)")
            }
        }
    }

    private func miniTile(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
            Text(value)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.label))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }

    private func heroValue(_ metric: APIClient.MemberMetricsDTO) -> String {
        switch sortField {
        case .workouts: return "\(metric.workouts)"
        case .total_duration: return "\(metric.total_duration) min"
        case .avg_duration: return "\(metric.avg_duration) min"
        case .avg_sleep_hours:
            return metric.avg_sleep_hours.map { String(format: "%.1f hrs", $0) } ?? "—"
        case .active_days: return "\(metric.active_days)"
        case .workout_types: return "\(metric.workout_types)"
        case .current_streak: return "\(metric.current_streak)"
        case .longest_streak: return "\(metric.longest_streak)"
        case .avg_food_quality:
            return metric.avg_food_quality.map { "\($0) / 5" } ?? "—"
        case .avg_steps:
            guard let value = metric.avg_steps else { return "—" }
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
        }
    }

    /// A program this card hasn't loaded yet → placeholder until ITS load lands; success → this program's rows; failure →
    /// "Couldn't load this" unless this card already shows this program's rows (kept — W7-D2).
    private func loadTop() async {
        guard let programId = programContext.programId else { return }
        if loadedProgramId != programId { state = .loading }
        let error = await programContext.loadMemberMetrics(
            search: "",
            sort: sortField.rawValue,
            direction: sortDirection.rawValue,
            filters: [:],
            dateRange: (nil, nil)
        )
        guard !Task.isCancelled, programContext.programId == programId else { return }
        if error == nil {
            loadedProgramId = programId
            state = .loaded
        } else if loadedProgramId != programId {
            state = .failed
        }
    }
}
```

### H. Apple Health consent copy (People Privacy §B)

37. **`Features/Home/Settings/AppleHealthSettingsView.swift`**: in `programSelectionSection`, add the footnote as the last child of its `VStack(alignment: .leading, spacing: 10)`, right after the `if programContext.programs.isEmpty { … } else { … }` block closes (near :184–189):
```swift
            // people 0.1.0 (D-C12, U-1): synced workouts are part of program activity.
            Text("Synced workouts are visible to members of your programs unless you turn on Hide my activity in My Profile.")
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
                .fixedSize(horizontal: false, vertical: true)
```

38. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/ios/RaSi-Fiters-App.xcodeproj/project.pbxproj`**: replace both identical lines, Debug (:381) and Release (:420). This is the only pbxproj edit; the groups are folder-synchronized, so new files need no entry.
   - Old: `				INFOPLIST_KEY_NSHealthShareUsageDescription = "RaSi Fit'ers reads your workout and sleep data from Apple Health to automatically log workouts and nightly sleep to your fitness programs.";`
   - New: `				INFOPLIST_KEY_NSHealthShareUsageDescription = "RaSi Fiters reads your workouts, sleep, and steps from Apple Health to log them in your programs. Members of your programs can see your workouts unless you turn on Hide my activity.";`

### Docs for the orchestrator (one docs commit at landing; the implementer edits none)

**Page SPECs** (`specs/pages/ios/…`):
- `notifications`: the preferences section, with its inline stale row and reconnect reload. The "no per-type preference API" D-rule is superseded.
- `program-actions`: tab 0 is Inbox for all roles; the new default-tab rule; `reservesOfflineBand`.
- `program-picker`: the FAB badge is the server `badge`; the Inbox account row; `inboxRoute` targets (TC10); counts load in `load()`.
- `admin-program`: the Inbox row in `ProgramMyAccountSection`, and "View Members" becomes "People" (TC1).
- `admin-members`: no header change (UA-1); S5 on both Members tabs (TC5, TC12).
- `program-member-management`: the roster is retired (TC9).
- `my-profile`: Hide my activity.
- `apple-health`: the footnote and the purpose string.
- **NEW** `inbox`: hosts, root sheet, TC2 read rules.
- **NEW** `people`: list, profile, kudos, full stats, U-1 notice.
- `specs/pages/REGISTRY.md`: new rows.

**Feature SPECs:**
- **notifications**: an iOS client D-rule covering:
  - C7.1–C7.8;
  - the D-N3 toast (TC6) and the root Inbox sheet (TC10);
  - D-N4, and D-N5 mark-all only after a loaded, visible visit (TC2);
  - D-N12 (TC4/UA-2) and the D-N14 per-device badge (UA-3).

  C7.3 supersedes A4's "/unacknowledged on ready", and U2's invite flag is superseded.
- **people**: `consumed_by` += ios; the D-C12 (b) realization.
- **members**: iOS reads and writes `hide_activity`.
- **invites**: invitations live inside the Inbox; target routing.
- **member-analytics**: the S5 client states and the TC5 owner rule.
- **observability**: iOS sends `X-Time-Zone`.
- **apple-health**: copy.
- **frontend-kit**: D-KIT-17 says "Inbox + Create tabs" and `InboxView`, and lists the root Inbox sheet among presentations that carry `.offlineBanner()` (PATCH).

**Registry and context:**
- `registry.json` and `REGISTRY.md`.
- `apps/ios/CONTEXT.md` :95: `NotificationModalView.swift` now holds only `ForcedUpdateModalView`. Add the `Features/Home/Inbox/` and `Features/Home/People/` folders.

## Endgame

39. **Compile check (iOS only)**:
   - Claude runs `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master && bash tools/ios-typecheck.sh` and fixes errors until it reports `errors=0`. It needs DerivedData from an earlier ⌘B.
   - These greps over `apps/ios/RaSi-Fiters-App` must return 0 hits: `notificationQueue`, `openInvitesRequested`, `acknowledgedNotificationIds`, `notificationIds`, `ProgramMembersListView`, `NotificationModalView(`, `fetchUnacknowledgedNotifications`, `PushNotificationTapped.inviteReceived`, `memberCardsBorrowed`, `acknowledgeNotificationById`.
   - **Then the USER presses ⌘B in Xcode.** All visual and live testing is the user's. It runs on prod (Debug hits prod), and only after N-SRV (sql/011 + notifications 0.6.0) and People S1 (sql/012) are live there. This is a client-only change, so staging is not needed. The user checks:
     - The toast "View":
       - on a kudos or digest item while inside a program, the root Inbox sheet opens and the program stays;
       - on a program item, that program opens.
     - The "+" sheet Inbox **offline**: the last row clears the offline banner (D-KIT-17).
     - Both account-menu Inbox rows.
     - Push-tap routing: invite, program, and reminder → log workout.
     - The app-icon badge drops after a loaded Inbox visit.
     - Live items while a pushed Inbox sits under another tab stay unread until you return.
     - The one-time permission prompt, then the visibility notice, never stacked over the Apple Health review.
     - Notifications settings: switches, reminder time, airplane mode (stale row, then reconnect).
     - People: list, profile, kudos give and undo, hidden member, staff "Open full stats".
     - Members tab after "Open full stats", both online and in airplane mode: placeholders, never the other member.
     - Admin Members tab after switching program: the preview shows a placeholder, never the old program.
     - Global-admin "Edit membership", then remove: the profile goes back to People.
     - Hide my activity, and the U-1 notice (including a failed Hide).
     - Members tabs in airplane mode.
     - iPhone 375 and 393 pt, plus the iPad and Mac column fit.

40. **Migration**: none. This track relies on sql/011 and sql/012, which the user runs in the server tracks.

41. **git-version**:
   - One no-bump `feat(ios)` commit: "Phase 4 iOS — Inbox + toast + notification settings + People + Members-tab kit".
   - Then the orchestrator's single docs commit for the three client tracks bumps:
     - notifications: next MINOR above the server landing.
     - people: MINOR (`consumed_by` += ios).
     - invites: MINOR.
     - member-analytics: MINOR.
     - frontend-kit: PATCH.
     - members, observability, apple-health: PATCH each.
   - No app version bump: 1.5.1 (59) stays.

## Risks the implementer must watch

- **Hard server dependency.** Until N-SRV and S1 are on prod:
  - the Inbox, settings and People return 404, so they show kit error views;
  - the "+" badge falls back to the invite count;
  - the Hide switch hides itself.

  Never upload this build to TestFlight before both servers are live. If the contracts move, only `APIClient+Inbox.swift` and `APIClient+People.swift` change.
- **Keep `ForcedUpdateModalView`.** Delete only `NotificationModalView`.
- **`.task` re-runs on every appearance** (a pop back or a tab switch). InboxView (marking read), MemberFullStatsView (the TC5 owner check) and PeopleListView rely on it. Don't move those `.task`s outside the view whose appearance matters.
- **Root Inbox sheet:**
  - It presents only when `ProgramContext.isPresentingModal` is false (UIKit `presentedViewController`). Otherwise TC10 falls back to the picker, which closes its own sheets, including `showInboxSheet`, before opening anything.
  - The picker's 0.5 s delay covers a sheet's dismissal. If the reminder → log-workout path ever fails to open the form, raise that delay.
- **More than one `ProgramPickerView` can be mounted** ("Select Program" pushes a second one). Both observe `inboxRoute`; the first consumer clears it. This is the same pre-existing risk as U2.
- **TC5:**
  - Every writer of the shared Members-card state must set `memberCardsOwner` first: the Members tabs and `MemberFullStatsView`.
  - The detail screens (ActivityTimelineDetailView, MemberRecentDetail) reload the same member, so they don't change the owner.
  - Never show a `.loaded` card after resetting `cards` without this round's result.
- **S5 cancellation.** A cancelled read reports nil. Every caller guards `Task.isCancelled` before writing state.
- **`MemberMetricsPreviewCard`** shows `memberMetrics` only when `state == .loaded`, which happens only after its own successful load for the current program. Don't reintroduce an `isEmpty`-based shortcut.
- **Quick-wins composition:**
  - `loadMemberOverview` changes from `-> Bool` to `-> AppError?`.
  - Keep `.offlineBanner()` on `ProgramActionsSheet` and AppRootView ≤ ~200 lines (≈170 after step 12).
  - Keep every `SessionCopy.kitMessage` swap.
- **The device capability arrives after sign-in.** `preparePushOnSessionStart` re-requests the APNs token, and `PUT /device` sends `inbox: true`. The build-keyed memo re-registers 1.5.0 → 1.5.1 upgraders once. If a build ever drops `inbox: true`, the server sends badges that build never clears.
- **No bare `applicationIconBadgeNumber`.** Only `setAppBadge` (`setBadgeCount`) touches the badge. The teardown sets it to 0.
- **Kudos:**
  - DELETE has no `count`, so the button decrements locally only when `removed`.
  - `.id(kudos)` resets the button after a re-fetch.
  - A 429 shows the kit "unavailable" copy.
  - A 403 `activity_hidden` re-fetches the profile.
- **Server-owned seams** (do not work around them on iOS):
  - S1's `getMemberTimeZone` versus `getTimeZones` (mismatch 2), and S1's hard-coded kudos copy (5).
  - Kudos never arrive via `/unacknowledged`: iOS reads `/inbox` and `?inbox=1` only and routes on C5 `target` (3, 4).
- **#45 is not fully closed.** `NSHealthUpdateUsageDescription` (pbxproj :382 and :421) and the other "Fit'ers" strings belong to the polish track.
- **Parity.**
  - The web and Android tracks must match: the copy tables (TC7), mark-read-after-a-loaded-visible-visit (TC2), "the program stays open when the inbox opens" (TC10) and the per-role People entry (TC1/UA-1).
  - iOS-only items: the app-icon badge, the system permission prompt, the top toast and the root Inbox sheet's modal form.
