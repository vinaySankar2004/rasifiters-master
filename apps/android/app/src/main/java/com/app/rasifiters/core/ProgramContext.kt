package com.app.rasifiters.core

import android.content.Context
import com.app.rasifiters.core.events.ClientEventQueue
import com.app.rasifiters.core.events.forcedSignOut
import com.app.rasifiters.core.events.signInFailed
import com.app.rasifiters.core.events.signInProviderFailed
import com.app.rasifiters.core.kit.AppErrorException
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.ConnectivityObserver
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.failing
import com.app.rasifiters.core.kit.refreshing
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.health.HealthSyncController
import com.app.rasifiters.health.HealthSyncResult
import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.AuthUnavailableException
import com.app.rasifiters.net.InviteResponseRequest
import com.app.rasifiters.net.Network
import com.app.rasifiters.net.PendingInviteDTO
import com.app.rasifiters.net.TokenRefresher
import com.app.rasifiters.push.DeviceRegistry
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.AvgDurationMtdDTO
import com.app.rasifiters.net.BulkHealthEntry
import com.app.rasifiters.net.BulkHealthRequest
import com.app.rasifiters.net.BulkWorkoutEntry
import com.app.rasifiters.net.BulkWorkoutRequest
import com.app.rasifiters.net.DailyHealthDeleteRequest
import com.app.rasifiters.net.DailyHealthRequest
import com.app.rasifiters.net.DistributionByDayDTO
import com.app.rasifiters.net.ChangeEmailRequest
import com.app.rasifiters.net.ChangePasswordRequest
import com.app.rasifiters.net.CreateProgramRequest
import com.app.rasifiters.net.ForgotPasswordRequest
import com.app.rasifiters.net.IdentitiesResponse
import com.app.rasifiters.net.InviteRequest
import com.app.rasifiters.net.LinkRequest
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
import com.app.rasifiters.net.SetPasswordRequest
import com.app.rasifiters.net.StepsStatsDTO
import com.app.rasifiters.net.UnlinkRequest
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
import android.os.SystemClock
import com.app.rasifiters.net.toApiException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.HttpException
import kotlin.coroutines.cancellation.CancellationException

