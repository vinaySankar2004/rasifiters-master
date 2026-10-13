# PLAN: Phase 4 Track C, revision 2. Android client for Notifications (N5, plus the client parts of N7 and N8) and People (S4, plus S5 = polish #32)

**Brief accepted**: yes. 39 files: 25 existing files modified, 1 deleted, 13 new. Every file is in the brief.
- `Routes.kt` gains `INBOX_LOG_WORKOUT` and the optional full-stats route. Both live in brief files.
- No file outside the brief is needed.

**Feature/version prediction**: this track lands as one **no-bump `feat(android)` commit**. The single docs commit after all three surfaces land then bumps:
- notifications: the server tracks' 0.6.x → **0.7.0** (MINOR)
- people: 0.1.x → **0.2.0** (MINOR)
- invites: 0.2.1 → **0.3.0** (MINOR)
- health-connect: 0.3.0 → **0.3.1** (PATCH)
- frontend-kit: **0.4.0 → 0.5.0** (MINOR). A new D-KIT-20 defines the toast, and Members, People and Inbox join the adoption list.

There is no app version bump. versionCode stays 6.

**Surfaces in scope**: [android] only. The file set is disjoint from the web, iOS and backend tracks.

## Revision 2: what changed (adversary objections)

| # | Fix |
|---|---|
| 1 BLOCKING | S5 state now lives in **ProgramContext** and is keyed by program and member.<br>• `memberCardsHeld` records whose data each shared flow holds. Every successful loader writes it.<br>• `memberCardsLoad` records, per part, what the last load asked for and whether it failed.<br>• A card shows its flow **only** when the held key equals the key that card is for. Otherwise it shows a placeholder while loading, or "—" once its read has failed.<br>• `membersSelfLoadedFor` and the screen-local failure state are deleted.<br>• Result: a re-entry after a failed load can never show another program's or another member's values (steps 17, 37, 38, 39). |
| 2 BLOCKING | Step 17(c) now quotes the real `selectProgram` block (3 statements) and keeps `membersLoadedFor` / `_membersViewAsId` resets. Steps 6 and 8 replace whole KDocs instead of quoting text that breaks across lines. |
| 3 | `setHideActivity` treats a missing `hide_activity` echo as a failure (step 16). |
| 4 | S5 now follows the Summary recipe:<br>• with nothing loaded and offline, the ErrorView shows the offline copy (no spinner);<br>• a failed refresh keeps this member's previous values and shows "Couldn't refresh · Retry" (A13). |
| 5 | The toast becomes kit rule **D-KIT-20**, written in the docs commit. Its top placement is recorded there as a deliberate exception to D-KIT-8, with the same answer on all three surfaces. The file stays at `ui/inbox/NotificationToast.kt` (the brief's file list). |
| 6 | A `log_workout` target opens the quick-add form on its own route, `INBOX_LOG_WORKOUT`. Closing pops back to where the member was, and their program stays open (step 23). |
| 7 | TC-1 now applies on every load: open, pull, Retry and reconnect all call `reloadInbox`, which loads and then marks all read. The race is documented (step 18). |
| 8 | Profile stat tiles use a compact one-line label over a one-line value, with shorter labels, so they fit at 360dp (step 33). |
| 9 | Size exceptions are listed explicitly (Risks). InboxList was split: the empty state, the request row and the time helper moved to InboxScreen. |
| 10 | frontend-kit gets a MINOR bump (it gains a new D-rule). |
| 11 | **Gate G-P** (step 0) blocks the People steps until the approved S1 contract is diffed against `PeopleDtos.kt`.<br>• MemberFullStatsScreen gains pull-to-refresh, reconnect reload and the stale banner.<br>• NotificationsScreen gains the stale banner and reconnect reload.<br>• The ★ files are already committed (82b7297). Anchors are quoted from HEAD. |

## Decisions (law for the implementer)

| # | Decision | One-line why | Parity |
|---|---|---|---|
| TC-1 | Every load of the newest Inbox page while the inbox is on screen (open, pull, Retry, reconnect) is followed by `POST /inbox/read {"all":true}`. Rows keep their unread dot until the next load. A push tap or toast "View" marks only that item (`{"ids":[id]}`). | Standard notification-center model; D-N5 allows it. | **The same rule is needed on web and iOS.** |
| TC-2 | Global admins' Inbox = All Invites with Revoke (A10) plus their own items. The "+" badge is the server `badge` (their own invites only). | A10 and D-N4. | Same |
| TC-3 | The admin Members header button becomes **People**. Invite moves to an "Invite member" row in People and stays in the Program tab. | One header button for every role. | **Web and iOS must give the same answer** |
| TC-4 | "Open full stats" opens `MemberFullStatsScreen`, which reuses the five Members cards (route `MEMBER_FULL_STATS`). | Works for loggers. | Android shape |
| TC-5 | Global admins get an "Edit membership" row on the profile, which opens `MEMBER_EDIT`. That screen loads its own rows. | D-P11 entry point. | Same |
| TC-6 | A `log_workout` target opens the multi-program quick-add workout form **over where the member is**. Closing or saving returns there; the program stays open. | Reminders have no program. | **iOS must match** |
| TC-7 | Built for U-1 (b), U-2 ON and U-3 "together". U-1 (a): delete the two `ActivityVisibilityNotice` call sites and the file. U-1 (c): swap the copy per the People plan. | Recommended defaults. | Same |
| TC-8 / TC-10 | The toast is kit rule **D-KIT-20**: `<title> · View`, top of the screen, 4 s, the newest replaces the previous, View marks it read and routes. This is a recorded exception to D-KIT-8's bottom placement, because the bottom holds the offline/stale banner, the nav and FABs. | Board §6.6 lists the toast as kit. | **The same on all three** |
| TC-9 | The re-register memo is `inbox_registered_token` in `rasi.push`, never versionCode. Every `PUT /device` sends `inbox: true`. | Quick-wins also ships versionCode 6. | Android only |
| TC-11 | **Platform-idiom divergences (Android only):**<br>• one channel per new category;<br>• the monochrome `ic_stat_notification`;<br>• launcher dots, no count;<br>• an in-app permission request with an "Open Settings" fallback;<br>• the FCM `tag` replace for reminders and digest. | Sanctioned (C5, "Moved" row). | — |
| TC-12 | People §F conflicts with Notifications C2. Android follows C2: kudos arrives through `/inbox` and `?inbox=1` only, and push data carries `category` and `target`. | C2 is the inbox contract. | Same |
| TC-13 | S5 data rule: a card shows its shared flow only when the flow holds THIS program's and member's data. Otherwise it shows a placeholder, or "—" after its read failed. Nothing loaded and everything failed, or offline → ErrorView. A failed refresh keeps the values and shows "Couldn't refresh · Retry". | A13 and polish-1 rule 6. | Same recipe on web and iOS |

### Copy (parity-sensitive)

**"+" sheet**
- Tabs: `Inbox` / `Create`. Header: `Inbox` · `Invites and updates`.

**Inbox**
- Sections: `Program invitations` (global admins: `All program invitations`) · `Updates`.
- Empty state: `You're all caught up` / `Invites and updates will show up here.`
- `Show more` / `Loading…` · `Couldn't load updates · Retry`.
- Times: `Just now`, `5m ago`, `3h ago`, `Yesterday`, `Oct 12`, `Oct 12, 2025`.

**Account row**
- `Inbox` · `Invites and updates` or `N new`.

**Toast**
- `<title>` (blank title → `New notification`) + `View`.

**Notifications settings**
- `Choose what RaSi Fiters notifies you about.` · `Enabled` / `Disabled`.
- Status lines: `You'll get alerts for the categories switched on below.` / `Notifications are off for RaSi Fiters on this phone.`
- Buttons: `Enable Notifications` / `Open Settings`.
- `Notify me about`, then the five rows (step 25).
- `Reminder time` / `In your phone's time zone`, then the opt-in note (step 25).

**People**
- `People` · `Invite member` / `Send an invite by username` · `Search people`.
- Row title: `Name (You) · Admin`.
- Row status: `Active today` / `Active yesterday` / `Last active Oct 12` / `No workouts yet` / `Activity hidden`.
- Empty: `No members yet.` / `No one matches your search.`

**Profile**
- `Profile` · `This member keeps their activity private.`
- Stat labels: `Current streak` · `Longest streak` · `This month` · `Last active`. Values: `N days` / `Oct 12`.
- Kudos: `N kudos` · `Give kudos` / `Kudos given` · `You gave kudos today. Tap again to undo.`
- `Recent workouts` · `No workouts logged yet.`
- `Open full stats` / `History, streaks, workouts and health`.
- `Edit membership` / `Joined date, active status or remove`.

**Full stats**
- `Full stats`.

**My Profile**
- `Hide my activity` + its hint (step 34).

**Notice and Health Connect footnote**
- People plan §B, verbatim.

## Steps: backend, web, iOS
None. Those are parallel tracks.

## Steps: android

All paths below are under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/`; Kotlin files are under `java/com/app/rasifiters/`. Anchor on the quoted text, not on line numbers.

### 0. Gates (before any code)
- **G-N.** The user-approved N-SRV API CONTRACT must match C1–C8 as quoted in the task for every key Android reads:
  - C3: `id`, `type`, `category`, `target`, `program_id`, `actor_member_id`, `title`, `body`, `created_at`, `read_at`;
  - C4 unread counts: `unread`, `pending_invites`, `badge`, `updated`;
  - C4 preferences: `categories`, `reminder_time`, `time_zone`;
  - C4 inbox page: `items`, `next_cursor`;
  - C5 push data keys and the channel ids `rasi_activity`, `rasi_reminders`, `rasi_digest`, `rasi_announcements`;
  - `PUT /device` `inbox`.

  Any difference: STOP and report it to the orchestrator.
- **G-P.** People S1 is being revised: seams S-1 and S-3 are missing, and S0 built a `workouts` kind. Before steps 3, 16 and 31–35, diff the **approved** S1 API CONTRACT §B–§F field by field (keys, nullability, status codes) against `net/PeopleDtos.kt` as written in step 3. Any difference: STOP and report it. Do not adapt it silently.

### Network and DTOs

1. **`net/ClientHeaders.kt`**
   - Add `import java.time.ZoneId`.
   - After `.header("X-App-Build", BuildConfig.VERSION_CODE.toString())`, insert:
   ```kotlin
               // notifications 0.6.0 (C1, D-N6): the device's IANA zone on every request (main, refresh, SSE).
               .header(TIME_ZONE, ZoneId.systemDefault().id)
   ```
   - Change the companion to `companion object { const val REQUEST_ID = "X-Request-Id"; const val TIME_ZONE = "X-Time-Zone" }`.

2. **NEW `net/InboxDtos.kt`**:
```kotlin
package com.app.rasifiters.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// notifications 0.6.0 (API CONTRACT C3 / C4) — the inbox item, a page, the unread counts, read marks and preferences.

/** C3 — one inbox item: a `GET /notifications/inbox` row AND every `?inbox=1` stream frame. */
@Serializable
data class InboxItemDTO(
    val id: String,
    val type: String = "",
    /** program | activity | reminders | digest | announcements. */
    val category: String = "program",
    /** invites | program | programs | log_workout | inbox — where opening it goes (core/NotificationInbox.InboxTarget). */
    val target: String = "inbox",
    @SerialName("program_id") val programId: String? = null,
    @SerialName("actor_member_id") val actorMemberId: String? = null,
    val title: String = "",
    val body: String = "",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("read_at") val readAt: String? = null,
)

/** `GET /notifications/inbox?limit&before` — newest first; [nextCursor] is opaque (null = no older page). */
@Serializable
data class InboxPageDTO(
    val items: List<InboxItemDTO> = emptyList(),
    @SerialName("next_cursor") val nextCursor: String? = null,
)

/** `GET /inbox/unread-count` and the `POST /inbox/read` answer. [badge] = unread items except invite items + pending
 *  invites — the "+" badge (Android draws no app-icon count: launcher dots are the OS's, the platform idiom). */
@Serializable
data class UnreadCountsDTO(
    val unread: Int = 0,
    @SerialName("pending_invites") val pendingInvites: Int = 0,
    val badge: Int = 0,
    /** Only on `POST /inbox/read`: how many items this call marked. */
    val updated: Int? = null,
)

/** `POST /inbox/read` — either [ids] (1–100) or [all] = true; the null one is omitted (explicitNulls = false). */
@Serializable
data class InboxReadRequest(
    val ids: List<String>? = null,
    val all: Boolean? = null,
)

/** `GET` / `PUT /notifications/preferences` answer. [reminderTime] = 24-hour "HH:MM" local; [timeZone] = the stored zone. */
@Serializable
data class NotificationPreferencesDTO(
    val categories: Map<String, Boolean> = emptyMap(),
    @SerialName("reminder_time") val reminderTime: String = "19:00",
    @SerialName("time_zone") val timeZone: String? = null,
)

/** `PUT /notifications/preferences` — partial: only the non-null fields are sent and changed. */
@Serializable
data class NotificationPreferencesUpdate(
    val categories: Map<String, Boolean>? = null,
    @SerialName("reminder_time") val reminderTime: String? = null,
)
```

3. **NEW `net/PeopleDtos.kt`** (gate G-P):
```kotlin
package com.app.rasifiters.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// people 0.1.0 (People API CONTRACT §B–§F).

/** §B `GET /api/people?programId`. */
@Serializable
data class PeopleListDTO(
    @SerialName("program_id") val programId: String = "",
    val viewer: PeopleViewerDTO = PeopleViewerDTO(),
    val people: List<PersonRowDTO> = emptyList(),
)

@Serializable
data class PeopleViewerDTO(
    @SerialName("member_id") val memberId: String = "",
    @SerialName("is_staff") val isStaff: Boolean = false,
)

/** One People row — server order ("You" first, then A→Z); [lastActive] null when none or not visible. */
@Serializable
data class PersonRowDTO(
    @SerialName("member_id") val memberId: String,
    @SerialName("member_name") val memberName: String = "",
    val initials: String = "?",
    val username: String = "",
    @SerialName("program_role") val programRole: String = "member",
    @SerialName("is_you") val isYou: Boolean = false,
    @SerialName("activity_visible") val activityVisible: Boolean = false,
    @SerialName("last_active") val lastActive: String? = null,
)

/** §C `GET /api/people/:memberId?programId` — [stats] / [recentWorkouts] / [kudos] are null when not visible. */
@Serializable
data class PersonProfileDTO(
    @SerialName("program_id") val programId: String = "",
    @SerialName("member_id") val memberId: String,
    @SerialName("member_name") val memberName: String = "",
    val initials: String = "?",
    val username: String = "",
    @SerialName("program_role") val programRole: String = "member",
    @SerialName("is_you") val isYou: Boolean = false,
    @SerialName("joined_at") val joinedAt: String? = null,
    @SerialName("activity_visible") val activityVisible: Boolean = false,
    @SerialName("can_open_full_stats") val canOpenFullStats: Boolean = false,
    val stats: PersonStatsDTO? = null,
    @SerialName("recent_workouts") val recentWorkouts: List<PersonWorkoutDTO>? = null,
    val kudos: KudosDTO? = null,
)

@Serializable
data class PersonStatsDTO(
    @SerialName("current_streak") val currentStreak: Int = 0,
    @SerialName("longest_streak") val longestStreak: Int = 0,
    @SerialName("active_days_this_month") val activeDaysThisMonth: Int = 0,
    @SerialName("last_active") val lastActive: String? = null,
)

@Serializable
data class PersonWorkoutDTO(
    @SerialName("workout_type") val workoutType: String = "",
    val date: String = "",
    @SerialName("duration_minutes") val durationMinutes: Int = 0,
)

/** The profile's kudos block (§C). */
@Serializable
data class KudosDTO(
    val count: Int = 0,
    @SerialName("given_today") val givenToday: Boolean = false,
    @SerialName("can_give") val canGive: Boolean = false,
)

/** §D body. */
@Serializable
data class KudosGiveRequest(@SerialName("program_id") val programId: String)

/** §D `{ kudos: { count, given_today } }` · §E `{ kudos: { given_today, removed } }` (undo carries NO count). */
@Serializable
data class KudosResponse(val kudos: KudosResultDTO = KudosResultDTO())

@Serializable
data class KudosResultDTO(
    val count: Int? = null,
    @SerialName("given_today") val givenToday: Boolean = false,
    val removed: Boolean? = null,
)

/** §F `PUT /members/:id` with only the "Hide my activity" switch (no default → always encoded). */
@Serializable
data class HideActivityRequest(@SerialName("hide_activity") val hideActivity: Boolean)

/** §F echo — null when the server predates people 0.1.0 (it ignored the key): NOT saved (PeopleStore treats it as a failure). */
@Serializable
data class HideActivityResponse(@SerialName("hide_activity") val hideActivity: Boolean? = null)
```

4. **`net/Dtos.kt`**
   - (a) Replace the block from `// ---- Notifications (Phase I) ----` through the closing `)` of `data class DeviceRegisterRequest(`. This covers the `NotificationDTO` KDoc and class, plus `DeviceRegisterRequest` and its KDoc. New block:
```kotlin
// ---- Notifications (Phase I; notifications 0.6.0 — the inbox DTOs live in InboxDtos.kt) ----

/** PUT /notifications/device — register this device's FCM token. `platform` AND `inbox` MUST be passed explicitly:
 *  kotlinx.serialization omits a property equal to its DEFAULT (encodeDefaults=false), so a default would be dropped from
 *  the body (the backend would fall back to "ios" / record no inbox capability — notifications D-C26). */
@Serializable
data class DeviceRegisterRequest(
    @SerialName("push_token") val pushToken: String,
    val platform: String,
    @SerialName("device_id") val deviceId: String? = null,
    /** notifications 0.6.0 (C7.4): this installation shows the inbox → category channels; always passed as true. */
    val inbox: Boolean? = null,
)
```
   - (b) Inside `data class MemberDTO(`, after its last property `val email: String? = null,` (the line just before the class's closing `)`), add:
```kotlin
    /** people 0.1.0 (§F): "Hide my activity" — present only for self / a global admin. */
    @SerialName("hide_activity") val hideActivity: Boolean? = null,
```

5. **`net/ApiService.kt`**
   - (a) Replace the block that starts with the comment line `    // ---- Notifications (Phase I) — in-app SSE backfill + acknowledge (the /stream route is opened by` and ends with `    suspend fun acknowledgeNotification(@Path("id") id: String): MessageResponse`. That is the 2-line comment, `getUnacknowledgedNotifications` and `acknowledgeNotification`. New block:
```kotlin
    // ---- notifications 0.6.0 (C4) — inbox, unread counts, read marks, preferences (the /stream route is opened by
    // NotificationStreamClient with ?inbox=1; /unacknowledged + /:id/acknowledge are no longer used — C7.3). ----
    @GET("notifications/inbox")
    suspend fun getInbox(@Query("limit") limit: Int? = null, @Query("before") before: String? = null): InboxPageDTO

    @GET("notifications/inbox/unread-count")
    suspend fun getUnreadCounts(): UnreadCountsDTO

    @POST("notifications/inbox/read")
    suspend fun markInboxRead(@Body body: InboxReadRequest): UnreadCountsDTO

    @GET("notifications/preferences")
    suspend fun getNotificationPreferences(): NotificationPreferencesDTO

    @PUT("notifications/preferences")
    suspend fun putNotificationPreferences(@Body body: NotificationPreferencesUpdate): NotificationPreferencesDTO
```
   - (b) At the end of the interface, before its final `}`, add:
```kotlin

    // ---- people 0.1.0 (People API CONTRACT §B–§F) ----
    @GET("people")
    suspend fun getPeople(@Query("programId") programId: String): PeopleListDTO

    @GET("people/{memberId}")
    suspend fun getPerson(@Path("memberId") memberId: String, @Query("programId") programId: String): PersonProfileDTO

    @POST("people/{memberId}/kudos")
    suspend fun giveKudos(@Path("memberId") memberId: String, @Body body: KudosGiveRequest): KudosResponse

    @DELETE("people/{memberId}/kudos")
    suspend fun undoKudos(@Path("memberId") memberId: String): KudosResponse

    /** §F: the "Hide my activity" switch only (own profile). */
    @PUT("members/{id}")
    suspend fun setHideActivity(@Path("id") id: String, @Body body: HideActivityRequest): HideActivityResponse
```
   - Add `import retrofit2.http.DELETE` and `import retrofit2.http.Query` only if they are not already imported.

6. **`net/NotificationStreamClient.kt`**
   - (a) Replace the whole class KDoc (from `/**` above `class NotificationStreamClient(` through its `*/`) with:
```kotlin
/**
 * notifications §3.3 stream client (`GET /notifications/stream?inbox=1`, Bearer header): foreground only (start on
 * ON_START, stop on ON_STOP); every close or error is a reconnect with exponential backoff + full jitter (1 s base, ×2,
 * 30 s cap), paused while offline; a fresh token before each connect (a 401 forces a refresh); `ready` resets the backoff
 * and triggers the unread-count refresh. `?inbox=1` (notifications 0.6.0 C7.2): every type arrives as a C3 inbox item.
 * The client's 60 s read timeout (pings every 25 s) detects a dead stream. State is mutated on [scope] (Main) only.
 */
```
   - (b) Change `var onNotification: ((NotificationDTO) -> Unit)? = null` to `var onNotification: ((InboxItemDTO) -> Unit)? = null`.
   - (c) Replace these two lines:
```kotlin
                    runCatching { Network.json.decodeFromString(NotificationDTO.serializer(), data) }.getOrNull()
                        ?.let { dto -> scope.launch { onNotification?.invoke(dto) } }
```
     with:
```kotlin
                    runCatching { Network.json.decodeFromString(InboxItemDTO.serializer(), data) }.getOrNull()
                        ?.let { item -> scope.launch { onNotification?.invoke(item) } }
```
   - (d) Replace `    private fun streamUrl(): String = (if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/") + "notifications/stream"` with:
```kotlin
    /** notifications 0.6.0 (C7.2): `?inbox=1` — every type as an inbox item (a plain stream gets the legacy types only). */
    private fun streamUrl(): String = (if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/") + "notifications/stream?inbox=1"
```

### Push plumbing

7. **`push/DeviceRegistry.kt`**
   - (a) Replace the class KDoc (the `/**` … `*/` directly above `class DeviceRegistry(`) with:
```kotlin
/**
 * notifications §3.1 device registry: install id in noBackupFilesDir/install_id; registration state + the one-time
 * permission flag in `rasi.push` (excluded from backup, survives process death); ONE serial queue (Mutex) for
 * PUT /device and POST /device/unregister (no login; one retry, then drop). PUT at most once per 12 h unless the token
 * or the permission changed; unregister once per denial (the cleared registration is the memo — A12). A sign-in waits
 * for an in-flight unregister and drops a pending retry (generation check); after an unregister the cached token +
 * memo are forgotten. notifications 0.6.0 (C7.4): every PUT sends `inbox: true`; the inbox memo [inboxToken] (the token
 * last registered WITH inbox) forces one PUT on the first launch of this build and after a login ride-along (which can't
 * send it) — never keyed on versionCode.
 */
```
   - (b) After the `registeredAtMs` property (its `set(v) = prefs.edit { putLong(KEY_AT, v) }` line), add:
```kotlin
    private var inboxToken: String?
        get() = prefs.getString(KEY_INBOX_TOKEN, null)
        set(v) = prefs.edit { if (v == null) remove(KEY_INBOX_TOKEN) else putString(KEY_INBOX_TOKEN, v) }
```
   - (c) Replace `                if (token == registeredToken && System.currentTimeMillis() - registeredAtMs < REREGISTER_AFTER_MS) return@withLock` with:
```kotlin
                if (token == registeredToken && token == inboxToken &&
                    System.currentTimeMillis() - registeredAtMs < REREGISTER_AFTER_MS
                ) return@withLock
```
   - (d) Replace these two lines:
```kotlin
                    api.registerDevice(DeviceRegisterRequest(pushToken = token, platform = "android", deviceId = deviceId))
                    markRegistered(token)
```
     with:
```kotlin
                    api.registerDevice(DeviceRegisterRequest(pushToken = token, platform = "android", deviceId = deviceId, inbox = true))
                    markRegistered(token)
                    inboxToken = token
```
   - (e) Change `        cachedPushToken = null; registeredToken = null; registeredAtMs = 0L` to `        cachedPushToken = null; registeredToken = null; registeredAtMs = 0L; inboxToken = null`.
   - (f) In the companion, after `const val KEY_ASKED = "permission_asked"`, add `const val KEY_INBOX_TOKEN = "inbox_registered_token"`.

8. **`push/RaSiFirebaseMessagingService.kt`**
   - Replace the class KDoc (the `/**` … `*/` above `class RaSiFirebaseMessagingService`) with:
```kotlin
/**
 * FCM entry point (the Android APNs-delegate analog):
 *  - **onNewToken** — the device's FCM token was (re)issued → [DeviceRegistry] (registered only while signed in).
 *  - **onMessageReceived** — a push arrived while the app is in the FOREGROUND (background `notification` messages are
 *    shown by the system tray). notifications §3.2 "Android shows foreground messages" — except while the SSE stream is
 *    connected, when the in-app toast already shows it (A5). Posted on the message's channel (a category channel for this
 *    inbox build — notifications 0.6.0 C5) with the monochrome icon; reminders / digest carry a tag (replace, not stack);
 *    the tap intent carries `notification_id` / `type` / `target` / `category` / `program_id` (MainActivity marks it read
 *    + routes).
 */
```
   - Replace everything from `        val channel = message.notification?.channelId ?: channelFor(payload["type"])` to the end of the file with:
```kotlin
        val channel = message.notification?.channelId ?: channelFor(payload["type"], payload["category"])
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            payload["notification_id"]?.let { putExtra("notification_id", it) }
            payload["type"]?.let { putExtra("type", it) }
            payload["target"]?.let { putExtra("target", it) }
            payload["category"]?.let { putExtra("category", it) }
            payload["program_id"]?.let { putExtra("program_id", it) }
        }
        val requestCode = (payload["notification_id"] ?: title).hashCode()
        val pending = PendingIntent.getActivity(this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setContentTitle(title)
            .setContentText(message.notification?.body.orEmpty())
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        // C5: reminders + digest carry a tag — same tag + same id REPLACES the previous one; everything else stacks.
        val tag = message.notification?.tag
        NotificationManagerCompat.from(this).notify(tag, if (tag != null) 0 else requestCode, notification)
    }

    /** Fallback when the message names no channel: invites/membership → rasi_invites, a new category → its channel. */
    private fun channelFor(type: String?, category: String?): String = getString(
        when {
            type in INVITE_TYPES -> R.string.invites_notification_channel_id
            category == "activity" -> R.string.activity_notification_channel_id
            category == "reminders" -> R.string.reminders_notification_channel_id
            category == "digest" -> R.string.digest_notification_channel_id
            category == "announcements" -> R.string.announcements_notification_channel_id
            else -> R.string.default_notification_channel_id
        },
    )

    private companion object {
        val INVITE_TYPES = setOf("program.invite_received", "program.role_changed", "program.admin_transferred", "program.member_removed")
    }
}
```

9. **`App.kt`**
   - In `onCreate`, swap the two lines so the channels exist before the container (and any registration) starts:
```kotlin
        createNotificationChannels()   // first: a PUT /device {inbox:true} lets the server name these channels
        container = AppContainer(this)
```
   - Replace `createNotificationChannels()` and its KDoc with:
```kotlin
    /** The channels FCM pushes post into (minSdk 26 = always required): `rasi_default` (the manifest default),
     *  high-importance `rasi_invites` (invites + membership changes) and — notifications 0.6.0 C5 — one per new category.
     *  Created before the container, so before any `PUT /device {inbox:true}` can make the server name them (a post to a
     *  missing channel is dropped). */
    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)
        listOf(
            Triple(R.string.default_notification_channel_id, R.string.default_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
            Triple(R.string.invites_notification_channel_id, R.string.invites_notification_channel_name, NotificationManager.IMPORTANCE_HIGH),
            Triple(R.string.activity_notification_channel_id, R.string.activity_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
            Triple(R.string.reminders_notification_channel_id, R.string.reminders_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
            Triple(R.string.digest_notification_channel_id, R.string.digest_notification_channel_name, NotificationManager.IMPORTANCE_LOW),
            Triple(R.string.announcements_notification_channel_id, R.string.announcements_notification_channel_name, NotificationManager.IMPORTANCE_DEFAULT),
        ).forEach { (id, name, importance) ->
            manager.createNotificationChannel(NotificationChannel(getString(id), getString(name), importance))
        }
    }
```

10. **`res/values/strings.xml`**: after the `invites_notification_channel_name` line, insert:
```xml
    <!-- notifications 0.6.0 (C5): one channel per new category; the server names them only for inbox-capable installs. -->
    <string name="activity_notification_channel_id" translatable="false">rasi_activity</string>
    <string name="activity_notification_channel_name">Activity</string>
    <string name="reminders_notification_channel_id" translatable="false">rasi_reminders</string>
    <string name="reminders_notification_channel_name">Reminders</string>
    <string name="digest_notification_channel_id" translatable="false">rasi_digest</string>
    <string name="digest_notification_channel_name">Weekly digest</string>
    <string name="announcements_notification_channel_id" translatable="false">rasi_announcements</string>
    <string name="announcements_notification_channel_name">Announcements</string>
```

11. **NEW `res/drawable/ic_stat_notification.xml`**:
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Status-bar (small) notification icon (notifications 0.6.0, N5): the three-bar brand mark of ic_launcher_monochrome.xml,
     cropped to a 40-unit window so it fills the 24dp canvas. White on transparent — Android tints it. Used by background
     FCM pushes (manifest default_notification_icon), RaSiFirebaseMessagingService and HealthSyncNotifier. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="40"
    android:viewportHeight="40">
    <group
        android:translateX="-32.15"
        android:translateY="-31.63">
        <path
            android:fillColor="#FFFFFFFF"
            android:pathData="M37.54,46.51 h4.12 a2.0,2.0 0 0 1 2.0,2.0 v14.25 a2.0,2.0 0 0 1 -2.0,2.0 h-4.12 a2.0,2.0 0 0 1 -2.0,-2.0 v-14.25 a2.0,2.0 0 0 1 2.0,-2.0 z" />
        <path
            android:fillColor="#FFFFFFFF"
            android:pathData="M49.99,42.61 h4.23 a2.0,2.0 0 0 1 2.0,2.0 v18.15 a2.0,2.0 0 0 1 -2.0,2.0 h-4.23 a2.0,2.0 0 0 1 -2.0,-2.0 v-18.15 a2.0,2.0 0 0 1 2.0,-2.0 z" />
        <path
            android:fillColor="#FFFFFFFF"
            android:pathData="M62.43,38.50 h4.33 a2.0,2.0 0 0 1 2.0,2.0 v22.26 a2.0,2.0 0 0 1 -2.0,2.0 h-4.33 a2.0,2.0 0 0 1 -2.0,-2.0 v-22.26 a2.0,2.0 0 0 1 2.0,-2.0 z" />
    </group>
</vector>
```

12. **`AndroidManifest.xml`**: after the `default_notification_channel_id` `<meta-data … />` (ending `android:value="@string/default_notification_channel_id" />`), insert:
```xml
        <!-- Small icon for background FCM "notification" messages (notifications 0.6.0 N5): the monochrome brand mark. -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@drawable/ic_stat_notification" />
```

13. **`health/HealthSyncNotifier.kt`**
    - Replace `.setSmallIcon(R.mipmap.ic_launcher)` with `.setSmallIcon(R.drawable.ic_stat_notification)`.
    - In the KDoc, replace ``` * `App.onCreate`), the same channel FCM pushes use.``` with ``` * `App.onCreate`), the same channel FCM pushes use, with the monochrome status-bar icon (notifications 0.6.0).```

14. **`MainActivity.kt`**: replace `handlePushTap` and its one-line KDoc with:
```kotlin
    /** FCM tap (tray or our foreground post): extras carry notification_id / type / target / program_id → mark read + open
     *  (notifications 0.6.0 C7.6). A background push's data keys arrive as the same extras. */
    private fun handlePushTap(intent: Intent?) {
        val id = intent?.getStringExtra("notification_id")?.takeIf { it.isNotEmpty() } ?: return
        (application as App).container.programContext.onPushTap(
            notificationId = id,
            type = intent.getStringExtra("type"),
            target = intent.getStringExtra("target"),
            programId = intent.getStringExtra("program_id"),
        )
        intent.removeExtra("notification_id")
    }
