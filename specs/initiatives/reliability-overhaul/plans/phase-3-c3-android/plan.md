# Phase 3 track C3 — plan

# PLAN: Reliability overhaul Phase 3 client half, Track C3 Android (one bundled release in `apps/android`), revision 2

**Brief accepted**: yes (58 of the briefed files are touched). No file outside the brief is needed. Three briefed files need no edit:
- `ui/members/MemberManagementScreens.kt`: the kit message already arrives through `Result` (D4i).
- `health/HealthSyncNotifier.kt`: the "Synced N" count source doesn't change.
- `ui/health/HealthSyncConfirmationScreen.kt`: it keeps calling `commitXPage`; the review-once logic lives in the controller and runner.

**Feature/version prediction**: Android app 1.0.0 (5) → **1.1.0 (5)** (Q1 is the user's call, H1). The orchestrator applies one bump per feature across C1–C3:

| Feature | Bump | Why |
|---|---|---|
| health-sync | 0.1.0 → 0.2.0 | `consumed_by` [] → [ios, android] |
| observability | 0.2.2 → 0.3.0 | `consumed_by` flip |
| app-config | 0.2.0 → 0.3.0 | gains android |
| frontend-kit | 0.1.0 → 0.2.0 | adoption: 15 s timeout, device cache, blocking update screen |
| health-connect | 0.2.0 → 0.3.0 | D-SUM, D-S1, D-STEPS superseded by v2 |
| notifications | 0.4.0 → 0.5.0 | Android client D-rules |
| invites | 0.2.0 → 0.2.1 | Android as-built note |
| auth | 0.13.0 → 0.13.1 | Android as-built; D-C14a resolved for Android ≥ 1.1.0 (5) |

**Surfaces in scope**: [android] only.

`P` = `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/java/com/app/rasifiters`

### What changed from the previous plan (one line per verdict item)

| # | Change | Steps |
|---|---|---|
| 1 (BLOCKING) | `ProgramActionsSheet(openOnInvites)` plus a `LaunchedEffect`; the picker sets it from the push route. | D11b, D12b |
| 2 (BLOCKING) | `Session.rotateTokens` (compare-and-set, never flips `signedIn`) and `Session.clearIfRefresh`; the refresher uses only these. | B1, B2 |
| 3 (BLOCKING) | The 0-row silent confirm is local only. `review_done` is sent only after a user confirm, or through the persisted `pendingReviewDone` set (rule-9 carry-over plus failed confirm PUTs). The per-run push of local confirms is removed. | C2, C6, C7 |
| 4 | Expiry = `receivedAt + (exp − iat)`. A newer stored token is reused unconditionally. | B1, B2 |
| 5 | Token writes use `commit()`. | B1 |
| 6, 13a | The registration and the "permission asked" flag persist in a new `rasi.push` prefs file, excluded from backup. | A12, A13, D1 |
| 7 | Automatic triggers run at least 60 s apart. | C8 |
| 8 | Checklist item 6 reworded. | checklist |
| 9 | The invite-response message isn't shown, matching iOS (`InvitesTabView.swift:191`). Called out as a D-rule. | D11d, Docs |
| 10 | Manifest FCM comment updated; extra Docs lines added. | A14, Docs |
| 11 | Runner split (≤ ~200 lines); D4h imports listed; Sync Now is judged per flow. | C5, C7, C8, C11, D4 |
| 12 | Summary pull-to-refresh reloads at once; the sync runs on the app scope and reloads again if it applied anything. | F3, F5 |
| 13b | A foreground FCM invite reloads the inbox. | D4, D5 |

### Open questions resolved
Q1 is the user's decision. Each Android-only answer becomes a D-rule in Docs.

| Q | Resolution |
|---|---|
| 1 | Proposed versionName **1.1.0**, versionCode **5** (unused; RELEASES.md needs ≥ 5). |
| 2 | Plain Play Store intent (`market://` with an https fallback). No new dependency. |
| 3 | "Sign out everywhere" in My Profile → Sign-in methods, under the Password row and above Delete Account, behind a confirm dialog. Shown for every role. Copy in B12. |
| 4 | Offline and stale banners on the picker and Summary only. The update-available banner on the picker only. |
| 5 | A foreground FCM message posts to the tray only while the SSE stream is not connected; while connected, the in-app modal shows it. |
| 6 | My Invites only (no all-invites or revoke). The tab is labeled "My Invites" for every role. |
| 7 | Yes, minimal: ask for POST_NOTIFICATIONS once, right after the first sign-in (flag in the no-backup `rasi.push`). Register only while notifications are enabled; unregister when they are turned off. `NotificationsScreen` is the settings fallback (unchanged). |
| 8 | Keep the per-member local Health toggles across sign-out (the store is namespaced per member). |
| 9 | Yes: pull-to-refresh on the picker and Summary. |
| 10 | No new page SPEC. The update screen is documented in program-picker (A-8) and widgets. |

### Cross-cutting rules for the implementer
- **Read the error body once.** `errorBody()` can only be read once, so convert first with `.recoverCatching { throw it.asApiError() }`, then use `.onFailure {}` for events and messages.
- **No defaults for sent values.** `Network.json` has `encodeDefaults=false`. Never give a DTO field a default equal to the value you send; pass it explicitly.
- **No ViewModels, no rebuilt screens** (board §6.8). State stays in `ProgramContext`.
- **No restyle.** Banners float, and Android keeps its neutral M3 roles.

---

## Steps — android

### A. Transport and events foundation (checkpoint A)

1. **NEW `P/net/ClientHeaders.kt`**
```kotlin
package com.app.rasifiters.net

import com.app.rasifiters.BuildConfig
import okhttp3.Interceptor
import okhttp3.Response
import java.util.UUID

/** observability §4.1 identity headers + a fresh X-Request-Id, on EVERY OkHttp client (main, refresh, SSE).
 *  app-config D-C5 keys on X-App-Version, so a client without it would be 426'd once the switch is on. */
class ClientHeadersInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val builder = request.newBuilder()
            .header("X-App-Platform", "android")
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-App-Build", BuildConfig.VERSION_CODE.toString())
        if (request.header(REQUEST_ID) == null) builder.header(REQUEST_ID, UUID.randomUUID().toString())
        return chain.proceed(builder.build())
    }

    companion object { const val REQUEST_ID = "X-Request-Id" }
}
```

2. **NEW `P/net/PlatformDtos.kt`** (all `@Serializable`, package `com.app.rasifiters.net`):
   - `AppConfigResponse(@SerialName("min_android_version_code") val minAndroidVersionCode: Int? = null, @SerialName("latest_android_version_code") val latestAndroidVersionCode: Int? = null)`
   - `ClientEvent(val id: String, val type: String, @SerialName("occurred_at") val occurredAt: String, @SerialName("request_id") val requestId: String? = null, val props: JsonObject = JsonObject(emptyMap()))`
   - `ClientEventBatch(val events: List<ClientEvent>)`
   - `ClientEventsResponse(val accepted: Int = 0, val dropped: Int = 0)`
   - `PendingInviteDTO` (invites §3.1):
     - `@SerialName` snake_case `inviteId: String`, `programId: String`;
     - then `programName`, `programStatus`, `programStartDate`, `programEndDate`, `invitedByName`, `invitedAt`, `expiresAt`, all `String? = null`.
   - `InviteResponseRequest(@SerialName("invite_id") val inviteId: String, val action: String, @SerialName("block_future") val blockFuture: Boolean? = null)`

3. **NEW `P/net/HealthSyncDtos.kt`** (health-sync §3.2–3.4; `@Serializable`):
   - `HealthSyncItemDTO`:
     - `kind: String`;
     - optional, all `= null`: `@SerialName("program_id") programId: String?`, `date: String?`, `@SerialName("sample_id") sampleId: String?`, `origin: String?`, `@SerialName("workout_name") workoutName: String?`, `value: JsonPrimitive?`, `@SerialName("start_at") startAt: String?`, `@SerialName("end_at") endAt: String?`, `deleted: Boolean?`, `legacy: Boolean?`.
   - `HealthSyncBatchRequest(val integration: String, val items: List<HealthSyncItemDTO>)`
   - `HealthSyncItemResult(val index: Int, val status: String, val error: String? = null)`
   - `HealthSyncBatchResponse(val integration: String? = null, val results: List<HealthSyncItemResult> = emptyList())`
   - `HealthSyncStateRow(val integration: String, @SerialName("program_id") val programId: String, val kind: String, @SerialName("review_done_at") val reviewDoneAt: String? = null, @SerialName("last_success_at") val lastSuccessAt: String? = null)`
   - `HealthSyncStateResponse(@SerialName("server_time") val serverTime: String? = null, val states: List<HealthSyncStateRow> = emptyList())`
   - `HealthSyncStateEntry(@SerialName("program_id") val programId: String, val kind: String, @SerialName("review_done") val reviewDone: Boolean? = null, @SerialName("sync_success") val syncSuccess: Boolean? = null)`
   - `HealthSyncStatePut(val integration: String, val entries: List<HealthSyncStateEntry>)`

4. **`P/net/Dtos.kt`**: in `ErrorBody`, add `val code: String? = null`.

5. **`P/net/ApiException.kt`**: replace the body below the imports. Add `import com.app.rasifiters.core.kit.AppError`.
```kotlin
class ApiException(
    val status: Int,
    override val message: String,
    val rowErrors: List<BulkRowError>? = null,
    val code: String? = null,
    val retryAfter: Int? = null,
    /** The response's X-Request-Id (else the one we sent) — quoted by client events (observability §8, D-KIT-5). */
    val requestId: String? = null,
) : Exception(message)

private val errorJson = Json { ignoreUnknownKeys = true }

fun HttpException.toApiException(): ApiException {
    val resp = response()
    val raw = try { resp?.errorBody()?.string() } catch (_: Exception) { null }
    val parsed = raw?.let { try { errorJson.decodeFromString<ErrorBody>(it) } catch (_: Exception) { null } }
    return ApiException(
        status = code(),
        message = parsed?.error ?: parsed?.message ?: "Request failed (${code()})",
        rowErrors = parsed?.rowErrors,
        code = parsed?.code,
        retryAfter = AppError.parseRetryAfter(resp?.headers()?.get("Retry-After")),
        requestId = resp?.headers()?.get(ClientHeadersInterceptor.REQUEST_ID)
            ?: resp?.raw()?.request?.header(ClientHeadersInterceptor.REQUEST_ID),
    )
}
```

6. **`P/core/kit/AppError.kt`**
   - Replace the `is ApiException ->` and `is HttpException ->` branches of `toAppError()` (:101-106) with:
```kotlin
    is AppErrorException -> error
    is ApiException -> AppError.fromHttp(status, code = code, retryAfterSeconds = retryAfter, serverMessage = message, rowErrors = rowErrors)
    is HttpException -> toApiException().toAppError()
```
   - Append to the file:
```kotlin
/** Carries an already-mapped [AppError] through a `Result`; its message is the kit copy (or invalidInput server text). */
class AppErrorException(val error: AppError) : Exception(error.message)

/** observability §8 `kind` for auth.* events (a 401 on a sign-in route = wrong_credentials). */
fun AppError.eventKind(): String = when (kind) {
    AppErrorKind.OFFLINE -> "offline"
    AppErrorKind.TIMEOUT -> "timeout"
    AppErrorKind.SIGNED_OUT -> "wrong_credentials"
    AppErrorKind.INVALID_INPUT -> "invalid_input"
    AppErrorKind.CONFLICT -> "conflict"
    AppErrorKind.UNAVAILABLE -> "unavailable"
    AppErrorKind.SERVER -> "server"
    else -> "unknown"
}

/** observability §8.1 `error_class` (frontend-kit kind names). */
fun AppError.errorClass(): String = when (kind) {
    AppErrorKind.OFFLINE -> "offline"
    AppErrorKind.TIMEOUT -> "timeout"
    AppErrorKind.SIGNED_OUT -> "signedOut"
    AppErrorKind.UNAVAILABLE -> "unavailable"
    AppErrorKind.SERVER -> "server"
    AppErrorKind.INVALID_INPUT -> "invalidInput"
    AppErrorKind.UPDATE_REQUIRED -> "updateRequired"
    else -> "unknown"
}
```

7. **`P/net/ApiService.kt`**: add these endpoints (all additive; import the new DTOs).
```kotlin
    @POST("auth/logout-all")
    suspend fun logoutAll(): MessageResponse

    @GET("program-memberships/my-invites")
    suspend fun getMyInvites(): List<PendingInviteDTO>

    @PUT("program-memberships/invite-response")
    suspend fun respondToInvite(@Body body: InviteResponseRequest): MessageResponse

    @GET("app-config")
    suspend fun getAppConfig(): AppConfigResponse

    @POST("client-events")
    suspend fun postClientEvents(@Body body: ClientEventBatch): Response<ClientEventsResponse>

    @POST("health-sync/batch")
    suspend fun healthSyncBatch(@Body body: HealthSyncBatchRequest): HealthSyncBatchResponse

    @GET("health-sync/state")
    suspend fun getHealthSyncState(): HealthSyncStateResponse

    @PUT("health-sync/state")
    suspend fun putHealthSyncState(@Body body: HealthSyncStatePut): HealthSyncStateResponse
```

8. **NEW `P/core/events/ClientEventQueue.kt`**
```kotlin
package com.app.rasifiters.core.events

import android.content.Context
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.eventKind
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.ClientEvent
import com.app.rasifiters.net.ClientEventBatch
import com.app.rasifiters.net.Network
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException

/**
 * observability §8 sender: a persisted queue (noBackupFilesDir — never backed up, survives sign-out) posted to
 * POST /api/client-events in batches of ≤ 25 with the current Bearer when one exists (the route never 401s). Ids are
 * client UUIDs kept across retries. 429 → wait Retry-After · 413 → halve (a single event that still 413s is dropped) ·
 * 400 → drop · 5xx / network → exponential backoff (30 s … 15 min). Thread-safe enqueue (called from OkHttp threads too).
 */
class ClientEventQueue(context: Context, private val api: ApiService, private val scope: CoroutineScope) {
    private val file = File(context.applicationContext.noBackupFilesDir, "client_events.json")
    private val serializer = ListSerializer(ClientEvent.serializer())
    private val lock = Any()
    private var cache: MutableList<ClientEvent>? = null
    private val flushMutex = Mutex()
    @Volatile private var nextAttemptAtMs = 0L
    private var failures = 0
    private var flushJob: Job? = null

    fun enqueue(type: String, props: JsonObject = JsonObject(emptyMap()), requestId: String? = null) {
        val event = ClientEvent(UUID.randomUUID().toString(), type, Instant.now().toString(), requestId, props)
        scope.launch {
            withContext(Dispatchers.IO) { mutate { list -> list += event; while (list.size > MAX_QUEUED) list.removeAt(0) } }
            flushSoon()
        }
    }

    /** Debounced (2 s); called after enqueue and on every foreground. */
    fun flushSoon() {
        if (flushJob?.isActive == true) return
        flushJob = scope.launch { delay(FLUSH_DELAY_MS); flush() }
    }

    private suspend fun flush() = flushMutex.withLock {
        var batchSize = MAX_BATCH
        while (System.currentTimeMillis() >= nextAttemptAtMs) {
            val batch = withContext(Dispatchers.IO) { snapshot().take(batchSize) }
            if (batch.isEmpty()) return@withLock
            val response = try {
                api.postClientEvents(ClientEventBatch(batch))
            } catch (e: CancellationException) { throw e } catch (_: Exception) { backOff(); return@withLock }
            when (response.code()) {
                in 200..299, 400 -> { withContext(Dispatchers.IO) { remove(batch) }; failures = 0; batchSize = MAX_BATCH }
                413 -> { if (batch.size == 1) withContext(Dispatchers.IO) { remove(batch) } else { batchSize = maxOf(1, batch.size / 2) } }
                429 -> {
                    val wait = AppError.parseRetryAfter(response.headers()["Retry-After"]) ?: 60
                    nextAttemptAtMs = System.currentTimeMillis() + wait * 1000L
                    return@withLock
                }
                else -> { backOff(); return@withLock }
            }
        }
    }

    private fun backOff() {
        failures++
        nextAttemptAtMs = System.currentTimeMillis() + minOf(30_000L shl (failures - 1).coerceAtMost(5), 900_000L)
    }

    private fun snapshot(): List<ClientEvent> = synchronized(lock) { loaded().toList() }
    private fun remove(sent: List<ClientEvent>) { val ids = sent.map { it.id }.toSet(); mutate { list -> list.removeAll { it.id in ids } } }
    private fun mutate(block: (MutableList<ClientEvent>) -> Unit) = synchronized(lock) { val list = loaded(); block(list); persist(list) }
    private fun loaded(): MutableList<ClientEvent> = cache
        ?: (runCatching { Network.json.decodeFromString(serializer, file.readText()) }.getOrNull()?.toMutableList() ?: mutableListOf())
            .also { cache = it }
    private fun persist(list: List<ClientEvent>) { runCatching { file.writeText(Network.json.encodeToString(serializer, list)) } }

    private companion object {
        const val MAX_BATCH = 25
        const val MAX_QUEUED = 200
        const val FLUSH_DELAY_MS = 2_000L
    }
}

/** auth.sign_in_failed — [error] is the already-mapped failure (ApiException / IOException). */
fun ClientEventQueue.signInFailed(method: String, error: Throwable) {
    if (error is CancellationException) return
    val app = error.toAppError()
    enqueue("auth.sign_in_failed", buildJsonObject {
        put("method", method); put("kind", app.eventKind())
        app.status?.let { put("status", it) }; app.code?.let { put("code", it.take(64)) }
    }, requestId = (error as? ApiException)?.requestId)
}

fun ClientEventQueue.signInProviderFailed(method: String, sdkCode: String) =
    enqueue("auth.sign_in_failed", buildJsonObject { put("method", method); put("kind", "provider"); put("code", sdkCode.take(64)) })

fun ClientEventQueue.forcedSignOut(reason: String, status: Int? = null, code: String? = null) =
    enqueue("auth.forced_sign_out", buildJsonObject { put("reason", reason); status?.let { put("status", it) }; code?.let { put("code", it) } })

fun ClientEventQueue.refreshFailed(kind: String, status: Int?, code: String?) =
    enqueue("auth.refresh_failed", buildJsonObject { put("kind", kind); status?.let { put("status", it) }; code?.let { put("code", it.take(64)) } })
```

9. **`P/net/Network.kt`** (checkpoint A only; B3 rewrites the file):
   - In `build()`, add `.addInterceptor(ClientHeadersInterceptor())` as the first interceptor.
   - In `AuthAuthenticator`, replace `OkHttpClient()` (:75) with `OkHttpClient.Builder().addInterceptor(ClientHeadersInterceptor()).build()`.

10. **`P/net/NotificationStreamClient.kt`** (:26-30): add `.addInterceptor(ClientHeadersInterceptor())` to the builder. D3 rewrites the file.

11. **`P/core/AppContainer.kt`**:
    - Add `val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)` above `session`.
    - Add `val events = ClientEventQueue(context.applicationContext, api, appScope)` after `api`.

12. **NEW `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/res/xml/backup_rules.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Auto Backup (API ≤ 30): the token store, Health Connect sync state and the push registration never leave the device
     (auth §3.1 / health-sync §8 rule 7 / notifications §3.1). install_id, the event queue and the launch cache live in
     noBackupFilesDir (excluded by the platform). -->
<full-backup-content>
    <exclude domain="sharedpref" path="rasi.fiters.session.xml" />
    <exclude domain="sharedpref" path="rasi.health.xml" />
    <exclude domain="sharedpref" path="rasi.push.xml" />
</full-backup-content>
```

13. **NEW `.../res/xml/data_extraction_rules.xml`**
```xml
<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="sharedpref" path="rasi.fiters.session.xml" />
        <exclude domain="sharedpref" path="rasi.health.xml" />
        <exclude domain="sharedpref" path="rasi.push.xml" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="sharedpref" path="rasi.fiters.session.xml" />
        <exclude domain="sharedpref" path="rasi.health.xml" />
        <exclude domain="sharedpref" path="rasi.push.xml" />
    </device-transfer>
</data-extraction-rules>
```

14. **`.../AndroidManifest.xml`**
    - Root tag: add `xmlns:tools="http://schemas.android.com/tools"`.
    - `<application>` (:24-32): add `android:fullBackupContent="@xml/backup_rules"`, `android:dataExtractionRules="@xml/data_extraction_rules"` and `tools:targetApi="31"`.
    - Replace the FCM service comment (:77-78) with `<!-- FCM push — onNewToken → push/DeviceRegistry; a foreground message is posted (rasi_invites / rasi_default) only while the in-app SSE stream is disconnected; background ones are shown by the system tray. A tap acknowledges + routes (MainActivity). -->`.

15. Compile: `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug`.

### B. Sessions (auth §3.1; board §2) (checkpoint B)

1. **`P/core/Session.kt`**: replace the class (imports: `android.util.Log`, `kotlinx.coroutines.flow.*`).
```kotlin
class Session(context: Context) {
    /** [receivedAtMs] = device time the pair was stored (0 = written by 1.0.0) — expiry is lifetime-based (clock-skew safe). */
    data class Tokens(val access: String, val refresh: String, val receivedAtMs: Long)

    /** True when the encrypted store could not be opened/read at launch and was reset → auth.forced_sign_out token_store_unreadable. */
    var recoveredFromUnreadableStore: Boolean = false
        private set

    /** null only if the Keystore stays unusable after a reset — the session then lives in memory for this process. */
    private val prefs: SharedPreferences? = openStore(context.applicationContext)

    private val _tokens = MutableStateFlow(readTokens())
    /** THE token store (board §2 client rule 1) — OkHttp, SSE and the gate all read this; no other copy exists. */
    val tokens: StateFlow<Tokens?> = _tokens.asStateFlow()

    private val _signedIn = MutableStateFlow(_tokens.value != null)
    /** Drives the root gate; flips only on sign-in ([saveTokens]) and sign-out ([clear]) — NEVER on a refresh. */
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    val accessToken: String? get() = _tokens.value?.access
    val refreshToken: String? get() = _tokens.value?.refresh
    val memberId: String? get() = prefs?.getString(KEY_MEMBER_ID, null)
    val globalRole: String? get() = prefs?.getString(KEY_GLOBAL_ROLE, null)
    val username: String? get() = prefs?.getString(KEY_USERNAME, null)
    val memberName: String? get() = prefs?.getString(KEY_MEMBER_NAME, null)

    /** Sign-in only. */
    @Synchronized
    fun saveTokens(access: String, refresh: String) {
        val t = Tokens(access, refresh, System.currentTimeMillis())
        write(t)
        _tokens.value = t
        _signedIn.value = true
    }

    /** Refresh rotation — compare-and-set on the refresh token the call used. false = the session changed while the call
     *  was in flight (signed out / another sign-in): nothing is written, so a late refresh can never resurrect a session. */
    @Synchronized
    fun rotateTokens(expectedRefresh: String, access: String, refresh: String): Boolean {
        if (_tokens.value?.refresh != expectedRefresh) return false
        val t = Tokens(access, refresh, System.currentTimeMillis())
        write(t)
        _tokens.value = t
        return true
    }

    /** `401 session_invalid` for [expectedRefresh] — clears only if that is still the stored session. */
    @Synchronized
    fun clearIfRefresh(expectedRefresh: String): Boolean {
        if (_tokens.value?.refresh != expectedRefresh) return false
        clear()
        return true
    }

    fun saveIdentity(memberId: String?, username: String?, memberName: String?, globalRole: String?) {
        prefs?.edit()?.putString(KEY_MEMBER_ID, memberId)?.putString(KEY_USERNAME, username)
            ?.putString(KEY_MEMBER_NAME, memberName)?.putString(KEY_GLOBAL_ROLE, globalRole)?.commit()
    }

    @Synchronized
    fun clear() {
        prefs?.edit()?.clear()?.commit()
        _tokens.value = null
        _signedIn.value = false
    }

    /** Board §2 rule 4: a rotated refresh token must be durable before use (commit, status checked). */
    private fun write(t: Tokens) {
        val ok = prefs?.edit()?.putString(KEY_ACCESS, t.access)?.putString(KEY_REFRESH, t.refresh)
            ?.putLong(KEY_RECEIVED_AT, t.receivedAtMs)?.commit()
        if (ok == false) Log.w(TAG, "token write failed")
    }

    private fun readTokens(): Tokens? = try {
        val a = prefs?.getString(KEY_ACCESS, null); val r = prefs?.getString(KEY_REFRESH, null)
        if (a.isNullOrEmpty() || r.isNullOrEmpty()) null else Tokens(a, r, prefs?.getLong(KEY_RECEIVED_AT, 0L) ?: 0L)
    } catch (e: Exception) {
        recoveredFromUnreadableStore = true
        runCatching { prefs?.edit()?.clear()?.commit() }
        null
    }

    private fun openStore(context: Context): SharedPreferences? = try {
        create(context)
    } catch (e: Exception) {
        Log.w(TAG, "token store unreadable — resetting", e)
        recoveredFromUnreadableStore = true
        context.deleteSharedPreferences(FILE)
        try { create(context) } catch (e2: Exception) { Log.e(TAG, "token store unavailable — in-memory session", e2); null }
    }

    private fun create(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        return EncryptedSharedPreferences.create(
            context, FILE, masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private companion object {
        const val TAG = "RaSiSession"
        const val FILE = "rasi.fiters.session"
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
        const val KEY_RECEIVED_AT = "tokens_received_at"
        const val KEY_MEMBER_ID = "member_id"
        const val KEY_GLOBAL_ROLE = "global_role"
        const val KEY_USERNAME = "username"
        const val KEY_MEMBER_NAME = "member_name"
    }
}
```
   Keep `recoveredFromUnreadableStore` declared ABOVE `prefs`; the init order depends on it.

2. **NEW `P/net/TokenRefresher.kt`**
```kotlin
package com.app.rasifiters.net

import android.util.Base64
import com.app.rasifiters.core.Session
import com.app.rasifiters.core.kit.AppError
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.io.InterruptedIOException

/** Refresh couldn't complete for infrastructure reasons — the session is KEPT (auth §3.1 rule 3). frontend-kit → unavailable. */
class AuthUnavailableException(val retryAfterSeconds: Int?) : IOException("Authentication service temporarily unavailable")

/**
 * The ONE refresh path (board §2 client rules 1–3), shared by the request interceptor, the 401 authenticator and SSE:
 * single-flight; proactive when the access token expires within 60 s (lifetime-based: receivedAt + (exp − iat), so a
 * wrong device clock can't loop); one quick retry inside 5 s, then backoff (5 → 60 s) with no network refresh;
 * sign-out ONLY on `401 session_invalid`. Writes go through Session's compare-and-set, so a refresh that lands after a
 * sign-out is discarded. Blocking — call from OkHttp / IO threads only.
 */
class TokenRefresher(
    baseUrl: String,
    private val session: Session,
    private val client: OkHttpClient,
    private val onRefreshFailed: (kind: String, status: Int?, code: String?) -> Unit,
    private val onSessionInvalid: () -> Unit,
) {
    sealed interface Outcome {
        data class Refreshed(val accessToken: String) : Outcome
        data object SessionInvalid : Outcome
        data class Unavailable(val retryAfterSeconds: Int?) : Outcome
        data object NoSession : Outcome
    }

    private sealed interface Attempt {
        data class Ok(val access: String, val refresh: String) : Attempt
        data object Invalid : Attempt
        data class Transient(val kind: String, val status: Int?, val code: String?, val retryAfter: Int?) : Attempt
    }

    private val refreshUrl = (if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/") + "auth/refresh"
    private val lock = Any()
    private var consecutiveFailures = 0
    private var blockedUntilMs = 0L
    @Volatile private var claimsCache: Pair<String, LongArray?>? = null

    /** The token to attach: refreshed first when it expires within 60 s. Throws when it is already expired and the
     *  refresh is unavailable; null when signed out. */
    @Throws(AuthUnavailableException::class)
    fun tokenForRequest(): String? {
        val current = session.tokens.value ?: return null
        if (!expiresWithin(current, PROACTIVE_WINDOW_S)) return current.access
        return when (val outcome = refresh(failedToken = current.access)) {
            is Outcome.Refreshed -> outcome.accessToken
            is Outcome.Unavailable -> if (expiresWithin(current, 0)) throw AuthUnavailableException(outcome.retryAfterSeconds) else current.access
            Outcome.SessionInvalid, Outcome.NoSession -> null
        }
    }

    /** Single-flight. [failedToken] = the access token the caller used; if the store already holds a different one, it
     *  is returned as-is (no clock test). */
    fun refresh(failedToken: String?): Outcome = synchronized(lock) {
        val current = session.tokens.value ?: return Outcome.NoSession
        if (current.access != failedToken) return Outcome.Refreshed(current.access)
        val now = System.currentTimeMillis()
        if (now < blockedUntilMs) return Outcome.Unavailable(((blockedUntilMs - now + 999) / 1000).toInt())

        var attempt = call(current.refresh)
        if (attempt is Attempt.Transient) {
            try {
                Thread.sleep((attempt.retryAfter ?: QUICK_RETRY_S).coerceIn(1, QUICK_RETRY_MAX_S) * 1000L)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt(); return Outcome.Unavailable(null)
            }
            attempt = call(current.refresh)
        }
        when (attempt) {
            is Attempt.Ok -> {
                consecutiveFailures = 0; blockedUntilMs = 0L
                if (session.rotateTokens(current.refresh, attempt.access, attempt.refresh)) Outcome.Refreshed(attempt.access)
                else Outcome.NoSession   // signed out / re-signed-in meanwhile → never resurrect
            }
            Attempt.Invalid -> {
                consecutiveFailures = 0; blockedUntilMs = 0L
                if (session.clearIfRefresh(current.refresh)) onSessionInvalid()
                Outcome.SessionInvalid
            }
            is Attempt.Transient -> {
                consecutiveFailures++
                blockedUntilMs = System.currentTimeMillis() + backoffMs(consecutiveFailures)
                onRefreshFailed(attempt.kind, attempt.status, attempt.code)
                Outcome.Unavailable(attempt.retryAfter)
            }
        }
    }

    /** Lifetime-based when iat + receivedAt are known; else exp vs the device clock (1.0.0-written tokens). */
    fun expiresWithin(tokens: Session.Tokens, seconds: Long): Boolean {
        val c = claims(tokens.access) ?: return false
        val exp = c[0]; val iat = c[1]
        if (exp <= 0) return false
        val expiresAtMs = if (iat in 1 until exp && tokens.receivedAtMs > 0) tokens.receivedAtMs + (exp - iat) * 1000 else exp * 1000
        return expiresAtMs - System.currentTimeMillis() <= seconds * 1000
    }

    private fun call(refreshToken: String): Attempt {
        val body = Network.json.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken)).toRequestBody(JSON)
        val request = Request.Builder().url(refreshUrl).post(body).build()
        return try {
            client.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (resp.isSuccessful) {
                    runCatching { Network.json.decodeFromString(TokenRefreshResponse.serializer(), text) }
                        .map<TokenRefreshResponse, Attempt> { Attempt.Ok(it.token, it.refreshToken) }
                        .getOrElse { Attempt.Transient("unknown", resp.code, null, null) }
                } else {
                    val code = runCatching { Network.json.decodeFromString(ErrorBody.serializer(), text).code }.getOrNull()
                    if (resp.code == 401 && code == SESSION_INVALID) Attempt.Invalid
                    else Attempt.Transient(kindFor(resp.code), resp.code, code, AppError.parseRetryAfter(resp.header("Retry-After")))
                }
            }
        } catch (_: InterruptedIOException) {
            Attempt.Transient("timeout", null, null, null)
        } catch (_: IOException) {
            Attempt.Transient("offline", null, null, null)
        }
    }

    private fun kindFor(status: Int) = when {
        status == 408 -> "timeout"
        status == 429 || status == 503 -> "unavailable"
        status >= 500 -> "server"
        status == 400 || status == 422 -> "invalid_input"
        else -> "unknown"
    }

    /** [exp, iat] (0 = absent); one-entry cache keyed by the token string. */
    private fun claims(token: String): LongArray? {
        claimsCache?.let { (t, c) -> if (t == token) return c }
        val parsed = try {
            val payload = token.split('.').getOrNull(1)
            payload?.let {
                val obj = Network.json.parseToJsonElement(
                    String(Base64.decode(it, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP), Charsets.UTF_8)
                ).jsonObject
                longArrayOf(obj["exp"]?.jsonPrimitive?.longOrNull ?: 0L, obj["iat"]?.jsonPrimitive?.longOrNull ?: 0L)
            }
        } catch (_: Exception) { null }
        claimsCache = token to parsed
        return parsed
    }

    private companion object {
        const val PROACTIVE_WINDOW_S = 60L
        const val QUICK_RETRY_S = 2
        const val QUICK_RETRY_MAX_S = 4
        const val SESSION_INVALID = "session_invalid"
        val JSON = "application/json".toMediaType()
        fun backoffMs(failures: Int): Long = minOf(5_000L shl (failures - 1).coerceIn(0, 4), 60_000L)
    }
}
```

3. **`P/net/Network.kt`**: rewrite the file. Imports: `okhttp3.RequestBody`, `okio.BufferedSink`, `java.util.concurrent.TimeUnit`, plus the existing ones.
```kotlin
object Network {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    private const val REQUEST_TIMEOUT_S = 15L   // frontend-kit adoption: requests time out at 15 s
    private const val REFRESH_TIMEOUT_S = 10L

    /** Main client. Order: identity headers → one-shot bodies → bearer (proactive refresh) → 426 gate → logging; 401 → [AuthAuthenticator]. */
    fun build(baseUrl: String, session: Session, refresher: TokenRefresher, onUpgradeRequired: () -> Unit): ApiService {
        val client = OkHttpClient.Builder()
            .connectTimeout(REQUEST_TIMEOUT_S, TimeUnit.SECONDS)
            .readTimeout(REQUEST_TIMEOUT_S, TimeUnit.SECONDS)
            .writeTimeout(REQUEST_TIMEOUT_S, TimeUnit.SECONDS)
            .addInterceptor(ClientHeadersInterceptor())
            .addInterceptor(OneShotBodyInterceptor())
            .addInterceptor(AuthHeaderInterceptor(session, refresher))
            .addInterceptor(UpgradeRequiredInterceptor(onUpgradeRequired))
            .authenticator(AuthAuthenticator(refresher))
            .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            .build()
        return Retrofit.Builder().baseUrl(normalizeBase(baseUrl)).client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(ApiService::class.java)
    }

    /** The refresh call's own client — no auth layer (no loops), still the §4.1 headers. */
    fun refreshClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(REFRESH_TIMEOUT_S, TimeUnit.SECONDS).readTimeout(REFRESH_TIMEOUT_S, TimeUnit.SECONDS)
        .writeTimeout(REFRESH_TIMEOUT_S, TimeUnit.SECONDS)
        .addInterceptor(ClientHeadersInterceptor()).build()

    /** SSE client: no read timeout (server pings every 25 s), §4.1 headers. */
    fun streamClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(REQUEST_TIMEOUT_S, TimeUnit.SECONDS).readTimeout(0, TimeUnit.SECONDS)
        .addInterceptor(ClientHeadersInterceptor()).build()

    private fun normalizeBase(base: String) = if (base.endsWith("/")) base else "$base/"
}

/** Paths that must never trigger a refresh (no loops; logout / unregister / events work without a valid login). */
private val NO_REFRESH_SUFFIXES = listOf(
    "/auth/refresh", "/auth/logout", "/auth/login/app", "/auth/oauth", "/auth/oauth/complete",
    "/auth/register", "/auth/forgot-password", "/notifications/device/unregister", "/client-events", "/app-config",
)
private fun String.isNoRefreshPath() = NO_REFRESH_SUFFIXES.any { endsWith(it) }

internal const val ONE_SHOT_HEADER = "X-One-Shot"

/** auth §3.1 rule 6: requests tagged X-One-Shot (password writes) get a one-shot body → OkHttp never re-sends them. */
private class OneShotBodyInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header(ONE_SHOT_HEADER) == null) return chain.proceed(request)
        val stripped = request.newBuilder().removeHeader(ONE_SHOT_HEADER)
        val body = request.body ?: return chain.proceed(stripped.build())
        val oneShot = object : RequestBody() {
            override fun contentType() = body.contentType()
            override fun contentLength() = body.contentLength()
            override fun writeTo(sink: BufferedSink) = body.writeTo(sink)
            override fun isOneShot() = true
        }
        return chain.proceed(stripped.method(request.method, oneShot).build())
    }
}

/** Bearer from the ONE store, refreshed first when it expires within 60 s (skipped for no-refresh paths). */
private class AuthHeaderInterceptor(private val session: Session, private val refresher: TokenRefresher) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("Authorization") != null) return chain.proceed(request)
        val token = if (request.url.encodedPath.isNoRefreshPath()) session.accessToken else refresher.tokenForRequest()
        token ?: return chain.proceed(request)
        return chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
    }
}

/** app-config D-C5: any 426 opens the blocking update screen. */
private class UpgradeRequiredInterceptor(private val onUpgradeRequired: () -> Unit) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response =
        chain.proceed(chain.request()).also { if (it.code == 426) onUpgradeRequired() }
}

/** 401 → one single-flight refresh + one retry. Unavailable → AuthUnavailableException (session kept); session_invalid → null (signed out). */
private class AuthAuthenticator(private val refresher: TokenRefresher) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.isNoRefreshPath()) return null
        if (response.priorResponse != null) return null
        val failed = response.request.header("Authorization")?.removePrefix("Bearer ") ?: return null
        return when (val outcome = refresher.refresh(failedToken = failed)) {
            is TokenRefresher.Outcome.Refreshed -> response.request.newBuilder().header("Authorization", "Bearer ${outcome.accessToken}").build()
            is TokenRefresher.Outcome.Unavailable -> throw AuthUnavailableException(outcome.retryAfterSeconds)
            else -> null
        }
    }
}
```

4. **`P/core/kit/AppError.kt`**
   - In `toAppError()`, add `is AuthUnavailableException -> AppError(AppErrorKind.UNAVAILABLE, retryAfterSeconds = retryAfterSeconds)` before `is InterruptedIOException`.
   - Append:
```kotlin
private val CREDENTIAL_TEXT_STATUSES = setOf(400, 401, 409, 422)

/** Credential screens (frontend-kit §4 scope rule): the server's own text for 400/401/409/422, the kit copy otherwise. */
fun Throwable.toCredentialMessage(): String {
    val app = toAppError()
    val api = this as? ApiException ?: return app.message
    val text = api.message.trim()
    return if (api.status in CREDENTIAL_TEXT_STATUSES && text.isNotEmpty() && !text.startsWith("Request failed (")) text else app.message
}

/** auth §3.1 rule 6: the password write may have landed (timeout / dropped connection / 408 / 5xx). */
fun Throwable.isUnconfirmedWrite(): Boolean = when (this) {
    is AuthUnavailableException, is java.net.UnknownHostException, is java.net.ConnectException -> false
    is IOException -> true
    is ApiException -> status == 408 || status >= 500
    else -> false
}

/** auth §3.1 rule 6: a manual retry answered "must be different" proves the first attempt landed. */
fun Throwable.isSamePasswordRejection(): Boolean =
    this is ApiException && status == 400 && message.contains("must be different", ignoreCase = true)
```

5. **`P/net/Dtos.kt`**
   - `LoginRequest`: add `val platform: String? = null`.
   - `OAuthRequest`: add `val platform: String? = null`.
   - `DeviceUnregisterRequest` → `data class DeviceUnregisterRequest(@SerialName("push_token") val pushToken: String? = null, @SerialName("device_id") val deviceId: String? = null)`, KDoc "POST /notifications/device/unregister — no login (notifications §3.1)".

6. **`P/net/ApiService.kt`**
   - `logout` → `suspend fun logout(@Header("Authorization") bearer: String?, @Body body: LogoutRequest): MessageResponse`.
   - Add `@Headers("X-One-Shot: 1")` above `changePassword` and `setPassword`.
   - Replace the `@HTTP(method = "DELETE", path = "notifications/device"…) unregisterDevice` with `@POST("notifications/device/unregister") suspend fun unregisterDevice(@Body body: DeviceUnregisterRequest): MessageResponse`.

7. **`P/core/AppContainer.kt`**: rewrite the body. The lambdas dereference `events` and `programContext` only when a real refresh fires, which is after construction.
```kotlin
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val session: Session = Session(appContext)
    val appearanceStore: AppearanceStore = AppearanceStore(appContext)
    val refresher = TokenRefresher(
        BuildConfig.API_BASE_URL, session, Network.refreshClient(),
        onRefreshFailed = { kind, status, code -> events.refreshFailed(kind, status, code) },
        onSessionInvalid = { programContext.onSessionInvalid() },
    )
    val api: ApiService = Network.build(BuildConfig.API_BASE_URL, session, refresher, onUpgradeRequired = {})
    val events = ClientEventQueue(appContext, api, appScope)
    val programContext: ProgramContext = ProgramContext(api, session, BuildConfig.API_BASE_URL, appContext, refresher, events)

    init { if (session.recoveredFromUnreadableStore) events.forcedSignOut("token_store_unreadable") }
}
```

8. **`P/core/ProgramContext.kt`** (thin edits)
   - **8a. Constructor.** Add `private val refresher: TokenRefresher, private val events: ClientEventQueue`. Add a file-level `private const val PLATFORM = "android"` next to `PUSH_TAG`.
   - **8b. Gate.** Replace :104-106 (`_authToken` / `authToken`) with `/** Root gate (auth §3.1 — the ONE store's sign-in state). */ val isSignedIn: StateFlow<Boolean> = session.signedIn`.
   - **8c. `login`** (:173-176):
```kotlin
    suspend fun login(identifier: String, password: String): Result<Unit> = runCatching {
        val resp = api.loginApp(LoginRequest(identifier = identifier, password = password, pushToken = lastRegisteredPushToken, platform = PLATFORM))
        applyLoginSession(resp.token, resp.refreshToken, resp.memberId, resp.username, resp.memberName, resp.globalRole)
    }.recoverCatching { throw it.asApiError() }.onFailure { events.signInFailed("password", it) }
```
   - **8d. `applyLoginSession`** (:188-190): swap the order to `session.saveIdentity(...)` then `session.saveTokens(...)`. Identity must be stored before the gate flips. Delete `_authToken.value = token`.
   - **8e. `socialSignIn`.** Add `platform = PLATFORM` to `OAuthRequest`. Change the tail to `.recoverCatching { throw it.asApiError() }.onFailure { events.signInFailed("google", it) }`.
   - **8f. `completeSocial`.** Same tail, with `"google"`.
   - **8g. `healIdentityIfNeeded`.** `if (!session.signedIn.value) return`.
   - **8h. Replace `signOut()` + `onAuthFailure()` (:326-340):**
```kotlin
    /** The user's own sign-out (auth §3.1 rule 1): revoke THIS device, then the full teardown. */
    fun signOut() { scope.launch { tearDown(revoke = true) } }

    /** TokenRefresher saw `401 session_invalid` for the stored session (tokens already cleared) — forced teardown. */
    fun onSessionInvalid() { scope.launch { tearDown(revoke = false, forcedReason = "refresh_session_invalid") } }

    /** POST /auth/logout-all (account settings). 200 → every session ended → teardown. */
    suspend fun logoutAll(): Result<Unit> {
        val result = runCatching { api.logoutAll(); Unit }.recoverCatching { throw AppErrorException(it.toAppError()) }
        if (result.isSuccess) tearDown(revoke = false)
        return result
    }

    /** ONE teardown for every sign-out path (board §2 client rule 5): state + tokens cleared at once (the gate flips),
     *  then best-effort revoke / unregister in the background with the captured credentials. */
    private suspend fun tearDown(revoke: Boolean, forcedReason: String? = null) {
        val access = session.accessToken
        val refresh = session.refreshToken
        val pushToken = lastRegisteredPushToken
        clearSession()
        if (forcedReason != null) events.forcedSignOut(forcedReason, status = 401, code = "session_invalid")
        pushToken?.let { t -> scope.launch { runCatching { api.unregisterDevice(DeviceUnregisterRequest(pushToken = t)) } } }
        if (revoke && (access != null || refresh != null)) {
            scope.launch { runCatching { api.logout(access?.let { "Bearer $it" }, LogoutRequest(refresh)) } }
        }
    }
```
   - **8i. `deleteAccount`** (:1167-1170):
```kotlin
    suspend fun deleteAccount(): Result<Unit> {
        val result = runCatching { api.deleteAccount(); Unit }.recoverCatching { throw it.asApiError() }
        if (result.isSuccess) tearDown(revoke = false)
        return result
    }
```
   - **8j. `clearSession`** (:1217): delete `_authToken.value = null`.
   - **8k.** Every other `session.accessToken.isNullOrEmpty()` guard in the file → `!session.signedIn.value`.

9. **`P/health/HealthSyncController.kt`** (compile fix only; C rewrites it):
   - Replace each `val token = programContext.authToken.value?.takeIf { it.isNotEmpty() } ?: return HealthSyncResult.Skipped` (:200, :306, :396) with `if (!programContext.isSignedIn.value) return HealthSyncResult.Skipped`, and delete the `token.let {}` lines.
   - Replace `programContext.authToken.value?.takeIf { it.isNotEmpty() } ?: return false` (:563, :597, :625) with `if (!programContext.isSignedIn.value) return false`.

10. **`P/ui/RootScreen.kt`**
    - `val token by programContext.authToken…` → `val signedIn by programContext.isSignedIn.collectAsStateWithLifecycle()`.
    - `LaunchedEffect(token) { if (token != null)` → `LaunchedEffect(signedIn) { if (signedIn)`.
    - In `DisposableEffect(lifecycleOwner, token)`, `token` and `&& token != null` → `signedIn`.
    - `if (token == null)` → `if (!signedIn)`.

11. **`P/ui/auth/LoginScreen.kt`** (:90 and the Google `onFailure` at :118): `errorMessage = it.toCredentialMessage()`.

12. **`P/ui/program/ProfileScreen.kt`**
    - **12a.** In the email-change `onFailure` (:238), link/unlink `onFailure` (:281) and set-password (:328): use `it.toCredentialMessage()`.
    - **12b. Set-password rule 6.** Add `var pwUnconfirmed by remember { mutableStateOf(false) }`, then replace the set-password `.onFailure`:
```kotlin
.onFailure { e ->
    when {
        pwUnconfirmed && e.isSamePasswordRejection() -> {
            programContext.listIdentities().onSuccess { identities = it.identities; hasPassword = it.hasPassword }
            showPwForm = false; newPassword = ""; pwUnconfirmed = false
        }
        e.isUnconfirmedWrite() -> { pwUnconfirmed = true; linkError = PASSWORD_UNCONFIRMED }
        else -> linkError = e.toCredentialMessage()
    }
}
```
    - **12c. Sign out everywhere row.** Add `var showSignOutAll by remember { mutableStateOf(false) }`, `var signingOutAll by remember { mutableStateOf(false) }` and `var signOutAllError by remember { mutableStateOf<String?>(null) }`. Insert directly after `linkError?.let { FormErrorText(it) }` (:337), before the Delete Account block:
```kotlin
// Sign out everywhere (auth §3.1 — POST /auth/logout-all). Every role.
Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.SpaceBetween) {
    Column(modifier = Modifier.weight(1f)) {
        Text("Sign out everywhere", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        Text("End your session on all devices, including this one.", style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    }
    TextButton(enabled = !signingOutAll, onClick = { signOutAllError = null; showSignOutAll = true }) {
        Text("Sign out", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
    }
}
signOutAllError?.let { FormErrorText(it) }
```
    - **12d. Confirm dialog,** next to the delete dialog:
```kotlin
if (showSignOutAll) {
    AlertDialog(
        onDismissRequest = { showSignOutAll = false },
        title = { Text("Sign out everywhere?") },
        text = { Text("You'll be signed out on all your devices, including this one.") },
        confirmButton = {
            TextButton(onClick = {
                showSignOutAll = false; signingOutAll = true
                scope.launch {
                    programContext.logoutAll().onFailure { signOutAllError = it.message; signingOutAll = false }
                    // Success: the teardown flips the gate to the auth graph.
                }
            }) { Text("Sign out everywhere", color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = { showSignOutAll = false }) { Text("Cancel") } },
    )
}
```

13. **`P/ui/program/ChangePasswordScreen.kt`** (rule 6)
    - Add above the composable: `internal const val PASSWORD_UNCONFIRMED = "We couldn't confirm the change. It may have gone through, so try your new password the next time you sign in."`
    - Add `var unconfirmed by remember { mutableStateOf(false) }`.
    - Replace `.onFailure` (:95):
```kotlin
.onFailure { e ->
    when {
        unconfirmed && e.isSamePasswordRejection() -> { unconfirmed = false; showSuccess = true }
        e.isUnconfirmedWrite() -> { unconfirmed = true; errorMessage = PASSWORD_UNCONFIRMED }
        else -> errorMessage = e.toCredentialMessage()
    }
}
```
    `ProgramContext.changePassword` / `setAccountPassword` stay single-call; the one-shot header blocks OkHttp replays.

14. Compile checkpoint B.

### C. Health Connect sync v2 (health-sync §8 rules 1–11) (checkpoint C)

1. **`P/health/HealthDates.kt`**
   - Replace both `LocalDate.ofInstant(...)` calls with `….atZone(ZoneId.systemDefault()).toLocalDate()`, because `ofInstant` needs API 31.
   - Add:
```kotlin
    const val CATCH_UP_CAP_DAYS = 30L
    const val FIRST_SYNC_DAYS = 14L
    /** Exclusions older than the widest re-read window can never come back. */
    const val EXCLUSION_KEEP_DAYS = 31L

    fun localDate(epochMillis: Long): LocalDate = Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toLocalDate()
    fun startOfDay(date: LocalDate): Instant = date.atStartOfDay(ZoneId.systemDefault()).toInstant()

    /** health-sync §8 rule 4: max(start of the local day of lastSuccess − 1 day, today − 30 days); null → [firstSync] (also capped). */
    fun catchUpStart(lastSuccess: Instant?, firstSync: LocalDate, today: LocalDate = LocalDate.now()): LocalDate {
        val cap = today.minusDays(CATCH_UP_CAP_DAYS)
        val start = lastSuccess?.atZone(ZoneId.systemDefault())?.toLocalDate()?.minusDays(1) ?: firstSync
        return maxOf(start, cap)
    }
```

2. **`P/health/HealthStore.kt`**: rewrite with per-member namespacing.
   - **Constructor and key helpers.**
     - `class HealthStore(context: Context, private val memberId: () -> String?)`, same prefs file `rasi.health`.
     - `private fun key(name: String): String? = memberId()?.let { "m.$it.$name" }`.
     - Typed helpers: `bool/putBool`, `long/putLong`, `int/putInt`, `set/putSet`, `string/putString` (null → remove), `remove(name)`.
     - With no member, reads return the default and writes are no-ops.
   - **Flow enum:** `enum class Flow(val prefix: String, val kind: String) { WORKOUTS("hc", "workout"), SLEEP("hc.sleep", "sleep"), STEPS("hc.steps", "steps") }`.
   - **Existing properties:** keep every property name and key suffix exactly, routed through the helpers (`hc.enabled`, `hc.syncProgramIds`, `hc.lastSyncMillis`, … `hc.steps.connectMillis`, `hc.changesToken`).
   - **New properties:**
     - `v2Initialized` (`hc.v2.initialized`);
     - `upgradeMarker` (`hc.v2.upgradeMarker`);
     - `pendingReviewDone: Set<String>` (`hc.v2.pendingReviewDone`), with KDoc "review_done entries (`<programId>|<kind>`) not yet accepted by PUT /state: the rule-9 carry-over plus user confirms whose PUT failed".
   - **Kept functions:** `confirmedProgramIds`, `markProgramConfirmed`, `clearConfirmedPrograms`, `excludedKeys`, `addExcludedKeys`, `clearExcludedKeys`.
   - **Replaced:** the two prune functions become `fun pruneExcludedKeys(flow: Flow, keepDays: Long)` (date = `substringAfterLast('|')`, cutoff = `HealthDates.localYMD(now - keepDays * DAY_MS)`).
   - **Removed:** `ledgerIsApplied`, `ledgerMarkApplied`, `ledgerPrune`, `ledgerClear`.
   - **Add:**
```kotlin
    fun addPendingReviewDone(programId: String, flow: Flow) { pendingReviewDone = pendingReviewDone + "$programId|${flow.kind}" }

    data class LedgerEntry(val key: String, val sampleId: String, val programId: String, val date: String)

    /** The old build's `hc.ledger|<uuid>|<programId>` → date entries (rule 9) — read + retired only. */
    fun ledgerEntries(): List<LedgerEntry> {
        val prefix = key("hc.ledger|") ?: return emptyList()
        return prefs.all.mapNotNull { (k, v) ->
            if (!k.startsWith(prefix) || v !is String) return@mapNotNull null
            val parts = k.removePrefix(prefix).split('|')
            if (parts.size != 2) null else LedgerEntry(k, parts[0], parts[1], v)
        }
    }

    fun ledgerRemove(fullKey: String) = prefs.edit { remove(fullKey) }

    /** One-shot (W4 §8): move the old build's un-namespaced keys under [memberId] — the member signed in at upgrade,
     *  else the first one to sign in afterwards. */
    fun adoptLegacyKeys(memberId: String) {
        if (prefs.getBoolean(ADOPTED, false)) return
        val legacy = prefs.all.filterKeys { !it.startsWith("m.") && it != ADOPTED }
        prefs.edit {
            legacy.forEach { (k, v) ->
                val nk = "m.$memberId.$k"
                when (v) {
                    is Boolean -> putBoolean(nk, v); is Long -> putLong(nk, v); is Int -> putInt(nk, v)
                    is Float -> putFloat(nk, v); is String -> putString(nk, v)
                    is Set<*> -> putStringSet(nk, v.filterIsInstance<String>().toSet())
                }
                remove(k)
            }
            putBoolean(ADOPTED, true)
        }
    }
```
   - Companion: `DAY_MS = 86_400_000L`, `ADOPTED = "v2.legacyAdopted"`.

3. **`P/health/HealthModels.kt`**
   - Replace `WorkoutSample`:
```kotlin
data class WorkoutSample(val uuid: String, val minutes: Double, val startAt: Instant, val endAt: Instant, val origin: String) {
    /** health-sync §3.2 `value`: max(1, round(seconds / 60)) per sample. */
    val wholeMinutes: Int get() = maxOf(1, minutes.roundToInt())
    companion object {
        fun of(r: ExerciseSessionRecord) = WorkoutSample(
            r.metadata.id, Duration.between(r.startTime, r.endTime).seconds / 60.0, r.startTime, r.endTime, r.metadata.dataOrigin.packageName,
        )
    }
}
```
   - Add:
```kotlin
/** One batch item + what its result feeds locally. programId null = a deletion; legacyKey = the old-ledger key it retires. */
data class PlannedItem(val dto: HealthSyncItemDTO, val flow: HealthStore.Flow, val programId: String?, val legacyKey: String? = null)

/** Per-kind result counts for sync.run (observability §8.1); `created` also feeds the sleep/steps "Synced N" count. */
class KindCounts {
    var sent = 0; var applied = 0; var created = 0; var unchanged = 0; var duplicate = 0
    var skipped = 0; var removed = 0; var invalid = 0
    fun add(status: String) {
        sent++
        when (status) {
            "created" -> { applied++; created++ }
            "updated" -> applied++
            "unchanged" -> unchanged++
            "duplicate", "recorded" -> duplicate++
            "removed" -> removed++
            "not_found" -> Unit
            "invalid" -> invalid++
            else -> if (status.startsWith("skipped")) skipped++
        }
    }
}

fun HealthStore.Flow.confirmationFlow(): PendingSyncConfirmation.Flow = when (this) {
    HealthStore.Flow.WORKOUTS -> PendingSyncConfirmation.Flow.WORKOUTS
    HealthStore.Flow.SLEEP -> PendingSyncConfirmation.Flow.SLEEP
    HealthStore.Flow.STEPS -> PendingSyncConfirmation.Flow.STEPS
}
```

4. **`P/health/HealthConnectManager.kt`**
   - `aggregate()` builds samples with `WorkoutSample.of(record)`.
   - Remove `sleepRecentDays`, `stepsRecentDays`, `fetchNewWorkouts` and the old `readWorkoutsSince(client, connectMillis)`.
   - Import `androidx.health.connect.client.changes.DeletionChange`.
   - Add or replace:
```kotlin
    fun permissionsFor(flow: HealthStore.Flow): Set<String> = when (flow) {
        HealthStore.Flow.WORKOUTS -> workoutPermissions; HealthStore.Flow.SLEEP -> sleepPermissions; HealthStore.Flow.STEPS -> stepsPermissions
    }

    /** readFrom != null → a window read (no / expired token). The caller commits newToken only when the run may advance (rule 5). */
    data class WorkoutFetch(val upserts: List<ExerciseSessionRecord>, val deletedIds: Set<String>, val newToken: String?, val readFrom: Instant?)

    /** Changes since [savedToken] (upserts + DeletionChange ids, every page). No / expired token → mint a fresh token FIRST,
     *  then read every session since [fallbackStart] (paged) — health-sync §8 rule 4. */
    suspend fun fetchWorkouts(savedToken: String?, fallbackStart: Instant): WorkoutFetch {
        val client = clientOrNull() ?: return WorkoutFetch(emptyList(), emptySet(), savedToken, null)
        if (savedToken != null) {
            var token: String = savedToken
            val upserts = LinkedHashMap<String, ExerciseSessionRecord>()
            val deleted = LinkedHashSet<String>()
            while (true) {
                val response = client.getChanges(token)
                if (response.changesTokenExpired) return fullRead(client, fallbackStart)
                response.changes.forEach { change ->
                    when (change) {
                        is UpsertionChange -> (change.record as? ExerciseSessionRecord)?.let { upserts[it.metadata.id] = it; deleted.remove(it.metadata.id) }
                        is DeletionChange -> { deleted += change.recordId; upserts.remove(change.recordId) }
                    }
                }
                token = response.nextChangesToken
                if (!response.hasMore) break
            }
            return WorkoutFetch(upserts.values.toList(), deleted, token, null)
        }
        return fullRead(client, fallbackStart)
    }

    private suspend fun fullRead(client: HealthConnectClient, start: Instant): WorkoutFetch {
        val token = client.getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))
        return WorkoutFetch(readWorkoutsSince(start), emptySet(), token, start)
    }

    /** Every session starting at/after [start] — all pages. */
    suspend fun readWorkoutsSince(start: Instant): List<ExerciseSessionRecord> {
        val client = clientOrNull() ?: return emptyList()
        val out = mutableListOf<ExerciseSessionRecord>(); var page: String? = null
        do {
            val response = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.after(start), pageToken = page))
            out += response.records; page = response.pageToken
        } while (page != null)
        return out
    }

    suspend fun fetchSleepSamples(start: Instant): List<SleepSessionRecord> {
        val client = clientOrNull() ?: return emptyList()
        val out = mutableListOf<SleepSessionRecord>(); var page: String? = null
        val now = Instant.now()
        do {
            val response = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, now), pageToken = page))
            out += response.records; page = response.pageToken
        } while (page != null)
        return out
    }
```
   - `fetchStepsDailyTotals()` → `fetchStepsDailyTotals(startDate: LocalDate)`; the window becomes `TimeRangeFilter.between(startDate.atStartOfDay(), LocalDateTime.now())` and the rest is unchanged.
   - Every read throws on failure; the runner catches.

5. **NEW `P/health/HealthSyncItems.kt`**: planning, server state and windows. Package `com.app.rasifiters.health`. Imports:
   - `com.app.rasifiters.core.ProgramContext`
   - `com.app.rasifiters.net.{HealthSyncItemDTO, HealthSyncStateRow}`
   - `androidx.health.connect.client.records.ExerciseSessionRecord`
   - `kotlinx.serialization.json.JsonPrimitive`
   - `java.time.{Instant, LocalDate}`, `java.time.temporal.ChronoUnit`
```kotlin
/** Item planning (health-sync §8 rules 3–4, 6): one item per sample (workouts) or day (sleep/steps) × eligible program
 *  (in-window D-S5, not excluded D-CONF, not admin-locked D-LOCK). Confirmed programs → upload; unconfirmed → a review page. */
internal object HealthSyncItems {
    const val INTEGRATION = "health_connect"

    data class PlanContext(
        val flow: HealthStore.Flow, val eligible: Set<String>, val lockHeld: Boolean,
        val windows: Map<String, Pair<String, String>>, val excluded: Set<String>, val confirmed: Set<String>,
    )

    data class FlowPlan(
        val upload: List<PlannedItem>,
        val reviewRows: Map<String, List<PendingSyncConfirmation.Row>>,
        val uploadPrograms: Set<String>,
        val lockHeld: Boolean,
    )

    data class FlowRead(val plan: FlowPlan, val workoutToken: String?, val catchUpDays: Long)

    /** GET /state rows, read per (program, kind). */
    class ServerState(rows: List<HealthSyncStateRow>) {
        private val reviewed = rows.filter { it.reviewDoneAt != null }.map { "${it.programId}|${it.kind}" }.toSet()
        private val lastSuccess = rows.filter { it.integration == INTEGRATION && it.lastSuccessAt != null }
            .mapNotNull { r -> runCatching { Instant.parse(r.lastSuccessAt) }.getOrNull()?.let { "${r.programId}|${r.kind}" to it } }.toMap()
        /** rule 6: a review done on ANY integration counts. */
        fun isReviewed(pid: String, flow: HealthStore.Flow) = "$pid|${flow.kind}" in reviewed
        /** rule 4: the oldest last_success_at among [pids]; null when any of them never synced (→ first-sync rule). */
        fun oldestLastSuccess(pids: Set<String>, flow: HealthStore.Flow): Instant? {
            if (pids.isEmpty()) return null
            val all = pids.map { lastSuccess["$it|${flow.kind}"] }
            return if (all.any { it == null }) null else all.filterNotNull().min()
        }
    }

    /** D-S5 windows `[start_date, min(end_date, today)]`; reloads programs when an id is missing (throws if that fails). */
    suspend fun loadSyncWindows(programContext: ProgramContext, ids: Set<String>): Map<String, Pair<String, String>> {
        var list = programContext.programs.value
        if (!ids.all { id -> list.any { it.id == id } }) { programContext.loadPrograms().getOrThrow(); list = programContext.programs.value }
        val today = HealthDates.localYMD(System.currentTimeMillis())
        return list.filter { it.id in ids }.mapNotNull { p ->
            val start = p.startDate?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val end = minOf(p.endDate ?: today, today)
            if (start <= end) p.id to (start to end) else null
        }.toMap()
    }

    /** Reads one flow's catch-up window (rule 4) and plans it. Throws on a Health Connect read failure. */
    suspend fun readAndPlan(manager: HealthConnectManager, store: HealthStore, ctx: PlanContext, oldest: Instant?, today: LocalDate): FlowRead =
        when (ctx.flow) {
            HealthStore.Flow.WORKOUTS -> {
                val firstSync = if (store.upgradeMarker) today.minusDays(HealthDates.CATCH_UP_CAP_DAYS) else HealthDates.localDate(store.workoutConnectMillis)
                val start = HealthDates.catchUpStart(oldest, firstSync, today)
                val fetch = manager.fetchWorkouts(store.workoutChangesToken, HealthDates.startOfDay(start))
                FlowRead(planWorkouts(manager.aggregate(fetch.upserts), fetch.deletedIds, ctx), fetch.newToken,
                    if (fetch.readFrom != null) ChronoUnit.DAYS.between(start, today) else 0L)
            }
            HealthStore.Flow.SLEEP -> {
                val start = HealthDates.catchUpStart(oldest, today.minusDays(HealthDates.FIRST_SYNC_DAYS), today)
                val nights = manager.aggregateSleep(manager.fetchSleepSamples(HealthDates.startOfDay(start.minusDays(1))))
                    .filter { it.date >= start.toString() }
                FlowRead(planSleep(nights, ctx), null, ChronoUnit.DAYS.between(start, today))
            }
            HealthStore.Flow.STEPS -> {
                val start = HealthDates.catchUpStart(oldest, today.minusDays(HealthDates.FIRST_SYNC_DAYS), today)
                FlowRead(planSteps(manager.fetchStepsDailyTotals(start), ctx), null, ChronoUnit.DAYS.between(start, today))
            }
        }

    fun planWorkouts(groups: List<AggregatedWorkout>, deletedIds: Set<String>, ctx: PlanContext): FlowPlan {
        val deletions = deletedIds.map { PlannedItem(HealthSyncItemDTO(kind = "workout", sampleId = it, deleted = true), HealthStore.Flow.WORKOUTS, null) }
        val kept = groups.mapNotNull { g -> g.samples.filterNot { it.uuid in deletedIds }.takeIf { it.isNotEmpty() }?.let { g.copy(samples = it) } }
        return plan(kept, ctx, deletions, { it.date }, { pid, g -> "$pid|${g.date}|${g.workoutName}" }, { g, pid -> workoutItems(g, pid) }) { g, key ->
            PendingSyncConfirmation.Row(g.workoutName, "${HealthSyncController.displayDate(g.date)} · ${g.durationMinutes} min", key, PendingSyncConfirmation.Payload.Workout(g))
        }
    }

    fun planSleep(nights: List<AggregatedSleep>, ctx: PlanContext): FlowPlan =
        plan(nights, ctx, emptyList(), { it.date }, { pid, n -> "$pid|${n.date}" }, { n, pid -> listOf(sleepItem(n, pid)) }) { n, key ->
            PendingSyncConfirmation.Row("Sleep", "${HealthSyncController.displayDate(n.date)} · ${HealthSyncController.formatHours(n.hours)}", key, PendingSyncConfirmation.Payload.Sleep(n))
        }

    fun planSteps(days: List<AggregatedSteps>, ctx: PlanContext): FlowPlan =
        plan(days, ctx, emptyList(), { it.date }, { pid, d -> "$pid|${d.date}" }, { d, pid -> listOf(stepsItem(d, pid)) }) { d, key ->
            PendingSyncConfirmation.Row("Steps", "${HealthSyncController.displayDate(d.date)} · ${HealthSyncController.formatSteps(d.count)}", key, PendingSyncConfirmation.Payload.Steps(d))
        }

    /** A reviewed page's checked rows → items for that program (within its window). */
    fun pageItems(page: PendingSyncConfirmation.ProgramPage, window: Pair<String, String>): List<PlannedItem> =
        page.rows.filter { it.isChecked && HealthDates.isWithin(it.payload.ymd, window.first, window.second) }.flatMap { row ->
            when (val p = row.payload) {
                is PendingSyncConfirmation.Payload.Workout -> workoutItems(p.workout, page.id)
                is PendingSyncConfirmation.Payload.Sleep -> listOf(sleepItem(p.sleep, page.id))
                is PendingSyncConfirmation.Payload.Steps -> listOf(stepsItem(p.steps, page.id))
            }
        }

    /** rule 9: an old-ledger entry re-read from Health → a `legacy` item (date = the ledger's stored day). */
    fun legacyWorkout(record: ExerciseSessionRecord, entry: HealthStore.LedgerEntry): PlannedItem {
        val s = WorkoutSample.of(record)
        return PlannedItem(
            HealthSyncItemDTO(kind = "workout", programId = entry.programId, date = entry.date, sampleId = s.uuid, origin = s.origin,
                workoutName = HealthConnectWorkoutTypeMap.workoutName(record.exerciseType), value = JsonPrimitive(s.wholeMinutes),
                startAt = s.startAt.toString(), endAt = s.endAt.toString(), legacy = true),
            HealthStore.Flow.WORKOUTS, entry.programId, legacyKey = entry.key,
        )
    }

    private fun workoutItems(g: AggregatedWorkout, programId: String): List<PlannedItem> = g.samples.map { s ->
        PlannedItem(HealthSyncItemDTO(kind = "workout", programId = programId, date = g.date, sampleId = s.uuid, origin = s.origin,
            workoutName = g.workoutName, value = JsonPrimitive(s.wholeMinutes), startAt = s.startAt.toString(), endAt = s.endAt.toString()),
            HealthStore.Flow.WORKOUTS, programId)
    }

    private fun sleepItem(n: AggregatedSleep, pid: String) =
        PlannedItem(HealthSyncItemDTO(kind = "sleep", programId = pid, date = n.date, value = JsonPrimitive(n.hours)), HealthStore.Flow.SLEEP, pid)

    private fun stepsItem(d: AggregatedSteps, pid: String) =
        PlannedItem(HealthSyncItemDTO(kind = "steps", programId = pid, date = d.date, value = JsonPrimitive(d.count)), HealthStore.Flow.STEPS, pid)

    private inline fun <T> plan(
        rows: List<T>, ctx: PlanContext, prefix: List<PlannedItem>,
        date: (T) -> String, key: (String, T) -> String,
        toItems: (T, String) -> List<PlannedItem>, toRow: (T, String) -> PendingSyncConfirmation.Row,
    ): FlowPlan {
        val upload = prefix.toMutableList()
        val review = LinkedHashMap<String, MutableList<PendingSyncConfirmation.Row>>()
        for (row in rows) for (pid in ctx.eligible) {
            val (start, end) = ctx.windows[pid] ?: continue
            if (!HealthDates.isWithin(date(row), start, end)) continue
            val k = key(pid, row)
            if (k in ctx.excluded) continue
            if (pid in ctx.confirmed) upload += toItems(row, pid) else review.getOrPut(pid) { mutableListOf() } += toRow(row, k)
        }
        return FlowPlan(upload, review, ctx.eligible.filter { it in ctx.confirmed }.toSet(), ctx.lockHeld)
    }
}
```

6. **NEW `P/health/HealthSyncUpgrade.kt`**. Imports: `java.time.LocalDate`, `kotlin.coroutines.cancellation.CancellationException`.
```kotlin
package com.app.rasifiters.health

/** health-sync §8 rule 9 — the once-per-member+device upgrade from the old build's client ledger. */
internal class HealthSyncUpgrade(private val store: HealthStore, private val manager: HealthConnectManager) {

    /** First v2 run for this member: if the old build left a ledger or a changes token, set the upgrade marker (rule 4
     *  then never uses the connect date) and DISCARD the token (this run reads workouts from today − 30 d). Queue the
     *  old build's confirmed lists as pending review_done (the carry-over; sent by the runner until PUT /state accepts).
     *  Idempotent. */
    fun prepare() {
        if (store.v2Initialized) return
        if (store.ledgerEntries().isNotEmpty() || store.workoutChangesToken != null) {
            store.upgradeMarker = true
            store.workoutChangesToken = null
        }
        val carried = HealthStore.Flow.entries.flatMap { f -> store.confirmedProgramIds(f).map { "$it|${f.kind}" } }
        if (carried.isNotEmpty()) store.pendingReviewDone = store.pendingReviewDone + carried
        store.v2Initialized = true
    }

    /** Old-ledger entries → `legacy` items, re-read in ONE paged window read (no per-id N+1). Entries Health no longer has
     *  are retired now. null = Health couldn't be read → the caller must not send workout adds this run (no double count). */
    suspend fun legacyItems(): List<PlannedItem>? {
        val entries = store.ledgerEntries()
        if (entries.isEmpty()) return emptyList()
        val oldest = runCatching { LocalDate.parse(entries.minOf { it.date }) }.getOrElse { LocalDate.now().minusDays(LEDGER_MAX_DAYS) }
        val records = try {
            manager.readWorkoutsSince(HealthDates.startOfDay(oldest.minusDays(1)))
        } catch (e: CancellationException) { throw e } catch (_: Exception) { return null }
        val byId = records.associateBy { it.metadata.id }
        return entries.mapNotNull { entry ->
            val record = byId[entry.sampleId]
            if (record == null) { store.ledgerRemove(entry.key); null } else HealthSyncItems.legacyWorkout(record, entry)
        }
    }

    /** Delete each old-ledger entry whose legacy item came back final (the marker stays). */
    fun retire(results: List<Pair<PlannedItem, String>>) {
        results.forEach { (item, status) -> val key = item.legacyKey; if (key != null && status != "skipped_locked") store.ledgerRemove(key) }
    }

    private companion object { const val LEDGER_MAX_DAYS = 45L }
}
```

7. **NEW `P/health/HealthSyncRunner.kt`**. Imports:
   - `android.os.SystemClock`
   - `com.app.rasifiters.core.ProgramContext`
   - `com.app.rasifiters.core.events.ClientEventQueue`
   - `com.app.rasifiters.core.kit.{AppError, AppErrorKind, errorClass, toAppError}`
   - `com.app.rasifiters.net.{ApiService, HealthSyncBatchRequest, HealthSyncStateEntry, HealthSyncStatePut}`
   - `kotlinx.coroutines.delay`
   - `kotlinx.serialization.json.{buildJsonObject, put}`
   - `java.time.LocalDate`
   - `kotlin.coroutines.cancellation.CancellationException`
```kotlin
package com.app.rasifiters.health

/**
 * One health-sync v2 run (health-sync §8 rules 2–10): read Health Connect → plan → ONE upload (≤ 300 items per request,
 * halved on 413; legacy items first) → PUT /state → one `sync.run`. Holds on `skipped_locked` (rule 5); never signs out
 * (rule 8). review_done is sent ONLY from store.pendingReviewDone (rule-9 carry-over + user confirms) — a silent 0-row
 * confirm stays local (rule 6 needs a user confirm).
 */
internal class HealthSyncRunner(
    private val api: ApiService,
    private val store: HealthStore,
    private val manager: HealthConnectManager,
    private val programContext: ProgramContext,
    private val events: ClientEventQueue,
) {
    data class FlowInput(val flow: HealthStore.Flow, val programIds: Set<String>)
    data class FlowResult(
        val attempted: Boolean = false, val advanced: Boolean = false, val failed: Boolean = false,
        val counts: KindCounts = KindCounts(), val reviewRows: Map<String, List<PendingSyncConfirmation.Row>> = emptyMap(),
    )
    data class RunResult(
        val outcome: String, val flows: Map<HealthStore.Flow, FlowResult>, val missingPermissions: Set<HealthStore.Flow>,
        val heldWorkoutToken: String? = null, val heldWorkoutTokenClean: Boolean = false,
    )
    private data class Upload(val results: List<Pair<PlannedItem, String>>, val error: AppError?, val batches: Int)
    private class Tally { val t0 = SystemClock.elapsedRealtime(); var catchUpDays = 0L; var batches = 0; var legacyRecorded: Int? = null }

    private val upgrade = HealthSyncUpgrade(store, manager)

    suspend fun run(trigger: String, inputs: List<FlowInput>): RunResult {
        val tally = Tally()
        val flows = inputs.associate { it.flow to FlowResult() }.toMutableMap()
        fun done(outcome: String, errorClass: String?, missing: Set<HealthStore.Flow>, token: String? = null, clean: Boolean = false): RunResult {
            report(trigger, tally, outcome, errorClass, flows)
            return RunResult(outcome, flows, missing, token, clean)
        }

        upgrade.prepare()
        val granted = try { manager.grantedPermissions() } catch (e: CancellationException) { throw e } catch (_: Exception) {
            return done("failed", "health_read_failed", emptySet())
        }
        val missing = inputs.filterNot { granted.containsAll(manager.permissionsFor(it.flow)) }.map { it.flow }.toSet()
        val runnable = inputs.filter { it.flow !in missing && it.programIds.isNotEmpty() }
        if (runnable.isEmpty()) return done(if (missing.isEmpty()) "skipped" else "failed", if (missing.isEmpty()) null else "permission_missing", missing)

        val state: HealthSyncItems.ServerState
        val windows: Map<String, Pair<String, String>>
        try {
            state = HealthSyncItems.ServerState(api.getHealthSyncState().states)
            windows = HealthSyncItems.loadSyncWindows(programContext, runnable.flatMap { it.programIds }.toSet())
        } catch (e: CancellationException) { throw e } catch (e: Exception) { return done("failed", e.toAppError().errorClass(), missing) }

        val today = LocalDate.now()
        val plans = LinkedHashMap<HealthStore.Flow, HealthSyncItems.FlowPlan>()
        val readFailed = mutableSetOf<HealthStore.Flow>()
        var workoutToken: String? = null
        for (input in runnable) {
            val flow = input.flow
            if (flow != HealthStore.Flow.WORKOUTS) store.pruneExcludedKeys(flow, HealthDates.EXCLUSION_KEEP_DAYS)
            val inWindow = input.programIds.filter { it in windows }.toSet()
            val locked = inWindow.filter { programContext.isDataEntryLocked(it) }.toSet()
            val eligible = inWindow - locked
            eligible.filter { state.isReviewed(it, flow) }.forEach { store.markProgramConfirmed(it, flow) }   // rule 6
            val confirmed = store.confirmedProgramIds(flow)
            val ctx = HealthSyncItems.PlanContext(flow, eligible, locked.isNotEmpty(), windows, store.excludedKeys(flow), confirmed)
            val read = try { HealthSyncItems.readAndPlan(manager, store, ctx, state.oldestLastSuccess(eligible, flow), today) }
            catch (e: CancellationException) { throw e } catch (_: Exception) { readFailed += flow; flows[flow] = FlowResult(failed = true); continue }
            tally.catchUpDays = maxOf(tally.catchUpDays, read.catchUpDays)
            if (flow == HealthStore.Flow.WORKOUTS) workoutToken = read.workoutToken
            plans[flow] = read.plan
            // D-CONF 0-row first sync confirms silently — LOCAL ONLY (no review_done; D-rule, cross-track with C2).
            eligible.filter { it !in confirmed && it !in read.plan.reviewRows }.forEach { store.markProgramConfirmed(it, flow) }
        }

        var legacy: List<PlannedItem> = emptyList()
        if (HealthStore.Flow.WORKOUTS in plans) {
            val read = upgrade.legacyItems()
            if (read == null) {   // never send workout adds before the old ledger is adopted
                plans.remove(HealthStore.Flow.WORKOUTS); readFailed += HealthStore.Flow.WORKOUTS
                flows[HealthStore.Flow.WORKOUTS] = FlowResult(failed = true); workoutToken = null
            } else legacy = read
        }
        if (plans.isEmpty()) return done("failed", "health_read_failed", missing)

        val items = legacy + plans.values.flatMap { it.upload }
        val upload = upload(items)
        tally.batches = upload.batches
        upgrade.retire(upload.results)
        if (legacy.isNotEmpty()) tally.legacyRecorded = upload.results.count { it.first.legacyKey != null && it.second == "recorded" }

        // Rule 5: advance + sync_success only when every item of the run came back final and nothing was held.
        val complete = upload.error == null && upload.results.size == items.size
        val pendingReviews = store.pendingReviewDone
        val stateEntries = pendingReviews.mapNotNull { k -> k.split('|').takeIf { it.size == 2 }?.let { HealthSyncStateEntry(it[0], it[1], reviewDone = true) } }.toMutableList()
        for ((flow, plan) in plans) {
            val mine = upload.results.filter { it.first.flow == flow && it.first.legacyKey == null }
            val counts = KindCounts().also { c -> mine.forEach { c.add(it.second) } }
            val advanced = complete && !plan.lockHeld && mine.none { it.second == STATUS_LOCKED }
            if (advanced) plan.uploadPrograms.forEach { stateEntries += HealthSyncStateEntry(it, flow.kind, syncSuccess = true) }
            flows[flow] = FlowResult(attempted = true, advanced = advanced, failed = !complete, counts = counts, reviewRows = plan.reviewRows)
        }
        if (putState(stateEntries)) store.pendingReviewDone = store.pendingReviewDone - pendingReviews

        var heldToken: String? = null
        var heldClean = false
        plans[HealthStore.Flow.WORKOUTS]?.let { plan ->
            val clean = flows.getValue(HealthStore.Flow.WORKOUTS).advanced
            if (plan.reviewRows.isNotEmpty()) { heldToken = workoutToken; heldClean = clean }
            else if (clean) store.workoutChangesToken = workoutToken
        }
        val anyHeld = flows.values.any { it.attempted && !it.advanced && !it.failed }
        val outcome = when {
            !complete && upload.results.isEmpty() && items.isNotEmpty() -> "failed"
            !complete || readFailed.isNotEmpty() || missing.isNotEmpty() || anyHeld -> "partial"
            else -> "success"
        }
        val errorClass = upload.error?.errorClass()
            ?: if (readFailed.isNotEmpty()) "health_read_failed" else if (missing.isNotEmpty()) "permission_missing" else null
        return done(outcome, errorClass, missing, heldToken, heldClean)
    }

    /** A reviewed page (rule 6): upload the checked rows, then mark the review done locally + on the server (queued in
     *  pendingReviewDone until PUT /state accepts). null = retry. */
    suspend fun commitPage(flow: HealthStore.Flow, page: PendingSyncConfirmation.ProgramPage): KindCounts? {
        val window = (try { HealthSyncItems.loadSyncWindows(programContext, setOf(page.id))[page.id] }
            catch (e: CancellationException) { throw e } catch (_: Exception) { null }) ?: return null
        if (programContext.isDataEntryLocked(page.id)) return null
        store.addExcludedKeys(page.rows.filterNot { it.isChecked }.map { it.exclusionKey }, flow)
        val items = HealthSyncItems.pageItems(page, window)
        val upload = upload(items)
        if (upload.error != null || upload.results.size < items.size || upload.results.any { it.second == STATUS_LOCKED }) return null
        store.markProgramConfirmed(page.id, flow)
        store.addPendingReviewDone(page.id, flow)
        val key = "${page.id}|${flow.kind}"
        if (putState(listOf(HealthSyncStateEntry(page.id, flow.kind, reviewDone = true)))) store.pendingReviewDone = store.pendingReviewDone - key
        return KindCounts().also { c -> upload.results.forEach { c.add(it.second) } }
    }

    /** Sequential batches; stops at the first failure (legacy items first → adds never precede their adoption).
     *  413 → halve; 429 / 503 with Retry-After ≤ 5 s → wait and resend once (rule 8). */
    private suspend fun upload(items: List<PlannedItem>): Upload {
        val results = ArrayList<Pair<PlannedItem, String>>(items.size)
        val queue = ArrayDeque(items.chunked(MAX_ITEMS))
        var batches = 0
        var waited = false
        while (queue.isNotEmpty()) {
            val chunk = queue.removeFirst()
            batches++
            val response = try {
                api.healthSyncBatch(HealthSyncBatchRequest(HealthSyncItems.INTEGRATION, chunk.map { it.dto }))
            } catch (e: CancellationException) { throw e } catch (e: Exception) {
                val err = e.toAppError()
                when {
                    err.status == 413 && chunk.size > 1 -> {
                        queue.addFirst(chunk.subList(chunk.size / 2, chunk.size)); queue.addFirst(chunk.subList(0, chunk.size / 2)); continue
                    }
                    err.kind == AppErrorKind.UNAVAILABLE && !waited && (err.retryAfterSeconds ?: 2) <= 5 -> {
                        waited = true; delay((err.retryAfterSeconds ?: 2) * 1000L); queue.addFirst(chunk); continue
                    }
                    else -> return Upload(results, err, batches)
                }
            }
            response.results.forEach { r -> chunk.getOrNull(r.index)?.let { results += it to r.status } }
        }
        return Upload(results, null, batches)
    }

    /** PUT /state merged per (program, kind), ≤ 60 entries per request. true = every chunk accepted (or nothing to send). */
    private suspend fun putState(entries: List<HealthSyncStateEntry>): Boolean {
        val merged = entries.groupBy { it.programId to it.kind }.map { (k, list) ->
            HealthSyncStateEntry(k.first, k.second,
                reviewDone = list.any { it.reviewDone == true }.takeIf { it }, syncSuccess = list.any { it.syncSuccess == true }.takeIf { it })
        }
        for (chunk in merged.chunked(MAX_STATE_ENTRIES)) {
            try { api.putHealthSyncState(HealthSyncStatePut(HealthSyncItems.INTEGRATION, chunk)) }
            catch (e: CancellationException) { throw e } catch (_: Exception) { return false }
        }
        return true
    }

    private fun report(trigger: String, tally: Tally, outcome: String, errorClass: String?, flows: Map<HealthStore.Flow, FlowResult>) {
        events.enqueue("sync.run", buildJsonObject {
            put("integration", HealthSyncItems.INTEGRATION); put("trigger", trigger); put("outcome", outcome)
            put("duration_ms", SystemClock.elapsedRealtime() - tally.t0); put("catch_up_days", tally.catchUpDays)
            put("batches", tally.batches); put("error_class", errorClass)
            flows.forEach { (flow, r) ->
                if (r.attempted) put(flow.kind, buildJsonObject {
                    put("sent", r.counts.sent); put("applied", r.counts.applied); put("unchanged", r.counts.unchanged)
                    put("duplicate", r.counts.duplicate); put("skipped", r.counts.skipped); put("removed", r.counts.removed); put("invalid", r.counts.invalid)
                })
            }
            tally.legacyRecorded?.let { put("legacy_recorded", it) }
        })
    }

    private companion object {
        const val MAX_ITEMS = 300
        const val MAX_STATE_ENTRIES = 60
        const val STATUS_LOCKED = "skipped_locked"
    }
}
```

8. **`P/health/HealthSyncController.kt`**: keep the public surface; the run logic moves to the runner.
   - **Constructor:** `class HealthSyncController(private val context: Context, api: ApiService, private val programContext: ProgramContext, events: ClientEventQueue)`.
   - **Fields:**
     - `private val store = HealthStore(context) { programContext.loggedInMemberId }`
     - `val manager = HealthConnectManager(context)`
     - `private val runner = HealthSyncRunner(api, store, manager, programContext, events)`
     - `private val runMutex = Mutex()`
     - `private var lastRunStartMs = 0L`
     - `private val _missingPermissions = MutableStateFlow<Set<HealthStore.Flow>>(emptySet())`, exposed as `val missingPermissions: StateFlow<Set<HealthStore.Flow>> = _missingPermissions.asStateFlow()`
   - **Keep unchanged:**
     - the 15 state flows (initial values from `store`), `pendingConfirmation`, `deferredSleep` / `deferredSteps`;
     - `isAvailable` and the `*Permissions` getters;
     - `toggle*Program`, `enqueuePendingConfirmation`, `stashDeferred`, `promoteDeferredConfirmation`, `buildConfirmationPages`, `publish*`;
     - the companion display helpers;
     - the `clearConfirmedPrograms` calls in `enable*AfterPermission` / `disconnect*` (a local re-gate; the server's `review_done_at` re-confirms on the next run, rule 6).
   - **Init:** add `init { programContext.loggedInMemberId?.let(store::adoptLegacyKeys); publishAll() }` AFTER the flow declarations. It may only use `loggedInMemberId`.
   - **Delete:**
     - `workoutSyncing`, `sleepSyncing`, `stepsSyncing`;
     - `performWorkoutSync`, `performSleepSync`, `performStepsSync`;
     - `loadSyncWindows`, `writeWorkout`, `writeSleep`, `writeSteps`;
     - the outcome enums and the exclusion-key helpers;
     - the old `onTrigger()`.
   - **Pending workout token:** `pendingWorkoutHadRetryable` / `pendingWorkoutLockHeld` → one `private var pendingWorkoutClean = false`. `commitPendingWorkoutTokenIfClean` body → `if (pendingWorkoutClean && pendingWorkoutToken != null) { store.workoutChangesToken = pendingWorkoutToken; store.lastWorkoutSyncMillis = System.currentTimeMillis(); publishWorkoutState() }; pendingWorkoutToken = null; pendingWorkoutClean = false`.
   - **`enable*AfterPermission`:** replace `scope.launch { performXSync() }` with `onTrigger("connect"); scope.launch { refreshPermissionState() }`.
   - **`disconnectWorkouts`:**
     - delete `store.ledgerClear()` (the old ledger stays until the upgrade retires it);
     - the pending reset becomes `pendingWorkoutToken = null; pendingWorkoutClean = false`;
     - each `disconnect*` also does `_missingPermissions.value = _missingPermissions.value - <flow>`.
   - **Add:**
```kotlin
    fun onTrigger(trigger: String) { scope.launch { sync(trigger) } }

    /** One v2 run of every enabled flow. Synced(applied) when anything applied or the run fully succeeded. */
    suspend fun sync(trigger: String): HealthSyncResult {
        val r = runOnce(trigger) ?: return HealthSyncResult.Skipped
        val applied = r.flows.values.sumOf { it.counts.applied }
        return when {
            r.outcome == "skipped" -> HealthSyncResult.Skipped
            r.outcome == "success" || applied > 0 -> HealthSyncResult.Synced(applied)
            else -> HealthSyncResult.Failed
        }
    }

    /** Settings "Sync Now" for [flow]: one run of all flows (`manual`), judged by [flow]'s own outcome only. */
    suspend fun syncNow(flow: HealthStore.Flow): HealthSyncResult {
        val r = runOnce("manual") ?: return HealthSyncResult.Skipped
        val f = r.flows[flow]
        return when {
            flow in r.missingPermissions || f == null -> HealthSyncResult.Skipped   // the Reconnect row explains it
            f.failed -> HealthSyncResult.Failed
            else -> HealthSyncResult.Synced(f.counts.applied)
        }
    }

    /** health-sync §8 rule 1: one run in flight per device; automatic triggers ≥ 60 s apart (D-C12 limiter headroom). */
    private suspend fun runOnce(trigger: String): HealthSyncRunner.RunResult? {
        if (!programContext.isSignedIn.value || !isAvailable) return null
        val inputs = HealthStore.Flow.entries.filter { enabled(it) && !awaitingReview(it) }
            .map { HealthSyncRunner.FlowInput(it, programIds(it)) }
        if (inputs.isEmpty()) return null
        val now = SystemClock.elapsedRealtime()
        if (trigger in AUTOMATIC_TRIGGERS && lastRunStartMs != 0L && now - lastRunStartMs < MIN_AUTO_INTERVAL_MS) return null
        if (!runMutex.tryLock()) return null
        try {
            lastRunStartMs = now
            val result = runner.run(trigger, inputs)
            applyResult(result)
            return result
        } finally { runMutex.unlock() }
    }

    private fun applyResult(result: HealthSyncRunner.RunResult) {
        _missingPermissions.value = result.missingPermissions
        val now = System.currentTimeMillis()
        result.flows.forEach { (flow, f) ->
            if (!f.attempted && !f.failed) return@forEach
            if (f.advanced) setLastSync(flow, now)
            setFailed(flow, f.failed)
            val n = if (flow == HealthStore.Flow.WORKOUTS) f.counts.applied else f.counts.created
            addCount(flow, n); notifySynced(flow, n)
            if (f.reviewRows.isNotEmpty()) {
                val pages = buildConfirmationPages(f.reviewRows)
                if (pages.isNotEmpty()) enqueuePendingConfirmation(PendingSyncConfirmation(flow.confirmationFlow(), pages))
            }
        }
        result.heldWorkoutToken?.let { pendingWorkoutToken = it; pendingWorkoutClean = result.heldWorkoutTokenClean }
        publishAll()
    }

    /** "Reconnect Health Connect" state (board §4.8) — re-read on the settings screen and after a grant. */
    suspend fun refreshPermissionState() {
        val granted = runCatching { manager.grantedPermissions() }.getOrNull() ?: return
        _missingPermissions.value = HealthStore.Flow.entries.filter { enabled(it) && !granted.containsAll(manager.permissionsFor(it)) }.toSet()
    }

    /** Sign-in / sign-out: adopt the old build's keys once, drop the previous member's queue, republish. */
    fun reloadForMember() {
        programContext.loggedInMemberId?.let(store::adoptLegacyKeys)
        _pendingConfirmation.value = null; deferredSleep = null; deferredSteps = null
        pendingWorkoutToken = null; pendingWorkoutClean = false
        _missingPermissions.value = emptySet()
        lastRunStartMs = 0L
        publishAll()
    }

    suspend fun commitWorkoutPage(page: PendingSyncConfirmation.ProgramPage) = commitPage(HealthStore.Flow.WORKOUTS, page)
    suspend fun commitSleepPage(page: PendingSyncConfirmation.ProgramPage) = commitPage(HealthStore.Flow.SLEEP, page)
    suspend fun commitStepsPage(page: PendingSyncConfirmation.ProgramPage) = commitPage(HealthStore.Flow.STEPS, page)

    private suspend fun commitPage(flow: HealthStore.Flow, page: PendingSyncConfirmation.ProgramPage): Boolean {
        if (!programContext.isSignedIn.value) return false
        val counts = runMutex.withLock { runner.commitPage(flow, page) } ?: return false
        addCount(flow, if (flow == HealthStore.Flow.WORKOUTS) counts.applied else counts.created)
        publishAll()
        return true
    }
```
   - **Private helpers** (each a `when (flow)` over the matching store properties): `enabled(flow)`, `programIds(flow)`, `awaitingReview(flow)`, `setLastSync`, `setFailed`, `addCount`, `notifySynced`, `publishAll()`.
     - `awaitingReview(flow)` = `_pendingConfirmation.value?.flow == flow.confirmationFlow()`, plus `deferredSleep != null` for SLEEP and `deferredSteps != null` for STEPS.
     - `addCount` does `lastXSyncCount += n`.
     - `notifySynced` calls `HealthSyncNotifier.notifyXSuccess`.
   - **Companion:** add `private val AUTOMATIC_TRIGGERS = setOf("launch", "foreground", "program_entry")` and `private const val MIN_AUTO_INTERVAL_MS = 60_000L`.
   - **Imports:** `android.os.SystemClock`, `kotlinx.coroutines.sync.{Mutex, withLock}`, `com.app.rasifiters.core.events.ClientEventQueue`.

9. **`P/net/ApiService.kt`**: delete `postWorkoutLog`, `postDailyHealthLogRaw`, `putDailyHealthLogRaw` and their comment block (:285-297) (rule 11).

10. **`P/core/ProgramContext.kt`**
    - :102 → `val health: HealthSyncController = HealthSyncController(appContext, api, this, events)`.
    - Append `health.reloadForMember()` as the last line of `applyLoginSession`.
    - In `tearDown`, add `health.reloadForMember()` right after `clearSession()`.

11. **`P/ui/health/HealthConnectSettingsScreen.kt`**
    - **11a.** Add `val missing by health.missingPermissions.collectAsStateWithLifecycle()` and `LaunchedEffect(Unit) { health.refreshPermissionState() }`.
    - **11b.** The three launcher callbacks become `{ granted -> if (granted.containsAll(health.Xpermissions)) health.enableXAfterPermission() else scope.launch { health.refreshPermissionState() } }`.
    - **11c.** In each `if (xEnabled)` branch, replace the `ConnectedRow(...)`:
```kotlin
if (HealthStore.Flow.WORKOUTS in missing) {
    ConnectButton(Icons.Filled.Favorite, AppRed, "Reconnect Health Connect", "Access was turned off. Tap to allow it again.") {
        workoutPermissionLauncher.launch(health.workoutPermissions)
    }
} else ConnectedRow(Icons.Filled.Favorite, "Workouts will sync automatically")
```
      Do the same for SLEEP (`Icons.Filled.Bedtime`, `AppBlue`, `sleepPermissionLauncher`) and STEPS (`Icons.AutoMirrored.Filled.DirectionsWalk`, `StepsTeal`, `stepsPermissionLauncher`).
    - **11d.** Sync Now (:128, :158, :188): `health.performWorkoutSync()` → `health.syncNow(HealthStore.Flow.WORKOUTS)`, likewise `SLEEP` and `STEPS`. The `is HealthSyncResult.Failed` check is unchanged. Import `com.app.rasifiters.health.HealthStore`.

12. **`P/ui/shell/AppScaffold.kt`** (:93): `LaunchedEffect(Unit) { programContext.health.onTrigger("program_entry") }`.

13. **`P/ui/RootScreen.kt`**: `programContext.health.onTrigger()` → `onTrigger("launch")` in `LaunchedEffect(signedIn)` (:74), and `onTrigger("foreground")` in the ON_RESUME observer (:94). D9 replaces this block.

14. Compile checkpoint C.

### D. Push + SSE + invites (notifications §3.1–3.3, invites §3.1) (checkpoint D)

1. **NEW `P/push/DeviceRegistry.kt`**. Imports:
   - `android.content.Context`, `android.util.Log`
   - `androidx.core.app.NotificationManagerCompat`, `androidx.core.content.edit`
   - `com.app.rasifiters.core.Session`
   - `com.app.rasifiters.net.{ApiService, DeviceRegisterRequest, DeviceUnregisterRequest}`
   - `com.google.firebase.messaging.FirebaseMessaging`
   - `kotlinx.coroutines.*`, `kotlinx.coroutines.sync.{Mutex, withLock}`
   - `retrofit2.HttpException`
   - `java.io.{File, IOException}`, `java.util.UUID`
   - `kotlin.coroutines.resume`, `kotlin.coroutines.cancellation.CancellationException`
```kotlin
package com.app.rasifiters.push

/**
 * notifications §3.1 device registry: install id in noBackupFilesDir/install_id; registration state + the one-time
 * permission flag in `rasi.push` (excluded from backup, survives process death); ONE serial queue (Mutex) for
 * PUT /device and POST /device/unregister (no login; one retry, then drop). A sign-in waits for an in-flight unregister
 * and drops a pending retry (generation check); after an unregister the cached token + memo are forgotten.
 */
class DeviceRegistry(context: Context, private val api: ApiService, private val session: Session, private val scope: CoroutineScope) {
    data class RideAlong(val pushToken: String?, val deviceId: String)

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val mutex = Mutex()
    @Volatile private var cachedPushToken: String? = null
    @Volatile private var signInGeneration = 0
    private var pendingRetry: Job? = null

    private var registeredToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(v) = prefs.edit { if (v == null) remove(KEY_TOKEN) else putString(KEY_TOKEN, v) }
    private var registeredAtMs: Long
        get() = prefs.getLong(KEY_AT, 0L)
        set(v) = prefs.edit { putLong(KEY_AT, v) }

    val installId: String by lazy { readOrCreateInstallId() }

    /** Start of every sign-in: drop a pending unregister retry, wait out an in-flight one, return the ride-along fields. */
    suspend fun beginSignIn(): RideAlong {
        signInGeneration++
        pendingRetry?.cancel(); pendingRetry = null
        mutex.withLock { }
        val token = if (notificationsEnabled()) currentPushToken() else null
        return RideAlong(token, withContext(Dispatchers.IO) { installId })
    }

    fun markRegistered(token: String?) { if (token != null) { registeredToken = token; registeredAtMs = System.currentTimeMillis() } }

    /** Launch / foreground / onNewToken / permission result: register while signed in + notifications enabled (re-PUT at
     *  most every 12 h per token — last_seen); unregister when notifications were turned off (survives process death). */
    fun sync(newToken: String? = null) {
        newToken?.let { cachedPushToken = it }
        scope.launch {
            if (session.accessToken == null) return@launch
            if (!notificationsEnabled()) { if (registeredToken != null) unregisterNow(); return@launch }
            val token = currentPushToken() ?: return@launch
            val deviceId = withContext(Dispatchers.IO) { installId }
            mutex.withLock {
                if (session.accessToken == null) return@withLock
                if (token == registeredToken && System.currentTimeMillis() - registeredAtMs < REREGISTER_AFTER_MS) return@withLock
                try {
                    api.registerDevice(DeviceRegisterRequest(pushToken = token, platform = "android", deviceId = deviceId)); markRegistered(token)
                } catch (e: CancellationException) { throw e } catch (e: Exception) { Log.w(TAG, "PUT /device failed", e) }
            }
        }
    }

    /** Every sign-out path (board §2 client rule 5) — works without a login. */
    fun unregister() { scope.launch { unregisterNow() } }

    fun shouldAskNotificationPermission(): Boolean = !prefs.getBoolean(KEY_ASKED, false)
    fun markNotificationPermissionAsked() = prefs.edit { putBoolean(KEY_ASKED, true) }

    private suspend fun unregisterNow() {
        val token = cachedPushToken ?: registeredToken
        val generation = signInGeneration
        val deviceId = withContext(Dispatchers.IO) { installId }
        val ok = mutex.withLock { attempt(token, deviceId) }
        cachedPushToken = null; registeredToken = null; registeredAtMs = 0L
        if (!ok) pendingRetry = scope.launch {
            delay(RETRY_DELAY_MS)
            mutex.withLock { if (generation == signInGeneration) attempt(token, deviceId) }
        }
    }

    /** true = done (200, or a 4xx retrying can't fix); false = network / 5xx → the one retry. */
    private suspend fun attempt(token: String?, deviceId: String): Boolean = try {
        api.unregisterDevice(DeviceUnregisterRequest(pushToken = token, deviceId = deviceId)); true
    } catch (e: CancellationException) { throw e
    } catch (e: HttpException) { e.code() < 500
    } catch (e: IOException) { false }

    private fun notificationsEnabled() = NotificationManagerCompat.from(appContext).areNotificationsEnabled()

    private suspend fun currentPushToken(): String? = cachedPushToken ?: withTimeoutOrNull(TOKEN_TIMEOUT_MS) {
        suspendCancellableCoroutine<String?> { cont ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { t -> if (cont.isActive) cont.resume(if (t.isSuccessful) t.result else null) }
        }
    }?.also { cachedPushToken = it }

    private fun readOrCreateInstallId(): String {
        val file = File(appContext.noBackupFilesDir, "install_id")
        runCatching { file.readText().trim() }.getOrNull()?.takeIf { runCatching { UUID.fromString(it) }.isSuccess }?.let { return it }
        return UUID.randomUUID().toString().also { id -> runCatching { file.writeText(id) } }
    }

    private companion object {
        const val TAG = "RaSiPush"
        const val PREFS = "rasi.push"
        const val KEY_TOKEN = "registered_token"
        const val KEY_AT = "registered_at"
        const val KEY_ASKED = "permission_asked"
        const val REREGISTER_AFTER_MS = 12 * 60 * 60 * 1000L
        const val RETRY_DELAY_MS = 5_000L
        const val TOKEN_TIMEOUT_MS = 2_000L
    }
}
```

2. **`P/core/AppContainer.kt`**: add `val deviceRegistry = DeviceRegistry(appContext, api, session, appScope)` before `programContext`, and pass it as the new last `ProgramContext` argument.

3. **`P/net/NotificationStreamClient.kt`**: rewrite the file.
```kotlin
/**
 * notifications §3.3 stream client: foreground only (start on ON_START, stop on ON_STOP); every close or error is a
 * reconnect with exponential backoff + full jitter (1 s base, 60 s cap); a fresh token before each connect (a 401 forces a
 * refresh); `ready` resets the backoff and triggers the /unacknowledged re-fetch. State is mutated on [scope] (Main) only.
 */
class NotificationStreamClient(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val scope: CoroutineScope,
    /** Blocking, run on Dispatchers.IO. true = force a refresh (the server rejected the last token). */
    private val tokenProvider: (forceRefresh: Boolean) -> String?,
) {
    var onNotification: ((NotificationDTO) -> Unit)? = null
    var onReady: (() -> Unit)? = null

    @Volatile var isConnected: Boolean = false
        private set
    @Volatile private var running = false
    @Volatile private var forceRefresh = false
    private var attempt = 0
    private var eventSource: EventSource? = null
    private var connectJob: Job? = null

    fun start() { if (running) return; running = true; attempt = 0; connect(0L) }

    fun stop() {
        running = false; isConnected = false
        connectJob?.cancel(); connectJob = null
        eventSource?.cancel(); eventSource = null
    }

    private fun connect(delayMs: Long) {
        connectJob?.cancel()
        connectJob = scope.launch {
            if (delayMs > 0) delay(delayMs)
            val token = withContext(Dispatchers.IO) { tokenProvider(forceRefresh) }
            forceRefresh = false
            if (!running) return@launch
            if (token == null) { scheduleReconnect(); return@launch }
            val request = Request.Builder().url(streamUrl()).header("Accept", "text/event-stream").header("Authorization", "Bearer $token").build()
            eventSource?.cancel()
            eventSource = EventSources.createFactory(client).newEventSource(request, listener)
        }
    }

    private fun scheduleReconnect() {
        isConnected = false
        if (!running) return
        val cap = minOf(MAX_DELAY_MS, BASE_DELAY_MS shl attempt.coerceAtMost(6))
        attempt++
        connect(Random.nextLong(0, cap + 1))
    }

    private val listener = object : EventSourceListener() {
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            when (type) {
                "ready" -> scope.launch { attempt = 0; isConnected = true; onReady?.invoke() }
                "notification" -> {
                    if (data.isBlank() || data == "{}") return
                    runCatching { Network.json.decodeFromString(NotificationDTO.serializer(), data) }.getOrNull()?.let { onNotification?.invoke(it) }
                }
            }
        }
        override fun onClosed(eventSource: EventSource) {
            scope.launch { if (eventSource === this@NotificationStreamClient.eventSource) scheduleReconnect() }
        }
        override fun onFailure(eventSource: EventSource, t: Throwable?, response: okhttp3.Response?) {
            if (response?.code == 401) forceRefresh = true
            scope.launch { if (eventSource === this@NotificationStreamClient.eventSource) scheduleReconnect() }
        }
    }

    private fun streamUrl(): String = (if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/") + "notifications/stream"

    private companion object { const val BASE_DELAY_MS = 1_000L; const val MAX_DELAY_MS = 60_000L }
}
```

4. **`P/core/ProgramContext.kt`** (push / SSE / invites). Add these imports in this step, because checkpoint D needs them:
   - `com.app.rasifiters.core.events.*` (`ClientEventQueue`, `signInFailed`, `forcedSignOut`)
   - `com.app.rasifiters.core.kit.{UiState, dataOrNull, refreshing, failing, toAppError, AppErrorException}`
   - `com.app.rasifiters.net.{PendingInviteDTO, InviteResponseRequest, Network, TokenRefresher, AuthUnavailableException}`
   - `com.app.rasifiters.push.DeviceRegistry`
   - `kotlinx.coroutines.coroutineScope`
   - `kotlin.coroutines.cancellation.CancellationException`

   Then the edits:
   - **4a.** Constructor: add `private val deviceRegistry: DeviceRegistry`.
   - **4b. Ride-along.**
     - `login`: first line `val ride = deviceRegistry.beginSignIn()`, then `LoginRequest(identifier, password, pushToken = ride.pushToken, deviceId = ride.deviceId, platform = PLATFORM)`. After `applyLoginSession(...)`: `deviceRegistry.markRegistered(ride.pushToken)`.
     - `socialSignIn`: the same `ride`, with `OAuthRequest(provider = "google", idToken = idToken, pushToken = ride.pushToken, deviceId = ride.deviceId, platform = PLATFORM)`. In the non-`needsProfile` branch, after apply: `deviceRegistry.markRegistered(ride.pushToken)`.
     - `completeSocial`: after apply, `deviceRegistry.sync()`.
   - **4c. Push section** (:489-519). Delete `lastRegisteredPushToken` (and its reset in `clearSession` :1213), the old `registerPushTokenIfNeeded` body and `onNewPushToken`. Replace with:
```kotlin
    fun registerPushTokenIfNeeded() = deviceRegistry.sync()
    fun shouldAskNotificationPermission() = deviceRegistry.shouldAskNotificationPermission()
    fun markNotificationPermissionAsked() = deviceRegistry.markNotificationPermissionAsked()

    /** A foreground FCM message (MainActivity / tray path) — keep the inbox fresh (invites §3.1). */
    fun onPushReceived(type: String?) {
        if (session.signedIn.value && type == "program.invite_received") scope.launch { loadMyInvites() }
    }
```
     In 8c's `login`, `pushToken = lastRegisteredPushToken` is replaced by 4b.
   - **4d. `tearDown`.** Delete the `pushToken` capture and the inline unregister; add `deviceRegistry.unregister()` as the first line, before `clearSession()`.
   - **4e. SSE** (:417-452). Replace the `notificationStreamClient` var, `startNotificationStreamIfNeeded`, `stopNotificationStream` and `loadUnacknowledgedNotifications` with:
```kotlin
    private val ackInFlight = mutableSetOf<String>()
    private val streamClient = NotificationStreamClient(baseUrl, Network.streamClient(), scope) { force ->
        try {
            if (force) (refresher.refresh(session.accessToken) as? TokenRefresher.Outcome.Refreshed)?.accessToken
            else refresher.tokenForRequest()
        } catch (_: AuthUnavailableException) { null }
    }.also { c ->
        c.onNotification = { dto -> scope.launch { enqueueNotification(dto) } }
        c.onReady = { scope.launch { loadUnacknowledgedNotifications() } }
    }
    /** FCM foreground suppression (D-rule): the in-app modal already shows what arrives while connected. */
    val isStreamConnected: Boolean get() = streamClient.isConnected

    fun startNotificationStream() { if (session.signedIn.value) streamClient.start() }
    fun pauseNotificationStream() = streamClient.stop()
    fun stopNotificationStream() { streamClient.stop(); _notificationQueue.value = emptyList(); notificationIds.clear() }

    /** notifications §3.3: after every `ready`, re-fetch and merge by id (the stream never replays). */
    suspend fun loadUnacknowledgedNotifications() {
        if (!session.signedIn.value) return
        runCatching { api.getUnacknowledgedNotifications() }.onSuccess { items ->
            val fresh = items.filterNot { it.id in ackInFlight }
            val newOnes = fresh.filter { it.id !in notificationIds }
            notificationIds.clear(); notificationIds.addAll(fresh.map { it.id })
            _notificationQueue.value = sortNotifications(fresh)
            newOnes.distinctBy { it.type }.forEach { refreshDataForNotification(it) }
        }
    }

    /** RootScreen ON_START — `launch` (first start of this signed-in state) or `foreground`. */
    fun onForeground(trigger: String) {
        events.flushSoon()
        if (!session.signedIn.value) return
        startNotificationStream()
        registerPushTokenIfNeeded()
        health.onTrigger(trigger)
    }

    fun onBackground() = pauseNotificationStream()
```
   - **4f. `acknowledgeNotification`:** add `ackInFlight += notification.id` before the POST, then `runCatching { api.acknowledgeNotification(notification.id) }.onSuccess { ackInFlight -= notification.id }.onFailure { ackInFlight -= notification.id; loadUnacknowledgedNotifications() }`.
   - **4g. Push tap:**
```kotlin
    private val _pushRoute = MutableStateFlow<PushRoute?>(null)
    val pushRoute: StateFlow<PushRoute?> = _pushRoute.asStateFlow()
    fun clearPushRoute() { _pushRoute.value = null }

    /** notifications §3.2: a push tap acknowledges and opens the target (invite → My Invites; anything else → picker). */
    fun onPushTap(notificationId: String, type: String?) {
        if (!session.signedIn.value) return
        ackInFlight += notificationId
        _notificationQueue.value = _notificationQueue.value.filterNot { it.id == notificationId }
        notificationIds.remove(notificationId)
        scope.launch { runCatching { api.acknowledgeNotification(notificationId) }; ackInFlight -= notificationId }
        _pushRoute.value = if (type == "program.invite_received") PushRoute.INVITES else PushRoute.PROGRAMS
    }
```
     Add `enum class PushRoute { INVITES, PROGRAMS }` at the bottom of the file.
   - **4h. Invites.** Replace `respondToInvite(programId, accept)` (:384-391) with:
```kotlin
    private val _invites = MutableStateFlow<UiState<List<PendingInviteDTO>>>(UiState.Idle)
    /** The ONE invite inbox (invites §3.1) — GET /my-invites. */
    val invites: StateFlow<UiState<List<PendingInviteDTO>>> = _invites.asStateFlow()

    suspend fun loadMyInvites(): Result<Unit> {
        _invites.value = _invites.value.refreshing()
        return runCatching { api.getMyInvites() }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { _invites.value = UiState.fresh(it) }
            .onFailure { if (it !is CancellationException) _invites.value = _invites.value.failing(it.toAppError()) }
            .map { }
    }

    /** PUT /invite-response, then inbox + programs reload in parallel. The 200 message is not shown (iOS InvitesTabView parity — D-rule). */
    suspend fun respondToInvite(inviteId: String, accept: Boolean, blockFuture: Boolean = false): Result<Unit> = runCatching {
        api.respondToInvite(InviteResponseRequest(inviteId, if (accept) "accept" else "decline", blockFuture.takeIf { it && !accept }))
        coroutineScope { launch { loadMyInvites() }; launch { loadPrograms() } }
        Unit
    }.recoverCatching { throw AppErrorException(it.toAppError()) }

    /** A "requested" card's Cancel Request — unchanged PUT /program-memberships (status removed). */
    suspend fun cancelJoinRequest(programId: String): Result<Unit> = runCatching {
        val memberId = session.memberId ?: error("Missing member id.")
        api.updateMembership(MembershipUpdateRequest(programId, memberId, "removed"))
        loadPrograms().getOrThrow()
    }.recoverCatching { throw it.asApiError() }
```
   - **4i. `sendProgramInvite`** (:999-1007): `return runCatching { api.sendInvite(InviteRequest(pid, username.trim())); Unit }.recoverCatching { throw AppErrorException(it.toAppError()) }`. Update the KDoc: the swallow is removed (invites §3.1).
   - **4j. `refreshDataForNotification`:** the `"program.invite_received"` branch → `runCatching { loadMyInvites() }`. The KDoc's "the picker list carries invites" → "the inbox is /my-invites".
   - **4k. `clearSession`:** add `_invites.value = UiState.Idle`, `_pushRoute.value = null` and `ackInFlight.clear()`.

5. **`P/push/RaSiFirebaseMessagingService.kt`**: rewrite the class.
```kotlin
class RaSiFirebaseMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        (application as? App)?.container?.deviceRegistry?.sync(newToken = token)
    }

    /** Foreground delivery (background messages are shown by the tray). notifications §3.2 "Android shows foreground
     *  messages" — except while the SSE stream is connected (the in-app modal shows it; D-rule). */
    override fun onMessageReceived(message: RemoteMessage) {
        val container = (application as? App)?.container ?: return
        val payload = message.data
        if (container.programContext.isStreamConnected) return
        container.programContext.onPushReceived(payload["type"])
        val title = message.notification?.title ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val channel = message.notification?.channelId ?: channelFor(payload["type"])
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            payload["notification_id"]?.let { putExtra("notification_id", it) }
            payload["type"]?.let { putExtra("type", it) }
            payload["program_id"]?.let { putExtra("program_id", it) }
        }
        val requestCode = (payload["notification_id"] ?: title).hashCode()
        val pending = PendingIntent.getActivity(this, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(message.notification?.body.orEmpty())
            .setAutoCancel(true).setContentIntent(pending).build()
        NotificationManagerCompat.from(this).notify(requestCode, notification)
    }

    private fun channelFor(type: String?) =
        getString(if (type in INVITE_TYPES) R.string.invites_notification_channel_id else R.string.default_notification_channel_id)

    private companion object {
        val INVITE_TYPES = setOf("program.invite_received", "program.role_changed", "program.admin_transferred", "program.member_removed")
    }
}
```
   `onMessageReceived` runs off the main thread; `onPushReceived` only launches on Main. Name the map `payload`, never `data`: inside `Intent.apply`, `data` binds to `Intent.data`.

6. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/src/main/res/values/strings.xml`**: add
```xml
    <!-- High-importance FCM channel for invites + membership changes (notifications §3.2). -->
    <string name="invites_notification_channel_id" translatable="false">rasi_invites</string>
    <string name="invites_notification_channel_name">Invites &amp; membership</string>
```

7. **`P/App.kt`**: `createNotificationChannel()` → `createNotificationChannels()`. It creates the existing `rasi_default` (IMPORTANCE_DEFAULT) and `NotificationChannel(getString(R.string.invites_notification_channel_id), getString(R.string.invites_notification_channel_name), NotificationManager.IMPORTANCE_HIGH)`. The manifest default channel stays `rasi_default`.

8. **`P/MainActivity.kt`**
   - In `onCreate`, after `handleDeepLink(intent)`: `if (savedInstanceState == null) handlePushTap(intent)`.
   - In `onNewIntent`: `handlePushTap(intent)`.
   - Add:
```kotlin
    /** FCM tap (tray or our foreground post): extras carry notification_id / type → acknowledge + route (notifications §3.2). */
    private fun handlePushTap(intent: Intent?) {
        val id = intent?.getStringExtra("notification_id") ?: return
        (application as App).container.programContext.onPushTap(id, intent.getStringExtra("type"))
        intent.removeExtra("notification_id")
    }
```

9. **`P/ui/RootScreen.kt`**: replace the effects block (:62-99) with:
```kotlin
    // notifications §3.1 + board §3.5: POST_NOTIFICATIONS asked ONCE (flag in no-backup rasi.push), right after the first
    // sign-in (Android 13+); the answer re-runs the registration. Settings fallback = NotificationsScreen.
    val notificationPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        programContext.registerPushTokenIfNeeded()
    }
    LaunchedEffect(signedIn) {
        if (signedIn && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            programContext.shouldAskNotificationPermission()
        ) {
            programContext.markNotificationPermissionAsked()
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Foreground lifecycle: ON_START → stream + registration + health (`launch` on this state's first start, else
    // `foreground`) + event flush; ON_STOP → close the stream (foreground only, notifications §3.3).
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, signedIn) {
        var firstStart = true
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> { programContext.onForeground(if (firstStart) "launch" else "foreground"); firstStart = false }
                Lifecycle.Event.ON_STOP -> programContext.onBackground()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
```
   In `SignedInGraph`, after the widget-route effect, add:
```kotlin
    // Push tap (notifications §3.2): pop back to the picker, which consumes the route (opens My Invites for invites).
    val pushRoute by programContext.pushRoute.collectAsStateWithLifecycle()
    LaunchedEffect(pushRoute) { if (pushRoute != null) nav.popBackStack(Routes.PROGRAM_PICKER, inclusive = false) }
```

10. **NEW `P/ui/programs/InviteInbox.kt`** (package `com.app.rasifiters.ui.programs`; imports: Compose foundation/material3, `AppOrange`, `PendingInviteDTO`, `java.time.LocalDate`, `java.time.format.DateTimeFormatter`, `java.util.Locale`).
```kotlin
/** One pending invite (invites §3.1) — the iOS InviteCardView content inside the sheet's existing card chrome. */
@Composable
fun InviteCard(invite: PendingInviteDTO, busy: Boolean, onAccept: () -> Unit, onDecline: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(invite.programName ?: "Unknown Program", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
        Text(inviteDateRange(invite.programStartDate, invite.programEndDate), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        invite.invitedByName?.let {
            Text("Invited by $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        }
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            InvitePill("Accept", AppOrange, enabled = !busy, onClick = onAccept)
            InvitePill("Decline", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), enabled = !busy, onClick = onDecline)
        }
    }
}

/** iOS DeclineInviteDialog parity: confirm + optional "Block future invites". */
@Composable
fun DeclineInviteDialog(programName: String, onDecline: (blockFuture: Boolean) -> Unit, onDismiss: () -> Unit) {
    var block by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Decline invitation?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(programName)
                Row(Modifier.fillMaxWidth().clickable { block = !block }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = block, onCheckedChange = { block = it }, colors = CheckboxDefaults.colors(checkedColor = AppOrange))
                    Text("Block future invites")
                }
            }
        },
        confirmButton = { TextButton(onClick = { onDecline(block) }) { Text("Decline", color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
internal fun InvitePill(label: String, color: Color, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        modifier = Modifier.clip(CircleShape).background(color.copy(alpha = 0.16f)).clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) { Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = color) }
}

private val INVITE_DATE_OUT = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

/** "Oct 1, 2026 – Dec 31, 2026" (iOS InviteCardView), "Start" / "End" when missing. */
private fun inviteDateRange(start: String?, end: String?): String {
    fun fmt(d: String?) = d?.let { runCatching { LocalDate.parse(it.take(10)).format(INVITE_DATE_OUT) }.getOrNull() }
    return "${fmt(start) ?: "Start"} \u2013 ${fmt(end) ?: "End"}"
}
```

11. **`P/ui/programs/ProgramActionsSheet.kt`**
    - **11a.** Delete the private `InvitePill` (:241-252).
    - **11b.** Signature `ProgramActionsSheet(programContext: ProgramContext, onDismiss: () -> Unit, openOnInvites: Boolean = false)`. Replace :80-85:
```kotlin
    val invitesState by programContext.invites.collectAsStateWithLifecycle()
    val programs by programContext.programs.collectAsStateWithLifecycle()
    val requested = programs.filter { it.myStatus == "requested" }
    // Push tap → always My Invites (the inbox may still be loading); else land on Invites only when there's something to act on.
    var selectedTab by remember {
        mutableIntStateOf(if (openOnInvites || invitesState.dataOrNull.orEmpty().isNotEmpty() || requested.isNotEmpty()) 0 else 1)
    }
    LaunchedEffect(openOnInvites) { if (openOnInvites) selectedTab = 0 }
```
      Delete `val isGlobalAdmin`.
    - **11c.** `SegmentedToggle(left = "My Invites", …)` always. Tab 0 → `InvitesTab(programContext, invitesState, requested, onAccepted = onDismiss)`.
    - **11d.** Replace `InvitesTab` / `InvitesEmptyState` / `InviteRow` with:
```kotlin
@Composable
private fun InvitesTab(programContext: ProgramContext, state: UiState<List<PendingInviteDTO>>, requested: List<ProgramDTO>, onAccepted: () -> Unit) {
    val scope = rememberCoroutineScope()
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var busyId by remember { mutableStateOf<String?>(null) }
    var declineTarget by remember { mutableStateOf<PendingInviteDTO?>(null) }
    val invites = state.dataOrNull.orEmpty()

    fun respond(invite: PendingInviteDTO, accept: Boolean, block: Boolean) {
        busyId = invite.inviteId; errorMessage = null
        scope.launch {
            programContext.respondToInvite(invite.inviteId, accept, block)
                .onSuccess { if (accept) onAccepted() }
                .onFailure { errorMessage = it.message }
            busyId = null
        }
    }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Program Invitations", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("Accept invitations to join programs", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        errorMessage?.let { FormErrorText(it) }
        val empty = invites.isEmpty() && requested.isEmpty()
        when {
            empty && state is UiState.Failed -> ErrorView(state.error, onRetry = { scope.launch { programContext.loadMyInvites() } })
            empty && (state is UiState.Loading || state is UiState.Idle) ->
                Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            empty -> InvitesEmptyState()
            else -> {
                invites.forEach { invite ->
                    InviteCard(invite, busy = busyId == invite.inviteId, onAccept = { respond(invite, true, false) }, onDecline = { declineTarget = invite })
                }
                requested.forEach { program ->
                    RequestedRow(program) {
                        scope.launch { programContext.cancelJoinRequest(program.id).onFailure { errorMessage = it.toAppError().message } }
                    }
                }
            }
        }
    }
    declineTarget?.let { inv ->
        DeclineInviteDialog(inv.programName ?: "this program", onDecline = { block -> declineTarget = null; respond(inv, false, block) }, onDismiss = { declineTarget = null })
    }
}
```
      - `InvitesEmptyState()` keeps the existing body with the non-admin text only ("You don't have any program invitations right now.").
      - `RequestedRow(program: ProgramDTO, onCancel: () -> Unit)` is the existing `InviteRow` "requested" branch: name, "Request pending approval", `InvitePill("Cancel Request", …, onClick = onCancel)`.
      - Imports: `LaunchedEffect`, `UiState`, `dataOrNull`, `toAppError`, `ErrorView`, `PendingInviteDTO`.
    - **11e.** KDoc: invites come from `/my-invites`, accept/decline go through `/invite-response`, and `openOnInvites` is for push taps.

12. **`P/ui/programs/ProgramPickerScreen.kt`** (invites part)
    - **12a. State and badge.**
      - Add `val invitesState by programContext.invites.collectAsStateWithLifecycle()`, `val pushRoute by programContext.pushRoute.collectAsStateWithLifecycle()` and `var actionsOnInvites by remember { mutableStateOf(false) }`.
      - Replace :115 with `val pendingInvites = (invitesState.dataOrNull?.size ?: 0) + programs.count { it.myStatus == "requested" }`.
    - **12b. Parallel load and push route.** Replace the `LaunchedEffect(Unit)` (:106-108):
```kotlin
    suspend fun reloadAll() = coroutineScope { launch { programContext.loadPrograms() }; launch { programContext.loadMyInvites() } }
    LaunchedEffect(Unit) { reloadAll() }
    LaunchedEffect(pushRoute) {
        val route = pushRoute ?: return@LaunchedEffect
        programContext.clearPushRoute()
        if (route == PushRoute.INVITES) { actionsOnInvites = true; showActions = true }
        reloadAll()
      }
```
      - The sheet call (:240-243): `ProgramActionsSheet(programContext = programContext, onDismiss = { showActions = false; actionsOnInvites = false }, openOnInvites = actionsOnInvites)`. The FAB `onClick = { showActions = true }` is unchanged.
      - Keep `errorMessage` / `ErrorBanner` for reorder and delete failures only: `"Couldn't save program order: ${it.toAppError().message}"` and `it.toAppError().message`. F moves load errors to the kit.
    - **12c. Card.** In `ProgramCard`, replace `onRespond: (Boolean) -> Unit` with `onCancelRequest: () -> Unit`. In `when (program.myStatus)` (:368-378), delete the `"invited"` branch; the `"requested"` branch becomes `InvitePill("Cancel Request", …, onClick = onCancelRequest)`. The call site (:196-201) becomes `onCancelRequest = { scope.launch { programContext.cancelJoinRequest(program.id).onFailure { errorMessage = it.toAppError().message } } }`.
    - **12d.** Delete the private `InvitePill` (:400-411); the internal one is call-compatible.
    - **12e.** KDoc (:77): invites come from the inbox; cards no longer accept inline.

13. **`P/net/Dtos.kt`**: `MembershipUpdateRequest` KDoc (:214) → "PUT /program-memberships — a 'requested' card's Cancel Request (status removed)". `ApiService.updateMembership` stays.

14. Compile checkpoint D.

### E. Google button (board §5, W5 §7) (checkpoint E)

1. **`P/ui/auth/GoogleCredential.kt`**: replace the `GetGoogleIdOption` usage throughout.
```kotlin
/** A Google ID token + the raw nonce whose SHA-256 hex Google embedded in it (W5 §7.3; /auth/oauth + /auth/link re-hash it). */
data class GoogleIdResult(val idToken: String, val rawNonce: String)

/** A Credential Manager failure mapped to a human message + a short SDK code for auth.sign_in_failed. */
class GoogleSignInException(val userMessage: String, val code: String) : Exception(userMessage)

private const val MSG_NO_ACCOUNT = "No Google account is available on this device. Add one in Settings, then try again."
private const val MSG_PLAY_SERVICES = "Google sign-in isn't available right now. Update Google Play services and try again."
private const val MSG_UNSUPPORTED = "Google sign-in isn't supported on this device."
private const val MSG_INTERRUPTED = "Google sign-in was interrupted. Try again."
private const val MSG_GENERIC = "Google sign-in failed. Try again."

/** Google's button flow (GetSignInWithGoogleOption) with a fresh nonce. User cancel → GetCredentialCancellationException
 *  (callers stay silent); coroutine cancellation rethrown; one automatic retry on Interrupted; everything else → GoogleSignInException. */
suspend fun fetchGoogleIdToken(context: Context): GoogleIdResult {
    val rawNonce = newRawNonce()
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).setNonce(sha256Hex(rawNonce)).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    val manager = CredentialManager.create(context)
    var retried = false
    while (true) {
        try {
            val result = manager.getCredential(context, request)
            return GoogleIdResult(GoogleIdTokenCredential.createFrom(result.credential.data).idToken, rawNonce)
        } catch (e: CancellationException) { throw e
        } catch (e: GetCredentialCancellationException) { throw e
        } catch (e: GetCredentialInterruptedException) { if (!retried) { retried = true; continue }; throw GoogleSignInException(MSG_INTERRUPTED, "interrupted")
        } catch (e: NoCredentialException) { throw GoogleSignInException(MSG_NO_ACCOUNT, "no_credential")
        } catch (e: GetCredentialProviderConfigurationException) { throw GoogleSignInException(MSG_PLAY_SERVICES, "provider_configuration")
        } catch (e: GetCredentialUnsupportedException) { throw GoogleSignInException(MSG_UNSUPPORTED, "unsupported")
        } catch (e: GetCredentialException) { throw GoogleSignInException(MSG_GENERIC, e.type.takeLast(64))
        } catch (e: GoogleIdTokenParsingException) { throw GoogleSignInException(MSG_GENERIC, "token_parsing")
        } catch (e: Exception) { throw GoogleSignInException(MSG_GENERIC, "unknown") }
    }
}

private fun newRawNonce(): String {
    val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
    return Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}

private fun sha256Hex(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
```
   - **`GoogleSignInButton`** signature → `(onResult: (GoogleIdResult) -> Unit, onError: (GoogleSignInException) -> Unit, enabled: Boolean = true)`.
     - Add `var inFlight by remember { mutableStateOf(false) }`.
     - `.clickable(enabled = enabled && !inFlight) { inFlight = true; scope.launch { try { onResult(fetchGoogleIdToken(context)) } catch (_: GetCredentialCancellationException) { } catch (e: GoogleSignInException) { onError(e) } finally { inFlight = false } } }`.
     - The chrome is unchanged.
   - Delete the old headless `fetchGoogleIdToken`.
   - Imports:
     - `com.google.android.libraries.identity.googleid.{GetSignInWithGoogleOption, GoogleIdTokenCredential, GoogleIdTokenParsingException}`
     - `androidx.credentials.exceptions.{GetCredentialException, GetCredentialInterruptedException, GetCredentialProviderConfigurationException, GetCredentialUnsupportedException, NoCredentialException}`
     - `android.util.Base64`, `java.security.{MessageDigest, SecureRandom}`, `kotlin.coroutines.cancellation.CancellationException`
     - Compose runtime `getValue` / `setValue` / `mutableStateOf` / `remember`
     - Drop the `GetGoogleIdOption` import.

2. **`P/core/ProgramContext.kt`**
   - `socialSignIn(idToken: String, nonce: String)` passes `nonce = nonce` into `OAuthRequest`.
   - `linkGoogle(idToken: String, nonce: String)` → `api.linkIdentity(LinkRequest(provider = "google", idToken = idToken, nonce = nonce))`.
   - `unlink` → `UnlinkRequest(provider = provider)`.
   - Add `fun reportGoogleProviderFailure(code: String) = events.signInProviderFailed("google", code)`.

3. **`P/ui/auth/LoginScreen.kt`** (:113-121):
```kotlin
GoogleSignInButton(
    onResult = { google ->
        scope.launch {
            programContext.socialSignIn(google.idToken, google.rawNonce)
                .onSuccess { needsProfile -> if (needsProfile) onCreateAccount() }
                .onFailure { errorMessage = it.toCredentialMessage() }
        }
    },
    onError = { e -> errorMessage = e.userMessage; programContext.reportGoogleProviderFailure(e.code) },
)
```

4. **`P/ui/auth/CreateAccountScreen.kt`**: the same replacement in the Google block (:177-185), without `onSuccess`. Lines :92 and :100 → `errorMessage = it.toCredentialMessage()`; :98 is unchanged.

5. **`P/ui/program/ProfileScreen.kt`** (:272-288): inside the link `try`, `val google = fetchGoogleIdToken(context); programContext.linkGoogle(google.idToken, google.rawNonce)`. Replace `catch (e: Exception) { linkError = e.message ?: … }` with `catch (e: GoogleSignInException) { linkError = e.userMessage }`; keep the cancellation catch. Linking is not a sign-in, so no event is sent.

6. Compile checkpoint E.

### F. Kit adoption and instant opens (board §6.5 / D-9, frontend-kit §5–6) (checkpoint F)

1. **NEW `P/core/LaunchCache.kt`**. Imports: `android.content.Context`, `com.app.rasifiters.net.{Network, ProgramDTO}`, `kotlinx.coroutines.{Dispatchers, withContext}`, `kotlinx.serialization.{KSerializer, Serializable}`, `java.io.File`.
```kotlin
package com.app.rasifiters.core

@Serializable private data class CachedPrograms(val savedAt: Long, val programs: List<ProgramDTO>)
@Serializable private data class CachedSummary(val savedAt: Long, val summary: SummaryData)

/** Instant opens (board §6.5 / D-9): the last good program list + per-program Summary, PER MEMBER, in noBackupFilesDir
 *  (never backed up). Shown before the first network wave, rewritten after each good load, deleted by the sign-out teardown.
 *  A missing / unreadable file is just a miss. */
class LaunchCache(context: Context) {
    data class Hit<T>(val data: T, val savedAt: Long)

    private val root = File(context.applicationContext.noBackupFilesDir, "launch_cache")

    suspend fun readPrograms(memberId: String): Hit<List<ProgramDTO>>? =
        read(file(memberId, PROGRAMS), CachedPrograms.serializer())?.let { Hit(it.programs, it.savedAt) }

    suspend fun writePrograms(memberId: String, programs: List<ProgramDTO>) =
        write(file(memberId, PROGRAMS), CachedPrograms.serializer(), CachedPrograms(System.currentTimeMillis(), programs))

    suspend fun readSummary(memberId: String, programId: String): Hit<SummaryData>? =
        read(file(memberId, "summary_$programId.json"), CachedSummary.serializer())?.let { Hit(it.summary, it.savedAt) }

    suspend fun writeSummary(memberId: String, programId: String, summary: SummaryData) =
        write(file(memberId, "summary_$programId.json"), CachedSummary.serializer(), CachedSummary(System.currentTimeMillis(), summary))

    suspend fun clear() { withContext(Dispatchers.IO) { root.deleteRecursively() } }

    private fun file(memberId: String, name: String) = File(File(root, memberId), name)

    private suspend fun <T> read(file: File, serializer: KSerializer<T>): T? = withContext(Dispatchers.IO) {
        if (!file.exists()) null else runCatching { Network.json.decodeFromString(serializer, file.readText()) }.getOrNull()
    }

    private suspend fun <T> write(file: File, serializer: KSerializer<T>, value: T) {
        withContext(Dispatchers.IO) {
            runCatching {
                file.parentFile?.mkdirs()
                val tmp = File(file.parentFile, file.name + ".tmp")
                tmp.writeText(Network.json.encodeToString(serializer, value))
                tmp.renameTo(file)
            }
        }
    }

    private companion object { const val PROGRAMS = "programs.json" }
}
```

2. **`P/core/AppContainer.kt`**
   - After `session`: `private val connectivity = ConnectivityObserver(appContext)` and `val isOnline: StateFlow<Boolean> = connectivity.onlineState(appScope)`.
   - Before `programContext`: `val launchCache = LaunchCache(appContext)`.
   - Pass `launchCache, isOnline` as the last two `ProgramContext` arguments.

3. **`P/core/ProgramContext.kt`**
   - **3a.** Constructor: add `private val launchCache: LaunchCache, val isOnline: StateFlow<Boolean>`.
   - **3b. Programs** (:162-166). Delete `_programsLoading` / `programsLoading`. Add:
```kotlin
    private val _programsState = MutableStateFlow<UiState<List<ProgramDTO>>>(UiState.Idle)
    /** The picker's kit state (frontend-kit §5); its data always equals [programs]. */
    val programsState: StateFlow<UiState<List<ProgramDTO>>> = _programsState.asStateFlow()

    /** Replace the list keeping the load-state variant (reorder / delete / edit / leave). */
    private fun setPrograms(list: List<ProgramDTO>) {
        _programs.value = list
        _programsState.value = when (val s = _programsState.value) {
            is UiState.Loaded -> s.copy(data = list)
            is UiState.Stale -> s.copy(data = list)
            else -> s
        }
    }
```
     - Every `_programs.value = …` write becomes `setPrograms(…)`: `moveProgram` :366, `persistProgramOrder` :374, `deleteProgram` :381, `updateProgram` :1192, `leaveProgram` :1202.
     - `clearSession` sets `_programs.value = emptyList(); _programsState.value = UiState.Idle`.
   - **3c. `loadPrograms`:**
```kotlin
    /** GET /programs. The first call after launch / sign-in shows this member's cached list instantly, then refreshes. */
    suspend fun loadPrograms(): Result<Unit> {
        val memberId = session.memberId
        if (_programsState.value is UiState.Idle && memberId != null) {
            launchCache.readPrograms(memberId)?.let { hit ->
                if (_programsState.value is UiState.Idle) { _programs.value = hit.data; _programsState.value = UiState.Loaded(hit.data, hit.savedAt) }
            }
        }
        _programsState.value = _programsState.value.refreshing()
        return runCatching { api.getPrograms() }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { list ->
                _programs.value = list; _programsState.value = UiState.fresh(list)
                if (memberId != null && memberId == session.memberId) launchCache.writePrograms(memberId, list)
            }
            .onFailure { if (it !is CancellationException) _programsState.value = _programsState.value.failing(it.toAppError()) }
            .map { }
    }
```
   - **3d. Summary** (:546-598). Delete `_summaryLoading`, `summaryLoading`, `_summaryError`, `summaryError`. Replace `_summary` / `summary` / `loadSummary` with:
```kotlin
    private val _summaryState = MutableStateFlow<UiState<SummaryData>>(UiState.Idle)
    val summaryState: StateFlow<UiState<SummaryData>> = _summaryState.asStateFlow()
    private val _summary = MutableStateFlow(SummaryData())
    /** The detail screens' view of the same data (empty until loaded). */
    val summary: StateFlow<SummaryData> = _summary.asStateFlow()
    private var summaryProgramId: String? = null

    private fun setSummaryState(state: UiState<SummaryData>) { _summaryState.value = state; _summary.value = state.dataOrNull ?: SummaryData() }

    /** The Summary tab's 7 reads, in PARALLEL (board §6.5); this member's cached Summary first when the program changes. */
    suspend fun loadSummary(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.failure(IllegalStateException("No active program."))
        val memberId = session.memberId
        if (summaryProgramId != pid) {
            summaryProgramId = pid
            setSummaryState(UiState.Idle)
            if (memberId != null) launchCache.readSummary(memberId, pid)?.let { hit ->
                if (summaryProgramId == pid && _summaryState.value is UiState.Idle) setSummaryState(UiState.Loaded(hit.data, hit.savedAt))
            }
        }
        setSummaryState(_summaryState.value.refreshing())
        return runCatching {
            coroutineScope {
                val mtd = async { api.getMtdParticipation(pid) }
                val total = async { api.getTotalWorkoutsMtd(pid) }
                val duration = async { api.getTotalDurationMtd(pid) }
                val avg = async { api.getAvgDurationMtd(pid) }
                val timeline = async { api.getActivityTimeline("week", pid).buckets }
                val distribution = async { api.getDistributionByDay(pid) }
                val types = async { api.getWorkoutTypes(pid, 100) }
                SummaryData(mtd.await(), total.await(), duration.await(), avg.await(), timeline.await(), distribution.await(), types.await())
            }
        }.recoverCatching { throw it.asApiError() }
            .onSuccess { data ->
                if (summaryProgramId == pid) {
                    setSummaryState(UiState.fresh(data))
                    if (memberId != null && memberId == session.memberId) launchCache.writeSummary(memberId, pid, data)
                }
            }
            .onFailure { if (it !is CancellationException && summaryProgramId == pid) setSummaryState(_summaryState.value.failing(it.toAppError())) }
            .map { }
    }

    /** Summary pull-to-refresh: reload now; the health run (`pull_to_refresh`) goes on the app scope (survives leaving the
     *  tab) and reloads again only if it applied something. */
    suspend fun refreshSummary(): Result<Unit> {
        scope.launch { if (((health.sync("pull_to_refresh") as? HealthSyncResult.Synced)?.count ?: 0) > 0) loadSummary() }
        return loadSummary()
    }
```
   - **3e.** `clearSession`: replace `_summary.value = SummaryData(); _summaryError.value = null` with `setSummaryState(UiState.Idle); summaryProgramId = null`.
   - **3f.** `tearDown`: add `launchCache.clear()` right after `clearSession()`.
   - **3g.** Annotate `SummaryData` (bottom of the file) with `@Serializable`; all 7 field types already are.
   - **3h.** Add imports: `kotlinx.coroutines.async`, `kotlinx.serialization.Serializable`, `com.app.rasifiters.health.HealthSyncResult`.

4. **`P/ui/programs/ProgramPickerScreen.kt`** (kit). Add `@OptIn(ExperimentalMaterial3Api::class)` to the composable.
   - **4a. State.** Replace `val loading by programContext.programsLoading…` with `val loadState by programContext.programsState.collectAsStateWithLifecycle()` and `val online by programContext.isOnline.collectAsStateWithLifecycle()`. Add `var pulling by remember { mutableStateOf(false) }`.
   - **4b. Pull-to-refresh.** Replace `Box(modifier = Modifier.weight(1f).fillMaxWidth()) {` (:145) with:
```kotlin
PullToRefreshBox(
    isRefreshing = pulling,
    onRefresh = { pulling = true; scope.launch { reloadAll(); pulling = false } },
    modifier = Modifier.weight(1f).fillMaxWidth(),
) {
```
   - **4c. Body.** Its `when` becomes (with `val current = loadState` above):
```kotlin
when {
    programs.isEmpty() && current is UiState.Failed ->
        ErrorView(current.error, Modifier.align(Alignment.Center), onRetry = { scope.launch { reloadAll() } })
    programs.isEmpty() && (current is UiState.Loading || current is UiState.Idle) -> CircularProgressIndicator(Modifier.align(Alignment.Center))
    programs.isEmpty() -> EmptyState("No programs yet", "Create a program to get started.")
    // … the existing visiblePrograms.isEmpty() / LazyColumn branches unchanged
}
```
   - **4d. Floating banner,** as the LAST child of the root `Box`, after the FAB Column:
```kotlin
val banner = when {
    !online -> FloatingBannerVariant.Offline
    loadState is UiState.Stale -> FloatingBannerVariant.Stale
    else -> null
}
banner?.let { v ->
    FloatingBanner(
        v, Modifier.align(Alignment.BottomCenter).navigationBarsPadding(), bottomInset = 146.dp,
        onRetry = if (v == FloatingBannerVariant.Stale) ({ scope.launch { reloadAll() } }) else null,
    )
}
```

5. **`P/ui/summary/SummaryScreen.kt`**. Add `@OptIn(ExperimentalMaterial3Api::class)`.
   - **5a. State.** Replace `val summary by …` / `val error by …` with `val state by programContext.summaryState.collectAsStateWithLifecycle()` and `val online by programContext.isOnline.collectAsStateWithLifecycle()`. Add `val scope = rememberCoroutineScope()` and `var pulling by remember { mutableStateOf(false) }`.
   - **5b. Analytics extraction.** Move :95-133 (the two metric Rows and the three chart cards) verbatim into `@Composable private fun SummaryAnalytics(summary: SummaryData, onNavigate: (String) -> Unit)`. Delete the private `ErrorBanner` (:164-178).
   - **5c. Root layout:**
```kotlin
val summary = state.dataOrNull
val banner = when { !online -> FloatingBannerVariant.Offline; state is UiState.Stale -> FloatingBannerVariant.Stale; else -> null }
Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
    PullToRefreshBox(
        isRefreshing = pulling,
        onRefresh = { pulling = true; scope.launch { programContext.refreshSummary(); pulling = false } },
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(/* existing modifier + arrangement */) {
            Header(…); if (locked) DataLockBanner()
            ProgramProgressCard(…); AddWorkoutCard(…); AddDailyHealthCard(…)
            val current = state
            when {
                summary != null -> SummaryAnalytics(summary, onNavigate)
                current is UiState.Failed -> ErrorView(current.error, onRetry = { scope.launch { programContext.loadSummary() } })
                else -> Box(Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            }
            Spacer(Modifier.height(if (banner != null) 84.dp else 8.dp))
        }
    }
    banner?.let { v ->
        FloatingBanner(v, Modifier.align(Alignment.BottomCenter),
            onRetry = if (v == FloatingBannerVariant.Stale) ({ scope.launch { programContext.loadSummary() } }) else null)
    }
}
```
     AppScaffold's `innerPadding` already clears the NavigationBar (kit §6), so no `bottomInset` is needed.

6. Compile checkpoint F.

### G. Version gate (app-config §3; board §1) (checkpoint G)

1. **NEW `P/core/VersionGate.kt`**. Imports: `android.content.{ActivityNotFoundException, Context, Intent}`, `android.net.Uri`, `androidx.core.content.edit`, `com.app.rasifiters.BuildConfig`, `com.app.rasifiters.net.ApiService`, coroutines `Mutex` / `withLock` / flows, `CancellationException`.
```kotlin
package com.app.rasifiters.core

/** app-config §3 Android consumption: installed versionCode < min_android_version_code (or any 426) → blocking
 *  "Update required"; else < latest_android_version_code → dismissable "Update available" (once per version). A failed
 *  read changes nothing — the gate never blocks on an error. */
class VersionGate(context: Context, private val api: ApiService) {
    private val prefs = context.applicationContext.getSharedPreferences("rasi.fiters.prefs", Context.MODE_PRIVATE)
    private val mutex = Mutex()
    private var lastCheckMs = 0L
    private var latestCode: Int? = null
    @Volatile private var blockedByServer = false

    private val _required = MutableStateFlow(false)
    val required: StateFlow<Boolean> = _required.asStateFlow()
    private val _updateAvailable = MutableStateFlow(false)
    val updateAvailable: StateFlow<Boolean> = _updateAvailable.asStateFlow()

    /** Launch, foreground, before a widget replay (throttled to once a minute). */
    suspend fun check() = mutex.withLock {
        val now = System.currentTimeMillis()
        if (now - lastCheckMs < THROTTLE_MS) return@withLock
        val config = try { api.getAppConfig() } catch (e: CancellationException) { throw e } catch (_: Exception) { return@withLock }
        lastCheckMs = now
        val min = config.minAndroidVersionCode
        _required.value = blockedByServer || (min != null && BuildConfig.VERSION_CODE < min)
        latestCode = config.latestAndroidVersionCode
        refreshNudge()
    }

    /** The OkHttp layer saw a 426 (app-config D-C5) — block for the rest of this process. Thread-safe. */
    fun markRequired() { blockedByServer = true; _required.value = true; _updateAvailable.value = false }

    fun dismissUpdate() { latestCode?.let { prefs.edit { putInt(KEY_DISMISSED, it) } }; _updateAvailable.value = false }

    /** Plain Play Store intent (no in-app update library — D-rule); https fallback when no store app. */
    fun openStore(context: Context) {
        val id = BuildConfig.APPLICATION_ID
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$id")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun refreshNudge() {
        val latest = latestCode
        _updateAvailable.value = !_required.value && latest != null && BuildConfig.VERSION_CODE < latest && prefs.getInt(KEY_DISMISSED, 0) != latest
    }

    private companion object { const val THROTTLE_MS = 60_000L; const val KEY_DISMISSED = "update.dismissed_version_code" }
}
```

2. **NEW `P/ui/components/UpdateRequiredScreen.kt`** (imports: `BackHandler`, Compose, `BrandMark`, `PillButton`, `KitCopy`, `AppErrorKind`):
```kotlin
/** Blocking "Update required" (app-config §3; kit copy updateRequired / update). Not dismissable; back closes the app. */
@Composable
fun UpdateRequiredScreen(onUpdate: () -> Unit) {
    val activity = LocalContext.current as? Activity
    BackHandler { activity?.finish() }
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier.fillMaxSize().systemBarsPadding().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp, Alignment.CenterVertically),
        ) {
            BrandMark(sizeDp = 72)
            Text(KitCopy.messageFor(AppErrorKind.UPDATE_REQUIRED), style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
            PillButton(label = KitCopy.UPDATE, onClick = onUpdate, modifier = Modifier.widthIn(max = 260.dp))
        }
    }
}
```

3. **`P/core/AppContainer.kt`**: final shape.
```kotlin
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val session: Session = Session(appContext)
    val appearanceStore: AppearanceStore = AppearanceStore(appContext)
    private val connectivity = ConnectivityObserver(appContext)
    val isOnline: StateFlow<Boolean> = connectivity.onlineState(appScope)
    // Lambdas below dereference later properties only when they fire (a real refresh / a 426) — after construction.
    val refresher = TokenRefresher(
        BuildConfig.API_BASE_URL, session, Network.refreshClient(),
        onRefreshFailed = { kind, status, code -> events.refreshFailed(kind, status, code) },
        onSessionInvalid = { programContext.onSessionInvalid() },
    )
    val api: ApiService = Network.build(BuildConfig.API_BASE_URL, session, refresher, onUpgradeRequired = { versionGate.markRequired() })
    val events = ClientEventQueue(appContext, api, appScope)
    val versionGate = VersionGate(appContext, api)
    val deviceRegistry = DeviceRegistry(appContext, api, session, appScope)
    val launchCache = LaunchCache(appContext)
    val programContext: ProgramContext = ProgramContext(
        api, session, BuildConfig.API_BASE_URL, appContext, refresher, events, deviceRegistry, launchCache, isOnline,
    )

    init { if (session.recoveredFromUnreadableStore) events.forcedSignOut("token_store_unreadable") }
}
```

4. **`P/MainActivity.kt`**: `RootScreen(programContext = container.programContext, appearanceStore = container.appearanceStore, versionGate = container.versionGate)`.

5. **`P/ui/RootScreen.kt`**
   - **5a.** Signature `RootScreen(programContext, appearanceStore, versionGate: VersionGate)`. Add `val updateRequired by versionGate.required.collectAsStateWithLifecycle()` and `val scope = rememberCoroutineScope()`.
   - **5b.** In the ON_START branch, `scope.launch { versionGate.check() }` comes before `programContext.onForeground(...)` and runs signed in or out.
   - **5c.** Pass `versionGate` to `SignedInGraph(programContext, appearanceStore, versionGate)` and on to `ProgramPickerScreen(…, versionGate = versionGate)`.
   - **5d. Widget replay** (:151-163):
```kotlin
LaunchedEffect(widgetRoute) {
    val route = widgetRoute ?: return@LaunchedEffect
    versionGate.check()   // app-config §3: gate before the widget deep link
    if (versionGate.required.value) { programContext.clearWidgetRoute(); return@LaunchedEffect }
    when (route) {
        WidgetRoute.QUICK_ADD_WORKOUT -> nav.navigate(Routes.WIDGET_LOG_WORKOUT) { launchSingleTop = true }
        WidgetRoute.QUICK_ADD_HEALTH -> nav.navigate(Routes.WIDGET_LOG_HEALTH) { launchSingleTop = true }
    }
    programContext.clearWidgetRoute()
}
```
   - **5e.** As the last child of the root `Box`: `if (updateRequired) UpdateRequiredScreen(onUpdate = { versionGate.openStore(context) })`.

6. **`P/ui/programs/ProgramPickerScreen.kt`**
   - Add the param `versionGate: VersionGate`, plus `val updateAvailable by versionGate.updateAvailable.collectAsStateWithLifecycle()` and `val context = LocalContext.current`.
   - The banner `when` gets `updateAvailable -> FloatingBannerVariant.UpdateAvailable` after the Stale branch.
   - The `FloatingBanner` call adds `onUpdate = if (v == FloatingBannerVariant.UpdateAvailable) ({ versionGate.openStore(context) }) else null` and `onDismiss = if (v == FloatingBannerVariant.UpdateAvailable) ({ versionGate.dismissUpdate() }) else null`.

7. Compile checkpoint G.

### H. Release and surface docs

1. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/app/build.gradle.kts`** :42: `versionName = "1.1.0"`; versionCode stays `5`. **USER DECISION (Q1)**: confirm before the AAB is built.

2. **`/Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android/CONTEXT.md`**
   - **Stack (:16-17)** → "Tokens + identity: EncryptedSharedPreferences `rasi.fiters.session` = the ONE token store (`core/Session.kt`, a StateFlow; rotation is compare-and-set). Appearance + version-gate dismissal: `rasi.fiters.prefs`. Push registration + the one-time permission flag: `rasi.push`. Health Connect state: `rasi.health`, per member. `noBackupFilesDir`: `install_id`, `client_events.json`, `launch_cache/`. Auto Backup excludes session, health and push. (DataStore is declared but unused.)"
   - **Auth (:51-55):**
     - ride-along `push_token` + `device_id` + `platform:"android"` (DeviceRegistry);
     - `net/TokenRefresher`: single-flight, proactive at < 60 s (lifetime-based), sign-out only on `401 session_invalid`, 503/timeout/offline keep the session;
     - one teardown on every sign-out path;
     - "Sign out everywhere" in My Profile;
     - 15 s timeouts; X-App-* headers on all 3 clients;
     - password writes are one-shot.
   - **Health (:57-67):** v2 (`/health-sync/batch` + `/state`), 30-day catch-up, paged reads, deletions, review once (server; the silent 0-row confirm is local), upgrade run (legacy items, token discarded, carry-over), D-LOCK hold, automatic runs ≥ 60 s apart, `sync.run`; no POST→409→PUT.
   - **New "Push" section:** channels `rasi_default` / `rasi_invites`; foreground post suppressed while SSE is connected; tap → ack + route; SSE foreground-only, backoff + jitter, re-fetch on `ready`; permission asked once.
   - **New "Kit" section:** picker + Summary (cache-first, parallel loads, ErrorView, offline/stale banners, pull-to-refresh); version gate + update banner.

3. **Page SPECs** under `/Users/vinayaksankaranarayanan/Developer/rasifiters-master/specs/pages/android/`. For each: bump the header Version, add the D-rules to §9 (or the A-n list), and add the changelog row "2026-10-13 · reliability Phase 3 C3".

| Page | Bump | Changes |
|---|---|---|
| `login/SPEC.md` | 0.2.2 → 0.3.0 | **D-REL3-1**: server text for 400/401/409/422, kit copy otherwise. **D-REL3-2**: Google = `GetSignInWithGoogleOption` + nonce, mapped messages, `auth.sign_in_failed`. |
| `create-account/SPEC.md` | 0.3.1 → 0.4.0 | The same two rules (D-C6, D-C7). |
| `program-picker/SPEC.md` | 0.2.0 → 0.3.0 | Rewrite **A-4**: badge = `/my-invites` count + `requested`. Rewrite **A-5**: My Invites = `/my-invites`; `/invite-response`; decline dialog + "Block future invites"; label "My Invites" for every role; no all-invites; inline invited Accept/Decline removed; Cancel Request kept; response message not shown (iOS parity). **A-7**: cache-first, parallel loads, ErrorView, offline/stale banner (146 + navigationBarsPadding), pull-to-refresh. **A-8**: update banner + blocking overlay (Q10). **A-9**: push tap → picker; invites open the sheet on My Invites. |
| `summary/SPEC.md` | 0.1.0 → 0.2.0 | **D-C3**: cache-first; 7 parallel reads; spinner, never zero cards; ErrorView; stale/offline banner; pull-to-refresh = reload now + a `pull_to_refresh` health run that reloads again if it applied anything. |
| `my-profile/SPEC.md` | 0.1.0 → 0.2.0 | **D-REL3-1**: "Sign out everywhere". **D-REL3-2**: link nonce + mapped errors. **D-REL3-3**: set-password rule 6. |
| `change-password/SPEC.md` | 0.1.0 → 0.2.0 | **D-REL3-1**: rule 6. |
| `health-connect/SPEC.md` | 0.2.0 → 0.3.0 | **D-REL3-1**: v2 contract. **D-REL3-2**: Reconnect row. **D-REL3-3**: Sync Now = one `manual` run of all flows, judged per flow; connect = `connect`; automatic triggers ≥ 60 s apart. |
| `notifications-alerts/SPEC.md` | 0.2.0 → 0.3.0 | SSE lifecycle/backoff/re-fetch; FCM foreground suppression + inbox reload; channels; tap ack + route; registry (persisted) / unregister; permission asked once. |
| `member-management/SPEC.md` | 0.1.0 → 0.1.1 | Invite-send errors via the kit; the swallow is removed. |
| `widgets/SPEC.md` | 0.2.0 → 0.2.1 | **D-ANDROID-WIDGET-5**: version gate before the replay. Doc fix: the widgets hold no token. |
| `notifications/SPEC.md` | 0.1.0 → 0.1.1 | The settings fallback for the one-time permission ask. |

---

## Endgame

N-2. **Compile check**
- Android: `cd /Users/vinayaksankaranarayanan/Developer/rasifiters-master/apps/android && ./gradlew :app:assembleDebug` after each checkpoint A–G and once after H. It must be green at every checkpoint. Optionally run `./gradlew :app:assembleStaging` once at the end.
- No backend, web or iOS compile (none touched).
- All visual and live testing is the USER's, on the Pixel. Prod by default; staging-first items are marked.
- Afterwards, clean `apps/android/app/build` (keep-disk-lean) and report free space.

N-1. **Migration**: none (client only).

N. **git-version**: per the header table, one bump per feature per landing across C1–C3; tag after landing on `main`.
- Commit set: `feat(android)` = the android code + `apps/android/CONTEXT.md` + `specs/pages/android/**`.
- Android app 1.0.0 → 1.1.0 (versionCode 5), pending Q1.

## Risks the implementer must watch
- **Errors and events**
  - Read `errorBody()` once: convert with `asApiError()` before `signInFailed` / `toAppError` (B8c, D4h, F3c).
  - `encodeDefaults=false`: always pass `platform`, `integration` and `action` explicitly.
- **Session races**
  - The refresher writes ONLY through `rotateTokens` / `clearIfRefresh`; never call `saveTokens` from the refresh path.
  - `applyLoginSession` must call `saveIdentity` before `saveTokens`.
- **Init order**
  - `HealthSyncController` init touches only `loggedInMemberId`.
  - `Session.recoveredFromUnreadableStore` stays declared above `prefs`.
- **Double counting**
  - Legacy items go first; the upload stops at the first failed batch.
  - A failed legacy re-read drops that run's workout adds.
  - Never re-add `ledgerClear()` to `disconnectWorkouts`.
- **Review once**
  - `review_done` leaves the device ONLY through `pendingReviewDone` (user confirm or rule-9 carry-over).
  - The silent 0-row confirm must never be added to it.
- **SSE**
  - Compare `eventSource === this@NotificationStreamClient.eventSource`.
  - Mutate the stream state on Main only.
- **FCM**
  - Name the map `payload`, not `data`.
  - Background taps rely on FCM putting the `data` keys into the launcher intent extras (no `click_action` is sent).
- **Pill clash**: delete both private `InvitePill`s; one `internal` copy remains in `InviteInbox.kt`.
- **No restyle**
  - Banners float; Summary only adds bottom spacing while a banner shows.
  - The spinner shows only on a first load with no cache.
- **API levels**: no `LocalDate.ofInstant`.
- **Live binaries**
  - Android 1.0.0 (3)/(4) is unaffected (backend unchanged); its invites stay broken (no shim).
  - Never set `MIN_ANDROID_VERSION_CODE` / `BLOCK_UNVERSIONED_ANDROID` in this work. This build sends `X-App-Version` on all three clients.

## Cross-track risks (C1 web / C2 iOS / backend)
Backend changes needed: **none**.
1. **"Sign out everywhere"** (parity anchor): My Profile → Sign-in methods, under Password, above Delete Account, every role.
   - Row: "Sign out everywhere" / "End your session on all devices, including this one." / button "Sign out".
   - Dialog: "Sign out everywhere?" / "You'll be signed out on all your devices, including this one." / "Sign out everywhere" / "Cancel".
2. **Rule-6 copy** (parity anchor): "We couldn't confirm the change. It may have gone through, so try your new password the next time you sign in."
3. **Banner scope**: offline + stale on the picker and Summary only; update-available on the picker only (iOS should match).
4. **Decline dialog** = iOS: "Decline invitation?" / program name (fallback "this program") / "Block future invites" / "Decline" / "Cancel". The invite-response message is not shown (iOS `_ = try await`). Web should match, or the orchestrator records the divergence.
5. **Review once (C2 must match)**: a silent 0-row first-sync confirm is LOCAL ONLY. `PUT review_done` is sent only after the user confirms a review page, or once for the rule-9 carry-over (retried until accepted). iOS today confirms silently, locally (`ProgramContext+HealthKit.swift:189`); C2 must not push those.
6. **Automatic sync spacing**: Android automatic triggers (`launch` / `foreground` / `program_entry`) run ≥ 60 s apart; `manual` / `connect` / `pull_to_refresh` bypass. Recommend the same for iOS (health-sync D-C12 limiter is 60 per 10 min).
7. **Summary pull-to-refresh**: reload at once; the health run continues in the background and reloads again if it applied anything. The Android sign-in transition reports `launch`.
8. **SSE reconnect values**: 1 s base, 60 s cap, full jitter (iOS should match).
9. **Foreground push**: Android suppresses the tray post while the stream is connected (Android-only D-rule).
10. **Event props**: the Android provider codes (`no_credential`, `provider_configuration`, `interrupted`, `unsupported`, `token_parsing`, an SDK `type` suffix) are Android values of `code` under `kind: provider`.

## Docs for the orchestrator
- **specs/features/auth/SPEC.md**: §3.1 Android as-built. Changelog 0.13.1.
  - D-C14a resolved for Android ≥ 1.1.0 (5).
  - EncryptedSharedPreferences, excluded from Auto Backup; unreadable-store reset + `token_store_unreadable`.
  - Rotation is compare-and-set (a late refresh never resurrects a signed-out session).
  - Lifetime-based expiry (receivedAt + (exp − iat)).
  - Token writes are committed synchronously.
  - Password writes are one-shot.
  - Correct "Android's default is 10 s" to 15 s.
- **specs/features/health-sync/SPEC.md**: `consumed_by` [] → [ios, android] (with C2). Changelog 0.2.0. §8 Android D-rules:
  - (a) `pageToken` paging; `DeletionChange.recordId`; the token is minted before a window read.
  - (b) The rule-9 re-read is ONE paged window read matched by id; missing ids are retired.
  - (c) A failed legacy read suppresses that run's workout adds.
  - (d) Per-member namespacing; un-namespaced 1.0.0 keys are adopted by the member signed in at upgrade, else the first to sign in afterwards (F-rule: a shared phone could attach them to another member).
  - (e) Sleep is read from start − 1 day; only days ≥ start are sent.
  - (f) The 0-row silent confirm is local only; `review_done` is sent only after a user confirm or for the rule-9 carry-over, held in a persisted pending set until PUT /state accepts (cross-track with C2).
  - (g) Automatic runs ≥ 60 s apart.
  - (h) `sync_success` per (program, kind) only when the whole flow advanced (rule 5, read literally).
- **specs/features/health-connect/SPEC.md**: changelog 0.3.0.
  - D-SUM superseded.
  - D-S1/D-STEPS: the 14 d window is replaced by the catch-up (the first sync stays 14 d).
  - D-CONF: the reconnect re-gate stays local, but a server `review_done_at` re-confirms (rule 6); the 0-row silent confirm is local.
  - POST→409→PUT is retired for new builds; D-SIL kept; the Reconnect state is added; Sync Now = one run of all flows, judged per flow; triggers named.
- **specs/features/notifications/SPEC.md**: changelog 0.5.0. Android D-rules:
  - `install_id` in noBackupFilesDir;
  - registration persisted in `rasi.push` (no backup; unregister-on-revoke survives process death);
  - re-PUT at most every 12 h;
  - foreground tray post suppressed while SSE is connected, and an invite push reloads the inbox;
  - tap → ack + route;
  - permission asked once (flag not backed up);
  - SSE backoff 1 s / 60 s with full jitter.
- **specs/features/invites/SPEC.md**: Android adopted §3.1; no all-invites/revoke (label "My Invites"); the 200 message is not shown (iOS parity; note against §3.1's "show the message"). Changelog 0.2.1.
- **specs/features/observability/SPEC.md**: `consumed_by` → [web, ios, android]. Android senders: queue in noBackupFilesDir, cap 200, backoff 30 s → 15 min. Changelog 0.3.0.
- **specs/features/app-config/SPEC.md**: `consumed_by` gains android. Android as-built: plain store intent (D-rule), checks throttled to 60 s, a 426 is sticky for the process, banner on the picker only. Changelog 0.3.0.
- **specs/features/frontend-kit/SPEC.md**: Android adoption (picker, Summary, invites tab, credential screens via `toCredentialMessage`), 15 s timeouts, `core/LaunchCache.kt`, `ui/components/UpdateRequiredScreen.kt`. Close the §10 Android items. Changelog 0.2.0.
- **programs, analytics, analytics-v2, workout-logs, daily-health-logs**: no bump (optional note: Android no longer calls the old sync writers).
- **registry.json + specs/features/REGISTRY.md**: the flips and versions above.
- **specs/pages/REGISTRY.md**: version cells for the 11 Android pages in H3; no new page row.
- **RELEASES.md**: on the user's upload announcement, add an Android 1.1.0 (5) row, then pre-bump versionCode → 6.
- **PROGRESS.md / specs/initiatives/reliability-overhaul/{BRIEF,HANDOFF,DESIGN_BOARD}.md**: C3 built and live per the user's Play push; record the Q2–Q10 resolutions.
- **ENV_RUNBOOK.md §7 release checklist**, two lines:
  - "An Android OAuth client exists in Google Cloud for every signing key that ships: the Play app-signing key, the upload key, and each dev machine's debug key (W5)."
  - "Before the 1.1.0 Play rollout, review the Play Console Data safety form: the install id (`device_id`) is a device identifier, and `app_events` (auth / sync diagnostics) is app-diagnostics data."

## User test checklist (Pixel; prod unless marked STAGING)
1. **Sign in and open offline.** Password sign-in → the picker loads. Kill the app, turn on airplane mode, reopen → the cached programs appear instantly with "You're offline" above the + / search buttons. Turn airplane mode off → the banner clears.
2. **Summary.**
   - The second open of a program is instant from cache.
   - Airplane mode + pull to refresh → the cards stay, with the stale banner + Retry.
   - A first-ever open while offline → error view + Retry, never zero cards.
3. **Long idle.** Leave the app for more than 1 h, then reopen → still signed in, and the data refreshes.
4. **STAGING** (`staging` build type, +stg accounts; wake the staging API first): My Profile → Sign out everywhere → the Pixel returns to sign-in. A second +stg device signs out at its next refresh (within the hour).
5. **STAGING**: change the password on the Pixel → the Pixel stays signed in; the other +stg device signs out at its next refresh.
6. **STAGING**: sign out everywhere from the web. The Pixel keeps working until its access token next needs a refresh (≤ 1 h; auth §3.1 rule 4), then it returns to sign-in with no crash. `app_events` shows `auth.forced_sign_out refresh_session_invalid`.
7. **Invites.** From web or the iPhone, invite the Pixel user:
   - with the app in the background, a heads-up notification arrives on "Invites & membership";
   - tap it → the sheet opens on **My Invites** (spinner, then the invite);
   - Accept → the program appears;
   - Decline with "Block future invites" → a later invite doesn't arrive.
8. **Foreground push.** With the app open, trigger a notification → only the in-app modal shows (no tray duplicate).
9. **Notifications off.** Sign out, then trigger a notification → nothing arrives. Sign back in, turn notifications off in system settings, reopen the app, and trigger again → `push_deliveries` shows `no_device`.
10. **Health Connect** (data entered by hand):
    - add a workout, a night of sleep and steps → open the app → synced; pull to refresh on Summary → they show;
    - delete the workout → reopen → the minutes are subtracted;
    - revoke the permission → the settings show "Reconnect Health Connect";
    - Sync Now on Sleep while workouts are fine → no error under Sleep.
11. **Review once across devices.** Connect Health Connect for a program with no data (no review, silent). On the iPhone, connect Apple Health for that program with past workouts → the iPhone still shows its first-sync review.
12. **Upgrade with no double count.** Play internal-testing upload of 1.1.0 over the Play 1.0.0 install (with Health Connect connected and synced first) → workouts from before the update don't double, and the first-sync review doesn't reappear.
13. **Google sign-in.** Continue with Google → success; cancel → silent; with no Google account on the device → the human message. The debug key needs its Android OAuth client.
14. **STAGING version gate.**
    - Set `LATEST_ANDROID_VERSION_CODE=6` on the staging service only (per-call confirm) → the update banner shows and can be dismissed.
    - Set `MIN_ANDROID_VERSION_CODE=6` → the blocking screen shows; Update opens Play.
    - Unset both afterwards.
15. **Widget.** Quick-add from the widget while signed in → the form opens and saves. Signed out → sign in → the form replays.

## Approval amendments

Apply [`../phase-3-client-amendments.md`](../phase-3-client-amendments.md) on top of this plan (user decisions, shared rules,
health-sync rules and this track's fixes). Where they disagree, the amendments win.