private const val PLATFORM = "android"
private const val INVITE_TYPE = "program.invite_received"
/** A4: acknowledged ids are remembered this long so a racing /unacknowledged re-fetch can't resurrect them. */
private const val ACK_MEMORY_MS = 120_000L

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
    private val refresher: TokenRefresher,
    private val events: ClientEventQueue,
    private val deviceRegistry: DeviceRegistry,
    private val launchCache: LaunchCache,
    private val connectivity: ConnectivityObserver,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    /** One app-wide connectivity monitor (frontend-kit §5, polish-1: link && !proven offline) — the global offline
     *  banner + SSE reconnect pause. */
    val isOnline: StateFlow<Boolean> = connectivity.isOnline

    /**
     * Health Connect auto-sync (Phase H) — the analog of the iOS Apple-Health lifecycle that hangs off
     * `ProgramContext`. Reads this context (token/programs/identity/lock); owns its own persisted state.
     */
    val health: HealthSyncController = HealthSyncController(appContext, api, this, events)

    /** Root gate (auth §3.1 — the ONE store's sign-in state; a refresh never flips it). */
    val isSignedIn: StateFlow<Boolean> = session.signedIn

    private val _signOutNotice = MutableStateFlow<String?>(null)
    /** A2: why the last session ended without the user asking — shown ONCE in the login screen's error slot. */
    val signOutNotice: StateFlow<String?> = _signOutNotice.asStateFlow()
    fun consumeSignOutNotice(): String? = _signOutNotice.value.also { _signOutNotice.value = null }
    /** A2: the session ended without the user asking (refresh `session_invalid`, a corrupt token store). Any thread. */
    fun noteForcedSignOut() { _signOutNotice.value = KitCopy.messageFor(AppErrorKind.SIGNED_OUT) }

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

    private val _programsState = MutableStateFlow<UiState<List<ProgramDTO>>>(UiState.Idle)
    /** The picker's kit state (frontend-kit §5); its data always equals [programs]. */
    val programsState: StateFlow<UiState<List<ProgramDTO>>> = _programsState.asStateFlow()

    /** Replace the list keeping the load-state variant (reorder / delete / edit / leave). */
    private fun setPrograms(list: List<ProgramDTO>) {
        _programs.value = list
        _programsState.value = when (val st = _programsState.value) {
            is UiState.Loaded -> st.copy(data = list)
            is UiState.Stale -> st.copy(data = list)
            else -> st
        }
    }

    /** The program chosen in the picker; hydrated on pick, read by the downstream shell (Phase D+). */
    private val _activeProgram = MutableStateFlow<ProgramDTO?>(null)
    val activeProgram: StateFlow<ProgramDTO?> = _activeProgram.asStateFlow()

    /** Mobile login via POST /auth/login/app. Persists tokens + identity, flips the gate. */
    suspend fun login(identifier: String, password: String): Result<Unit> = runCatching {
        val ride = deviceRegistry.beginSignIn()
        val resp = api.loginApp(
            LoginRequest(identifier, password, pushToken = ride.pushToken, deviceId = ride.deviceId, platform = PLATFORM),
        )
        applyLoginSession(resp.token, resp.refreshToken, resp.memberId, resp.username, resp.memberName, resp.globalRole)
        deviceRegistry.markRegistered(ride)
    }.recoverCatching { throw it.asApiError() }.onFailure { events.signInFailed("password", it) }

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
        // Identity first: the gate flips on saveTokens and the signed-in graph reads the member id at once.
        session.saveIdentity(memberId, username, memberName, globalRole)
        refresher.reset()
        _signOutNotice.value = null
        session.saveTokens(token, refreshToken)
        _globalRole.value = globalRole
        _memberName.value = memberName
        _memberUsername.value = username
        health.reloadForMember()
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
    suspend fun socialSignIn(idToken: String, nonce: String): Result<Boolean> = runCatching {
        val ride = deviceRegistry.beginSignIn()
        val resp = api.oauth(
            OAuthRequest(
                provider = "google", idToken = idToken, nonce = nonce,
                pushToken = ride.pushToken, deviceId = ride.deviceId, platform = PLATFORM,
            ),
        )
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
            deviceRegistry.markRegistered(ride)
            false
        }
    }.recoverCatching { throw it.asApiError() }.onFailure { events.signInFailed("google", it) }

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
        deviceRegistry.sync()
    }.recoverCatching { throw it.asApiError() }.onFailure { events.signInFailed("google", it) }

    // ---- Auth phase-2 (D-C10): linked sign-in identities ----
    suspend fun listIdentities(): Result<IdentitiesResponse> =
        runCatching { api.listIdentities() }.recoverCatching { throw it.asApiError() }

    /** POST /auth/link — the raw [nonce] whose SHA-256 hex Google embedded (link/unlink ignore refresh_token, D-C14c). */
    suspend fun linkGoogle(idToken: String, nonce: String): Result<IdentitiesResponse> =
        runCatching { api.linkIdentity(LinkRequest(provider = "google", idToken = idToken, nonce = nonce)) }
            .recoverCatching { throw it.asApiError() }

    suspend fun unlink(provider: String): Result<IdentitiesResponse> =
        runCatching { api.unlinkIdentity(UnlinkRequest(provider = provider)) }
            .recoverCatching { throw it.asApiError() }

    /** The Google SDK failed before any API call (observability §8 `kind: provider`). */
    fun reportGoogleProviderFailure(code: String) = events.signInProviderFailed("google", code)

    suspend fun setAccountPassword(newPassword: String): Result<IdentitiesResponse> =
        passwordWrite { api.setPassword(SetPasswordRequest(newPassword)) }

    /** auth §3.1 rule 6 (password writes): the body is one-shot, so OkHttp never replays it after a dropped connection.
     *  A 401 means the write never ran — the authenticator has refreshed by then, so re-send ONCE (A9). */
    private suspend fun <T> passwordWrite(call: suspend () -> T): Result<T> {
        val first = runCatching { call() }.recoverCatching { throw it.asApiError() }
        val e = first.exceptionOrNull()
        if (e is ApiException && e.status == 401 && session.signedIn.value) {
            return runCatching { call() }.recoverCatching { throw it.asApiError() }
        }
        return first
    }

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
        if (!session.signedIn.value) return
        scope.launch {
            runCatching { api.me() }.onSuccess { me ->
                session.saveIdentity(me.memberId, me.username, me.memberName, me.globalRole)
                _globalRole.value = me.globalRole
                _memberName.value = me.memberName
                _memberUsername.value = me.username
            }
        }
    }

    /** The user's own sign-out (auth §3.1 rule 1): revoke THIS device, then the full teardown. */
    fun signOut() { scope.launch { tearDown(revoke = true) } }

    /** TokenRefresher saw `401 session_invalid` for the stored session (tokens already cleared, so the gate has already
     *  flipped) — the A2 reason is set at once (any thread), then the forced teardown. */
    fun onSessionInvalid() {
        noteForcedSignOut()
        scope.launch { tearDown(revoke = false, forcedReason = "refresh_session_invalid") }
    }

    /** POST /auth/logout-all (My Profile → Sign out everywhere). 200 → every session ended → teardown. */
    suspend fun logoutAll(): Result<Unit> {
        val result = runCatching { api.logoutAll(); Unit }.recoverCatching { throw AppErrorException(it.toAppError()) }
        if (result.isSuccess) tearDown(revoke = false)
        return result
    }

    /** ONE teardown for every sign-out path (board §2 client rule 5): state + tokens cleared at once (the gate flips),
     *  then best-effort revoke / unregister in the background with the captured credentials. */
    private suspend fun tearDown(revoke: Boolean, forcedReason: String? = null) {
        // NonCancellable: logout-all / delete account run this in My Profile's scope, which dies the moment the gate
        // flips — the rest of the teardown must still complete.
        withContext(NonCancellable) {
            health.cancelRun()
            deviceRegistry.unregister()
            val access = session.accessToken
            val refresh = session.refreshToken
            // A2: the reason is set BEFORE the gate flips, so the auth graph mounts straight onto Login with it.
            if (forcedReason != null) noteForcedSignOut()
            clearSession()
            launchCache.clear()
            refresher.reset()
            health.reloadForMember()
            if (forcedReason != null) events.forcedSignOut(forcedReason, status = 401, code = "session_invalid")
            if (revoke && (access != null || refresh != null)) {
                scope.launch { runCatching { api.logout(access?.let { "Bearer $it" }, LogoutRequest(refresh)) } }
            }
        }
    }

    /** Who a load started for: null = signed out, else the member id ("" if unknown). A late response is applied only
     *  while [isCurrentOwner] — a sign-out / another sign-in meanwhile drops it (no cross-session state or cache). */
    private fun sessionOwner(): String? = if (session.signedIn.value) session.memberId.orEmpty() else null
    private fun isCurrentOwner(owner: String?): Boolean = owner != null && owner == sessionOwner()

    /** Load "My Programs" (GET /programs), in the member's saved order. The first call after launch / sign-in shows this
     *  member's cached list instantly (board §6.5), then refreshes. */
    suspend fun loadPrograms(): Result<Unit> {
        val owner = sessionOwner()
        val memberId = session.memberId
        if (_programsState.value is UiState.Idle && memberId != null) {
            launchCache.readPrograms(memberId)?.let { hit ->
                if (_programsState.value is UiState.Idle && isCurrentOwner(owner)) {
                    _programs.value = hit.data; _programsState.value = UiState.Loaded(hit.data, hit.savedAt)
                }
            }
        }
        _programsState.value = _programsState.value.refreshing()
        return runCatching { api.getPrograms() }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { list ->
                if (!isCurrentOwner(owner)) return@onSuccess
                _programs.value = list; _programsState.value = UiState.fresh(list)
                if (memberId != null) launchCache.writePrograms(memberId, list)
            }
            .onFailure {
                if (it !is CancellationException && isCurrentOwner(owner)) _programsState.value = _programsState.value.failing(it.toAppError())
            }
            .map { }
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
        setPrograms(current)
    }

    /** Persist the current display order (PUT /programs/order). On failure, revert to [previousOrder]. */
    suspend fun persistProgramOrder(previousOrder: List<ProgramDTO>): Result<Unit> = runCatching {
        api.saveProgramOrder(ProgramOrderRequest(_programs.value.map { it.id }))
        Unit
    }.recoverCatching {
        setPrograms(previousOrder)
        throw it.asApiError()
    }

    /** Manage-gated delete (DELETE /programs/:id); drops the card locally on success. */
    suspend fun deleteProgram(programId: String): Result<Unit> = runCatching {
        api.deleteProgram(programId)
        setPrograms(_programs.value.filterNot { it.id == programId })
    }.recoverCatching { throw it.asApiError() }

    // ---- Invites (invites §3.1) — the ONE inbox; push / SSE are hints only ----

    private val _invites = MutableStateFlow<UiState<List<PendingInviteDTO>>>(UiState.Idle)
    /** GET /my-invites; global admins GET /all-invites (A10 — iOS parity, with Revoke). */
    val invites: StateFlow<UiState<List<PendingInviteDTO>>> = _invites.asStateFlow()

    suspend fun loadInvites(): Result<Unit> {
        val owner = sessionOwner()
        _invites.value = _invites.value.refreshing()
        return runCatching { if (isGlobalAdmin) api.getAllInvites() else api.getMyInvites() }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { if (isCurrentOwner(owner)) _invites.value = UiState.fresh(it) }
            .onFailure {
                if (it !is CancellationException && isCurrentOwner(owner)) _invites.value = _invites.value.failing(it.toAppError())
            }
            .map { }
    }

    /** PUT /invite-response (`accept` / `decline` [+ block_future] / `revoke` for global admins), then inbox + programs
     *  reload in parallel. The 200 message is not shown (invites §3.1 as amended — all three surfaces). */
    suspend fun respondToInvite(inviteId: String, action: String, blockFuture: Boolean = false): Result<Unit> = runCatching {
        api.respondToInvite(InviteResponseRequest(inviteId, action, blockFuture.takeIf { it && action == "decline" }))
        coroutineScope { launch { loadInvites() }; launch { loadPrograms() } }
        Unit
    }.recoverCatching { throw AppErrorException(it.toAppError()) }

    /** A "requested" card's Cancel Request — unchanged PUT /program-memberships (status removed). */
    suspend fun cancelJoinRequest(programId: String): Result<Unit> = runCatching {
        val memberId = session.memberId ?: error("Missing member id.")
        api.updateMembership(MembershipUpdateRequest(programId, memberId, "removed"))
        loadPrograms().getOrThrow()
    }.recoverCatching { throw AppErrorException(it.toAppError()) }

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

    // ---- Notifications (notifications §3.3) — real-time SSE + the modal queue ----
    // An SSE stream pushes new alerts live; every `ready` re-fetches `GET /notifications/unacknowledged` (the stream
    // never replays). Alerts render as a single-notification modal QUEUE (oldest-first), acknowledged optimistically.

    private val notificationIds = mutableSetOf<String>()
    private val recentlyAcked = LinkedHashMap<String, Long>()

    /** The pending-alert queue; the shell shows `first` in a modal and pops it on acknowledge (web F7 parity). */
    private val _notificationQueue = MutableStateFlow<List<NotificationDTO>>(emptyList())
    val notificationQueue: StateFlow<List<NotificationDTO>> = _notificationQueue.asStateFlow()

    private val streamClient = NotificationStreamClient(
        baseUrl, Network.streamClient(), scope,
        awaitOnline = { isOnline.first { it } },
    ) { force ->
        try {
            if (force) (refresher.refresh(session.accessToken) as? TokenRefresher.Outcome.Refreshed)?.accessToken
            else refresher.tokenForRequest()
        } catch (_: AuthUnavailableException) { null }
    }.also { c ->
        c.onNotification = { dto -> scope.launch { enqueueNotification(dto) } }
        c.onReady = { scope.launch { loadUnacknowledgedNotifications() } }
    }

    /** FCM foreground suppression (A5): the in-app modal already shows what arrives while the stream is connected. */
    val isStreamConnected: Boolean get() = streamClient.isConnected

    fun startNotificationStream() { if (session.signedIn.value) streamClient.start() }
    fun pauseNotificationStream() = streamClient.stop()

    /** Tear down the stream + clear the queue (sign-out). */
    fun stopNotificationStream() {
        streamClient.stop()
        _notificationQueue.value = emptyList()
        notificationIds.clear()
    }

    /** RootScreen ON_START — `launch` (first start of this signed-in state) or `foreground`. */
    fun onForeground(trigger: String) {
        connectivity.setForeground(true)   // the offline probe runs signed in or out
        events.flushSoon()
        if (!session.signedIn.value) return
        startNotificationStream()
        registerPushTokenIfNeeded()
        health.onTrigger(trigger)
    }

    /** RootScreen ON_STOP — the stream and the offline probe are foreground-only. */
    fun onBackground() {
        connectivity.setForeground(false)
        pauseNotificationStream()
    }

    /** notifications §3.3: after every `ready`, re-fetch — drops items acknowledged elsewhere, keeps our own recent acks
     *  out (A4), and refreshes the invite inbox when an invite is among them. */
    suspend fun loadUnacknowledgedNotifications() {
        if (!session.signedIn.value) return
        runCatching { api.getUnacknowledgedNotifications() }.onSuccess { items ->
            pruneAcked()
            val fresh = items.filterNot { it.id in recentlyAcked }
            val newTypes = fresh.filter { it.id !in notificationIds }.map { it.type }.toSet()
            notificationIds.clear()
            notificationIds.addAll(fresh.map { it.id })
            _notificationQueue.value = sortNotifications(fresh)
            if (fresh.any { it.type == INVITE_TYPE }) runCatching { loadInvites() }
            newTypes.filter { it != INVITE_TYPE }.forEach { refreshDataForType(it) }
        }
    }

    /** Optimistic acknowledge: pop the alert immediately, then `POST /:id/acknowledge`; on failure re-backfill
     *  so it reappears (iOS/web F8 parity). */
    suspend fun acknowledgeNotification(notification: NotificationDTO) {
        if (!session.signedIn.value) return
        rememberAcked(notification.id)
        _notificationQueue.value = _notificationQueue.value.filterNot { it.id == notification.id }
        notificationIds.remove(notification.id)
        runCatching { api.acknowledgeNotification(notification.id) }
            .onFailure { recentlyAcked.remove(notification.id); loadUnacknowledgedNotifications() }
    }

    private suspend fun enqueueNotification(notification: NotificationDTO) {
        if (notification.id in recentlyAcked || !notificationIds.add(notification.id)) return
        _notificationQueue.value = sortNotifications(_notificationQueue.value + notification)
        refreshDataForType(notification.type)
    }

    /** Invalidate the caches an event touches so the open screen reflects it (iOS `refreshDataForNotification`
     *  / web per-notification query invalidation). Best-effort; the inbox is always GET /my-invites. */
    private suspend fun refreshDataForType(type: String) {
        when (type) {
            INVITE_TYPE -> runCatching { loadInvites() }
            "program.role_changed", "program.member_removed", "program.member_left",
            "program.member_joined", "program.admin_transferred", "program.updated", "program.deleted" -> {
                runCatching { loadPrograms() }
                if (_activeProgram.value != null) runCatching { loadMembershipDetails() }
            }
        }
    }

    private fun rememberAcked(id: String) { pruneAcked(); recentlyAcked[id] = SystemClock.elapsedRealtime() }
    private fun pruneAcked() {
        val cutoff = SystemClock.elapsedRealtime() - ACK_MEMORY_MS
        recentlyAcked.entries.removeAll { it.value < cutoff }
    }

    /** Oldest-first (ISO `created_at` string sort; missing dates sink to the front — distant past). */
    private fun sortNotifications(items: List<NotificationDTO>): List<NotificationDTO> =
        items.sortedBy { it.createdAt ?: "" }

    // ---- Push (FCM, notifications §3.1–3.2) — registration lives in DeviceRegistry ----

    fun registerPushTokenIfNeeded() = deviceRegistry.sync()
    fun shouldAskNotificationPermission() = deviceRegistry.shouldAskNotificationPermission()
    fun markNotificationPermissionAsked() = deviceRegistry.markNotificationPermissionAsked()

    /** A foreground FCM message (tray path) — keep the inbox fresh (invites §3.1). Any thread. */
    fun onPushReceived(type: String?) {
        if (type == INVITE_TYPE) scope.launch { if (session.signedIn.value) loadInvites() }
    }

    private val _inviteInboxRequest = MutableStateFlow(false)
    /** U2: an invite push tap asks the picker to open the actions sheet on its invites tab. */
    val inviteInboxRequest: StateFlow<Boolean> = _inviteInboxRequest.asStateFlow()
    fun consumeInviteInboxRequest() { _inviteInboxRequest.value = false }

    /** notifications §3.2 (U2): a push tap acknowledges; an invite opens the inbox, any other type re-fetches its data. */
    fun onPushTap(notificationId: String, type: String?) {
        if (!session.signedIn.value) return
        rememberAcked(notificationId)
        _notificationQueue.value = _notificationQueue.value.filterNot { it.id == notificationId }
        notificationIds.remove(notificationId)
        scope.launch {
            runCatching { api.acknowledgeNotification(notificationId) }
            type?.let { refreshDataForType(it) }
        }
        if (type == INVITE_TYPE) _inviteInboxRequest.value = true
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

    private val _summaryState = MutableStateFlow<UiState<SummaryData>>(UiState.Idle)
    /** The Summary tab's kit state (frontend-kit §5). */
    val summaryState: StateFlow<UiState<SummaryData>> = _summaryState.asStateFlow()
    private val _summary = MutableStateFlow(SummaryData())
    /** The detail screens' view of the same data (empty until loaded). */
    val summary: StateFlow<SummaryData> = _summary.asStateFlow()
    private var summaryProgramId: String? = null

    private fun setSummaryState(state: UiState<SummaryData>) { _summaryState.value = state; _summary.value = state.dataOrNull ?: SummaryData() }

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
     * Load the Summary tab's 7 analytics reads for the active program, in PARALLEL (board §6.5); this member's cached
     * Summary shows first when the program changes. A13: a partial failure keeps the parts that loaded (the rest keep
     * this program's previous values) and shows the stale banner; only all seven failing with no data → ErrorView.
     * Program progress is read from the loaded [activeProgram] DTO (the vestigial `analytics/summary` is skipped).
     */
    suspend fun loadSummary(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.failure(IllegalStateException("No active program."))
        val owner = sessionOwner()
        val memberId = session.memberId
        fun stillMine() = summaryProgramId == pid && isCurrentOwner(owner)
        if (summaryProgramId != pid) {
            summaryProgramId = pid
            setSummaryState(UiState.Idle)
            if (memberId != null) launchCache.readSummary(memberId, pid)?.let { hit ->
                if (stillMine() && _summaryState.value is UiState.Idle) setSummaryState(UiState.Loaded(hit.data, hit.savedAt))
            }
        }
        setSummaryState(_summaryState.value.refreshing())
        val parts = coroutineScope {
            val mtd = async { attempt { api.getMtdParticipation(pid) } }
            val total = async { attempt { api.getTotalWorkoutsMtd(pid) } }
            val duration = async { attempt { api.getTotalDurationMtd(pid) } }
            val avg = async { attempt { api.getAvgDurationMtd(pid) } }
            val timeline = async { attempt { api.getActivityTimeline("week", pid).buckets } }
            val distribution = async { attempt { api.getDistributionByDay(pid) } }
            val types = async { attempt { api.getWorkoutTypes(pid, 100) } }
            SummaryParts(mtd.await(), total.await(), duration.await(), avg.await(), timeline.await(), distribution.await(), types.await())
        }
        if (!stillMine()) return Result.success(Unit)   // the program or the session changed mid-load
        val errors = parts.errors()
        val prev = _summaryState.value.dataOrNull
        if (errors.size == SummaryParts.COUNT) {
            setSummaryState(_summaryState.value.failing(errors.first().toAppError()))
            return Result.failure(errors.first())
        }
        val data = parts.merge(prev)
        if (errors.isEmpty()) {
            setSummaryState(UiState.fresh(data))
            if (memberId != null) launchCache.writeSummary(memberId, pid, data)
            return Result.success(Unit)
        }
        setSummaryState(UiState.Stale(data, System.currentTimeMillis(), errors.first().toAppError()))
        return Result.failure(errors.first())
    }

    /** Summary pull-to-refresh (A13): reload now; the health run (`pull_to_refresh`) goes on the app scope (survives
     *  leaving the tab) and reloads again only if it applied something. */
    suspend fun refreshSummary(): Result<Unit> {
        scope.launch { if (((health.sync("pull_to_refresh") as? HealthSyncResult.Synced)?.count ?: 0) > 0) loadSummary() }
        return loadSummary()
    }

    private suspend fun <T> attempt(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        Result.failure(e.asApiError())
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
     * POST /program-memberships/invite. The server keeps the privacy guarantee (every no-op is a 200 "Invitation
     * sent", F1); the client-side swallow is removed (invites §3.1) — "Invitation sent" only on 200, every other
     * status / transport failure through the frontend kit.
     */
    suspend fun sendProgramInvite(username: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.sendInvite(InviteRequest(pid, username.trim())); Unit }
            .recoverCatching { throw AppErrorException(it.toAppError()) }
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
        passwordWrite { api.changePassword(ChangePasswordRequest(newPassword)); Unit }

    /** PUT /auth/email — direct, password-confirmed change. Returns the updated email. */
    suspend fun changeEmail(newEmail: String, password: String): Result<String?> =
        runCatching { api.changeEmail(ChangeEmailRequest(newEmail, password)).email }
            .recoverCatching { throw it.asApiError() }

    /** DELETE /auth/account — permanent. On success the session is cleared (→ back to login). */
    suspend fun deleteAccount(): Result<Unit> {
        val result = runCatching { api.deleteAccount(); Unit }.recoverCatching { throw it.asApiError() }
        if (result.isSuccess) tearDown(revoke = false)
        return result
    }

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
            setPrograms(_programs.value.map { if (it.id == updated.id) updated else it })
        }.recoverCatching { throw it.asApiError() }
    }

    /** PUT /program-memberships/leave — soft leave; drops the card + clears the active program. */
    suspend fun leaveProgram(): Result<Unit> {
        val program = _activeProgram.value
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.leaveProgram(LeaveProgramRequest(program.id))
            setPrograms(_programs.value.filterNot { it.id == program.id })
            _activeProgram.value = null
        }.recoverCatching { throw it.asApiError() }
    }

    /** PUT /program-memberships — set a member's program role (Manage Roles). Reloads the roster. */
    suspend fun updateMemberRole(memberId: String, role: String): Result<Unit> =
        editMembership(memberId = memberId, role = role)

    private fun clearSession() {
        stopNotificationStream()
        session.clear()
        _invites.value = UiState.Idle
        _inviteInboxRequest.value = false
        recentlyAcked.clear()
        _pendingSocial.value = null
        _loggedInGender.value = null
        _globalRole.value = null
        _memberName.value = null
        _memberUsername.value = null
        _programs.value = emptyList()
        _programsState.value = UiState.Idle
        _activeProgram.value = null
        _widgetRoute.value = null
        setSummaryState(UiState.Idle)
        summaryProgramId = null
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

/** The active program's Summary-tab analytics, loaded together by [ProgramContext.loadSummary] (also launch-cached). */
@Serializable
data class SummaryData(
    val mtdParticipation: MtdParticipationDTO? = null,
    val totalWorkouts: TotalWorkoutsMtdDTO? = null,
    val totalDuration: TotalDurationMtdDTO? = null,
    val avgDuration: AvgDurationMtdDTO? = null,
    val timeline: List<ActivityTimelinePoint> = emptyList(),
    val distribution: DistributionByDayDTO? = null,
    val workoutTypes: List<WorkoutTypeDTO> = emptyList(),
    /** A13: list parts that failed with no previous value ([SummaryPart.TIMELINE] / [SummaryPart.TYPES]) — shown as "—",
     *  never as an empty chart. A failed object part is simply null. Never cached (only full successes are). */
    @Transient val unavailable: Set<SummaryPart> = emptySet(),
)

enum class SummaryPart { TIMELINE, TYPES }

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

/** The 7 Summary reads, each its own result (A13 partial failures). */
private data class SummaryParts(
    val mtd: Result<MtdParticipationDTO>,
    val total: Result<TotalWorkoutsMtdDTO>,
    val duration: Result<TotalDurationMtdDTO>,
    val avg: Result<AvgDurationMtdDTO>,
    val timeline: Result<List<ActivityTimelinePoint>>,
    val distribution: Result<DistributionByDayDTO>,
    val types: Result<List<WorkoutTypeDTO>>,
) {
    fun errors(): List<Throwable> =
        listOf(mtd, total, duration, avg, timeline, distribution, types).mapNotNull { it.exceptionOrNull() }

    /** Loaded parts win; a failed part keeps [prev] (this program's previous values) when there is one, else it is
     *  null / marked unavailable (rendered "—", never a fake zero — A13). */
    fun merge(prev: SummaryData?) = SummaryData(
        mtdParticipation = mtd.getOrElse { prev?.mtdParticipation },
        totalWorkouts = total.getOrElse { prev?.totalWorkouts },
        totalDuration = duration.getOrElse { prev?.totalDuration },
        avgDuration = avg.getOrElse { prev?.avgDuration },
        timeline = timeline.getOrElse { prev?.timeline.orEmpty() },
        distribution = distribution.getOrElse { prev?.distribution },
        workoutTypes = types.getOrElse { prev?.workoutTypes.orEmpty() },
        unavailable = buildSet {
            if (timeline.isFailure && (prev == null || SummaryPart.TIMELINE in prev.unavailable)) add(SummaryPart.TIMELINE)
            if (types.isFailure && (prev == null || SummaryPart.TYPES in prev.unavailable)) add(SummaryPart.TYPES)
        },
    )

    companion object { const val COUNT = 7 }
}