```

### Core

15. **NEW `core/NotificationInbox.kt`**:
```kotlin
package com.app.rasifiters.core

import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.failing
import com.app.rasifiters.core.kit.refreshing
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.InboxItemDTO
import com.app.rasifiters.net.InboxReadRequest
import com.app.rasifiters.net.NotificationPreferencesDTO
import com.app.rasifiters.net.NotificationPreferencesUpdate
import com.app.rasifiters.net.UnreadCountsDTO
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException

private const val INVITE_TYPE = "program.invite_received"
/** C4: `POST /inbox/read` takes at most 100 ids. */
private const val MAX_READ_IDS = 100

/** Where a notification opens (notifications 0.6.0 C2). An unknown value opens the inbox. */
enum class InboxTarget(val wire: String) {
    INVITES("invites"), PROGRAM("program"), PROGRAMS("programs"), LOG_WORKOUT("log_workout"), INBOX("inbox");

    companion object {
        fun parse(raw: String?): InboxTarget = entries.firstOrNull { it.wire == raw } ?: INBOX
    }
}

/** A push tap / toast View waiting for the signed-in graph to open it (RootScreen consumes it once). */
data class PendingOpen(val target: InboxTarget, val programId: String?)

/**
 * The notification inbox hub (notifications 0.6.0 §3.5, C7; D-N3–D-N5). ProgramContext owns one and feeds it the
 * `?inbox=1` stream, foreground pushes and push taps. Holds the unread counts (the "+" badge), the paged list, the
 * preference cache that gates the toast (C7.5), the toast and the pending "open this". Read = the server's acknowledged
 * flag: every load of the open inbox marks everything read (TC-1), a push tap / View marks that item. Every apply checks
 * [owner], so a late answer after a sign-out is dropped.
 */
