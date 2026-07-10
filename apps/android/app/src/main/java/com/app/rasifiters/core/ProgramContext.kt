package com.app.rasifiters.core

import android.content.Context
import com.app.rasifiters.health.HealthSyncController
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.AvgDurationMtdDTO
import com.app.rasifiters.net.BulkHealthEntry
import com.app.rasifiters.net.BulkHealthRequest
import com.app.rasifiters.net.BulkWorkoutEntry
import com.app.rasifiters.net.BulkWorkoutRequest
import com.app.rasifiters.net.DailyHealthDeleteRequest
import com.app.rasifiters.net.DailyHealthRequest
import com.app.rasifiters.net.DeviceRegisterRequest
import com.app.rasifiters.net.DeviceUnregisterRequest
import com.app.rasifiters.net.DistributionByDayDTO
import com.app.rasifiters.net.ChangeEmailRequest
import com.app.rasifiters.net.ChangePasswordRequest
import com.app.rasifiters.net.CreateProgramRequest
import com.app.rasifiters.net.ForgotPasswordRequest
import com.app.rasifiters.net.InviteRequest
import com.app.rasifiters.net.LeaveProgramRequest
import com.app.rasifiters.net.LoginRequest
import com.app.rasifiters.net.MemberDTO
import com.app.rasifiters.net.LogoutRequest
import com.app.rasifiters.net.MemberHistoryResponse
import com.app.rasifiters.net.MemberMetricsDTO
import com.app.rasifiters.net.MemberHealthItem
import com.app.rasifiters.net.MemberRecentItem
import com.app.rasifiters.net.MemberStreaksResponse
import com.app.rasifiters.net.MembershipDetailDTO
import com.app.rasifiters.net.MembershipEditRequest
import com.app.rasifiters.net.MembershipRemoveRequest
import com.app.rasifiters.net.MembershipUpdateRequest
import com.app.rasifiters.net.MtdParticipationDTO
import com.app.rasifiters.net.OAuthCompleteRequest
import com.app.rasifiters.net.OAuthRequest
import com.app.rasifiters.net.NotificationDTO
import com.app.rasifiters.net.NotificationStreamClient
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.net.ProgramOrderRequest
import com.app.rasifiters.net.ProgramWorkoutDTO
import com.app.rasifiters.net.RegisterRequest
import com.app.rasifiters.net.StepsStatsDTO
import com.app.rasifiters.net.ActivityTimelinePoint
import com.app.rasifiters.net.ActivityTimelineResponse
import com.app.rasifiters.net.AddCustomWorkoutRequest
import com.app.rasifiters.net.EditCustomWorkoutRequest
import com.app.rasifiters.net.HealthTimelineResponse
import com.app.rasifiters.net.ToggleWorkoutVisibilityRequest
import com.app.rasifiters.net.TotalDurationMtdDTO
import com.app.rasifiters.net.UpdateMemberProfileRequest
import com.app.rasifiters.net.UpdateProgramRequest
import com.app.rasifiters.net.TotalWorkoutsMtdDTO
import com.app.rasifiters.net.WorkoutLogDeleteRequest
import com.app.rasifiters.net.WorkoutLogUpdateRequest
import com.app.rasifiters.net.WorkoutTypeDTO
import com.app.rasifiters.net.WorkoutTypeHighestParticipationDTO
import com.app.rasifiters.net.WorkoutTypeLongestDurationDTO
import com.app.rasifiters.net.WorkoutTypeMostPopularDTO
import android.util.Log
import com.app.rasifiters.net.toApiException
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.HttpException
import java.io.IOException

private const val PUSH_TAG = "RaSiPush"

/**
 * App-scoped state hub — the analog of the iOS `ProgramContext` ObservableObject and the web
 * `AuthProvider`. Owns session/auth state and the account-level API actions. Feature state
 * (active program, rosters, analytics) is layered on in later phases.
 */