class NotificationInbox(
    private val api: ApiService,
    private val scope: CoroutineScope,
    /** The signed-in member a load started for (null = signed out) — ProgramContext.sessionOwner. */
    private val owner: () -> String?,
    /** An invite arrived / the pending-invite count moved → reload the invite list. */
    private val onInviteActivity: suspend () -> Unit,
    /** Any other item → refresh what its type touches (programs, roster). */
    private val onItemActivity: suspend (type: String) -> Unit,
) {
    private val _counts = MutableStateFlow<UnreadCountsDTO?>(null)
    /** C4 counts (null = not loaded yet); `badge` drives the "+" badge and the account Inbox row. */
    val counts: StateFlow<UnreadCountsDTO?> = _counts.asStateFlow()

    private val _items = MutableStateFlow<UiState<List<InboxItemDTO>>>(UiState.Idle)
    val items: StateFlow<UiState<List<InboxItemDTO>>> = _items.asStateFlow()
    private var nextCursor: String? = null
    private val _canLoadMore = MutableStateFlow(false)
    val canLoadMore: StateFlow<Boolean> = _canLoadMore.asStateFlow()
    private val _loadingMore = MutableStateFlow(false)
    val loadingMore: StateFlow<Boolean> = _loadingMore.asStateFlow()

    private val _preferences = MutableStateFlow<UiState<NotificationPreferencesDTO>>(UiState.Idle)
    val preferences: StateFlow<UiState<NotificationPreferencesDTO>> = _preferences.asStateFlow()
    private val saveLock = Mutex()

    private val _toast = MutableStateFlow<InboxItemDTO?>(null)
    val toast: StateFlow<InboxItemDTO?> = _toast.asStateFlow()

    private val _pendingOpen = MutableStateFlow<PendingOpen?>(null)
    val pendingOpen: StateFlow<PendingOpen?> = _pendingOpen.asStateFlow()
    fun consumePendingOpen() { _pendingOpen.value = null }

    private val _invitesSheetRequest = MutableStateFlow(false)
    /** An `invites` target asks the program picker to open the "+" sheet on its Inbox tab. */
    val invitesSheetRequest: StateFlow<Boolean> = _invitesSheetRequest.asStateFlow()
    fun consumeInvitesSheetRequest() { _invitesSheetRequest.value = false }

    // ---- counts ----

    /** GET /inbox/unread-count — foreground, every stream `ready`, every item / push. Keeps the last value on failure. */
    suspend fun refreshCounts() {
        val o = owner() ?: return
        runCatching { api.getUnreadCounts() }.onSuccess { applyCounts(o, it) }
    }

    private suspend fun applyCounts(o: String, next: UnreadCountsDTO) {
        if (o != owner()) return
        val prev = _counts.value
        _counts.value = next
        if (prev != null && prev.pendingInvites != next.pendingInvites) runCatching { onInviteActivity() }
    }

    // ---- the list ----

    /** The newest page (30). */
    suspend fun loadFirstPage(): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        _items.value = _items.value.refreshing()
        return runCatching { api.getInbox() }
            .onSuccess { page ->
                if (o != owner()) return@onSuccess
                nextCursor = page.nextCursor
                _canLoadMore.value = page.nextCursor != null
                _items.value = UiState.fresh(page.items)
            }
            .onFailure { if (it !is CancellationException && o == owner()) _items.value = _items.value.failing(it.toAppError()) }
            .map { }
    }

    /** TC-1 (D-N5): the inbox is on screen — every load of its newest page (open, pull, Retry, reconnect) then marks
     *  everything read; the dots stay until the next load. An item that lands between the load and the mark is marked
     *  read without its dot (it still shows: the stream inserts it, else the next load). */
    suspend fun loadAndMarkRead(): Result<Unit> = loadFirstPage().onSuccess { markAllRead() }

    /** "Show more" — the next page (`before = next_cursor`); a failure keeps what is shown (the button stays). */
    suspend fun loadMore() {
        val o = owner() ?: return
        val cursor = nextCursor ?: return
        if (_loadingMore.value) return
        _loadingMore.value = true
        runCatching { api.getInbox(before = cursor) }.onSuccess { page ->
            if (o != owner()) return@onSuccess
            nextCursor = page.nextCursor
            _canLoadMore.value = page.nextCursor != null
            updateItems { list -> list + page.items.filter { item -> list.none { it.id == item.id } } }
        }
        _loadingMore.value = false
    }

    private suspend fun markAllRead() {
        val o = owner() ?: return
        if (_counts.value?.unread == 0) return
        runCatching { api.markInboxRead(InboxReadRequest(all = true)) }.onSuccess { applyCounts(o, it) }
    }

    /** C7.6 / C7.7: these items are read (a push tap, a toast View, an answered invite); their dots clear at once. */
    suspend fun markRead(ids: List<String>) {
        val o = owner() ?: return
        val unique = ids.distinct().take(MAX_READ_IDS)
        if (unique.isEmpty()) return
        val now = Instant.now().toString()
        updateItems { list -> list.map { if (it.id in unique && it.readAt == null) it.copy(readAt = now) else it } }
        runCatching { api.markInboxRead(InboxReadRequest(ids = unique)) }.onSuccess { applyCounts(o, it) }
    }

    /** C7.7: after an invite is accepted / declined, its program's unread invite items are read (else just recount). */
    suspend fun markInviteItemsRead(programId: String) {
        val ids = _items.value.dataOrNull.orEmpty()
            .filter { it.type == INVITE_TYPE && it.programId == programId && it.readAt == null }
            .map { it.id }
        if (ids.isEmpty()) refreshCounts() else markRead(ids)
    }

    // ---- live items, pushes, opening ----

    /** A `?inbox=1` stream frame (C7.5): on top of a loaded list, counts refreshed, a toast when its category is on, and
     *  what it touches refreshed (an invite → the invite list). */
    fun onStreamItem(item: InboxItemDTO) {
        if (owner() == null) return
        updateItems { list -> if (list.any { it.id == item.id }) list else listOf(item) + list }
        if (categoryOn(item.category)) _toast.value = item
        scope.launch {
            refreshCounts()
            runCatching { if (item.type == INVITE_TYPE) onInviteActivity() else onItemActivity(item.type) }
        }
    }

    /** A foreground push the tray showed (the stream was down): the badge and an invite's list stay fresh. Any thread. */
    fun onPushReceived(type: String?) {
        if (owner() == null) return
        scope.launch {
            refreshCounts()
            if (type == INVITE_TYPE) runCatching { onInviteActivity() }
        }
    }

    /** A push tap (C7.6), the toast's View or an inbox row: mark it read and open its target. A push sent before 0.6.0
     *  has no `target`: an invite opens the invites, anything else the inbox. */
    fun open(notificationId: String, type: String?, target: String?, programId: String?) {
        if (owner() == null) return
        val resolved = when {
            target != null -> InboxTarget.parse(target)
            type == INVITE_TYPE -> InboxTarget.INVITES
            else -> InboxTarget.INBOX
        }
        if (_toast.value?.id == notificationId) _toast.value = null
        if (resolved == InboxTarget.INVITES) _invitesSheetRequest.value = true
        _pendingOpen.value = PendingOpen(resolved, programId)
        scope.launch {
            markRead(listOf(notificationId))
            if (type != null) runCatching { if (type == INVITE_TYPE) onInviteActivity() else onItemActivity(type) }
        }
    }

    fun openItem(item: InboxItemDTO) = open(item.id, item.type, item.target, item.programId)

    fun dismissToast(id: String) { if (_toast.value?.id == id) _toast.value = null }

    /** C7.5 gate — unknown preferences fail open (the toast shows). */
    private fun categoryOn(category: String): Boolean = _preferences.value.dataOrNull?.categories?.get(category) ?: true

    // ---- preferences (C4) ----

    /** GET /preferences — every foreground (it gates the toast) and when the settings screen opens. */
    suspend fun loadPreferences(): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        _preferences.value = _preferences.value.refreshing()
        return runCatching { api.getNotificationPreferences() }
            .onSuccess { if (o == owner()) _preferences.value = UiState.fresh(it) }
            .onFailure { if (it !is CancellationException && o == owner()) _preferences.value = _preferences.value.failing(it.toAppError()) }
            .map { }
    }

    /** PUT /preferences (partial), one at a time. Optimistic: the switch moves at once; a failure puts it back. */
    suspend fun savePreferences(update: NotificationPreferencesUpdate): Result<Unit> = saveLock.withLock {
        val o = owner() ?: return@withLock Result.success(Unit)
        val before = _preferences.value.dataOrNull
            ?: return@withLock Result.failure(IllegalStateException("Notification settings aren't loaded."))
        _preferences.value = UiState.fresh(
            before.copy(
                categories = before.categories + update.categories.orEmpty(),
                reminderTime = update.reminderTime ?: before.reminderTime,
            ),
        )
        runCatching { api.putNotificationPreferences(update) }
            .onSuccess { if (o == owner()) _preferences.value = UiState.fresh(it) }
            .onFailure { if (it !is CancellationException && o == owner()) _preferences.value = UiState.fresh(before) }
            .map { }
    }

    private fun updateItems(transform: (List<InboxItemDTO>) -> List<InboxItemDTO>) {
        _items.value = when (val st = _items.value) {
            is UiState.Loaded -> st.copy(data = transform(st.data))
            is UiState.Stale -> st.copy(data = transform(st.data))
            else -> st
        }
    }

    /** Sign-out teardown. */
    fun reset() {
        _counts.value = null
        _items.value = UiState.Idle
        nextCursor = null
        _canLoadMore.value = false
        _loadingMore.value = false
        _preferences.value = UiState.Idle
        _toast.value = null
        _pendingOpen.value = null
        _invitesSheetRequest.value = false
    }
}
```

16. **NEW `core/PeopleStore.kt`** (gate G-P):
```kotlin
package com.app.rasifiters.core

import android.content.Context
import androidx.core.content.edit
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorException
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.failing
import com.app.rasifiters.core.kit.refreshing
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.HideActivityRequest
import com.app.rasifiters.net.KudosGiveRequest
import com.app.rasifiters.net.PeopleListDTO
import com.app.rasifiters.net.PersonProfileDTO
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.coroutines.cancellation.CancellationException

/**
 * People (people 0.1.0 §B–§F; phase-4 D-P1–D-P11) — the active program's People list, the open profile, kudos give / undo,
 * "Hide my activity", and the device-local "Who can see your activity" notice flag (U-1 b). The server decides every
 * visibility rule (`activity_visible`, `can_give`, `can_open_full_stats`); this store only shows them. Owned by
 * ProgramContext; reset by the sign-out teardown.
 */
class PeopleStore(context: Context, private val api: ApiService, private val owner: () -> String?) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val _list = MutableStateFlow<UiState<PeopleListDTO>>(UiState.Idle)
    val list: StateFlow<UiState<PeopleListDTO>> = _list.asStateFlow()
    private var listProgramId: String? = null

    private val _profile = MutableStateFlow<UiState<PersonProfileDTO>>(UiState.Idle)
    val profile: StateFlow<UiState<PersonProfileDTO>> = _profile.asStateFlow()
    private val _focusedId = MutableStateFlow<String?>(null)
    /** The person the profile route shows (stashed before the push — the static-route idiom). */
    val focusedId: StateFlow<String?> = _focusedId.asStateFlow()
    private var profileKey: String? = null

    /** Pick the person to open; another person / program starts from loading (never someone else's profile). */
    fun focus(programId: String, memberId: String) {
        _focusedId.value = memberId
        val key = "$programId|$memberId"
        if (profileKey != key) {
            profileKey = key
            _profile.value = UiState.Idle
        }
    }

    /** §B — a program switch drops the previous program's list first. */
    suspend fun loadList(programId: String): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        if (listProgramId != programId) {
            listProgramId = programId
            _list.value = UiState.Idle
        }
        fun mine() = o == owner() && listProgramId == programId
        _list.value = _list.value.refreshing()
        return runCatching { api.getPeople(programId) }
            .onSuccess { if (mine()) _list.value = UiState.fresh(it) }
            .onFailure { if (it !is CancellationException && mine()) _list.value = _list.value.failing(it.toAppError()) }
            .map { }
    }

    /** §C — only for the focused person. */
    suspend fun loadProfile(programId: String, memberId: String): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        val key = "$programId|$memberId"
        fun mine() = o == owner() && profileKey == key
        if (!mine()) return Result.success(Unit)
        _profile.value = _profile.value.refreshing()
        return runCatching { api.getPerson(memberId, programId) }
            .onSuccess { if (mine()) _profile.value = UiState.fresh(it) }
            .onFailure { if (it !is CancellationException && mine()) _profile.value = _profile.value.failing(it.toAppError()) }
            .map { }
    }

    /** §D / §E — toggles today's kudos on the open profile. Undo carries no count: −1 when `removed`. A 403
     *  (`activity_hidden` — the person hid their activity meanwhile) re-fetches the profile. */
    suspend fun toggleKudos(): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        val current = _profile.value.dataOrNull ?: return Result.success(Unit)
        val kudos = current.kudos ?: return Result.success(Unit)
        return runCatching {
            if (kudos.givenToday) {
                val undo = api.undoKudos(current.memberId).kudos
                kudos.copy(givenToday = false, count = if (undo.removed == true) (kudos.count - 1).coerceAtLeast(0) else kudos.count)
            } else {
                val given = api.giveKudos(current.memberId, KudosGiveRequest(current.programId)).kudos
                kudos.copy(givenToday = given.givenToday, count = given.count ?: kudos.count)
            }
        }.onSuccess { next ->
            if (o == owner()) updateProfile { it.copy(kudos = next) }
        }.onFailure {
            if (it !is CancellationException && o == owner() && it.toAppError().kind == AppErrorKind.FORBIDDEN) {
                loadProfile(current.programId, current.memberId)
            }
        }.map { }
    }

    /** §F `PUT /members/:id {hide_activity}` — the member's own switch (people D-C3). Returns the SAVED value. A server
     *  without people 0.1.0 ignores the key and echoes nothing → a failure (never report a hide that didn't happen). */
    suspend fun setHideActivity(memberId: String, hide: Boolean): Result<Boolean> = runCatching {
        api.setHideActivity(memberId, HideActivityRequest(hide)).hideActivity
            ?: throw AppErrorException(AppError(AppErrorKind.SERVER))
    }

    /** U-1 (b): the one-time notice, per member, on this device. */
    fun activityNoticeSeen(memberId: String?): Boolean =
        memberId == null || prefs.getBoolean(KEY_NOTICE_PREFIX + memberId, false)

    fun markActivityNoticeSeen(memberId: String?) {
        if (memberId != null) prefs.edit { putBoolean(KEY_NOTICE_PREFIX + memberId, true) }
    }

    private fun updateProfile(transform: (PersonProfileDTO) -> PersonProfileDTO) {
        _profile.value = when (val st = _profile.value) {
            is UiState.Loaded -> st.copy(data = transform(st.data))
            is UiState.Stale -> st.copy(data = transform(st.data))
            else -> st
        }
    }

    /** Sign-out teardown. */
    fun reset() {
        _list.value = UiState.Idle
        listProgramId = null
        _profile.value = UiState.Idle
        profileKey = null
        _focusedId.value = null
    }

    private companion object {
        const val PREFS = "rasi.people"
        const val KEY_NOTICE_PREFIX = "activity_notice_seen."
    }
}
```

17. **★ `core/ProgramContext.kt`**. Anchor on the quoted text.
    - (a) **Imports**:
      - Delete `import com.app.rasifiters.net.NotificationDTO` and `import android.os.SystemClock`.
      - Add `import com.app.rasifiters.core.kit.AppError`, `import kotlinx.coroutines.awaitAll`, `import kotlinx.coroutines.ensureActive` and `import kotlinx.coroutines.flow.update`.
    - (b) **Top-level constants**: delete `private const val INVITE_TYPE = "program.invite_received"`, plus the `/** A4: acknowledged ids are remembered this long …*/` KDoc line and `private const val ACK_MEMORY_MS = 120_000L`.
    - (c) **`selectProgram`**: replace these lines:
```kotlin
        // Polish #5/#10: a switch re-spins the Members tab and re-defaults View-as — the shared member flows and the
        // View-as pick may belong to the previous program (the admin body writes the same flows).
        if (program.id != _activeProgram.value?.id) {
            membersSelfLoadedFor = null
            membersLoadedFor = null          // the roster + View-as default re-initialize for the new program
            _membersViewAsId.value = null    // no leftover key → the logs effect starts on self, never a stale member
        }
```
      with:
```kotlin
        // Polish #5/#10: a switch re-defaults View-as — the pick may belong to the previous program. The Members cards
        // re-spin by themselves: every card's data is keyed to its program + member (S5 — memberCardsHeld).
        if (program.id != _activeProgram.value?.id) {
            membersLoadedFor = null          // the roster + View-as default re-initialize for the new program
            _membersViewAsId.value = null    // no leftover key → the logs effect starts on self, never a stale member
        }
```
    - (d) Directly after the `selectProgram` function's closing `}`, add:
```kotlin

    /** notifications C2 `program` target: the program to open when the member can (active, or a global admin); loads the
     *  list once when it isn't known yet (a cold start from a push tap). null → the picker. */
    suspend fun programForOpen(programId: String?): ProgramDTO? {
        val id = programId ?: return null
        fun find() = _programs.value.firstOrNull { it.id == id && (isGlobalAdmin || it.myStatus == "active") }
        return find() ?: run { loadPrograms(); find() }
    }
```
    - (e) **`respondToInvite`**: replace the whole function, including its 2-line KDoc, with:
```kotlin
    /** PUT /invite-response (`accept` / `decline` [+ block_future] / `revoke` for global admins), then inbox + programs
     *  reload in parallel; C7.7: the answered program's unread invite items are marked read. The 200 message is not shown. */
    suspend fun respondToInvite(
        inviteId: String,
        action: String,
        blockFuture: Boolean = false,
        programId: String? = null,
    ): Result<Unit> = runCatching {
        api.respondToInvite(InviteResponseRequest(inviteId, action, blockFuture.takeIf { it && action == "decline" }))
        coroutineScope {
            launch { loadInvites() }
            launch { loadPrograms() }
            if (programId != null && action != "revoke") launch { inbox.markInviteItemsRead(programId) }
        }
        Unit
    }.recoverCatching { throw AppErrorException(it.toAppError()) }
```
    - (f) **Replace the whole modal-queue section**: from the line `    // ---- Notifications (notifications §3.3) — real-time SSE + the modal queue ----` up to, but not including, `    // ---- Summary dashboard (Phase D) ----`. Replacement:
```kotlin
    // ---- Notifications (notifications 0.6.0 §3.3–§3.5) — the inbox stream, the unread badge, the toast, push routing ----
    // The SSE stream opens with ?inbox=1 (every type, as a C3 inbox item). [inbox] keeps the unread counts, the paged
    // list, the preference cache that gates the toast, the toast and the pending "open this" — D-N3: no blocking pop-up.

    /** The notification inbox hub (core/NotificationInbox.kt). */
    val inbox = NotificationInbox(
        api = api,
        scope = scope,
        owner = { sessionOwner() },
        onInviteActivity = { loadInvites() },
        onItemActivity = { type -> refreshDataForType(type) },
    )

    /** People (core/PeopleStore.kt) — the program's People list, profiles, kudos and "Hide my activity". */
    val people = PeopleStore(appContext, api, owner = { sessionOwner() })

    private val streamClient = NotificationStreamClient(
        baseUrl, Network.streamClient(), scope,
        awaitOnline = { isOnline.first { it } },
    ) { force ->
        try {
            if (force) (refresher.refresh(session.accessToken) as? TokenRefresher.Outcome.Refreshed)?.accessToken
            else refresher.tokenForRequest()
        } catch (_: AuthUnavailableException) { null }
    }.also { c ->
        c.onNotification = { item -> inbox.onStreamItem(item) }
        // The stream never replays: every `ready` re-reads the counts (the badge catches up on anything missed).
        c.onReady = { scope.launch { inbox.refreshCounts() } }
    }

    /** FCM foreground suppression (A5): the in-app toast already shows what arrives while the stream is connected. */
    val isStreamConnected: Boolean get() = streamClient.isConnected

    fun startNotificationStream() { if (session.signedIn.value) streamClient.start() }
    fun pauseNotificationStream() = streamClient.stop()

    /** Tear down the stream + the inbox state (sign-out). */
    fun stopNotificationStream() {
        streamClient.stop()
        inbox.reset()
    }

    /** RootScreen ON_START — `launch` (first start of this signed-in state) or `foreground`. */
    fun onForeground(trigger: String) {
        connectivity.setForeground(true)   // the offline probe runs signed in or out
        events.flushSoon()
        if (!session.signedIn.value) return
        startNotificationStream()
        registerPushTokenIfNeeded()
        health.onTrigger(trigger)
        // C7.5: the "+" badge and the preference cache that gates the toast.
        scope.launch { inbox.refreshCounts() }
        scope.launch { inbox.loadPreferences() }
    }

    /** RootScreen ON_STOP — the stream and the offline probe are foreground-only. */
    fun onBackground() {
        connectivity.setForeground(false)
        pauseNotificationStream()
    }

    /** Invalidate the caches a program event touches so the open screen reflects it (iOS `refreshDataForNotification`
     *  / web per-notification query invalidation). Best-effort; invites are the inbox's (the invite list reload). */
    private suspend fun refreshDataForType(type: String) {
        when (type) {
            "program.role_changed", "program.member_removed", "program.member_left",
            "program.member_joined", "program.admin_transferred", "program.updated", "program.deleted" -> {
                runCatching { loadPrograms() }
                if (_activeProgram.value != null) runCatching { loadMembershipDetails() }
            }
        }
    }

    // ---- Push (FCM, notifications §3.1–3.2) — registration lives in DeviceRegistry ----

    fun registerPushTokenIfNeeded() = deviceRegistry.sync()
    fun shouldAskNotificationPermission() = deviceRegistry.shouldAskNotificationPermission()
    fun markNotificationPermissionAsked() = deviceRegistry.markNotificationPermissionAsked()

    /** A foreground FCM message the tray showed (the stream was down) — the badge + an invite's list stay fresh. Any thread. */
    fun onPushReceived(type: String?) { if (session.signedIn.value) inbox.onPushReceived(type) }

    /** C7.6: a push tap marks it read and opens its target (RootScreen consumes [NotificationInbox.pendingOpen]). */
    fun onPushTap(notificationId: String, type: String?, target: String?, programId: String?) {
        if (session.signedIn.value) inbox.open(notificationId, type, target, programId)
    }

```
    - (g) Replace these three lines:
```kotlin
    /** The program whose Members-tab self data last finished loading (polish #5): the tab spins only when nothing for the
     *  active program is on screen; a re-entry keeps the cards and refreshes underneath. Reset by the teardown. */
    var membersSelfLoadedFor: String? = null
```
      with:
```kotlin
    /** S5 (polish #32): whose data each Members card's shared flow holds — the program + member of its last SUCCESSFUL
     *  read (any caller: the tab, People "Open full stats", the drill-downs). A screen shows a card's flow only when this
     *  matches the member the card is for, so it never shows another program's / member's values (A13). Kept here, not in
     *  the screen, so a tab switch or a detail push can't lose it. Reset by the teardown. */
    private val _memberCardsHeld = MutableStateFlow<Map<MemberCardPart, MemberCardKey>>(emptyMap())
    val memberCardsHeld: StateFlow<Map<MemberCardPart, MemberCardKey>> = _memberCardsHeld.asStateFlow()

    /** S5: per part, what the latest [loadMemberCards] asked for and whether it failed (ErrorView / "—" / stale banner). */
    private val _memberCardsLoad = MutableStateFlow(MemberCardsLoad())
    val memberCardsLoad: StateFlow<MemberCardsLoad> = _memberCardsLoad.asStateFlow()

    private fun markCardHeld(part: MemberCardPart, programId: String, memberId: String?) {
        _memberCardsHeld.update { it + (part to MemberCardKey(programId, memberId)) }
    }
```
    - (h) **Loaders mark their card held on success.** Five insertions inside the existing `runCatching` blocks:
      - `loadMemberMetrics`: after `            _memberMetricsRange.value = (resp.dateRange?.start to resp.dateRange?.end)` add `            markCardHeld(MemberCardPart.METRICS, pid, null)`.
      - `loadMemberOverview`: after `            _selectedMemberOverview.value = resp.members.firstOrNull()` add `            markCardHeld(MemberCardPart.OVERVIEW, pid, memberId)`.
      - `loadMemberHistory`: after `            _memberHistory.value = resp` (before the line `            resp`) add `            markCardHeld(MemberCardPart.HISTORY, pid, memberId)`.
      - `loadMemberStreaks`: replace `        return runCatching { _memberStreaks.value = api.getMemberStreaks(pid, memberId) }` with:
```kotlin
        return runCatching {
            _memberStreaks.value = api.getMemberStreaks(pid, memberId)
            markCardHeld(MemberCardPart.STREAKS, pid, memberId)
        }
```
      - `loadMemberRecent`: after the `            ).items` line that closes `_memberRecent.value = api.getMemberRecent(`, add `            markCardHeld(MemberCardPart.RECENT, pid, memberId)`.
      - `loadMemberHealthLogs`: after the `            ).items` line that closes `_memberHealthLogs.value = api.getMemberHealthLogs(`, add `            markCardHeld(MemberCardPart.HEALTH, pid, memberId)`.
    - (i) Directly before `    /** GET /program-memberships/details — the roster editor's rich rows`, insert:
```kotlin
    /** S5 (polish #32): the Members cards' reads in parallel — METRICS (the admin preview), OVERVIEW / HISTORY / STREAKS
     *  for [statsId], RECENT / HEALTH for [logsId] (a logger's View-as). Each success marks its card held (the loaders
     *  above); the outcome per part goes to [memberCardsLoad]. A part whose member id is missing is skipped; a run
     *  cancelled by a newer one (a new pick, a reload) records nothing. */
    suspend fun loadMemberCards(statsId: String?, logsId: String? = statsId, parts: Set<MemberCardPart>) {
        val pid = _activeProgram.value?.id ?: return
        val keys = parts.mapNotNull { part ->
            val memberId = when (part) {
                MemberCardPart.METRICS -> null
                MemberCardPart.RECENT, MemberCardPart.HEALTH -> logsId ?: return@mapNotNull null
                else -> statsId ?: return@mapNotNull null
            }
            part to MemberCardKey(pid, memberId)
        }.toMap()
        if (keys.isEmpty()) return
        val results = coroutineScope {
            keys.map { (part, key) ->
                val id = key.memberId.orEmpty()
                async {
                    part to when (part) {
                        MemberCardPart.METRICS -> loadMemberMetrics(sort = "active_days", direction = "desc")
                        MemberCardPart.OVERVIEW -> loadMemberOverview(id)
                        MemberCardPart.HISTORY -> loadMemberHistory(id, "week").map { }
                        MemberCardPart.STREAKS -> loadMemberStreaks(id)
                        MemberCardPart.RECENT -> loadMemberRecent(id, limit = 10)
                        MemberCardPart.HEALTH -> loadMemberHealthLogs(id, limit = 10)
                    }
                }
            }.awaitAll().also { ensureActive() }
        }
        val failures = results.filter { it.second.isFailure }
        val firstError = failures.firstOrNull()?.second?.exceptionOrNull()?.toAppError()
        _memberCardsLoad.update { prev ->
            val failed = prev.failed - keys.keys + failures.map { it.first }
            MemberCardsLoad(
                keys = prev.keys + keys,
                failed = failed,
                error = firstError ?: prev.error.takeIf { failed.isNotEmpty() },
            )
        }
    }

```
    - (j) **`clearSession()`**:
      - Replace these lines:
```kotlin
        stopNotificationStream()
        session.clear()
        _invites.value = UiState.Idle
        _inviteInboxRequest.value = false
        recentlyAcked.clear()
```
        with:
```kotlin
        stopNotificationStream()   // also resets the inbox (counts, list, preferences, toast, pending open)
        people.reset()
        session.clear()
        _invites.value = UiState.Idle
```
      - Replace `        membersSelfLoadedFor = null` with:
```kotlin
        _memberCardsHeld.value = emptyMap()
        _memberCardsLoad.value = MemberCardsLoad()
```
    - (k) After `enum class SummaryPart { TIMELINE, TYPES }`, add:
```kotlin

/** The Members cards (S5 / polish #32), each its own read. METRICS = the admin tab's program leaderboard preview. */
enum class MemberCardPart { METRICS, OVERVIEW, HISTORY, STREAKS, RECENT, HEALTH }

/** The program + member a Members card's data belongs to ([memberId] null for the program-wide METRICS preview). */
data class MemberCardKey(val programId: String, val memberId: String?)

/** Per part: what the latest [ProgramContext.loadMemberCards] asked for ([keys]), which of those parts failed, and the
 *  first error (the ErrorView's). */
data class MemberCardsLoad(
    val keys: Map<MemberCardPart, MemberCardKey> = emptyMap(),
    val failed: Set<MemberCardPart> = emptySet(),
    val error: AppError? = null,
)
```

### Inbox UI

18. **NEW `ui/inbox/InboxList.kt`**:
```kotlin
package com.app.rasifiters.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.InboxTarget
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.InboxItemDTO
import com.app.rasifiters.net.PendingInviteDTO
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.programs.DeclineInviteDialog
import com.app.rasifiters.ui.programs.InviteCard
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/** The inbox's ONE reload — open, pull, Retry, reconnect: invites + the newest page, then everything read (TC-1). */
internal suspend fun reloadInbox(programContext: ProgramContext) = coroutineScope {
    launch { programContext.loadInvites() }
    launch { programContext.inbox.loadAndMarkRead() }
}

/**
 * The inbox list (notifications 0.6.0, D-N4) — shared by the "+" sheet's Inbox tab and the Inbox screen. Pending invites
 * first with their actions (the ONE invite inbox, invites §3.1: `/my-invites`; global admins `/all-invites` + Revoke — A10)
 * and the member's own join requests (Cancel Request); then the notification items, newest first, 30 a page ("Show
 * more"). Every load marks every item read (TC-1 / D-N5 — the dots stay until the next load). A row whose target leads
 * somewhere (a program, the picker, logging a workout) is tappable. Kit: nothing yet → spinner; nothing + a failure →
 * ErrorView + Retry (the offline copy while offline — QA4).
 */
@Composable
fun InboxList(
    programContext: ProgramContext,
    onOpenItem: (InboxItemDTO) -> Unit,
    onAccepted: () -> Unit,
    modifier: Modifier = Modifier,
    bottomPadding: Dp = 8.dp,
) {
    val inbox = programContext.inbox
    val invitesState by programContext.invites.collectAsStateWithLifecycle()
    val itemsState by inbox.items.collectAsStateWithLifecycle()
    val canLoadMore by inbox.canLoadMore.collectAsStateWithLifecycle()
    val loadingMore by inbox.loadingMore.collectAsStateWithLifecycle()
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val isGlobalAdmin = programContext.isGlobalAdmin
    val scope = rememberCoroutineScope()
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var declineTarget by remember { mutableStateOf<PendingInviteDTO?>(null) }

    LaunchedEffect(Unit) { reloadInbox(programContext) }

    fun respond(invite: PendingInviteDTO, action: String, block: Boolean = false) {
        busyId = invite.inviteId; errorMessage = null
        scope.launch {
            programContext.respondToInvite(invite.inviteId, action, block, programId = invite.programId)
                .onSuccess { if (action == "accept") onAccepted() }
                .onFailure { errorMessage = it.toAppError().message }
            busyId = null
        }
    }

    val invites = invitesState.dataOrNull.orEmpty().let { list -> if (isGlobalAdmin) list.sortedBy { it.programName.orEmpty() } else list }
    val requested = programs.filter { it.myStatus == "requested" }
    val items = itemsState.dataOrNull.orEmpty()
    val hasInvites = invites.isNotEmpty() || requested.isNotEmpty()
    val nothing = !hasInvites && items.isEmpty()
    val failure = (invitesState as? UiState.Failed)?.error ?: (itemsState as? UiState.Failed)?.error

    Column(modifier = modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        errorMessage?.let { FormErrorText(it) }
        when {
            nothing && failure != null ->
                ErrorView(if (!online) AppError(AppErrorKind.OFFLINE) else failure, onRetry = { scope.launch { reloadInbox(programContext) } })
            nothing && (invitesState.isPending() || itemsState.isPending()) ->
                Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            nothing -> InboxEmptyState()
            else -> {
                if (hasInvites) {
                    SectionLabel(if (isGlobalAdmin) "All program invitations" else "Program invitations")
                    invites.forEach { invite ->
                        InviteCard(
                            invite = invite,
                            busy = busyId == invite.inviteId,
                            onAccept = { respond(invite, "accept") },
                            onDecline = { declineTarget = invite },
                            onRevoke = if (isGlobalAdmin) ({ respond(invite, "revoke") }) else null,
                        )
                    }
                    requested.forEach { program ->
                        RequestedRow(program) {
                            scope.launch {
                                programContext.cancelJoinRequest(program.id).onFailure { errorMessage = it.toAppError().message }
                            }
                        }
                    }
                }
                if (items.isNotEmpty()) {
                    SectionLabel("Updates")
                    items.forEach { item -> InboxRow(item, onClick = if (item.opensSomewhere()) ({ onOpenItem(item) }) else null) }
                    if (canLoadMore) {
                        TextButton(
                            onClick = { scope.launch { inbox.loadMore() } },
                            enabled = !loadingMore,
                            modifier = Modifier.align(Alignment.CenterHorizontally),
                        ) { Text(if (loadingMore) "Loading…" else "Show more", color = AppOrange, fontWeight = FontWeight.SemiBold) }
                    }
                } else if (itemsState is UiState.Failed) {
                    TextButton(onClick = { scope.launch { reloadInbox(programContext) } }) {
                        Text("Couldn't load updates · Retry", color = AppOrange, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
        Spacer(Modifier.height(bottomPadding))
    }

    declineTarget?.let { invite ->
        DeclineInviteDialog(
            programName = invite.programName ?: "this program",
            onDecline = { block -> declineTarget = null; respond(invite, "decline", block) },
            onDismiss = { declineTarget = null },
        )
    }
}

private fun UiState<*>.isPending(): Boolean = this is UiState.Idle || this is UiState.Loading

/** A row leads somewhere only for program / programs / log-a-workout targets (`inbox` / `invites` items are already here). */
private fun InboxItemDTO.opensSomewhere(): Boolean = when (InboxTarget.parse(target)) {
    InboxTarget.PROGRAM -> programId != null
    InboxTarget.PROGRAMS, InboxTarget.LOG_WORKOUT -> true
    InboxTarget.INBOX, InboxTarget.INVITES -> false
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
    )
}

/** One notification: unread dot · title + time · body; a chevron when it opens something. */
@Composable
private fun InboxRow(item: InboxItemDTO, onClick: (() -> Unit)?) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val unread = item.readAt == null
        Box(
            modifier = Modifier
                .padding(top = 6.dp)
                .size(8.dp)
                .clip(CircleShape)
                .background(if (unread) AppOrange else Color.Transparent)
                .then(if (unread) Modifier.semantics { contentDescription = "Unread" } else Modifier),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    item.title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (unread) FontWeight.Bold else FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    inboxTime(item.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                    maxLines = 1,
                )
            }
            if (item.body.isNotBlank()) {
                Text(
                    item.body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    maxLines = 4,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (onClick != null) {
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
        }
    }
}
```

19. **NEW `ui/inbox/InboxScreen.kt`**:
```kotlin
package com.app.rasifiters.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.programs.InvitePill
import com.app.rasifiters.ui.summary.DetailTopBar
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d", Locale.US)
private val DAY_YEAR_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

/**
 * The Inbox screen (notifications 0.6.0, D-N4) — the account menu's Inbox row (picker sheet + Program tab) and a push /
 * toast `inbox` target. The same [InboxList] as the "+" sheet's tab. Kit: pull to refresh; stale → "Couldn't refresh ·
 * Retry"; back online → a failed / stale list reloads; every reload marks all read (TC-1). Registered in both graphs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val itemsState by programContext.inbox.items.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var pulling by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = programContext.inbox.items.value
            if (st is UiState.Failed || st is UiState.Stale) reloadInbox(programContext)
        }
    }
    val staleBanner = online && itemsState is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { reloadInbox(programContext); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp).padding(top = 20.dp)) {
                DetailTopBar(onBack = onBack, centerTitle = "Inbox")
                Spacer(Modifier.height(16.dp))
                InboxList(
                    programContext = programContext,
                    onOpenItem = { item -> programContext.inbox.openItem(item) },
                    onAccepted = {},
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    bottomPadding = if (staleBanner) 96.dp else 24.dp,
                )
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { scope.launch { reloadInbox(programContext) } })
        }
    }
}

/** The member's own join request (a "requested" program) — kept on every surface with its Cancel Request (A10). */
@Composable
internal fun RequestedRow(program: ProgramDTO, onCancel: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(program.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
        Text(
            "Request pending approval",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
        InvitePill("Cancel Request", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), onClick = onCancel)
    }
}

@Composable
internal fun InboxEmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .padding(vertical = 40.dp, horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            Icons.Filled.Inbox,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
            modifier = Modifier.size(40.dp),
        )
        Text("You're all caught up", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            "Invites and updates will show up here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
        )
    }
}

/** "Just now" · "5m ago" · "3h ago" · "Yesterday" · "Oct 12" · "Oct 12, 2025" (device time zone). */
internal fun inboxTime(iso: String?, now: Instant = Instant.now()): String {
    val at = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
    val minutes = Duration.between(at, now).toMinutes()
    val zone = ZoneId.systemDefault()
    val day = at.atZone(zone).toLocalDate()
    val today = now.atZone(zone).toLocalDate()
    return when {
        minutes < 1 -> "Just now"
        minutes < 60 -> "${minutes}m ago"
        day == today -> "${minutes / 60}h ago"
        day == today.minusDays(1) -> "Yesterday"
        day.year == today.year -> day.format(DAY_FMT)
        else -> day.format(DAY_YEAR_FMT)
    }
}
```