class ProgramContext(
    private val api: ApiService,
    private val session: Session,
    private val baseUrl: String,
    appContext: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /**
     * Health Connect auto-sync (Phase H) — the analog of the iOS Apple-Health lifecycle that hangs off
     * `ProgramContext`. Reads this context (token/programs/identity/lock); owns its own persisted state.
     */
    val health: HealthSyncController = HealthSyncController(appContext, api, this)

    private val _authToken = MutableStateFlow(session.accessToken)
    /** Drives the root auth gate: non-null → signed in. */
    val authToken: StateFlow<String?> = _authToken.asStateFlow()

    private val _globalRole = MutableStateFlow(session.globalRole)
    val globalRole: StateFlow<String?> = _globalRole.asStateFlow()

    private val _memberName = MutableStateFlow(session.memberName)
    val memberName: StateFlow<String?> = _memberName.asStateFlow()

    private val _memberUsername = MutableStateFlow(session.username)
    val memberUsername: StateFlow<String?> = _memberUsername.asStateFlow()

    /** The signed-in member's gender — seeded from the membership roster (loadMembershipDetails) or a
     *  My-Profile fetch, and updated when the user edits their own profile. Drives the My Profile picker. */
    private val _loggedInGender = MutableStateFlow<String?>(null)
    val loggedInGender: StateFlow<String?> = _loggedInGender.asStateFlow()

    val isGlobalAdmin: Boolean get() = _globalRole.value == "global_admin"

    /** The signed-in member's id/name — seeded into log-form rows when locked to self. */
    val loggedInMemberId: String? get() = session.memberId
    val loggedInMemberName: String? get() = _memberName.value

    /**
     * Admin/logger/global-admin get the per-row member picker and may log for anyone; a plain member is
     * locked to themselves (the log-forms' `canSelectAnyMember`). The backend batch authorization is the
     * real boundary — this only drives the UI (log-workout F1 / web F).
     */
    val canLogForAnyMember: Boolean
        get() {
            if (isGlobalAdmin) return true
            val role = _activeProgram.value?.myRole?.lowercase()
            return role == "admin" || role == "logger"
        }

    /**
     * Coarse widget capability (no single active program): global admin OR an admin/logger in ANY loaded
     * program. Derived from the program LIST (not `_activeProgram`), because the quick-add widget forms
     * have no current program — the iOS `QuickAdd*WidgetEntryView.canSelectAnyMember` analog.
     */
    val canLogForAnyProgramMember: Boolean
        get() = isGlobalAdmin || _programs.value.any { isPrivilegedIn(it) }

    /** Admin/logger privilege in a specific program (iOS widget-form `privileged(_:)`). */
    fun isPrivilegedIn(program: ProgramDTO): Boolean =
        isGlobalAdmin || program.myRole?.lowercase() in setOf("admin", "logger")

    /** Program admin OR global admin — gates the Members-tab "View as" selector + invite + roster editor. */
    val isProgramAdmin: Boolean
        get() = isGlobalAdmin || _activeProgram.value?.myRole?.lowercase() == "admin"

    /** The signed-in member's role IN the active program (admin | logger | member); defaults to member. */
    val loggedInUserProgramRole: String
        get() = _activeProgram.value?.myRole?.lowercase() ?: "member"

    // ---- Programs (the picker's "My Programs" list) ----

    private val _programs = MutableStateFlow<List<ProgramDTO>>(emptyList())
    val programs: StateFlow<List<ProgramDTO>> = _programs.asStateFlow()

    private val _programsLoading = MutableStateFlow(false)
    val programsLoading: StateFlow<Boolean> = _programsLoading.asStateFlow()

    /** The program chosen in the picker; hydrated on pick, read by the downstream shell (Phase D+). */
    private val _activeProgram = MutableStateFlow<ProgramDTO?>(null)
    val activeProgram: StateFlow<ProgramDTO?> = _activeProgram.asStateFlow()

    /** Mobile login via POST /auth/login/app. Persists tokens + identity, flips the gate. */
    suspend fun login(identifier: String, password: String): Result<Unit> = runCatching {
        val resp = api.loginApp(LoginRequest(identifier = identifier, password = password))
        applyLoginSession(resp.token, resp.refreshToken, resp.memberId, resp.username, resp.memberName, resp.globalRole)
    }.recoverCatching { throw it.asApiError() }

    /** The single session-write path shared by password login + social sign-in/completion: persist tokens +
     *  identity and flip the StateFlows that drive the root gate + header. */
    private fun applyLoginSession(
        token: String,
        refreshToken: String,
        memberId: String?,
        username: String?,
        memberName: String?,
        globalRole: String?,
    ) {
        session.saveTokens(token, refreshToken)
        session.saveIdentity(memberId, username, memberName, globalRole)
        _authToken.value = token
        _globalRole.value = globalRole
        _memberName.value = memberName
        _memberUsername.value = username
    }

    // ---- Social sign-in (Continue with Google) — the id_token exchange + brand-new-user profile completion.
    // Credential Manager acquisition lives in the UI layer (needs an Activity/Context); this hub owns only the
    // two API-facing steps. Mirrors the iOS/web /auth/oauth + /auth/oauth/complete flow.

    /** A brand-new social user's pending session, stashed between /auth/oauth (needs_profile) and the wizard's
     *  /auth/oauth/complete. The pending access token authorizes the completion call. */
    data class PendingSocial(
        val token: String,
        val refreshToken: String?,
        val email: String?,
        val firstName: String?,
        val lastName: String?,
    )

    private val _pendingSocial = MutableStateFlow<PendingSocial?>(null)
    /** Non-null → CreateAccountScreen renders the 2-step social branch (locked email, no password). */
    val pendingSocial: StateFlow<PendingSocial?> = _pendingSocial.asStateFlow()

    /**
     * POST /auth/oauth — exchange a Google id_token. Existing member → apply the session (returns false, the
     * root gate swaps). Brand-new social user → stash the pending session + prefill (returns true, the screen
     * routes to the completion wizard). The device push token rides along when we already have one.
     */
    suspend fun socialSignIn(idToken: String): Result<Boolean> = runCatching {
        val resp = api.oauth(OAuthRequest(provider = "google", idToken = idToken, pushToken = lastRegisteredPushToken))
        if (resp.needsProfile) {
            _pendingSocial.value = PendingSocial(
                token = resp.token ?: error("Missing pending token."),
                refreshToken = resp.refreshToken,
                email = resp.email,
                firstName = resp.firstName,
                lastName = resp.lastName,
            )
            true
        } else {
            applyLoginSession(
                token = resp.token ?: error("Missing token."),
                refreshToken = resp.refreshToken ?: error("Missing refresh token."),
                memberId = resp.memberId,
                username = resp.username,
                memberName = resp.memberName,
                globalRole = resp.globalRole,
            )
            false
        }
    }.recoverCatching { throw it.asApiError() }

    /**
     * POST /auth/oauth/complete — finish a brand-new social user's profile (Bearer = the pending access token).
     * Applies the returned login session (falling back to the pending refresh token when the response omits it)
     * and clears the pending state; the root gate swaps on success.
     */
    suspend fun completeSocial(
        username: String,
        gender: String?,
        firstName: String?,
        lastName: String?,
    ): Result<Unit> = runCatching {
        val pending = _pendingSocial.value ?: error("No pending social sign-in.")
        val resp = api.oauthComplete(
            "Bearer ${pending.token}",
            OAuthCompleteRequest(username, gender, firstName, lastName, refreshToken = pending.refreshToken),
        )
        applyLoginSession(
            token = resp.token ?: error("Missing token."),
            refreshToken = resp.refreshToken ?: pending.refreshToken ?: error("Missing refresh token."),
            memberId = resp.memberId,
            username = resp.username,
            memberName = resp.memberName,
            globalRole = resp.globalRole,
        )
        _pendingSocial.value = null
    }.recoverCatching { throw it.asApiError() }

    suspend fun register(
        firstName: String,
        lastName: String,
        username: String,
        email: String,
        password: String,
        gender: String?,
    ): Result<Unit> = runCatching {
        api.register(
            RegisterRequest(
                firstName = firstName,
                lastName = lastName,
                username = username,
                email = email,
                password = password,
                gender = gender,
            ),
        )
        Unit
    }.recoverCatching { throw it.asApiError() }

    suspend fun forgotPassword(email: String): Result<Unit> = runCatching {
        api.forgotPassword(ForgotPasswordRequest(email))
        Unit
    }.recoverCatching { throw it.asApiError() }

    /** Self-heal identity from the verified token on relaunch (GET /auth/me). Best-effort. */
    fun healIdentityIfNeeded() {
        if (_authToken.value == null) return
        scope.launch {
            runCatching { api.me() }.onSuccess { me ->
                session.saveIdentity(me.memberId, me.username, me.memberName, me.globalRole)
                _globalRole.value = me.globalRole
                _memberName.value = me.memberName
                _memberUsername.value = me.username
            }
        }
    }

    fun signOut() {
        scope.launch {
            // Deregister this device from push while the access token is still valid (iOS parity).
            lastRegisteredPushToken?.let { t ->
                runCatching { api.unregisterDevice(DeviceUnregisterRequest(t)) }
            }
            runCatching { api.logout(LogoutRequest(session.refreshToken)) }
            clearSession()
        }
    }

    /** Called by the network layer when a token refresh fails (session already cleared). */
    fun onAuthFailure() {
        scope.launch { clearSession() }
    }

    /** Load "My Programs" (GET /programs). The list arrives in the member's saved order — rendered as-is. */
    suspend fun loadPrograms(): Result<Unit> {
        _programsLoading.value = true
        return runCatching { _programs.value = api.getPrograms() }
            .recoverCatching { throw it.asApiError() }
            .also { _programsLoading.value = false }
    }

    /** POST /programs — create a program (creator becomes its admin); reload the list to include it (iOS parity). */
    suspend fun createProgram(
        name: String,
        status: String,
        startDate: String?,
        endDate: String?,
    ): Result<Unit> = runCatching {
        api.createProgram(CreateProgramRequest(name.trim(), status, startDate, endDate))
        loadPrograms().getOrThrow()
    }.recoverCatching { throw it.asApiError() }

    /** Optimistic local reorder during a drag — the source of the persisted order (see [persistProgramOrder]). */
    fun moveProgram(from: Int, to: Int) {
        val current = _programs.value.toMutableList()
        if (from !in current.indices || to !in current.indices || from == to) return
        current.add(to, current.removeAt(from))
        _programs.value = current
    }

    /** Persist the current display order (PUT /programs/order). On failure, revert to [previousOrder]. */
    suspend fun persistProgramOrder(previousOrder: List<ProgramDTO>): Result<Unit> = runCatching {
        api.saveProgramOrder(ProgramOrderRequest(_programs.value.map { it.id }))
        Unit
    }.recoverCatching {
        _programs.value = previousOrder
        throw it.asApiError()
    }

    /** Manage-gated delete (DELETE /programs/:id); drops the card locally on success. */
    suspend fun deleteProgram(programId: String): Result<Unit> = runCatching {
        api.deleteProgram(programId)
        _programs.value = _programs.value.filterNot { it.id == programId }
    }.recoverCatching { throw it.asApiError() }

    /** Inline invite response (PUT /program-memberships): accept → "active", decline/cancel → "removed". */
    suspend fun respondToInvite(programId: String, accept: Boolean): Result<Unit> = runCatching {
        val memberId = session.memberId ?: error("Missing member id.")
        api.updateMembership(
            MembershipUpdateRequest(programId, memberId, if (accept) "active" else "removed"),
        )
        loadPrograms().getOrThrow()
    }.recoverCatching { throw it.asApiError() }

    /** Pick a program → hydrate the active-program state the shell reads. */
    fun selectProgram(program: ProgramDTO) {
        _activeProgram.value = program
    }

    // ---- Widget quick-add deep-link route (iOS `widgetRoute` + `returnToMyPrograms` analog) ----

    /** The pending home-screen-widget deep-link, stashed by MainActivity and consumed once by RootScreen.
     *  Survives a signed-out→signed-in transition (stash-and-replay, iOS parity); nulled on explicit logout. */
    private val _widgetRoute = MutableStateFlow<WidgetRoute?>(null)
    val widgetRoute: StateFlow<WidgetRoute?> = _widgetRoute.asStateFlow()

    fun setWidgetRoute(route: WidgetRoute?) { _widgetRoute.value = route }
    fun clearWidgetRoute() { _widgetRoute.value = null }

    /** Drop the active program (iOS `returnToMyPrograms`) — used by the widget forms' exit-to-My-Programs. */
    fun clearActiveProgram() { _activeProgram.value = null }

    // ---- Notifications (Phase I) — real-time SSE + the modal queue ----
    // The alerts layer: an SSE stream (NotificationStreamClient) pushes new alerts live, backed by a
    // `GET /notifications/unacknowledged` backfill on connect. Alerts render as a single-notification modal
    // QUEUE (oldest-first, one at a time), acknowledged optimistically via `POST /:id/acknowledge`. Mirrors
    // the iOS `ProgramContext+Notifications` set (notifications SPEC D-REF). FCM push is the follow-up.

    private var notificationStreamClient: NotificationStreamClient? = null
    private val notificationIds = mutableSetOf<String>()

    /** The pending-alert queue; the shell shows `first` in a modal and pops it on acknowledge (web F7 parity). */
    private val _notificationQueue = MutableStateFlow<List<NotificationDTO>>(emptyList())
    val notificationQueue: StateFlow<List<NotificationDTO>> = _notificationQueue.asStateFlow()

    /** Open (or restart) the SSE stream when signed in + run the unacknowledged backfill. Idempotent — safe
     *  to call on launch and on every resume (iOS `startNotificationStreamIfNeeded`). */
    fun startNotificationStreamIfNeeded() {
        val token = session.accessToken?.takeIf { it.isNotEmpty() } ?: return
        notificationStreamClient?.disconnect()
        val client = NotificationStreamClient(baseUrl) { session.accessToken }
        client.onNotification = { dto -> scope.launch { enqueueNotification(dto) } }
        client.connect()
        notificationStreamClient = client
        scope.launch { loadUnacknowledgedNotifications() }
    }

    /** Tear down the stream + clear the queue (sign-out / auth-fail). */
    fun stopNotificationStream() {
        notificationStreamClient?.disconnect()
        notificationStreamClient = null
        _notificationQueue.value = emptyList()
        notificationIds.clear()
    }

    /** Backfill the member's un-acked alerts (oldest-first). Swallowed on failure — retried on next event. */
    suspend fun loadUnacknowledgedNotifications() {
        if (session.accessToken.isNullOrEmpty()) return
        runCatching { api.getUnacknowledgedNotifications() }.onSuccess { items ->
            notificationIds.clear()
            notificationIds.addAll(items.map { it.id })
            _notificationQueue.value = sortNotifications(items)
        }
    }

    /** Optimistic acknowledge: pop the alert immediately, then `POST /:id/acknowledge`; on failure re-backfill
     *  so it reappears (iOS/web F8 parity). */
    suspend fun acknowledgeNotification(notification: NotificationDTO) {
        if (session.accessToken.isNullOrEmpty()) return
        _notificationQueue.value = _notificationQueue.value.filterNot { it.id == notification.id }
        notificationIds.remove(notification.id)
        runCatching { api.acknowledgeNotification(notification.id) }
            .onFailure { loadUnacknowledgedNotifications() }
    }

    private suspend fun enqueueNotification(notification: NotificationDTO) {
        if (!notificationIds.add(notification.id)) return
        _notificationQueue.value = sortNotifications(_notificationQueue.value + notification)
        refreshDataForNotification(notification)
    }

    /** Invalidate the caches an event touches so the open screen reflects it (iOS `refreshDataForNotification`
     *  / web per-notification query invalidation). Best-effort; the picker list carries invites on Android. */
    private suspend fun refreshDataForNotification(notification: NotificationDTO) {
        when (notification.type) {
            "program.invite_received" -> {
                runCatching { loadPrograms() }
            }
            "program.role_changed", "program.member_removed", "program.member_left",
            "program.member_joined", "program.admin_transferred", "program.updated", "program.deleted" -> {
                runCatching { loadPrograms() }
                if (_activeProgram.value != null) runCatching { loadMembershipDetails() }
            }
        }
    }

    /** Oldest-first (ISO `created_at` string sort; missing dates sink to the front — distant past). */
    private fun sortNotifications(items: List<NotificationDTO>): List<NotificationDTO> =
        items.sortedBy { it.createdAt ?: "" }

    // ---- Push (FCM, Phase I-b) — device-token registration (the iOS APNs device lifecycle analog) ----

    /** The last token we successfully registered — dedupes redundant `PUT /device` calls. */
    private var lastRegisteredPushToken: String? = null

    /** Fetch the current FCM token and register it (if signed in). Called on sign-in + resume. Best-effort;
     *  failures are logged (a push path must not swallow errors silently). */
    fun registerPushTokenIfNeeded() {
        if (session.accessToken.isNullOrEmpty()) { Log.d(PUSH_TAG, "register skipped — not signed in"); return }
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d(PUSH_TAG, "FCM token fetched: ${token?.take(16)}…")
                token?.let { onNewPushToken(it) }
            } else {
                Log.w(PUSH_TAG, "FCM token fetch FAILED", task.exception)
            }
        }
    }

    /** Register a (new) FCM token with the backend as an `android` device. Called from
     *  [registerPushTokenIfNeeded] + the FirebaseMessagingService's `onNewToken`. */
    fun onNewPushToken(token: String) {
        if (token.isEmpty() || session.accessToken.isNullOrEmpty()) return
        if (token == lastRegisteredPushToken) return
        scope.launch {
            runCatching { api.registerDevice(DeviceRegisterRequest(pushToken = token, platform = "android")) }
                .onSuccess { lastRegisteredPushToken = token; Log.d(PUSH_TAG, "device registered ✓") }
                .onFailure { Log.w(PUSH_TAG, "device register FAILED", it) }
        }
    }

    // ---- Summary dashboard (Phase D) ----

    /** The active program's `admin_only_data_entry` lock bites only non-admins (web `isDataEntryLocked`). */
    val dataEntryLocked: Boolean
        get() {
            val program = _activeProgram.value ?: return false
            if (!program.adminOnlyDataEntry) return false
            val isAdmin = isGlobalAdmin || program.myRole?.lowercase() == "admin"
            return !isAdmin
        }

    /**
     * Per-program data-entry lock, by id — the multi-program analog of [dataEntryLocked] (mirrors iOS
     * `ProgramContext.isDataEntryLocked(programId:)`). Locked iff the program's `admin_only_data_entry`
     * is on AND the viewer is neither a global admin nor that program's admin. Fail-open when the program
     * isn't in the loaded list; the backend 403 is the backstop. Used by the Health Connect sync, which
     * targets many programs at once.
     */
    fun isDataEntryLocked(programId: String): Boolean {
        val program = _programs.value.firstOrNull { it.id == programId } ?: return false
        if (!program.adminOnlyDataEntry) return false
        val isAdmin = isGlobalAdmin || program.myRole?.lowercase() == "admin"
        return !isAdmin
    }

    private val _summary = MutableStateFlow(SummaryData())
    /** The active program's Summary-tab analytics (7 reads, refreshed together). */
    val summary: StateFlow<SummaryData> = _summary.asStateFlow()

    private val _summaryLoading = MutableStateFlow(false)
    val summaryLoading: StateFlow<Boolean> = _summaryLoading.asStateFlow()

    private val _summaryError = MutableStateFlow<String?>(null)
    val summaryError: StateFlow<String?> = _summaryError.asStateFlow()

    /**
     * Bumped after a successful log-form save so the Summary tab re-runs [loadSummary] — the Android
     * analogue of iOS's `summaryRefreshToken` (log-workout D-C3) / web's `invalidateQueries(["summary"])`.
     */
    private val _summaryRefreshToken = MutableStateFlow(0)
    val summaryRefreshToken: StateFlow<Int> = _summaryRefreshToken.asStateFlow()

    /**
     * One-shot transient confirmations (a Snackbar shown by the shell) — the Android-idiom acknowledgement
     * that a write succeeded. iOS confirms by dismissing back to the refreshed screen (it dropped the legacy
     * success Alert, log-workout D-C3); a Material Snackbar is the platform equivalent. Errors stay inline
     * on each screen (iOS D-C4), so this channel carries successes only.
     */
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    /**
     * Load the Summary tab's 7 analytics reads for the active program (the iOS `AdminSummaryTab.load()`
     * analogue). Program progress is read straight from the already-loaded [activeProgram] DTO
     * (progress_percent + start/end dates), so the vestigial `analytics/summary` over-fetch — which the
     * iOS/web landings flag as feeding only the deferred detail views (iOS F2 / web F5) — is skipped here.
     */
    suspend fun loadSummary(): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        _summaryLoading.value = true
        _summaryError.value = null
        return runCatching {
            _summary.value = SummaryData(
                mtdParticipation = api.getMtdParticipation(pid),
                totalWorkouts = api.getTotalWorkoutsMtd(pid),
                totalDuration = api.getTotalDurationMtd(pid),
                avgDuration = api.getAvgDurationMtd(pid),
                timeline = api.getActivityTimeline("week", pid).buckets,
                distribution = api.getDistributionByDay(pid),
                workoutTypes = api.getWorkoutTypes(pid, 100),
            )
        }.recoverCatching {
            val err = it.asApiError()
            _summaryError.value = err.message ?: "Couldn't load summary."
            throw err
        }.also { _summaryLoading.value = false }
    }

    /** Fetch the activity timeline for a period (week|month|year|program) — the detail view's period switch. */
    suspend fun loadActivityTimeline(period: String): Result<ActivityTimelineResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.getActivityTimeline(period, pid) }
            .recoverCatching { throw it.asApiError() }
    }

    // ---- Log-form lookups (member + workout pickers) ----

    /** Active-program roster for the member picker (empty on no-program or failure — an empty-hint case). */
    suspend fun loadProgramMembers(): Result<List<ProgramMemberDTO>> {
        val pid = _activeProgram.value?.id ?: return Result.success(emptyList())
        return runCatching { api.getProgramMembers(pid) }.recoverCatching { throw it.asApiError() }
    }

    /** Active-program workout catalog, non-hidden only (`is_hidden` filtered — matches web/iOS). */
    suspend fun loadProgramWorkouts(): Result<List<ProgramWorkoutDTO>> {
        val pid = _activeProgram.value?.id ?: return Result.success(emptyList())
        return runCatching { api.getProgramWorkouts(pid).filterNot { it.isHidden } }
            .recoverCatching { throw it.asApiError() }
    }

    // ---- Per-program lookups (the widget forms cache one entry per selected program, intersected) ----

    /** Roster for a SPECIFIC program (the widget form's per-program member cache). Returns the active
     *  roster as-is — the endpoint already returns the active set (no client `is_active` filter, O1). */
    suspend fun fetchProgramMembersFor(programId: String): Result<List<ProgramMemberDTO>> =
        runCatching { api.getProgramMembers(programId) }
            .recoverCatching { throw it.asApiError() }

    /** Workout catalog for a SPECIFIC program, non-hidden only (`is_hidden` filtered — matches web/iOS). */
    suspend fun fetchProgramWorkoutsFor(programId: String): Result<List<ProgramWorkoutDTO>> =
        runCatching { api.getProgramWorkouts(programId).filterNot { it.isHidden } }
            .recoverCatching { throw it.asApiError() }

    // ---- Log-form writes (both bump the Summary refresh on success — D-C3) ----

    /** POST /workout-logs/batch. `programIds` = the full multi-program selection (current included, DC-2).
     *  On failure the mapped [com.app.rasifiters.net.ApiException] carries rowErrors. */
    suspend fun addWorkoutLogsBatch(entries: List<BulkWorkoutEntry>, programIds: List<String>): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.addWorkoutLogsBatch(BulkWorkoutRequest(pid, programIds, entries)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess {
                _summaryRefreshToken.value += 1
                val n = entries.size
                _messages.tryEmit(if (n == 1) "Workout saved" else "$n workouts saved")
            }
    }

    /** POST /daily-health-logs/batch — the batched multi-row (+ multi-program) daily-health save (DC-2/DC-5).
     *  On failure the mapped [com.app.rasifiters.net.ApiException] carries rowErrors. */
    suspend fun addDailyHealthLogsBatch(entries: List<BulkHealthEntry>, programIds: List<String>): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.addDailyHealthLogsBatch(BulkHealthRequest(pid, programIds, entries)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess {
                _summaryRefreshToken.value += 1
                val n = entries.size
                _messages.tryEmit(if (n == 1) "Daily log saved" else "$n daily logs saved")
            }
    }

    /**
     * POST /workout-logs/batch with an EXPLICIT primary program (the widget form has no active program —
     * it passes the first selected program as `program_id` + the full set as `program_ids`). Bumps the
     * Summary refresh on success; does NOT emit `_messages` (the widget host has no Snackbar collector —
     * success feedback is the in-view toast). iOS `QuickAddWorkoutWidgetEntryView.save()` analog.
     */
    suspend fun addWorkoutLogsBatchExplicit(
        primaryProgramId: String,
        programIds: List<String>,
        entries: List<BulkWorkoutEntry>,
    ): Result<Unit> =
        runCatching { api.addWorkoutLogsBatch(BulkWorkoutRequest(primaryProgramId, programIds, entries)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { _summaryRefreshToken.value += 1 }

    /** POST /daily-health-logs/batch with an EXPLICIT primary program — the widget form's health analog of
     *  [addWorkoutLogsBatchExplicit]. Bumps the Summary refresh; no `_messages` emit (in-view toast). */
    suspend fun addDailyHealthLogsBatchExplicit(
        primaryProgramId: String,
        programIds: List<String>,
        entries: List<BulkHealthEntry>,
    ): Result<Unit> =
        runCatching { api.addDailyHealthLogsBatch(BulkHealthRequest(primaryProgramId, programIds, entries)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { _summaryRefreshToken.value += 1 }

    /** POST /daily-health-logs. `foodQuality` null (or omitted) clears diet; `sleepHours` null omits sleep. */
    suspend fun addDailyHealthLog(
        memberId: String,
        logDate: String,
        sleepHours: Double?,
        foodQuality: Int?,
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.addDailyHealthLog(DailyHealthRequest(pid, logDate, memberId, sleepHours, foodQuality)); Unit
        }.recoverCatching { throw it.asApiError() }
            .onSuccess {
                _summaryRefreshToken.value += 1
                _messages.tryEmit("Daily log saved")
            }
    }

    // ---- Members tab (Phase E) — state, reads, writes ----
    // The per-member analytics + roster state the Members tab + its 8 detail screens read. Loaders mirror
    // the iOS `ProgramContext+Members` set (server-driven search/sort/filter; the tab loads, the detail
    // re-loads on control change). Errors are mapped but stay swallowed on-screen for reads (iOS F1) —
    // only mutation errors surface (returned as failures for the caller to render inline).

    private val _memberMetrics = MutableStateFlow<List<MemberMetricsDTO>>(emptyList())
    val memberMetrics: StateFlow<List<MemberMetricsDTO>> = _memberMetrics.asStateFlow()

    private val _memberMetricsTotal = MutableStateFlow(0)
    val memberMetricsTotal: StateFlow<Int> = _memberMetricsTotal.asStateFlow()

    private val _memberMetricsRange = MutableStateFlow<Pair<String?, String?>>(null to null)
    val memberMetricsRange: StateFlow<Pair<String?, String?>> = _memberMetricsRange.asStateFlow()

    private val _selectedMemberOverview = MutableStateFlow<MemberMetricsDTO?>(null)
    val selectedMemberOverview: StateFlow<MemberMetricsDTO?> = _selectedMemberOverview.asStateFlow()

    private val _memberHistory = MutableStateFlow<MemberHistoryResponse?>(null)
    val memberHistory: StateFlow<MemberHistoryResponse?> = _memberHistory.asStateFlow()

    private val _memberStreaks = MutableStateFlow<MemberStreaksResponse?>(null)
    val memberStreaks: StateFlow<MemberStreaksResponse?> = _memberStreaks.asStateFlow()

    private val _memberRecent = MutableStateFlow<List<MemberRecentItem>>(emptyList())
    val memberRecent: StateFlow<List<MemberRecentItem>> = _memberRecent.asStateFlow()

    private val _memberHealthLogs = MutableStateFlow<List<MemberHealthItem>>(emptyList())
    val memberHealthLogs: StateFlow<List<MemberHealthItem>> = _memberHealthLogs.asStateFlow()

    private val _membershipDetails = MutableStateFlow<List<MembershipDetailDTO>>(emptyList())
    val membershipDetails: StateFlow<List<MembershipDetailDTO>> = _membershipDetails.asStateFlow()

    /** The member a detail screen is scoped to — stashed by the tab before push (Android's static-route idiom). */
    private val _focusedMemberId = MutableStateFlow<String?>(null)
    val focusedMemberId: StateFlow<String?> = _focusedMemberId.asStateFlow()
    private val _focusedMemberName = MutableStateFlow<String?>(null)
    val focusedMemberName: StateFlow<String?> = _focusedMemberName.asStateFlow()

    fun focusMember(id: String?, name: String?) {
        _focusedMemberId.value = id
        _focusedMemberName.value = name
    }

    /**
     * The Members-tab roster + the persisted "View as" selection. Hoisted here (not screen-local `remember`)
     * so the choice SURVIVES navigating into a detail and back — the tab composable is disposed on push, so
     * screen-local state would reset to the default on return. Loaded/defaulted once per program.
     */
    private val _members = MutableStateFlow<List<ProgramMemberDTO>>(emptyList())
    val members: StateFlow<List<ProgramMemberDTO>> = _members.asStateFlow()
    private var membersLoadedFor: String? = null

    private val _membersViewAsId = MutableStateFlow<String?>(null)
    val membersViewAsId: StateFlow<String?> = _membersViewAsId.asStateFlow()

    /** Persist the tab's "View as" pick (null = "None", global-admin only). */
    fun setMembersViewAs(id: String?) { _membersViewAsId.value = id }

    /**
     * Load the roster + set the default View-as ONCE per active program (global-admin → "None"; everyone
     * else → self). Idempotent: re-entering the tab (e.g. after a detail push) is a no-op, so the prior
     * selection is preserved. A program switch re-initializes.
     */
    suspend fun ensureMembersLoaded(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        if (membersLoadedFor == pid) return Result.success(Unit)
        return runCatching {
            val list = api.getProgramMembers(pid)
            _members.value = list
            membersLoadedFor = pid
            _membersViewAsId.value = if (isGlobalAdmin) null else list.firstOrNull { it.id == loggedInMemberId }?.id
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /member-metrics — the full leaderboard (server search/sort/filter). Sets the table + envelope. */
    suspend fun loadMemberMetrics(
        search: String = "",
        sort: String = "workouts",
        direction: String = "desc",
        filterParams: Map<String, String> = emptyMap(),
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        val params = buildMap {
            put("programId", pid)
            if (search.isNotBlank()) put("search", search.trim())
            put("sort", sort)
            put("direction", direction)
            putAll(filterParams)
        }
        return runCatching {
            val resp = api.getMemberMetrics(params)
            _memberMetrics.value = resp.members
            _memberMetricsTotal.value = resp.total
            _memberMetricsRange.value = (resp.dateRange?.start to resp.dateRange?.end)
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /member-metrics scoped to one member — the selected member's Overview row. */
    suspend fun loadMemberOverview(memberId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            val resp = api.getMemberMetrics(mapOf("programId" to pid, "memberId" to memberId))
            _selectedMemberOverview.value = resp.members.firstOrNull()
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /member-history — the member's W/M/Y/P timeline. Sets state + returns the response for the detail. */
    suspend fun loadMemberHistory(memberId: String, period: String): Result<MemberHistoryResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            val resp = api.getMemberHistory(pid, memberId, period)
            _memberHistory.value = resp
            resp
        }.recoverCatching { throw it.asApiError() }
    }

    /** Reset the shared member-history to the default "week" window when the history detail leaves — the
     *  Members-tab card reads this shared state, so a detail left on Month/Year/Program would otherwise
     *  linger there (iOS `ActivityTimelineDetailView.onDisappear` parity). Fire-and-forget on the app scope. */
    fun resetMemberHistoryToWeek(memberId: String) {
        scope.launch { runCatching { loadMemberHistory(memberId, "week") } }
    }

    /** GET /member-streaks — server-computed streaks + milestone ladder. */
    suspend fun loadMemberStreaks(memberId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { _memberStreaks.value = api.getMemberStreaks(pid, memberId) }
            .recoverCatching { throw it.asApiError() }
    }

    /** GET /member-recent — the member's workout history (server sort/filter; `limit=0` → backend cap). */
    suspend fun loadMemberRecent(
        memberId: String,
        limit: Int = 1000,
        startDate: String? = null,
        endDate: String? = null,
        sortBy: String? = null,
        sortDir: String? = null,
        workoutType: String? = null,
        minDuration: Int? = null,
        maxDuration: Int? = null,
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            _memberRecent.value = api.getMemberRecent(
                pid, memberId, limit, startDate, endDate, sortBy, sortDir, workoutType, minDuration, maxDuration,
            ).items
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /daily-health-logs — the member's daily-health history (server sort/filter). */
    suspend fun loadMemberHealthLogs(
        memberId: String,
        limit: Int = 1000,
        startDate: String? = null,
        endDate: String? = null,
        sortBy: String? = null,
        sortDir: String? = null,
        minSleepHours: Double? = null,
        maxSleepHours: Double? = null,
        minFoodQuality: Int? = null,
        maxFoodQuality: Int? = null,
        minSteps: Int? = null,
        maxSteps: Int? = null,
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            _memberHealthLogs.value = api.getMemberHealthLogs(
                pid, memberId, limit, startDate, endDate, sortBy, sortDir,
                minSleepHours, maxSleepHours, minFoodQuality, maxFoodQuality,
                minSteps, maxSteps,
            ).items
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /program-memberships/details — the roster editor's rich rows (active memberships). Also seeds
     *  the signed-in member's gender (mirrors iOS ProgramContext+Members), read by My Profile. */
    suspend fun loadMembershipDetails(): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            val details = api.getMembershipDetails(pid)
            _membershipDetails.value = details
            details.firstOrNull { it.memberId == loggedInMemberId }?.let { _loggedInGender.value = it.gender }
            Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /** PUT /workout-logs — edit a log's duration (member_name only when editing another member's log). */
    suspend fun updateWorkoutLog(
        memberName: String?,
        workoutName: String,
        date: String,
        durationMinutes: Int,
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.updateWorkoutLog(WorkoutLogUpdateRequest(pid, memberName, workoutName, date, durationMinutes)); Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /** DELETE /workout-logs. */
    suspend fun deleteWorkoutLog(
        memberId: String?,
        memberName: String?,
        workoutName: String,
        date: String,
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.deleteWorkoutLog(WorkoutLogDeleteRequest(pid, memberId, memberName, workoutName, date)); Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /** PUT /daily-health-logs — edit sleep + diet + steps. Explicit nulls (via JsonObject) clear a metric
     *  server-side; `steps` rides along only when `stepsProvided` (absence = leave unchanged — the same
     *  presence semantics `food_quality` relies on). */
    suspend fun updateDailyHealthLog(
        memberId: String,
        logDate: String,
        sleepHours: Double?,
        foodQuality: Int?,
        steps: Int? = null,
        stepsProvided: Boolean = false,
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        val body = buildJsonObject {
            put("program_id", pid)
            put("member_id", memberId)
            put("log_date", logDate)
            put("sleep_hours", sleepHours)
            put("food_quality", foodQuality)
            if (stepsProvided) put("steps", steps)   // explicit JsonNull clears steps (mirrors food_quality)
        }
        return runCatching { api.updateDailyHealthLog(body); Unit }
            .recoverCatching { throw it.asApiError() }
    }

    /** DELETE /daily-health-logs. */
    suspend fun deleteDailyHealthLog(memberId: String, logDate: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.deleteDailyHealthLog(DailyHealthDeleteRequest(pid, memberId, logDate)); Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /** PUT /program-memberships — global-admin membership edit (is_active + joined_at). Reloads the roster. */
    suspend fun editMembership(
        memberId: String,
        role: String? = null,
        isActive: Boolean? = null,
        joinedAt: String? = null,
    ): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.editMembership(MembershipEditRequest(pid, memberId, role, isActive, joinedAt))
            loadMembershipDetails()
            Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /** DELETE /program-memberships — remove a member from the program. Reloads the roster. */
    suspend fun removeMember(memberId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.removeMember(MembershipRemoveRequest(pid, memberId))
            loadMembershipDetails()
            Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /**
     * POST /program-memberships/invite — privacy-safe (F3, LOAD-BEARING). Any HTTP/AppError failure is
     * swallowed as success so the screen never reveals whether a username exists; only a true network/IO
     * failure surfaces. The backend also swallows non-AppError to 200 — this completes the guarantee client-side.
     */
    suspend fun sendProgramInvite(username: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.sendInvite(InviteRequest(pid, username.trim())); Unit }
            .recoverCatching { e ->
                if (e is IOException) throw com.app.rasifiters.net.ApiException(0, "Network error. Please try again.")
                Unit
            }
    }

    // ---- Lifestyle tab (Phase F) — workout-type analytics + health timeline + workout management ----
    // The Lifestyle tab shows workout-type stats scoped to the "View as" member (participation is always
    // program-wide) + a sleep/diet health-timeline preview. Loaders mirror the iOS `AdminWorkoutTypesTab`
    // set. The "View as" pick is hoisted here (not screen-local) so it survives a detail push + return —
    // memory: persist-tab-selections-across-nav. `null` selection = the program-wide ("Admin") view.

    private val _lifestyle = MutableStateFlow(LifestyleData())
    val lifestyle: StateFlow<LifestyleData> = _lifestyle.asStateFlow()

    private val _lifestyleLoading = MutableStateFlow(false)
    val lifestyleLoading: StateFlow<Boolean> = _lifestyleLoading.asStateFlow()

    /** The Lifestyle-tab "View as" member (null = program-wide "Admin" view). Separate from the Members tab. */
    private val _lifestyleViewAsId = MutableStateFlow<String?>(null)
    val lifestyleViewAsId: StateFlow<String?> = _lifestyleViewAsId.asStateFlow()

    /** Whether the user explicitly picked a Lifestyle "View as" (distinguishes program-admin's default-self
     *  from an explicit "Admin" pick — mirrors the iOS `hasUserChosenViewAs` label logic). */
    private val _lifestyleViewAsChosen = MutableStateFlow(false)
    val lifestyleViewAsChosen: StateFlow<Boolean> = _lifestyleViewAsChosen.asStateFlow()

    private var lifestyleDefaultedFor: String? = null

    fun setLifestyleViewAs(id: String?) {
        _lifestyleViewAsChosen.value = true
        _lifestyleViewAsId.value = id
    }

    /**
     * Seed the Lifestyle "View as" default ONCE per program: global-admin → null ("Admin", program-wide);
     * everyone else → self. Reuses the roster loaded by [ensureMembersLoaded]. Idempotent — re-entering the
     * tab (e.g. after a detail push) preserves the prior pick; a program switch re-initializes.
     */
    suspend fun ensureLifestyleViewAsDefault(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        ensureMembersLoaded()
        if (lifestyleDefaultedFor == pid) return Result.success(Unit)
        lifestyleDefaultedFor = pid
        _lifestyleViewAsChosen.value = false
        _lifestyleViewAsId.value = if (isGlobalAdmin) null else _members.value.firstOrNull { it.id == loggedInMemberId }?.id
        return Result.success(Unit)
    }

    /**
     * Load the Lifestyle tab's cards for `memberId` (null = program-wide). Highest-participation is ALWAYS
     * program-wide (memberId=null), matching iOS. The health-timeline preview always loads the week window.
     */
    suspend fun loadLifestyle(memberId: String?): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        _lifestyleLoading.value = true
        return runCatching {
            _lifestyle.value = LifestyleData(
                totalTypes = api.getWorkoutTypesTotal(pid, memberId).totalTypes,
                mostPopular = api.getWorkoutTypeMostPopular(pid, memberId),
                longestDuration = api.getWorkoutTypeLongestDuration(pid, memberId),
                highestParticipation = api.getWorkoutTypeHighestParticipation(pid, null),
                workoutTypes = api.getWorkoutTypes(pid, 100, memberId),
                timeline = api.getHealthTimeline("week", pid, memberId),
                steps = api.getHealthSteps(pid, memberId),
            )
        }.recoverCatching { throw it.asApiError() }.also { _lifestyleLoading.value = false }
    }

    /** GET /analytics/health/timeline for a period — the Lifestyle timeline detail's period switch. */
    suspend fun loadHealthTimeline(period: String, memberId: String?): Result<HealthTimelineResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.getHealthTimeline(period, pid, memberId) }
            .recoverCatching { throw it.asApiError() }
    }

    // ---- Workout-types management (Lifestyle tab → "manage" list; nominally Program-tab / Phase G) ----
    // Gated on canEditProgramData (= isProgramAdmin). Global types can only be hidden/shown; customs can be
    // renamed/deleted/hidden. Each mutation reloads the full catalog. Errors surface (Result) for inline UI.

    val canEditProgramData: Boolean get() = isProgramAdmin

    private val _programWorkoutsAll = MutableStateFlow<List<ProgramWorkoutDTO>>(emptyList())
    /** The FULL program workout catalog (incl. hidden) for the manager — distinct from the log-form's filtered list. */
    val programWorkoutsAll: StateFlow<List<ProgramWorkoutDTO>> = _programWorkoutsAll.asStateFlow()

    suspend fun loadAllProgramWorkouts(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        return runCatching { _programWorkoutsAll.value = api.getProgramWorkouts(pid) }
            .recoverCatching { throw it.asApiError() }
    }

    suspend fun toggleWorkoutVisibility(libraryWorkoutId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.toggleWorkoutVisibility(ToggleWorkoutVisibilityRequest(pid, libraryWorkoutId))
            loadAllProgramWorkouts().getOrThrow()
        }.recoverCatching { throw it.asApiError() }
    }

    suspend fun toggleCustomWorkoutVisibility(workoutId: String): Result<Unit> = runCatching {
        api.toggleCustomWorkoutVisibility(workoutId)
        loadAllProgramWorkouts().getOrThrow()
    }.recoverCatching { throw it.asApiError() }

    suspend fun addCustomProgramWorkout(name: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.addCustomWorkout(AddCustomWorkoutRequest(pid, name))
            loadAllProgramWorkouts().getOrThrow()
        }.recoverCatching { throw it.asApiError() }
    }

    suspend fun editCustomProgramWorkout(workoutId: String, name: String): Result<Unit> = runCatching {
        api.editCustomWorkout(workoutId, EditCustomWorkoutRequest(name))
        loadAllProgramWorkouts().getOrThrow()
    }.recoverCatching { throw it.asApiError() }

    suspend fun deleteCustomProgramWorkout(workoutId: String): Result<Unit> = runCatching {
        api.deleteCustomWorkout(workoutId)
        loadAllProgramWorkouts().getOrThrow()
    }.recoverCatching { throw it.asApiError() }

    // ---- Program tab (Phase G) — account settings + admin program management ----
    // The My-Account settings actions + the admin program edit/leave/role mutations. Errors surface
    // (Result) for inline UI. Self-edits keep the cached identity (name/gender) in sync so the header +
    // account rows update without a reload.

    /** GET /members/:id — read the account profile (email + gender) for My Profile. */
    suspend fun fetchMember(memberId: String): Result<MemberDTO> =
        runCatching { api.getMember(memberId) }.recoverCatching { throw it.asApiError() }

    /** PUT /members/:id — edit own name/gender. On self-edit, refresh the cached name + gender. */
    suspend fun updateMemberProfile(
        memberId: String,
        firstName: String,
        lastName: String,
        gender: String?,
    ): Result<Unit> = runCatching {
        api.updateMemberProfile(memberId, UpdateMemberProfileRequest(firstName, lastName, gender))
        if (memberId == loggedInMemberId) {
            val full = "$firstName $lastName".trim()
            _memberName.value = full
            session.saveIdentity(session.memberId, session.username, full, session.globalRole)
            if (gender != null) _loggedInGender.value = gender
        }
        Unit
    }.recoverCatching { throw it.asApiError() }

    /** PUT /auth/change-password. */
    suspend fun changePassword(newPassword: String): Result<Unit> =
        runCatching { api.changePassword(ChangePasswordRequest(newPassword)); Unit }
            .recoverCatching { throw it.asApiError() }

    /** PUT /auth/email — direct, password-confirmed change. Returns the updated email. */
    suspend fun changeEmail(newEmail: String, password: String): Result<String?> =
        runCatching { api.changeEmail(ChangeEmailRequest(newEmail, password)).email }
            .recoverCatching { throw it.asApiError() }

    /** DELETE /auth/account — permanent. On success the session is cleared (→ back to login). */
    suspend fun deleteAccount(): Result<Unit> =
        runCatching { api.deleteAccount(); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { clearSession() }

    /** PUT /programs/:id — admin program edit. Updates the active program + picker card locally. */
    suspend fun updateProgram(
        name: String,
        status: String,
        startDate: String,
        endDate: String,
        adminOnlyDataEntry: Boolean,
    ): Result<Unit> {
        val program = _activeProgram.value
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.updateProgram(
                program.id,
                UpdateProgramRequest(name, status, startDate, endDate, adminOnlyDataEntry),
            )
            val updated = program.copy(
                name = name, status = status, startDate = startDate,
                endDate = endDate, adminOnlyDataEntry = adminOnlyDataEntry,
            )
            _activeProgram.value = updated
            _programs.value = _programs.value.map { if (it.id == updated.id) updated else it }
        }.recoverCatching { throw it.asApiError() }
    }

    /** PUT /program-memberships/leave — soft leave; drops the card + clears the active program. */
    suspend fun leaveProgram(): Result<Unit> {
        val program = _activeProgram.value
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.leaveProgram(LeaveProgramRequest(program.id))
            _programs.value = _programs.value.filterNot { it.id == program.id }
            _activeProgram.value = null
        }.recoverCatching { throw it.asApiError() }
    }

    /** PUT /program-memberships — set a member's program role (Manage Roles). Reloads the roster. */
    suspend fun updateMemberRole(memberId: String, role: String): Result<Unit> =
        editMembership(memberId = memberId, role = role)

    private fun clearSession() {
        stopNotificationStream()
        lastRegisteredPushToken = null
        session.clear()
        _pendingSocial.value = null
        _loggedInGender.value = null
        _authToken.value = null
        _globalRole.value = null
        _memberName.value = null
        _memberUsername.value = null
        _programs.value = emptyList()
        _activeProgram.value = null
        _widgetRoute.value = null
        _summary.value = SummaryData()
        _summaryError.value = null
        _memberMetrics.value = emptyList()
        _selectedMemberOverview.value = null
        _memberHistory.value = null
        _memberStreaks.value = null
        _memberRecent.value = emptyList()
        _memberHealthLogs.value = emptyList()
        _membershipDetails.value = emptyList()
        _focusedMemberId.value = null
        _focusedMemberName.value = null
        _members.value = emptyList()
        _membersViewAsId.value = null
        membersLoadedFor = null
        _lifestyle.value = LifestyleData()
        _lifestyleViewAsId.value = null
        _lifestyleViewAsChosen.value = false
        lifestyleDefaultedFor = null
        _programWorkoutsAll.value = emptyList()
    }

    private fun Throwable.asApiError(): Throwable =
        if (this is HttpException) toApiException() else this
}

/** The active program's Summary-tab analytics, refreshed together by [ProgramContext.loadSummary]. */
data class SummaryData(
    val mtdParticipation: MtdParticipationDTO? = null,
    val totalWorkouts: TotalWorkoutsMtdDTO? = null,
    val totalDuration: TotalDurationMtdDTO? = null,
    val avgDuration: AvgDurationMtdDTO? = null,
    val timeline: List<ActivityTimelinePoint> = emptyList(),
    val distribution: DistributionByDayDTO? = null,
    val workoutTypes: List<WorkoutTypeDTO> = emptyList(),
)

/** The active program's Lifestyle-tab analytics for the selected member, refreshed by [ProgramContext.loadLifestyle]. */
data class LifestyleData(
    val totalTypes: Int = 0,
    val mostPopular: WorkoutTypeMostPopularDTO? = null,
    val longestDuration: WorkoutTypeLongestDurationDTO? = null,
    val highestParticipation: WorkoutTypeHighestParticipationDTO? = null,
    val workoutTypes: List<WorkoutTypeDTO> = emptyList(),
    val timeline: HealthTimelineResponse? = null,
    val steps: StepsStatsDTO? = null,
)