20. **NEW `ui/inbox/NotificationToast.kt`**:
```kotlin
package com.app.rasifiters.ui.inbox

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.InboxItemDTO
import kotlinx.coroutines.delay

private const val TOAST_MS = 4_000L

/**
 * The notification toast — frontend-kit D-KIT-20 (notifications 0.6.0, D-N3 — it replaces the blocking pop-up queue):
 * "<title> · View" at the TOP of the screen for 4 s (D-KIT-20's deliberate exception to D-KIT-8's bottom rule: the bottom
 * holds the offline / stale banner, the nav and FABs); the newest replaces the previous (the rest wait in the Inbox). View
 * opens the item (marks it read + routes); a tap on the card, or the time running out, just hides it (it stays unread).
 * Shown only for categories switched on (C7.5). Chrome = the kit banner's (neutral surface, 1px border, soft shadow,
 * max 520 wide, ≥ 48dp tap target); announced politely to screen readers.
 */
@Composable
fun BoxScope.NotificationToast(programContext: ProgramContext) {
    val inbox = programContext.inbox
    val item by inbox.toast.collectAsStateWithLifecycle()
    LaunchedEffect(item?.id) {
        val id = item?.id ?: return@LaunchedEffect
        delay(TOAST_MS)
        inbox.dismissToast(id)
    }
    AnimatedContent(
        targetState = item,
        transitionSpec = { fadeIn() togetherWith fadeOut() },
        contentKey = { it?.id },
        label = "notificationToast",
        modifier = Modifier
            .align(Alignment.TopCenter)
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) { shown ->
        if (shown != null) {
            ToastCard(shown, onView = { inbox.openItem(shown) }, onDismiss = { inbox.dismissToast(shown.id) })
        }
    }
}

@Composable
private fun ToastCard(item: InboxItemDTO, onView: () -> Unit, onDismiss: () -> Unit) {
    Surface(
        onClick = onDismiss,
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 6.dp,
        modifier = Modifier
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Row(
            modifier = Modifier.heightIn(min = 52.dp).padding(start = 16.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(AppOrange))
            Spacer(Modifier.width(10.dp))
            Text(
                item.title.ifBlank { "New notification" },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onView, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("View", color = AppOrange, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
```

21. **DELETE `ui/components/NotificationModal.kt`** (D-N3).

### Shell, routes and root

22. **`ui/Routes.kt`**
    - Replace `    const val MEMBER_ROSTER = "members/roster"` with:
```kotlin
    // people 0.1.0 (D-P2 a): the roster grew into the People list (Members header for every role + Program tab "View
    // Members"); a person's profile (stashed via ProgramContext.people.focus) and the staff "Open full stats" (the five
    // member cards for ProgramContext.focusedMemberId).
    const val MEMBER_ROSTER = "members/roster"
    const val PERSON_PROFILE = "members/person"
    const val MEMBER_FULL_STATS = "members/full-stats"
```
    - After `    const val HEALTH_CONNECT = "program/health"`, add:
```kotlin

    // notifications 0.6.0 (D-N4) — the Inbox screen (account Inbox row; push / toast target `inbox`). Both graphs.
    const val INBOX = "inbox"
    // notifications 0.6.0 (C2 `log_workout`, TC-6) — the quick-add workout form over where the member is (root graph);
    // closing returns there (the widget route WIDGET_LOG_WORKOUT instead exits to My Programs).
    const val INBOX_LOG_WORKOUT = "inbox/log-workout"
```

23. **★ `ui/RootScreen.kt`**
    - (a) **Imports**: delete `import com.app.rasifiters.ui.components.NotificationModal`. Add `import com.app.rasifiters.core.InboxTarget`, `import com.app.rasifiters.ui.inbox.InboxScreen` and `import com.app.rasifiters.ui.inbox.NotificationToast`.
    - (b) Delete `    val notificationQueue by programContext.notificationQueue.collectAsStateWithLifecycle()`.
    - (c) Delete the block from `        // The single-notification modal queue, shown above the whole app (iOS AppRootView ZStack overlay). A Dialog is` through the closing `}` of `if (!updateRequired) { notificationQueue.firstOrNull()?.let { … } }`.
    - (d) Directly before `        // app-config §3: blocking "Update required"`, insert:
```kotlin
        // D-N3 / D-KIT-20: a new notification floats in as a small toast ("<title> · View") at the top — never a blocking
        // pop-up; withheld while the blocking update screen shows (A7).
        if (signedIn && !updateRequired) NotificationToast(programContext)

```
    - (e) In `SignedInGraph`, replace the three statements starting at `    // Invite push tap (notifications §3.2, U2): pop back to the picker` (the comment, `val inviteInboxRequest …` and `LaunchedEffect(inviteInboxRequest) { … }`) with:
```kotlin
    // notifications 0.6.0 (C2 targets, C7.6): a push tap / the toast's View / an inbox row → open its place. Consumed once.
    val pendingOpen by programContext.inbox.pendingOpen.collectAsStateWithLifecycle()
    LaunchedEffect(pendingOpen) {
        val open = pendingOpen ?: return@LaunchedEffect
        when (open.target) {
            // The picker opens the "+" sheet on its Inbox tab (NotificationInbox.invitesSheetRequest).
            InboxTarget.INVITES, InboxTarget.PROGRAMS -> nav.popBackStack(Routes.PROGRAM_PICKER, inclusive = false)
            InboxTarget.INBOX -> nav.navigate(Routes.INBOX) { launchSingleTop = true }
            // TC-6: the quick-add form over where the member is; closing returns there (their program stays open).
            InboxTarget.LOG_WORKOUT -> nav.navigate(Routes.INBOX_LOG_WORKOUT) { launchSingleTop = true }
            InboxTarget.PROGRAM -> {
                val program = programContext.programForOpen(open.programId)
                when {
                    program == null -> nav.popBackStack(Routes.PROGRAM_PICKER, inclusive = false)
                    // Already inside it: stay where the member is (the item already refreshed the program's data).
                    program.id == programContext.activeProgram.value?.id && nav.currentDestination?.route == Routes.SHELL -> Unit
                    else -> {
                        programContext.selectProgram(program)
                        nav.navigate(Routes.SHELL) { popUpTo(Routes.PROGRAM_PICKER) }
                    }
                }
            }
        }
        programContext.inbox.consumePendingOpen()
    }
```
    - (f) Replace `                SettingsInset { NotificationsScreen(onBack = { nav.popBackStack() }) }` with `                SettingsInset { NotificationsScreen(programContext = programContext, onBack = { nav.popBackStack() }) }`.
    - (g) After the `composable(Routes.HEALTH_CONNECT) { … }` block in `SignedInGraph`, add:
```kotlin
            composable(Routes.INBOX) {
                SettingsInset { InboxScreen(programContext = programContext, onBack = { nav.popBackStack() }) }
            }
            composable(Routes.INBOX_LOG_WORKOUT) {
                SettingsInset { QuickAddWorkoutWidgetScreen(programContext = programContext, onExit = { nav.popBackStack() }) }
            }
```
    - (h) In the `RootScreen` KDoc, replace `and the app-wide overlays.` with `and the app-wide overlays (the notification toast, the Health Connect review, the update screen).`

24. **`ui/shell/AppScaffold.kt`**
    - (a) Delete `import com.app.rasifiters.ui.members.ProgramMembersListScreen`. Add `import com.app.rasifiters.ui.inbox.InboxScreen`, `import com.app.rasifiters.ui.members.MemberFullStatsScreen`, `import com.app.rasifiters.ui.people.PeopleListScreen` and `import com.app.rasifiters.ui.people.PersonProfileScreen`.
    - (b) Replace `                    NotificationsScreen(onBack = { nav.popBackStack() })` with `                    NotificationsScreen(programContext = programContext, onBack = { nav.popBackStack() })`.
    - (c) After the `composable(Routes.HEALTH_CONNECT) { … }` block, add:
```kotlin
                composable(Routes.INBOX) {
                    InboxScreen(programContext = programContext, onBack = { nav.popBackStack() })
                }
```
    - (d) Replace the `composable(Routes.MEMBER_ROSTER) { ProgramMembersListScreen(…) }` block with:
```kotlin
                composable(Routes.MEMBER_ROSTER) {
                    PeopleListScreen(programContext = programContext, onNavigate = { nav.navigate(it) }, onBack = { nav.popBackStack() })
                }
                composable(Routes.PERSON_PROFILE) {
                    PersonProfileScreen(programContext = programContext, onNavigate = { nav.navigate(it) }, onBack = { nav.popBackStack() })
                }
                composable(Routes.MEMBER_FULL_STATS) {
                    MemberFullStatsScreen(programContext = programContext, onNavigate = { nav.navigate(it) }, onBack = { nav.popBackStack() })
                }
```

### Notification settings

25. **NEW `ui/program/NotificationPreferencesSection.kt`**:
```kotlin
package com.app.rasifiters.ui.program

import android.app.TimePickerDialog
import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.NotificationPreferencesUpdate
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** One category switch (notifications C2 key + label) with its one-line explanation — the same copy on web and iOS. */
private data class CategoryRow(val key: String, val title: String, val hint: String, val default: Boolean)

private val CATEGORY_ROWS = listOf(
    CategoryRow("program", "Program & invites", "Invites, role changes and updates to your programs.", true),
    CategoryRow("activity", "Activity", "Kudos from members of your programs.", true),
    CategoryRow("reminders", "Reminders", "A daily nudge at your chosen time if you haven't logged a workout.", false),
    CategoryRow("digest", "Weekly digest", "A summary of your week, every Monday morning.", false),
    CategoryRow("announcements", "Announcements", "News and updates from the RaSi Fiters team.", true),
)

/** Honest opt-in wording (App Store 4.5.4 / D-N2 c) — the same on all three. */
private const val OPT_IN_NOTE =
    "Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, " +
        "they still appear in your Inbox, just without an alert."

/**
 * notifications 0.6.0 §3.5 (D-N2, D-N7, D-N10) — the five category switches and, while Reminders is on, the reminder time
 * (platform TimePickerDialog; default 19:00). The time zone is never picked: it rides every request (X-Time-Zone, C1).
 * Kit: loading → spinner, failed → ErrorView + Retry (offline copy while offline); a change moves at once and goes back on
 * failure (the kit message under the list). The stale banner is the host screen's (NotificationsScreen).
 */
@Composable
fun NotificationPreferencesSection(programContext: ProgramContext) {
    val inbox = programContext.inbox
    val state by inbox.preferences.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { inbox.loadPreferences() }

    fun save(update: NotificationPreferencesUpdate) {
        error = null
        scope.launch { inbox.savePreferences(update).onFailure { error = it.toAppError().message } }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Notify me about", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        val current = state
        val prefs = current.dataOrNull
        when {
            prefs != null -> {
                CATEGORY_ROWS.forEach { row ->
                    PreferenceRow(row.title, row.hint, checked = prefs.categories[row.key] ?: row.default) { on ->
                        save(NotificationPreferencesUpdate(categories = mapOf(row.key to on)))
                    }
                }
                if (prefs.categories["reminders"] == true) {
                    ReminderTimeRow(prefs.reminderTime) { picked -> save(NotificationPreferencesUpdate(reminderTime = picked)) }
                }
                Text(
                    OPT_IN_NOTE,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                error?.let { FormErrorText(it) }
            }
            !online -> ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = { scope.launch { inbox.loadPreferences() } })
            current is UiState.Failed -> ErrorView(current.error, onRetry = { scope.launch { inbox.loadPreferences() } })
            else -> Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AppOrange)
            }
        }
    }
}

@Composable
private fun PreferenceRow(title: String, hint: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onChange)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

/** The reminder time — the platform TimePickerDialog (Material3 1.3.1 has no time-picker dialog composable). */
@Composable
private fun ReminderTimeRow(time: String, onPick: (String) -> Unit) {
    val context = LocalContext.current
    val local = runCatching { LocalTime.parse(time) }.getOrDefault(LocalTime.of(19, 0))
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .clickable {
                TimePickerDialog(
                    context,
                    { _, hour, minute -> onPick(String.format(Locale.US, "%02d:%02d", hour, minute)) },
                    local.hour,
                    local.minute,
                    DateFormat.is24HourFormat(context),
                ).show()
            }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Reminder time", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "In your phone's time zone",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        Text(
            local.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = AppOrange,
        )
    }
}
```

26. **`ui/program/NotificationsScreen.kt`**: replace the whole file:
```kotlin
package com.app.rasifiters.ui.program

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.summary.DetailTopBar
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

/**
 * "Notifications" (notifications 0.6.0) — whether this phone lets RaSi Fiters notify, with a real way to fix it (the
 * DISCOVERY "Moved" row): **Enable Notifications** asks in-app (Android 13+, until the member has said no twice), else
 * **Open Settings** opens the app's notification settings; re-checked on resume. Below it the category switches and the
 * reminder time ([NotificationPreferencesSection]). Kit: a failed refresh of loaded settings → "Couldn't refresh · Retry";
 * back online → a failed / stale load reloads.
 */
@Composable
fun NotificationsScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val prefsState by programContext.inbox.preferences.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var enabled by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    var canAsk by remember { mutableStateOf(canAskPermission(context, programContext)) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        programContext.markNotificationPermissionAsked()
        programContext.registerPushTokenIfNeeded()
        enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        canAsk = canAskPermission(context, programContext)
    }

    // Re-check when returning from system settings.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
                canAsk = canAskPermission(context, programContext)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    // D-KIT-13: back online → a failed / stale preferences load reloads by itself.
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = programContext.inbox.preferences.value
            if (st is UiState.Failed || st is UiState.Stale) programContext.inbox.loadPreferences()
        }
    }
    val staleBanner = online && prefsState is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Notifications")
            Column {
                Text("Notifications", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Choose what RaSi Fiters notifies you about.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            StatusCard(enabled)
            if (!enabled) {
                PillButton(
                    label = if (canAsk) "Enable Notifications" else "Open Settings",
                    onClick = {
                        if (canAsk) {
                            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            context.startActivity(
                                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                            )
                        }
                    },
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }
            NotificationPreferencesSection(programContext)
            Spacer(Modifier.height(if (staleBanner) 72.dp else 0.dp))
        }
        if (staleBanner) {
            FloatingBanner(
                FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter),
                onRetry = { scope.launch { programContext.inbox.loadPreferences() } },
            )
        }
    }
}

@Composable
private fun StatusCard(enabled: Boolean) {
    val tint = if (enabled) AppOrange else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(modifier = Modifier.size(42.dp).background(tint.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(
                if (enabled) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(18.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(if (enabled) "Enabled" else "Disabled", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                if (enabled) "You'll get alerts for the categories switched on below."
                else "Notifications are off for RaSi Fiters on this phone.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
    }
}

/** "Moved" row: the in-app ask works on Android 13+ until the member has said no twice (no rationale left) — then only
 *  the system settings page can turn notifications on. Below Android 13 there is no runtime ask. */
private fun canAskPermission(context: Context, programContext: ProgramContext): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false
    val activity = context.findActivity() ?: return false
    return programContext.shouldAskNotificationPermission() ||
        ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
```

### Account rows and the "+" sheet

27. **`ui/programs/AccountMenuSheet.kt`**
    - Add `import androidx.compose.material.icons.filled.Inbox`.
    - After `    val username by programContext.memberUsername.collectAsStateWithLifecycle()`, add `    val inboxCounts by programContext.inbox.counts.collectAsStateWithLifecycle()`.
    - After the `ProfileRow(…)` call's closing `)`, insert:
```kotlin

            // notifications 0.6.0 (D-N4): the Inbox row (invites + updates).
            AccountRow(Icons.Filled.Inbox, AppOrange, "Inbox", inboxRowSubtitle(inboxCounts?.badge ?: 0)) { onNavigate(Routes.INBOX) }
```
    - At the end of the file, add:
```kotlin

/** The account menus' Inbox row subtitle (picker sheet + Program tab — one copy). */
fun inboxRowSubtitle(badge: Int): String = if (badge > 0) "$badge new" else "Invites and updates"
```

28. **`ui/program/ProgramAccountSection.kt`**
    - Add `import androidx.compose.material.icons.filled.Inbox` and `import com.app.rasifiters.ui.programs.inboxRowSubtitle`.
    - After `    val appearance by appearanceStore.mode.collectAsStateWithLifecycle()`, add `    val inboxCounts by programContext.inbox.counts.collectAsStateWithLifecycle()`.
    - After the `ProgramProfileRow(…)` call's closing `)`, insert:
```kotlin
        ProgramSettingsRow(
            icon = Icons.Filled.Inbox,
            tint = AppOrange,
            title = "Inbox",
            subtitle = inboxRowSubtitle(inboxCounts?.badge ?: 0),
            onClick = { onNavigate(Routes.INBOX) },
        )
```

29. **★ `ui/programs/ProgramActionsSheet.kt`**
    - (a) Replace the whole import block with:
```kotlin
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.OFFLINE_BANNER_RESERVE
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.inbox.InboxList
import com.app.rasifiters.ui.summary.DatePillField
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
```
    - (b) In the `TAB_CONTENT_HEIGHT` comment, replace `when toggling to My Invites` with `when toggling to Inbox`.
    - (c) Replace the KDoc and the whole `ProgramActionsSheet` function (everything from `/**` above `@OptIn(ExperimentalMaterial3Api::class)` up to, but not including, `@Composable\nprivate fun SegmentedToggle`) with:
```kotlin
/**
 * The "+" actions sheet on the picker — the Android analog of the iOS `ProgramActionsSheet`: a two-tab segmented control
 * over **Inbox** and **Create** (the new-program form). The Inbox tab (notifications 0.6.0, D-N4 — it grew out of "My
 * Invites") is the shared [InboxList]: pending invites first with their actions (`/my-invites`; global admins
 * `/all-invites` + Revoke — A10), the member's own join requests (Cancel Request), then the notification items. Opens on
 * Inbox when the badge is above 0, there is an invite / request, or [openOnInbox] (an `invites` push / toast target), else
 * on Create.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgramActionsSheet(
    programContext: ProgramContext,
    onDismiss: () -> Unit,
    openOnInbox: Boolean = false,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val invitesState by programContext.invites.collectAsStateWithLifecycle()
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val counts by programContext.inbox.counts.collectAsStateWithLifecycle()
    val hasRequests = programs.any { it.myStatus == "requested" }
    var selectedTab by remember {
        mutableIntStateOf(
            if (openOnInbox || (counts?.badge ?: 0) > 0 || invitesState.dataOrNull.orEmpty().isNotEmpty() || hasRequests) 0 else 1,
        )
    }
    LaunchedEffect(openOnInbox) { if (openOnInbox) selectedTab = 0 }
    val online by programContext.isOnline.collectAsStateWithLifecycle()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        // Polish #2 (D-KIT-17): the sheet is its own window, so the root offline banner can't show over it — it carries
        // its own, and the tab area gives up the banner's band (the sheet keeps its height) so nothing sits under it.
        Box(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 16.dp),
            ) {
                SegmentedToggle(left = "Inbox", right = "Create", selectedIndex = selectedTab, onSelect = { selectedTab = it })
                Spacer(Modifier.height(16.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(TAB_CONTENT_HEIGHT)
                        .padding(bottom = if (online) 0.dp else OFFLINE_BANNER_RESERVE),
                ) {
                    when (selectedTab) {
                        0 -> InboxTab(programContext, onDismiss)
                        else -> CreateProgramTab(programContext, onCreated = onDismiss)
                    }
                }
            }
            if (!online) {
                FloatingBanner(FloatingBannerVariant.Offline, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
            }
        }
    }
}

/** The Inbox tab: a title over the shared [InboxList]; an item that leads somewhere closes the sheet first. */
@Composable
private fun InboxTab(programContext: ProgramContext, onDismiss: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Inbox", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Invites and updates",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        InboxList(
            programContext = programContext,
            onOpenItem = { item -> onDismiss(); programContext.inbox.openItem(item) },
            onAccepted = onDismiss,
            modifier = Modifier.fillMaxWidth().weight(1f),
        )
    }
}

```
    - (d) Delete everything from `// ---- Invites tab ----` up to, but not including, `// ---- Create tab ----`. That removes `InvitesTab`, `InvitesEmptyState` and `RequestedRow`. `SegmentedToggle` and `CreateProgramTab` stay byte-identical.

30. **★ `ui/programs/ProgramPickerScreen.kt`**
    - (a) Add `import com.app.rasifiters.ui.people.ActivityVisibilityNotice`.
    - (b) In the KDoc, replace ` * (My Invites / Create)` with ` * (Inbox / Create; the "+" badge = the server inbox badge, notifications 0.6.0)`.
    - (c) Replace `    val inviteInboxRequest by programContext.inviteInboxRequest.collectAsStateWithLifecycle()` with:
```kotlin
    val invitesSheetRequest by programContext.inbox.invitesSheetRequest.collectAsStateWithLifecycle()
    val inboxCounts by programContext.inbox.counts.collectAsStateWithLifecycle()
    val workoutSync by programContext.health.workoutEnabled.collectAsStateWithLifecycle()
```
    - (d) Replace `    var actionsOnInvites by remember { mutableStateOf(false) }` with:
```kotlin
    var actionsOnInbox by remember { mutableStateOf(false) }
    var showActivityNotice by remember { mutableStateOf(false) }
```
    - (e) In `reloadAll()`, after `        launch { programContext.loadInvites() }`, add `        launch { programContext.inbox.refreshCounts() }`.
    - (f) Replace the comment `    // Invite push tap (U2): open the actions sheet on its invites tab, then refresh.` and its `LaunchedEffect(inviteInboxRequest) { … }` block with:
```kotlin
    // notifications 0.6.0: an `invites` push / toast target opens the actions sheet on its Inbox tab, then refreshes.
    LaunchedEffect(invitesSheetRequest) {
        if (!invitesSheetRequest) return@LaunchedEffect
        programContext.inbox.consumeInvitesSheetRequest()
        actionsOnInbox = true; showActions = true
        reloadAll()
    }
    // people D-C12 / U-1 (b): members already syncing Health Connect workouts see the activity notice once after the update.
    LaunchedEffect(workoutSync) {
        if (workoutSync && !programContext.people.activityNoticeSeen(programContext.loggedInMemberId)) showActivityNotice = true
    }
```
    - (g) Replace `    val pendingInvites = (invitesState.dataOrNull?.size ?: 0) + programs.count { it.myStatus == "requested" }` with:
```kotlin
    // D-N4: the server badge (unread except invite items + pending invites — each invite once); requests no longer count
    // (polish #40 badge half). Until the first count arrives: the member's own invite count.
    val inboxBadge = inboxCounts?.badge ?: if (isGlobalAdmin) 0 else invitesState.dataOrNull?.size ?: 0
```
    - (h) Replace `contentDescription = "Create program or view invites",` with `contentDescription = "Create program or open inbox",`, and `badgeCount = pendingInvites,` with `badgeCount = inboxBadge,`.
    - (i) Replace the `ProgramActionsSheet(…)` call with:
```kotlin
        ProgramActionsSheet(
            programContext = programContext,
            onDismiss = { showActions = false; actionsOnInbox = false },
            openOnInbox = actionsOnInbox,
        )
```
    - (j) Directly after the `if (showAccount) { AccountMenuSheet(…) }` block's closing `}`, add:
```kotlin

    if (showActivityNotice) ActivityVisibilityNotice(programContext, onDone = { showActivityNotice = false })
```

### People UI (gate G-P)

31. **NEW `ui/people/ActivityVisibilityNotice.kt`**:
```kotlin
package com.app.rasifiters.ui.people

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch

/** The notice copy — People plan §B verbatim (the same on web and iOS). */
private const val NOTICE_TITLE = "Who can see your activity"
private const val NOTICE_BODY =
    "Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or " +
        "Health Connect. Sleep, diet and steps stay private to you and your program's staff."

/**
 * U-1 (b) — the one-time "Who can see your activity" notice (people D-C12): on the first People open, and once on the
 * program picker for members already syncing Health Connect workouts. [Keep visible] (or closing it) just closes; [Hide my
 * activity] saves the switch (`PUT /members/:id`) — only a confirmed save closes it. Either way it is never shown again for
 * this member on this device once closed.
 */
@Composable
fun ActivityVisibilityNotice(programContext: ProgramContext, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val memberId = programContext.loggedInMemberId

    fun finish() {
        programContext.people.markActivityNoticeSeen(memberId)
        onDone()
    }

    AlertDialog(
        onDismissRequest = { if (!saving) finish() },
        title = { Text(NOTICE_TITLE) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(NOTICE_BODY)
                error?.let { FormErrorText(it) }
            }
        },
        confirmButton = { TextButton(enabled = !saving, onClick = { finish() }) { Text("Keep visible") } },
        dismissButton = {
            TextButton(
                enabled = !saving && memberId != null,
                onClick = {
                    val id = memberId ?: return@TextButton
                    saving = true; error = null
                    scope.launch {
                        programContext.people.setHideActivity(id, true)
                            .onSuccess { finish() }
                            .onFailure { e -> error = e.toAppError().message; saving = false }
                    }
                },
            ) { Text("Hide my activity") }
        },
    )
}
```

32. **NEW `ui/people/PeopleListScreen.kt`**:
```kotlin
package com.app.rasifiters.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.PersonRowDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.program.ProgramSettingsRow
import com.app.rasifiters.ui.summary.DetailTopBar
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d", Locale.US)
private val DAY_YEAR_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

/**
 * People (people 0.1.0 S4; phase-4 D-P1–D-P3, D-P10) — the active program's members, opened from the Members header (every
 * role) and the Program tab's "View Members" (the roster grew into this). "You" first, then A→Z (server order); initials
 * only; each row shows last active (or that the person keeps their activity private) and opens their profile. Program
 * admins / global admins also get "Invite member" here (TC-3). Kit (the Summary recipe): loading → spinner, failed →
 * ErrorView + Retry (offline copy while offline), stale → "Couldn't refresh · Retry", pull to refresh, back online → a
 * failed / stale list reloads. The one-time "Who can see your activity" notice shows on the first open (U-1 b).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PeopleListScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val people = programContext.people
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val state by people.list.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var query by remember { mutableStateOf("") }
    var pulling by remember { mutableStateOf(false) }
    var showNotice by remember { mutableStateOf(!people.activityNoticeSeen(programContext.loggedInMemberId)) }
    val programId = program?.id

    suspend fun reload() { if (programId != null) people.loadList(programId) }
    LaunchedEffect(programId) { reload() }
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = people.list.value
            if (st is UiState.Failed || st is UiState.Stale) reload()
        }
    }

    val current = state
    val data = current.dataOrNull
    val q = query.trim()
    val rows = data?.people.orEmpty().filter {
        q.isEmpty() || it.memberName.contains(q, ignoreCase = true) || it.username.contains(q, ignoreCase = true)
    }
    val staleBanner = online && current is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { reload(); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = if (staleBanner) 96.dp else 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { DetailTopBar(onBack = onBack, centerTitle = "People") }
                item {
                    Text(
                        program?.name.orEmpty(),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (programContext.isProgramAdmin) {
                    item {
                        ProgramSettingsRow(Icons.Filled.PersonAdd, AppOrange, "Invite member", "Send an invite by username") {
                            onNavigate(Routes.MEMBER_INVITE)
                        }
                    }
                }
                item { SearchField(query) { query = it } }
                when {
                    data == null && !online -> item {
                        ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = { scope.launch { reload() } })
                    }
                    data == null && current is UiState.Failed -> item {
                        ErrorView(current.error, onRetry = { scope.launch { reload() } })
                    }
                    data == null -> item {
                        Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = AppOrange)
                        }
                    }
                    rows.isEmpty() -> item {
                        Text(
                            if (q.isEmpty()) "No members yet." else "No one matches your search.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    else -> items(rows, key = { it.memberId }) { person ->
                        PersonRow(person) {
                            if (programId != null) {
                                people.focus(programId, person.memberId)
                                onNavigate(Routes.PERSON_PROFILE)
                            }
                        }
                    }
                }
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { scope.launch { reload() } })
        }
    }

    if (showNotice) ActivityVisibilityNotice(programContext, onDone = { showNotice = false })
}

@Composable
private fun SearchField(query: String, onChange: (String) -> Unit) {
    TextField(
        value = query,
        onValueChange = onChange,
        singleLine = true,
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
        placeholder = { Text("Search people") },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
    )
}

@Composable
private fun PersonRow(person: PersonRowDTO, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PersonInitials(person.initials, 44, accent = person.programRole == "admin")
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                personTitle(person),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                lastActiveText(person.activityVisible, person.lastActive),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                maxLines = 1,
            )
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f))
    }
}

/** "Ava Rivera (You) · Admin" — the name with the viewer / role marker. */
private fun personTitle(p: PersonRowDTO): String = buildString {
    append(p.memberName)
    if (p.isYou) append(" (You)")
    roleLabel(p.programRole)?.let { append(" · ").append(it) }
}

internal fun roleLabel(role: String): String? = when (role) {
    "admin" -> "Admin"
    "logger" -> "Logger"
    else -> null
}

/** Server-computed initials (D-P10, the same letters on all three) in a circle; admins get the orange tint. */
@Composable
internal fun PersonInitials(initials: String, size: Int, accent: Boolean = false) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(if (accent) AppOrange.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials.ifBlank { "?" },
            style = if (size >= 60) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = if (accent) AppOrange else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** "Today" · "Yesterday" · "Oct 12" · "Oct 12, 2025" for a "YYYY-MM-DD" (the device's today); null for none / bad. */
internal fun peopleDay(iso: String?, today: LocalDate = LocalDate.now()): String? {
    val day = iso?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return null
    return when {
        day == today -> "Today"
        day == today.minusDays(1) -> "Yesterday"
        day.year == today.year -> day.format(DAY_FMT)
        else -> day.format(DAY_YEAR_FMT)
    }
}

internal fun lastActiveText(visible: Boolean, lastActive: String?): String {
    if (!visible) return "Activity hidden"
    return when (val day = peopleDay(lastActive)) {
        null -> "No workouts yet"
        "Today" -> "Active today"
        "Yesterday" -> "Active yesterday"
        else -> "Last active $day"
    }
}
```

33. **NEW `ui/people/PersonProfileScreen.kt`**:
```kotlin
package com.app.rasifiters.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppYellow
import com.app.rasifiters.net.KudosDTO
import com.app.rasifiters.net.PersonProfileDTO
import com.app.rasifiters.net.PersonStatsDTO
import com.app.rasifiters.net.PersonWorkoutDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.members.formatDurationHM
import com.app.rasifiters.ui.program.ProgramSettingsRow
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.SummaryCard
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

private const val HIDDEN_LINE = "This member keeps their activity private."

/**
 * A person's profile (people 0.1.0 §C; D-P3, D-P4, D-P11) — workouts only: streaks, active days this month, last active,
 * the last 10 workouts, and kudos (one per day, undoable, a count). Hidden from this viewer → name only + [HIDDEN_LINE].
 * Staff get "Open full stats" (the Members cards); global admins also "Edit membership". Kit: loading → spinner, failed →
 * ErrorView + Retry, stale → "Couldn't refresh · Retry", pull to refresh, reload on reconnect.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonProfileScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val people = programContext.people
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val memberId by people.focusedId.collectAsStateWithLifecycle()
    val state by people.profile.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var pulling by remember { mutableStateOf(false) }
    var kudosBusy by remember { mutableStateOf(false) }
    var kudosError by remember { mutableStateOf<String?>(null) }
    val programId = program?.id

    suspend fun reload() {
        val pid = programId ?: return
        val mid = memberId ?: return
        people.loadProfile(pid, mid)
    }
    LaunchedEffect(programId, memberId) { reload() }
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = people.profile.value
            if (st is UiState.Failed || st is UiState.Stale) reload()
        }
    }

    val current = state
    val profile = current.dataOrNull
    val staleBanner = online && current is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { reload(); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp).padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                DetailTopBar(onBack = onBack, centerTitle = "Profile")
                when {
                    profile != null -> ProfileContent(
                        p = profile,
                        kudosBusy = kudosBusy,
                        kudosError = kudosError,
                        onKudos = {
                            kudosBusy = true; kudosError = null
                            scope.launch {
                                people.toggleKudos().onFailure { kudosError = it.toAppError().message }
                                kudosBusy = false
                            }
                        },
                        onFullStats = {
                            programContext.focusMember(profile.memberId, profile.memberName)
                            onNavigate(Routes.MEMBER_FULL_STATS)
                        },
                        onEditMembership = if (programContext.isGlobalAdmin) ({
                            programContext.focusMember(profile.memberId, profile.memberName)
                            onNavigate(Routes.MEMBER_EDIT)
                        }) else null,
                    )
                    !online -> ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = { scope.launch { reload() } })
                    current is UiState.Failed -> ErrorView(current.error, onRetry = { scope.launch { reload() } })
                    else -> Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = AppOrange)
                    }
                }
                Spacer(Modifier.height(if (staleBanner) 96.dp else 24.dp))
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { scope.launch { reload() } })
        }
    }
}

@Composable
private fun ProfileContent(
    p: PersonProfileDTO,
    kudosBusy: Boolean,
    kudosError: String?,
    onKudos: () -> Unit,
    onFullStats: () -> Unit,
    onEditMembership: (() -> Unit)?,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        PersonInitials(p.initials, 64, accent = p.programRole == "admin")
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(p.memberName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (p.username.isNotBlank()) {
                Text("@${p.username}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(
                listOfNotNull(roleLabel(p.programRole) ?: "Member", "You".takeIf { p.isYou }).joinToString(" · "),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = AppOrange,
            )
        }
    }
    if (!p.activityVisible) {
        SummaryCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Filled.VisibilityOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                Text(HIDDEN_LINE, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            }
        }
    } else {
        p.stats?.let { StatsGrid(it) }
        p.kudos?.let { KudosCard(it, kudosBusy, kudosError, onKudos) }
        p.recentWorkouts?.let { RecentWorkoutsCard(it) }
    }
    if (p.canOpenFullStats) {
        ProgramSettingsRow(Icons.Filled.BarChart, AppOrange, "Open full stats", "History, streaks, workouts and health", onClick = onFullStats)
    }
    onEditMembership?.let {
        ProgramSettingsRow(Icons.Filled.Edit, AppBlue, "Edit membership", "Joined date, active status or remove", onClick = it)
    }
}

private fun days(n: Int): String = if (n == 1) "1 day" else "$n days"

/** 2×2 compact tiles — one-line label over one-line value, so both tiles of a row share a height and fit at 360dp. */
@Composable
private fun StatsGrid(s: PersonStatsDTO) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileStat(Icons.Filled.LocalFireDepartment, AppOrange, "Current streak", days(s.currentStreak), Modifier.weight(1f))
            ProfileStat(Icons.Filled.EmojiEvents, AppYellow, "Longest streak", days(s.longestStreak), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileStat(Icons.Filled.CalendarMonth, AppBlue, "This month", days(s.activeDaysThisMonth), Modifier.weight(1f))
            ProfileStat(Icons.Filled.History, AppGreen, "Last active", peopleDay(s.lastActive) ?: "—", Modifier.weight(1f))
        }
    }
}

@Composable
private fun ProfileStat(icon: ImageVector, tint: Color, label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun KudosCard(kudos: KudosDTO, busy: Boolean, error: String?, onToggle: () -> Unit) {
    SummaryCard {
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.ThumbUp, contentDescription = null, tint = AppOrange, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text("${kudos.count} kudos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (kudos.canGive) KudosButton(kudos.givenToday, busy, onToggle)
            }
            if (kudos.canGive && kudos.givenToday) {
                Text(
                    "You gave kudos today. Tap again to undo.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            error?.let { FormErrorText(it) }
        }
    }
}

@Composable
private fun KudosButton(given: Boolean, busy: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(if (given) AppOrange.copy(alpha = 0.16f) else AppOrange)
            .clickable(enabled = !busy, role = Role.Button, onClick = onClick)
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (busy) {
            CircularProgressIndicator(strokeWidth = 2.dp, color = if (given) AppOrange else Color.Black, modifier = Modifier.size(18.dp))
        } else {
            Text(
                if (given) "Kudos given" else "Give kudos",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = if (given) AppOrange else Color.Black,
            )
        }
    }
}

@Composable
private fun RecentWorkoutsCard(workouts: List<PersonWorkoutDTO>) {
    SummaryCard {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text("Recent workouts", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            if (workouts.isEmpty()) {
                Text("No workouts logged yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            } else {
                workouts.forEach { w ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(w.workoutType, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(peopleDay(w.date) ?: w.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                        Text(formatDurationHM(w.durationMinutes), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
```

34. **NEW `ui/program/HideActivitySection.kt`**:
```kotlin
package com.app.rasifiters.ui.program

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch

/** What "Hide my activity" hides and from whom (people D-C2 / D-C3) — the same sentence on web and iOS. */
private const val HIDE_ACTIVITY_HINT =
    "Hides your workouts, streaks and kudos from other members of your programs. Program admins and loggers still see them."

/**
 * My Profile's "Hide my activity" switch (people 0.1.0, D-P6 / D-P7 — one switch for every program; only the member sets
 * it). [hidden] = the saved value from `GET /members/:id` (null = not loaded / a server without people 0.1.0 → disabled).
 * A change shows at once and goes back if the save fails or isn't confirmed by the server (the kit message under it).
 */
@Composable
fun HideActivitySection(programContext: ProgramContext, hidden: Boolean?, onSaved: (Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val memberId = programContext.loggedInMemberId
    val enabled = hidden != null && memberId != null && !saving

    fun change(next: Boolean) {
        val id = memberId ?: return
        val before = hidden == true
        onSaved(next); saving = true; error = null
        scope.launch {
            programContext.people.setHideActivity(id, next)
                .onSuccess { onSaved(it) }
                .onFailure { e -> onSaved(before); error = e.toAppError().message }
            saving = false
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .toggleable(value = hidden == true, enabled = enabled, role = Role.Switch, onValueChange = { change(it) }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Hide my activity", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    HIDE_ACTIVITY_HINT,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            Spacer(Modifier.width(12.dp))
            Switch(checked = hidden == true, onCheckedChange = null, enabled = enabled)
        }
        error?.let { FormErrorText(it) }
    }
}
```

35. **★ `ui/program/ProfileScreen.kt`**
    - (a) After `    var signOutAllError by remember { mutableStateOf<String?>(null) }`, add:
```kotlin

    // people 0.1.0: "Hide my activity" (null until GET /members/:id answers with it).
    var hideActivity by remember { mutableStateOf<Boolean?>(null) }
```
    - (b) Inside `programContext.fetchMember(id).onSuccess { member ->`, after `            member.gender?.let { gender = it }`, add `            hideActivity = member.hideActivity`.
    - (c) Directly before `            // Email section`, insert:
```kotlin
            // people 0.1.0 (D-P6 / D-P7): the member's one "Hide my activity" switch.
            SectionDivider()
            HideActivitySection(programContext, hidden = hideActivity, onSaved = { hideActivity = it })

```

36. **`ui/health/HealthConnectSettingsScreen.kt`** (People plan §B footnote)
    - (a) Find the workouts `else` branch:
```kotlin
                } else {
                    ConnectButton(Icons.Filled.Favorite, AppRed, "Connect Workouts", "Grant access to read your workouts") {
                        workoutPermissionLauncher.launch(health.workoutPermissions)
                    }
                }
```
      Directly after its closing `}` and before the next `                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)`, insert:
```kotlin
                // people 0.1.0 (D-C12, U-1): synced workouts are program activity — say so where they're connected.
                Text(
                    ACTIVITY_VISIBILITY_FOOTNOTE,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
```
    - (b) After `private const val AUTO_RETRY_TEXT = "Last sync couldn't reach the server — will retry automatically."`, add:
```kotlin
private const val ACTIVITY_VISIBILITY_FOOTNOTE =
    "Synced workouts are visible to members of your programs unless you turn on Hide my activity in My Profile."
```

### Members tab (S5 / polish #32), People entry, full stats

37. **`ui/members/MemberCards.kt`**
    - (a) **Imports**:
      - Delete `import androidx.compose.runtime.LaunchedEffect`, `import androidx.compose.runtime.mutableStateOf`, `import androidx.compose.runtime.remember` and `import androidx.compose.runtime.setValue`.
      - Add `import androidx.compose.ui.unit.Dp`, `import com.app.rasifiters.core.MemberCardKey`, `import com.app.rasifiters.core.MemberCardPart`, `import com.app.rasifiters.core.MemberCardsLoad` and `import com.app.rasifiters.core.kit.AppError`.
    - (b) In the header comment, after `// loaded upstream by the tab; each is a chevron-header drill-down (a NavigationLink push on iOS).`, add `// S5 (polish #32): each card takes a [CardState] — its data, a placeholder, or "—" (never a fake empty / 0-day streak).`
    - (c) Directly after the `EmptyLine` function's closing `}`, insert:
```kotlin

// ---- S5 (polish #32): the cards' load state ----

private const val UNAVAILABLE_TEXT = "—"

/** What a Members card shows: its data, a loading placeholder (its read for THIS member is still running), or "—" (that
 *  read failed and nothing of this member's is held). Never a fake empty / 0-day streak, never another member's values. */
enum class CardState { DATA, PENDING, UNAVAILABLE }

/** A card body that isn't [CardState.DATA]: the placeholder block or "—". */
@Composable
private fun CardStateBody(state: CardState, height: Dp = 90.dp) {
    if (state == CardState.UNAVAILABLE) {
        EmptyLine(UNAVAILABLE_TEXT)
    } else {
        Box(
            modifier = Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
        )
    }
}

/** The five per-member cards (the admin body, a logger / member's own, People "Open full stats"). */
internal val MEMBER_PARTS: Set<MemberCardPart> = setOf(
    MemberCardPart.OVERVIEW, MemberCardPart.HISTORY, MemberCardPart.STREAKS, MemberCardPart.RECENT, MemberCardPart.HEALTH,
)
/** Recent + Health — a logger's View-as re-scopes only these. */
internal val LOGS_PARTS: Set<MemberCardPart> = setOf(MemberCardPart.RECENT, MemberCardPart.HEALTH)

/**
 * One screen's view of its cards (TC-13): [want] = the program + member each card is for; [held] = whose data each shared
 * flow holds (ProgramContext.memberCardsHeld); [load] = the latest read per part (ProgramContext.memberCardsLoad).
 */
internal class MemberCardsView(
    private val want: Map<MemberCardPart, MemberCardKey>,
    private val held: Map<MemberCardPart, MemberCardKey>,
    private val load: MemberCardsLoad,
) {
    private fun hasData(part: MemberCardPart): Boolean = want[part] != null && held[part] == want[part]
    private fun lastFailed(part: MemberCardPart): Boolean =
        want[part] != null && load.keys[part] == want[part] && part in load.failed

    fun stateOf(part: MemberCardPart): CardState = when {
        hasData(part) -> CardState.DATA
        lastFailed(part) -> CardState.UNAVAILABLE
        else -> CardState.PENDING
    }

    /** Something of this program / member is on screen. */
    val anyData: Boolean get() = want.keys.any { hasData(it) }
    /** Every card's read failed and none holds this member's data → the ErrorView. */
    val allFailed: Boolean get() = want.isNotEmpty() && want.keys.all { !hasData(it) && lastFailed(it) }
    /** A refresh failed while data shows → "Couldn't refresh · Retry" (the previous values stay — A13). */
    val stale: Boolean get() = anyData && want.keys.any { lastFailed(it) }
    /** Back online: anything missing or failed reloads. */
    val needsReload: Boolean get() = want.keys.any { !hasData(it) || lastFailed(it) }
    val error: AppError? get() = load.error
}
```
    - (d) **`MemberOverviewCard`**:
      - Change the signature to `fun MemberOverviewCard(programContext: ProgramContext, state: CardState = CardState.DATA) {`.
      - Replace:
```kotlin
            val o = overview
            if (o == null) {
                EmptyLine("No workouts logged yet.")
            } else {
```
        with:
```kotlin
            val o = overview
            if (state != CardState.DATA) {
                CardStateBody(state)
            } else if (o == null) {
                EmptyLine("No workouts logged yet.")
            } else {
```
    - (e) **Replace the whole `MemberMetricsPreviewCard` function** (its `@Composable` through its closing `}`) with:
```kotlin
@Composable
fun MemberMetricsPreviewCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {
    val metrics by programContext.memberMetrics.collectAsStateWithLifecycle()
    val total by programContext.memberMetricsTotal.collectAsStateWithLifecycle()
    // S5: loaded by the tab with the member cards (ProgramContext.loadMemberCards, METRICS) — shown only when it is this
    // program's; else a placeholder, or "—" when the read failed. Never another program's leaderboard.
    val count = if (total > 0) total else metrics.size
    val subtitle = when (state) {
        CardState.DATA -> "$count ${if (count == 1) "member" else "members"}"
        CardState.PENDING -> null
        CardState.UNAVAILABLE -> UNAVAILABLE_TEXT
    }
    DrillCard(onClick = onClick) {
        Column(modifier = Modifier.fillMaxWidth()) {
            CardChevronHeader("Member Performance Metrics", subtitle)
            Spacer(Modifier.height(12.dp))
            val top = metrics.firstOrNull()
            when {
                state != CardState.DATA -> CardStateBody(state)
                top == null -> EmptyLine("No members to display")
                else -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Star, contentDescription = null, tint = AppOrange, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(
                            top.memberName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${top.activeDays}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = AppOrange)
                            Text("Active Days", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    // Icon-less mini tiles here (matches iOS preview) so "Active Days" stays on one line.
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MiniStatTile("Active Days", "${top.activeDays}", Modifier.weight(1f))
                        MiniStatTile("Workouts", "${top.workouts}", Modifier.weight(1f))
                        MiniStatTile("Types", "${top.workoutTypes}", Modifier.weight(1f))
                    }
                }
            }
        }
    }
}
```
    - (f) **`MemberHistoryCard`**:
      - Change the signature to `fun MemberHistoryCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {`.
      - Replace:
```kotlin
            if (buckets.isEmpty()) {
                EmptyLine("No workouts logged yet.")
            } else {
```
        with:
```kotlin
            if (state != CardState.DATA) {
                CardStateBody(state, height = 200.dp)
            } else if (buckets.isEmpty()) {
                EmptyLine("No workouts logged yet.")
            } else {
```
    - (g) **`MemberStreakCard`**:
      - Change the signature to `fun MemberStreakCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {`.
      - Replace:
```kotlin
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StreakTile(Icons.Filled.LocalFireDepartment, AppOrange, "Current", "${streaks?.currentStreakDays ?: 0} days", Modifier.weight(1f))
                StreakTile(Icons.Filled.EmojiEvents, AppYellow, "Longest", "${streaks?.longestStreakDays ?: 0} days", Modifier.weight(1f))
            }
```
        with:
```kotlin
            val s = streaks
            if (state != CardState.DATA || s == null) {
                // S5: not loaded / failed → a placeholder or "—", never a fake 0-day streak.
                CardStateBody(if (state == CardState.DATA) CardState.UNAVAILABLE else state, height = 80.dp)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StreakTile(Icons.Filled.LocalFireDepartment, AppOrange, "Current", "${s.currentStreakDays} days", Modifier.weight(1f))
                    StreakTile(Icons.Filled.EmojiEvents, AppYellow, "Longest", "${s.longestStreakDays} days", Modifier.weight(1f))
                }
            }
```
    - (h) **`MemberRecentCard`**:
      - Change the signature to `fun MemberRecentCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {`.
      - Replace:
```kotlin
            if (recent.isEmpty()) {
                EmptyLine("No workouts logged yet.")
            } else {
```
        with:
```kotlin
            if (state != CardState.DATA) {
                CardStateBody(state)
            } else if (recent.isEmpty()) {
                EmptyLine("No workouts logged yet.")
            } else {
```
    - (i) **`MemberHealthCard`**:
      - Change the signature to `fun MemberHealthCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {`.
      - Replace:
```kotlin
            if (logs.isEmpty()) {
                EmptyLine("No daily health logs yet.")
            } else {
```
        with:
```kotlin
            if (state != CardState.DATA) {
                CardStateBody(state)
            } else if (logs.isEmpty()) {
                EmptyLine("No daily health logs yet.")
            } else {
```

38. **★ `ui/members/MembersScreen.kt`**
    - (a) Replace the whole import block (everything between `package com.app.rasifiters.ui.members` and the first `/**`) with:
```kotlin
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.MemberCardKey
import com.app.rasifiters.core.MemberCardPart
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppOrangeGradientEnd
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
```
    - (b) Replace the region from the `/**` KDoc above `fun MembersScreen(` through the end of `private fun MembersHeader(…) { … }`, stopping just before `/** The circular gradient icon button (iOS `GlassButton`) — the Members header action. */`. Replacement:
```kotlin
/**
 * The Members tab (Tab 2) — the per-member performance dashboard, bifurcated by role (iOS `AdminMembersTab` /
 * `StandardMembersTab`, selected by `isProgramAdmin`). Every role's header button opens People (people 0.1.0, D-P2 a: the
 * roster grew into People; admins invite from People or the Program tab — TC-3). Admins get the metrics preview, a "View
 * as" picker (global-admin "None"; program-admin self) and the 5 member cards; loggers / members their own cards (loggers
 * a logs-only View-as). S5 (polish #32, TC-13) — the Summary recipe on the kit: the reads run together
 * ([ProgramContext.loadMemberCards]) on every entry, pick, pull, Retry and reconnect; a card shows its data only when it
 * is THIS program's / member's ([ProgramContext.memberCardsHeld]) — else a placeholder while it loads, "—" when its read
 * failed; nothing yet → a spinner, or the ErrorView when everything failed / offline; a failed refresh keeps the previous
 * values + "Couldn't refresh · Retry".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MembersScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val viewAsId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    val held by programContext.memberCardsHeld.collectAsStateWithLifecycle()
    val load by programContext.memberCardsLoad.collectAsStateWithLifecycle()
    val programName = program?.name ?: ""
    val view = MemberCardsView(membersWant(programContext, program?.id, viewAsId), held, load)
    var reloadTick by remember { mutableIntStateOf(0) }
    var pulling by remember { mutableStateOf(false) }
    val reload = CardsReload(tick = reloadTick, onSettled = { pulling = false }, onRetry = { reloadTick++ })

    // D-KIT-13: back online → anything missing or failed reloads by itself.
    val currentView by rememberUpdatedState(view)
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect { if (currentView.needsReload) reloadTick++ }
    }
    // Offline is the app-wide banner (AppScaffold, A6); this screen adds only its own "Couldn't refresh".
    val staleBanner = online && view.stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; reloadTick++ },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (programContext.isProgramAdmin) {
                    AdminMembersBody(programContext, programName, view, reload, online, onNavigate)
                } else {
                    StandardMembersBody(programContext, programName, view, reload, online, onNavigate)
                }
                Spacer(Modifier.height(if (staleBanner) 84.dp else 8.dp))
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = reload.onRetry)
        }
    }
}

// ---- Admin / global-admin variant ----

@Composable
private fun AdminMembersBody(
    programContext: ProgramContext,
    programName: String,
    view: MemberCardsView,
    reload: CardsReload,
    online: Boolean,
    onNavigate: (String) -> Unit,
) {
    val isGlobalAdmin = programContext.isGlobalAdmin
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    // Roster + selection live in ProgramContext so the "View as" pick survives a detail push + return.
    val roster by programContext.members.collectAsStateWithLifecycle()
    val selectedId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }

    LaunchedEffect(program?.id) { programContext.ensureMembersLoaded() }

    // The preview + the selected member's five reads, together (#5) — on a new pick, every tab entry, pull, Retry and
    // reconnect (S5). A newer run cancels a slower one (it records nothing).
    LaunchedEffect(program?.id, selectedId, reload.tick) {
        try {
            val id = selectedId
            if (id != null) programContext.focusMember(id, roster.firstOrNull { it.id == id }?.memberName)
            programContext.loadMemberCards(statsId = id, parts = if (id == null) METRICS_PART else ADMIN_PARTS)
        } finally {
            reload.onSettled()
        }
    }

    val selected = roster.firstOrNull { it.id == selectedId }
    val viewAsLabel = selected?.memberName
        ?: if (isGlobalAdmin) "None" else (programContext.loggedInMemberName ?: "Member")

    MembersHeader(subtitle = programName, onPeople = { onNavigate(Routes.MEMBER_ROSTER) })

    if (!view.anyData) {
        MemberCardsEmpty(view, online, reload.onRetry)
        return
    }

    MemberMetricsPreviewCard(programContext, state = view.stateOf(MemberCardPart.METRICS), onClick = { onNavigate(Routes.MEMBER_METRICS) })

    ViewAsSelector(label = viewAsLabel, onClick = { showPicker = true })

    if (selected != null) {
        MemberSectionCards(programContext, selected.id, selected.memberName, view, onNavigate)
    }

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = selectedId,
            showNone = isGlobalAdmin,
            onSelect = { member -> programContext.setMembersViewAs(member?.id); showPicker = false },
            onDismiss = { showPicker = false },
        )
    }
}

// ---- Logger / member variant ----

@Composable
private fun StandardMembersBody(
    programContext: ProgramContext,
    programName: String,
    view: MemberCardsView,
    reload: CardsReload,
    online: Boolean,
    onNavigate: (String) -> Unit,
) {
    val isLogger = programContext.loggedInUserProgramRole == "logger"
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val selfId = programContext.loggedInMemberId
    val selfName = programContext.loggedInMemberName ?: "Member"

    val roster by programContext.members.collectAsStateWithLifecycle()
    val loggerViewAsId by programContext.membersViewAsId.collectAsStateWithLifecycle()
    val overview by programContext.selectedMemberOverview.collectAsStateWithLifecycle()
    var showPicker by remember { mutableStateOf(false) }
    // Recent + Health follow the member they show (a logger's View-as pick, else self).
    val logsKey = if (isLogger) (loggerViewAsId ?: selfId) else selfId

    // Self data — the five reads together (#5); again on a logger's View-as pick, every tab entry, pull, Retry and
    // reconnect (S5). The self metric row IS the overview row (no all-member download, member-analytics D-C10). A newer
    // run cancels a slower one (it records nothing — ProgramContext.loadMemberCards).
    LaunchedEffect(program?.id, logsKey, reload.tick) {
        try {
            programContext.ensureMembersLoaded()
            if (selfId != null) {
                programContext.focusMember(selfId, selfName)
                programContext.loadMemberCards(statsId = selfId, logsId = logsKey ?: selfId, parts = MEMBER_PARTS)
            }
        } finally {
            reload.onSettled()
        }
    }

    MembersHeader(subtitle = programName, onPeople = { onNavigate(Routes.MEMBER_ROSTER) })

    if (!view.anyData) {
        MemberCardsEmpty(view, online, reload.onRetry)
        return
    }

    val overviewState = view.stateOf(MemberCardPart.OVERVIEW)
    MemberOverviewCard(programContext, state = overviewState)
    if (overviewState == CardState.DATA) {
        overview?.takeIf { it.memberId == selfId }?.let { MemberMetricsCard(it, MetricSortField.ACTIVE_DAYS) }
    }
    MemberHistoryCard(programContext, state = view.stateOf(MemberCardPart.HISTORY), onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_HISTORY)
    })
    MemberStreakCard(programContext, state = view.stateOf(MemberCardPart.STREAKS), onClick = {
        programContext.focusMember(selfId, selfName); onNavigate(Routes.MEMBER_STREAKS)
    })

    val logsTarget = if (isLogger) (roster.firstOrNull { it.id == loggerViewAsId }) else null
    val logsId = logsTarget?.id ?: selfId
    val logsName = logsTarget?.memberName ?: selfName

    if (isLogger) {
        ViewAsSelector(label = logsTarget?.memberName ?: selfName, onClick = { showPicker = true })
    }

    MemberRecentCard(programContext, state = view.stateOf(MemberCardPart.RECENT), onClick = {
        programContext.focusMember(logsId, logsName); onNavigate(Routes.MEMBER_WORKOUTS)
    })
    MemberHealthCard(programContext, state = view.stateOf(MemberCardPart.HEALTH), onClick = {
        programContext.focusMember(logsId, logsName); onNavigate(Routes.MEMBER_HEALTH)
    })

    if (showPicker) {
        MemberPickerSheet(
            members = roster,
            selectedId = loggerViewAsId,
            showNone = false,
            onSelect = { member -> programContext.setMembersViewAs(member?.id ?: selfId); showPicker = false },
            onDismiss = { showPicker = false },
        )
    }
}

/** The 5 member cards for [focusId] (the admin body + People "Open full stats"), each in its S5 state. */
@Composable
internal fun MemberSectionCards(
    programContext: ProgramContext,
    focusId: String,
    focusName: String,
    view: MemberCardsView,
    onNavigate: (String) -> Unit,
) {
    MemberOverviewCard(programContext, state = view.stateOf(MemberCardPart.OVERVIEW))
    MemberHistoryCard(programContext, state = view.stateOf(MemberCardPart.HISTORY), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_HISTORY)
    })
    MemberStreakCard(programContext, state = view.stateOf(MemberCardPart.STREAKS), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_STREAKS)
    })
    MemberRecentCard(programContext, state = view.stateOf(MemberCardPart.RECENT), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_WORKOUTS)
    })
    MemberHealthCard(programContext, state = view.stateOf(MemberCardPart.HEALTH), onClick = {
        programContext.focusMember(focusId, focusName); onNavigate(Routes.MEMBER_HEALTH)
    })
}

// ---- Header + glass action button ----

/** The tab header — every role's one action opens People (people 0.1.0, D-P2 a; TC-3). */
@Composable
private fun MembersHeader(subtitle: String, onPeople: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Members", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(
                subtitle,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        GlassIconButton(icon = Icons.Filled.Group, contentDescription = "People", onClick = onPeople)
    }
}

```
    - (c) At the end of the file, add:
```kotlin

// ---- S5 helpers (shared with MemberFullStatsScreen) ----

private val METRICS_PART: Set<MemberCardPart> = setOf(MemberCardPart.METRICS)
private val ADMIN_PARTS: Set<MemberCardPart> = METRICS_PART + MEMBER_PARTS

/** The program + member each card of the Members tab is for (S5): admins — the preview + the View-as member's five;
 *  loggers / members — their own three + Recent / Health for the logger's View-as (else self). */
private fun membersWant(programContext: ProgramContext, programId: String?, viewAsId: String?): Map<MemberCardPart, MemberCardKey> {
    val pid = programId ?: return emptyMap()
    if (programContext.isProgramAdmin) {
        val metrics = mapOf(MemberCardPart.METRICS to MemberCardKey(pid, null))
        return if (viewAsId == null) metrics else metrics + MEMBER_PARTS.associateWith { MemberCardKey(pid, viewAsId) }
    }
    val self = programContext.loggedInMemberId ?: return emptyMap()
    val logs = (if (programContext.loggedInUserProgramRole == "logger") viewAsId else null) ?: self
    return MEMBER_PARTS.associateWith { MemberCardKey(pid, if (it in LOGS_PARTS) logs else self) }
}

/** The tab's reload trigger (pull / Retry / reconnect) handed to the bodies' load effects. */
private class CardsReload(val tick: Int, val onSettled: () -> Unit, val onRetry: () -> Unit)

/** S5: nothing of this program / member to show yet — everything failed or offline → the kit ErrorView + Retry (the
 *  offline copy while offline: never an endless spinner, D-KIT-18), else a spinner. */
@Composable
internal fun MemberCardsEmpty(view: MemberCardsView, online: Boolean, onRetry: () -> Unit) {
    if (view.allFailed || !online) {
        ErrorView(if (!online) AppError(AppErrorKind.OFFLINE) else view.error ?: AppError(AppErrorKind.UNKNOWN), onRetry = onRetry)
    } else {
        MembersSpinner()
    }
}

@Composable
internal fun MembersSpinner() {
    Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = AppOrange)
    }
}
```

39. **★ `ui/members/MemberManagementScreens.kt`**
    - (a) **Imports**:
      - Delete `androidx.compose.material.icons.filled.ChevronRight`, `androidx.compose.material.icons.filled.Search`, `androidx.compose.material3.TextField`, `androidx.compose.material3.TextFieldDefaults`, `androidx.compose.ui.graphics.Color`, `androidx.compose.ui.text.style.TextOverflow` and `com.app.rasifiters.net.MembershipDetailDTO`.
      - Add:
        - `androidx.compose.material3.ExperimentalMaterial3Api`
        - `androidx.compose.material3.pulltorefresh.PullToRefreshBox`
        - `androidx.compose.runtime.mutableIntStateOf`
        - `androidx.compose.runtime.rememberUpdatedState`
        - `com.app.rasifiters.core.MemberCardKey`
        - `com.app.rasifiters.core.kit.AppError`
        - `com.app.rasifiters.core.kit.AppErrorKind`
        - `com.app.rasifiters.ui.components.kit.ErrorView`
        - `com.app.rasifiters.ui.components.kit.FloatingBanner`
        - `com.app.rasifiters.ui.components.kit.FloatingBannerVariant`
        - `kotlinx.coroutines.flow.drop`
        - `kotlinx.coroutines.flow.filter`
    - (b) Replace the header comment's second and third lines (`// Invite (privacy-safe) · roster (searchable; global-admin rows tappable) · editor (global-admin only:` and `// joined-date + active toggle + remove). Faithful to program-member-management §4/§7.`) with:
```kotlin
// Invite (privacy-safe) · editor (global-admin only: joined-date + active toggle + remove) · "Open full stats" (staff,
// from a People profile — people 0.1.0). The roster grew into People (ui/people). Faithful to program-member-management §4/§7.
```
    - (c) Delete everything from `// ---- Roster (View Members) ----` up to, but not including, `// ---- Member editor (global-admin only) ----`. That removes `ProgramMembersListScreen` and `RosterRow`.
    - (d) In `MemberDetailEditScreen`, after `    var confirmRemove by remember { mutableStateOf(false) }`, add:
```kotlin
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<AppError?>(null) }
    // people 0.1.0 (TC-5): opened from a People profile — the roster no longer preloads the membership rows.
    suspend fun loadDetails() {
        loadError = programContext.loadMembershipDetails().exceptionOrNull()?.toAppError()
        loaded = true
    }
    LaunchedEffect(Unit) { loadDetails() }
```
      Then replace:
```kotlin
            if (membership == null) {
                Text("Member not found.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                return@Column
            }
```
      with:
```kotlin
            if (membership == null) {
                val err = loadError
                when {
                    !loaded -> MembersSpinner()
                    err != null -> ErrorView(
                        if (!online) AppError(AppErrorKind.OFFLINE) else err,
                        onRetry = { scope.launch { loadDetails() } },
                    )
                    else -> Text("Member not found.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                return@Column
            }
```
    - (e) Directly before `@Composable\nprivate fun FactRow(`, insert:
```kotlin
// ---- Open full stats (people 0.1.0, D-P11 — staff; reached from a People profile) ----

/** The five Members cards for [ProgramContext.focusedMemberId] (the profile focused that member before the push), on the
 *  S5 recipe (TC-13): the reads together; a card shows only THIS member's data (never the tab's leftovers) — a placeholder
 *  while it loads, "—" when its read failed; nothing yet → spinner / ErrorView (offline copy offline); a failed refresh
 *  keeps the values + "Couldn't refresh · Retry"; pull to refresh; back online → reload. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberFullStatsScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val focusId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val focusName by programContext.focusedMemberName.collectAsStateWithLifecycle()
    val held by programContext.memberCardsHeld.collectAsStateWithLifecycle()
    val load by programContext.memberCardsLoad.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    var reloadTick by remember { mutableIntStateOf(0) }
    var pulling by remember { mutableStateOf(false) }
    val pid = program?.id
    val id = focusId
    val view = MemberCardsView(
        if (pid != null && id != null) MEMBER_PARTS.associateWith { MemberCardKey(pid, id) } else emptyMap(),
        held,
        load,
    )

    LaunchedEffect(pid, id, reloadTick) {
        try {
            if (id != null) programContext.loadMemberCards(statsId = id, parts = MEMBER_PARTS)
        } finally {
            pulling = false
        }
    }
    val currentView by rememberUpdatedState(view)
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect { if (currentView.needsReload) reloadTick++ }
    }
    val staleBanner = online && view.stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; reloadTick++ },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = if (staleBanner) 96.dp else 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                DetailTopBar(onBack = onBack, centerTitle = "Full stats")
                when {
                    id == null -> Text("Member not found.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    !view.anyData -> MemberCardsEmpty(view, online) { reloadTick++ }
                    else -> MemberSectionCards(programContext, id, focusName ?: "Member", view, onNavigate)
                }
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { reloadTick++ })
        }
    }
}

```

## Endgame

40. **Self-checks and compile check** (Claude runs these; Android is CLI compile-only).
    - Run this grep. **Expect no output.**
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master && grep -rn "NotificationDTO\|NotificationModal\|notificationQueue\|inviteInboxRequest\|acknowledgeNotification\|getUnacknowledgedNotifications\|ProgramMembersListScreen\|openOnInvites\|actionsOnInvites\|membersSelfLoadedFor\|_memberCardsFor\|recentlyAcked" apps/android/app/src/main
```
    - Build:
```bash
cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug
```
    - Fix every Kotlin/AGP error and repeat until it builds. If iCloud " 2"/" 3" duplicates show up in build intermediates, run `rm -rf app/build build` and rebuild.
    - Then clean up and report free space: `rm -rf /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/build /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/build && df -h /Users/vinayaksankaranarayanan | tail -1`.
    - There are no emulator or screenshot steps. **All visual and live testing is the USER's**, on a device against prod. The debug build hits prod, so N-SRV with 011 and People S1 with 012 must both be live there first. iOS compile (`bash tools/ios-typecheck.sh` + ⌘B) belongs to the iOS track, not this one.
    - **User device checklist:**
      1. The "+" badge equals the server `badge`, and a pending join request no longer counts.
      2. The sheet opens on **Inbox**: invites first, then Updates. The badge drops after it opens; invites stay counted.
      3. Pull to refresh on the Inbox screen also clears new dots on the next load.
      4. App in the foreground, a role change from another account: a **top toast** appears, View opens that program, and there is no pop-up.
      5. App in the background: the push shows the **monochrome icon** and a tap lands on the right place.
      6. A reminder tap inside a program opens Add workouts. Back or save returns to the **same program**.
      7. Notifications screen: Enable Notifications (Android 13+, denied once), then Open Settings after a second denial.
      8. Toggle all five switches and pick a reminder time. Kill and relaunch: the values persist.
      9. Android Settings lists the **Activity / Reminders / Weekly digest / Announcements** channels.
      10. People flow: Members header → People → "You" first → a profile → kudos and undo. A hidden member shows name only.
      11. Staff: Open full stats, then back to the Members tab. Your own cards show briefly as placeholders, then your data. **Never the other person's.**
      12. Program A loads, then switch to program B with airplane mode on. Members shows the ErrorView (offline). Switch tabs and back: still no A data.
      13. Admin view-as X, then Y with the network failing: Y's cards show "—" and the stale banner, never X's values.
      14. My Profile → Hide my activity. Before S1 is live, it shows an error and does not flip. After S1, another account sees "Activity hidden".
      15. 360dp phone: the profile stat tiles share a height and nothing wraps.

41. **Migration**: none in this track. It consumes `apps/backend/sql/011_notifications_inbox_prefs_scheduler.sql` and `apps/backend/sql/012_people_hide_activity_kudos.sql`, which the USER runs in the server tracks.

42. **git-version**:
    - One **no-bump `feat(android)`** commit (`git add -A -- apps/android`, which also stages the delete).
    - The orchestrator's single docs commit, after web and iOS land, bumps these (tags pushed by name):
      - notifications → **0.7.0** (MINOR)
      - people → **0.2.0** (MINOR, `consumed_by` += android)
      - invites 0.2.1 → **0.3.0** (MINOR)
      - health-connect 0.3.0 → **0.3.1** (PATCH)
      - frontend-kit 0.4.0 → **0.5.0** (MINOR)
    - Docs to update:
      - **`specs/features/frontend-kit/SPEC.md`**:
        - new **D-KIT-20 The notification toast**: copy `<title> · View`, a blank title falls back to `New notification`, top placement below the status bar, max 520, D-KIT-8 chrome, 4 s, newest replaces previous, View marks read + routes, a tap elsewhere or the timeout only hides it, shown only when its category is on, polite live region, explicitly an exception to D-KIT-8's bottom rule, the same on all three;
        - D-KIT-13 adoption list += Members tab (TC-13 recipe), People, Person profile, Inbox, Notifications settings;
        - §10 drops the toast from the open list.
      - **`specs/features/notifications/SPEC.md`**: the Android client section — TC-1 (incl. the race), TC-9 memo, channels, monochrome icon, the launcher-dot divergence, toast → D-KIT-20, TC-6, the C7 rules, and channels created before the container.
      - **`specs/features/people/SPEC.md`**: `consumed_by` += android; S4 notes (TC-3/4/5, the notice, the missing-echo rule).
      - **`specs/features/invites/SPEC.md`**: "My Invites" becomes Inbox; the badge rule; C7.7; the global-admin badge semantics.
      - **`specs/features/health-connect/SPEC.md`**: the footnote and the notifier icon.
      - **Android page SPECs**:
        - bumped: `notifications`, `notifications-alerts`, `program-picker`, `program`, `members` (TC-13), `member-management` (+ full stats, editor self-load), `my-profile`, `health-connect`;
        - **new**: `specs/pages/android/{inbox,people,person-profile}/SPEC.md`, plus rows in `specs/pages/REGISTRY.md`.
      - Record polish **#32** (S5) and the badge half of **#40** as delivered on Android.

## Risks the implementer must watch
- **Gates G-N / G-P come first.** People S1 is being revised. If its approved §B–§F shapes change, `PeopleDtos.kt` follows the approved contract, but only after the orchestrator updates this plan. Never guess.
- **★ files are already committed** (82b7297, quick-wins). Anchor on the quoted text and keep quick-wins' #2/#5/#8 behaviour; the replacement blocks already carry it.
  - `membersSelfLoadedFor` is **deliberately removed**: TC-13's held-key rule replaces it.
- **TC-13 invariant: every new screen that reads the shared member flows must render through `MemberCardsView`.** The flows are `selectedMemberOverview`, `memberHistory`, `memberStreaks`, `memberRecent`, `memberHealthLogs` and `memberMetrics`. The drill-down detail screens are unchanged (polish #10 is out of scope).
  - Known limit: the held key tracks identity only. A detail screen's filtered or re-sorted load is still "this member's", so on return the card may briefly show the filtered rows until the re-entry reload lands. That is the pre-existing #10 behaviour.
- **Cancellation.** `loadMemberCards` records nothing when cancelled (`ensureActive` after `awaitAll`). Never remove that line: the loaders' `runCatching` swallows `CancellationException` into a failure result.
- **A logger's View-as pick now reloads all 5 parts** (3 extra self reads) instead of only Recent/Health. Accepted for simplicity; the self cards keep showing during the reload.
- **Server dependency.** Until N-SRV and S1 are on prod:
  - `/notifications/inbox*` and `/api/people*` return 404;
  - Inbox and People show the kit error;
  - the badge falls back to the member's own invite count;
  - Hide my activity shows an error (no echo).

  Don't ship before both servers are live; the store release is gated on all of Phase 4.
- **`encodeDefaults=false`**: `DeviceRegisterRequest.inbox` is always passed explicitly; `HideActivityRequest` has no default on purpose.
- **Channels before capability.** `App.onCreate` now creates all six channels **before** `AppContainer`. Never move it back.
- **Global-admin badge semantics change** (D-N4): the badge counts their own invites only, while All Invites with Revoke stays in the list. Record this in the invites SPEC.
- **TC-1 race** (accepted, documented): an item arriving between the page GET and `{all:true}` is marked read without a dot.
- **The toast sits under ModalBottomSheet windows** (each sheet is its own window). The item still lands in the Inbox.
- **Parity decisions** TC-1, TC-3, TC-6, TC-10 (D-KIT-20) and TC-13, plus the copy table, must get the same answer on web and iOS.
- **Accepted file-size exceptions.** The brief's file list is exhaustive, so no new files can absorb these:

  | File | Approx. lines |
  |---|---|
  | `ProgramContext.kt` | ~1,530 (pre-existing) |
  | `MemberCards.kt` | ~610 |
  | `MembersScreen.kt` | ~450 |
  | `PersonProfileScreen.kt` | ~330 |
  | `PeopleListScreen.kt` | ~270 |
  | `NotificationInbox.kt` | ~270 |
  | `NotificationsScreen.kt` | ~210 |
  | `InboxList.kt` | ~210 |

  `MemberManagementScreens.kt` stays about the same size (~350).
- **U-1 / U-2 / U-3 outcomes** (TC-7) change only the two notice call sites and two copy strings.
