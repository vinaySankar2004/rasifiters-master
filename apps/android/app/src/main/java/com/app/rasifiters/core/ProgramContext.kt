package com.app.rasifiters.core

import android.content.Context
import com.app.rasifiters.core.events.ClientEventQueue
import com.app.rasifiters.core.events.forcedSignOut
import com.app.rasifiters.core.events.signInFailed
import com.app.rasifiters.core.events.signInProviderFailed
import com.app.rasifiters.core.kit.AppError
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
import com.app.rasifiters.push.clearPostedPushes
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
import com.app.rasifiters.net.MemberMetricsResponse
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
import com.app.rasifiters.net.NotificationStreamClient
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.net.ProgramOrderRequest
import com.app.rasifiters.net.ProgramWorkoutDTO
import com.app.rasifiters.net.RegisterRequest
import com.app.rasifiters.net.SetPasswordRequest
import com.app.rasifiters.net.UnlinkRequest
import com.app.rasifiters.net.ActivityTimelinePoint
import com.app.rasifiters.net.ActivityTimelineResponse
import com.app.rasifiters.net.AddCustomWorkoutRequest
import com.app.rasifiters.net.EditCustomWorkoutRequest
import com.app.rasifiters.net.HealthTimelineResponse
import com.app.rasifiters.net.ToggleWorkoutVisibilityRequest
import com.app.rasifiters.net.TotalDurationMtdDTO
import com.app.rasifiters.net.UpdateProgramRequest
import com.app.rasifiters.net.TotalWorkoutsMtdDTO
import com.app.rasifiters.net.WorkoutLogDeleteRequest
import com.app.rasifiters.net.WorkoutLogUpdateRequest
import com.app.rasifiters.net.WorkoutTypeDTO
import android.os.SystemClock
import com.app.rasifiters.net.toApiException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import retrofit2.HttpException
import kotlin.coroutines.cancellation.CancellationException

private const val PLATFORM = "android"
/** The catch-up rule: a stream `ready` / foreground start re-reads the counts, invites and programs at most this often. */
private const val CATCH_UP_MIN_MS = 5_000L

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

    /** Polish #21: leaving the sign-up wizard (Back from its first page, or "Sign in") drops an abandoned Google sign-up,
     *  so it can't stick until the app restarts. */
    fun clearPendingSocial() { _pendingSocial.value = null }

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

    /** POST /programs — create a program (creator becomes its admin). Polish #12: success is the write alone; the list
     *  refreshes in the background, so a failed refresh can never make a retry create a duplicate. */
    suspend fun createProgram(
        name: String,
        status: String,
        startDate: String?,
        endDate: String?,
    ): Result<Unit> = runCatching {
        api.createProgram(CreateProgramRequest(name.trim(), status, startDate, endDate))
        Unit
    }.recoverCatching { throw it.asApiError() }
        .onSuccess { scope.launch { loadPrograms() } }

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
     *  reload in parallel; the answered program's unread invite items are marked read. The 200 message is not shown. */
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

    /** A "requested" card's Cancel Request — unchanged PUT /program-memberships (status removed). Polish #12: success is
     *  the write alone — the card drops at once, then the list refreshes in the background. */
    suspend fun cancelJoinRequest(programId: String): Result<Unit> = runCatching {
        val memberId = session.memberId ?: error("Missing member id.")
        api.updateMembership(MembershipUpdateRequest(programId, memberId, "removed"))
        Unit
    }.recoverCatching { throw AppErrorException(it.toAppError()) }
        .onSuccess {
            setPrograms(_programs.value.filterNot { it.id == programId })
            scope.launch { loadPrograms() }
        }

    /** Pick a program → hydrate the active-program state the shell reads. Polish #5/#10: a different program clears every
     *  program-scoped flow first ([resetProgramScope] — the roster + View-as re-default; the Members cards re-spin, S5
     *  keys them to their program + member), so no tab ever shows the previous program's numbers under the new name. */
    fun selectProgram(program: ProgramDTO) {
        if (program.id != _activeProgram.value?.id) resetProgramScope()
        _activeProgram.value = program
    }

    /** The `program` target: the program to open when the member can (active, or a global admin); loads the list once
     *  when it isn't known yet (a cold start from a push tap). null → the picker. */
    suspend fun programForOpen(programId: String?): ProgramDTO? {
        val id = programId ?: return null
        fun find() = _programs.value.firstOrNull { it.id == id && (isGlobalAdmin || it.myStatus == "active") }
        return find() ?: run { loadPrograms(); find() }
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

    // ---- Notifications (notifications §3.3–§3.5 + §3.9) — the inbox stream, the unread badge, the toast, push routing ----
    // The SSE stream opens with ?inbox=1 (every type, as an inbox item). [inbox] keeps the unread counts, the paged list,
    // the preference cache that gates the toast, the toast and the pending "open this" — no blocking pop-up.

    /** The notification inbox hub (core/NotificationInbox.kt). */
    val inbox = NotificationInbox(
        api = api,
        scope = scope,
        owner = { sessionOwner() },
        onInviteActivity = { loadInvites() },
        onItemActivity = { type -> refreshDataForType(type) },
        onAllRead = { clearPostedPushes(appContext) },
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
        // The stream never replays: every `ready` runs the catch-up (the badge + lists catch up on anything missed).
        c.onReady = { catchUp() }
    }

    /** FCM foreground suppression (A5): the in-app toast already shows what arrives while the stream is connected. */
    val isStreamConnected: Boolean get() = streamClient.isConnected

    fun startNotificationStream() { if (session.signedIn.value) streamClient.start() }
    fun pauseNotificationStream() = streamClient.stop()

    /** Tear down the stream + the inbox state (sign-out). */
    fun stopNotificationStream() {
        streamClient.stop()
        inbox.reset()
        lastCatchUpAt = 0L
    }

    /** RootScreen ON_START — `launch` (first start of this signed-in state) or `foreground`. */
    fun onForeground(trigger: String) {
        connectivity.setForeground(true)   // the offline probe runs signed in or out
        events.flushSoon()
        if (!session.signedIn.value) return
        startNotificationStream()
        registerPushTokenIfNeeded()
        health.onTrigger(trigger)
        catchUp()
        // The preference cache that gates the toast.
        scope.launch { inbox.loadPreferences() }
    }

    /** RootScreen ON_STOP — the stream and the offline probe are foreground-only. */
    fun onBackground() {
        connectivity.setForeground(false)
        pauseNotificationStream()
    }

    private var lastCatchUpAt = 0L

    /** The catch-up rule (every stream `ready` and foreground start, at most once per 5 s): the unread counts, the inbox
     *  when it is on screen, the invites, the programs and — with a program open — its role-dependent membership rows. */
    private fun catchUp() {
        if (!session.signedIn.value) return
        val now = SystemClock.elapsedRealtime()
        if (lastCatchUpAt != 0L && now - lastCatchUpAt < CATCH_UP_MIN_MS) return
        lastCatchUpAt = now
        scope.launch { inbox.refreshCounts() }
        if (inbox.inboxVisible.value) scope.launch { inbox.loadAndMarkRead() }
        scope.launch { runCatching { loadInvites() } }
        scope.launch { loadPrograms().onSuccess { reconcileActiveProgram() } }
        if (_activeProgram.value != null) scope.launch { runCatching { loadMembershipDetails() } }
    }

    /** The catch-up's role re-read for the OPEN program, from the fresh list: gone (or, for a member, no longer active) →
     *  the picker through the routing rule's `programs` target (the form guard applies); changed → the open program is
     *  replaced, and a role change re-defaults the Members roster + View-as (the role-dependent data). */
    private fun reconcileActiveProgram() {
        val active = _activeProgram.value ?: return
        val fresh = _programs.value.firstOrNull { it.id == active.id && (isGlobalAdmin || it.myStatus == "active") }
        when {
            fresh == null -> inbox.requestOpen(PendingOpen(InboxTarget.PROGRAMS, active.id))
            fresh != active -> {
                if (fresh.myRole != active.myRole) {
                    membersLoadedFor = null
                    _membersViewAsId.value = null
                }
                _activeProgram.value = fresh
            }
        }
    }

    /** Invalidate the caches a program event touches so the open screen reflects it (iOS `refreshDataForNotification`
     *  / web per-notification query invalidation). Best-effort; invites are the inbox's (the invite list reload). */
    private suspend fun refreshDataForType(type: String) {
        when (type) {
            "program.role_changed", "program.member_removed", "program.member_left",
            "program.member_joined", "program.admin_transferred", "program.updated", "program.deleted" -> {
                loadPrograms().onSuccess { reconcileActiveProgram() }
                if (_activeProgram.value != null) runCatching { loadMembershipDetails() }
            }
        }
    }

    // ---- Push (FCM, notifications §3.1–3.2) — registration lives in DeviceRegistry ----

    fun registerPushTokenIfNeeded() = deviceRegistry.sync()
    fun shouldAskNotificationPermission() = deviceRegistry.shouldAskNotificationPermission()
    fun markNotificationPermissionAsked() = deviceRegistry.markNotificationPermissionAsked()

    private val _notificationPromptOpen = MutableStateFlow(false)
    /** The first-start POST_NOTIFICATIONS prompt is on screen — the activity notice waits for its answer. */
    val notificationPromptOpen: StateFlow<Boolean> = _notificationPromptOpen.asStateFlow()

    /** RootScreen's once-per-install ask: remembered as asked, and open until [endNotificationPrompt]. */
    fun beginNotificationPrompt() { markNotificationPermissionAsked(); _notificationPromptOpen.value = true }
    fun endNotificationPrompt() { _notificationPromptOpen.value = false }

    /** A foreground FCM message the tray showed (the stream was down) — the badge + an invite's list stay fresh. Any thread. */
    fun onPushReceived(type: String?) { if (session.signedIn.value) inbox.onPushReceived(type) }

    /** A push tap marks it read and opens its target (RootScreen consumes [NotificationInbox.pendingOpen]). */
    fun onPushTap(notificationId: String, type: String?, target: String?, programId: String?) {
        if (session.signedIn.value) inbox.open(notificationId, type, target, programId)
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
            // D1: a program picked from the launch-cached list carries that list's day counts — re-read the row (as iOS
            // and web do on open) so the ring isn't a day behind for the session.
            scope.launch { loadPrograms().onSuccess { reconcileActiveProgram() } }
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
        // D1 / X-2: the ring reads the open program's /programs row — a pull re-reads it too.
        scope.launch { loadPrograms().onSuccess { reconcileActiveProgram() } }
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

    private val _membersViewAsId = MutableStateFlow<String?>(null)
    val membersViewAsId: StateFlow<String?> = _membersViewAsId.asStateFlow()

    /** Persist the tab's "View as" pick (null = "None", global-admin only). */
    fun setMembersViewAs(id: String?) { _membersViewAsId.value = id }

    /**
     * Load the roster + set the default View-as ONCE per active program (global-admin → "None"; everyone else → self).
     * Idempotent unless [force]: re-entering the tab is a no-op, so the prior selection is preserved. [force] (the Program
     * tab, polish #33) re-reads the roster but never re-defaults the pick. A program switch mid-load drops the result.
     */
    suspend fun ensureMembersLoaded(force: Boolean = false): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        if (!force && membersLoadedFor == pid) return Result.success(Unit)
        return runCatching {
            val list = api.getProgramMembers(pid)
            if (_activeProgram.value?.id != pid) return@runCatching
            val firstForProgram = membersLoadedFor != pid
            _members.value = list
            membersLoadedFor = pid
            if (firstForProgram) {
                _membersViewAsId.value = if (isGlobalAdmin) null else list.firstOrNull { it.id == loggedInMemberId }?.id
            }
        }.recoverCatching { throw it.asApiError() }
    }

    /** The keyed-state rule for the shared member flows: a read publishes only while the program it was made for is still
     *  the active one (the Members cards also check the member — S5's [memberCardsHeld]). */
    private fun stillActive(pid: String) = _activeProgram.value?.id == pid

    /** GET /member-metrics — the full leaderboard (server search/sort/filter). [publish] = false for the metrics detail
     *  (polish #34): it keeps its own page, so the Members-tab preview never re-sorts under it. */
    suspend fun loadMemberMetrics(
        search: String = "",
        sort: String = "workouts",
        direction: String = "desc",
        filterParams: Map<String, String> = emptyMap(),
        publish: Boolean = true,
    ): Result<MemberMetricsResponse> {
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
            if (publish && stillActive(pid)) {
                _memberMetrics.value = resp.members
                _memberMetricsTotal.value = resp.total
                _memberMetricsRange.value = (resp.dateRange?.start to resp.dateRange?.end)
                markCardHeld(MemberCardPart.METRICS, pid, null)
            }
            resp
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /member-metrics scoped to one member — the selected member's Overview row. */
    suspend fun loadMemberOverview(memberId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            val resp = api.getMemberMetrics(mapOf("programId" to pid, "memberId" to memberId))
            if (stillActive(pid)) {
                _selectedMemberOverview.value = resp.members.firstOrNull()
                markCardHeld(MemberCardPart.OVERVIEW, pid, memberId)
            }
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /member-history — the member's W/M/Y/P timeline. [publish] = false for the history detail (polish #34): it
     *  keeps its own result, so the Members-tab card always shows its week. */
    suspend fun loadMemberHistory(memberId: String, period: String, publish: Boolean = true): Result<MemberHistoryResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            val resp = api.getMemberHistory(pid, memberId, period)
            if (publish && stillActive(pid)) {
                _memberHistory.value = resp
                markCardHeld(MemberCardPart.HISTORY, pid, memberId)
            }
            resp
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /member-streaks — server-computed streaks + milestone ladder (the tab card and the streak detail, #29). */
    suspend fun loadMemberStreaks(memberId: String): Result<MemberStreaksResponse> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.getMemberStreaks(pid, memberId).also {
                if (stillActive(pid)) {
                    _memberStreaks.value = it
                    markCardHeld(MemberCardPart.STREAKS, pid, memberId)
                }
            }
        }.recoverCatching { throw it.asApiError() }
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
        publish: Boolean = true,
    ): Result<List<MemberRecentItem>> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.getMemberRecent(
                pid, memberId, limit, startDate, endDate, sortBy, sortDir, workoutType, minDuration, maxDuration,
            ).items.also {
                if (publish && stillActive(pid)) {
                    _memberRecent.value = it
                    markCardHeld(MemberCardPart.RECENT, pid, memberId)
                }
            }
        }.recoverCatching { throw it.asApiError() }
    }

    /** GET /daily-health-logs — the member's daily-health history (server sort/filter). [publish] = false for the health
     *  detail (polish #34): it keeps its own list. */
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
        publish: Boolean = true,
    ): Result<List<MemberHealthItem>> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching {
            api.getMemberHealthLogs(
                pid, memberId, limit, startDate, endDate, sortBy, sortDir,
                minSleepHours, maxSleepHours, minFoodQuality, maxFoodQuality,
                minSteps, maxSteps,
            ).items.also {
                if (publish && stillActive(pid)) {
                    _memberHealthLogs.value = it
                    markCardHeld(MemberCardPart.HEALTH, pid, memberId)
                }
            }
        }.recoverCatching { throw it.asApiError() }
    }

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
                        MemberCardPart.METRICS -> loadMemberMetrics(sort = "active_days", direction = "desc").map { }
                        MemberCardPart.OVERVIEW -> loadMemberOverview(id)
                        MemberCardPart.HISTORY -> loadMemberHistory(id, "week").map { }
                        MemberCardPart.STREAKS -> loadMemberStreaks(id).map { }
                        MemberCardPart.RECENT -> loadMemberRecent(id, limit = 10).map { }
                        MemberCardPart.HEALTH -> loadMemberHealthLogs(id, limit = 10).map { }
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

    /** GET /program-memberships/details — the roster editor's rich rows (active memberships). Also seeds
     *  the signed-in member's gender (mirrors iOS ProgramContext+Members), read by My Profile. */
    suspend fun loadMembershipDetails(): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        val owner = sessionOwner()
        return runCatching {
            val details = api.getMembershipDetails(pid)
            // Polish #12/#33: never land one program's roster on another (a late reply after a program switch).
            if (_activeProgram.value?.id != pid || !isCurrentOwner(owner)) return@runCatching
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

    private val _lifestyleState = MutableStateFlow<UiState<LifestyleData>>(UiState.Idle)
    /** The Lifestyle tab's kit state (polish #31), keyed by (program, "View as" member): a key change starts from Loading. */
    val lifestyleState: StateFlow<UiState<LifestyleData>> = _lifestyleState.asStateFlow()
    private var lifestyleKey: Pair<String, String?>? = null

    /** The Lifestyle-tab "View as" member (null = program-wide "Admin" view). Separate from the Members tab. */
    private val _lifestyleViewAsId = MutableStateFlow<String?>(null)
    val lifestyleViewAsId: StateFlow<String?> = _lifestyleViewAsId.asStateFlow()

    /** Whether the user explicitly picked a Lifestyle "View as" (distinguishes program-admin's default-self
     *  from an explicit "Admin" pick — mirrors the iOS `hasUserChosenViewAs` label logic). */
    private val _lifestyleViewAsChosen = MutableStateFlow(false)
    val lifestyleViewAsChosen: StateFlow<Boolean> = _lifestyleViewAsChosen.asStateFlow()

    private val _lifestyleDefaultedFor = MutableStateFlow<String?>(null)
    /** The program whose Lifestyle "View as" default is applied — the tab's first load waits for it (the keyed-state
     *  rule: the first fetch is already in the right scope, and a pick is never overwritten by the default). */
    val lifestyleDefaultedFor: StateFlow<String?> = _lifestyleDefaultedFor.asStateFlow()

    /** A "View as" pick. Polish #10 (the keyed-state rule): a different scope resets the cards to loading in the same
     *  event as the pick — never a frame of the previous scope's numbers under the new name. */
    fun setLifestyleViewAs(id: String?) {
        _lifestyleViewAsChosen.value = true
        if (id == _lifestyleViewAsId.value) return
        _lifestyleViewAsId.value = id
        _lifestyleState.value = UiState.Idle
        lifestyleKey = null
    }

    /**
     * Seed the Lifestyle "View as" default ONCE per program: global-admin → null ("Admin", program-wide);
     * everyone else → self. Idempotent — re-entering the tab (e.g. after a detail push) preserves the prior pick; a
     * program switch re-initializes. The default is applied BEFORE the roster read (the picker's list), so a pick made
     * while the roster loads is never overwritten.
     */
    suspend fun ensureLifestyleViewAsDefault(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        if (_lifestyleDefaultedFor.value != pid) {
            _lifestyleViewAsChosen.value = false
            // Polish #31: self is known without the roster, so a failed roster read can't leave a program admin on
            // program-wide numbers labelled with their own name (the reconnect refetch would keep it that way).
            _lifestyleViewAsId.value = if (isGlobalAdmin) null else loggedInMemberId
            _lifestyleDefaultedFor.value = pid
        }
        ensureMembersLoaded()
        return Result.success(Unit)
    }

    /**
     * Load the Lifestyle tab's cards for `memberId` (null = program-wide). Highest-participation is ALWAYS program-wide
     * (memberId=null), matching iOS; the health-timeline preview always loads the week window. Polish #31 (the Summary
     * recipe): the 7 reads run in parallel and each keeps its own result. A (program, member) change resets to Loading —
     * never the other scope's numbers. A partial failure keeps the parts that loaded (the rest "—") + Stale; all seven
     * failing → Failed (ErrorView) or Stale over this scope's previous data.
     */
    suspend fun loadLifestyle(memberId: String?): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        val owner = sessionOwner()
        val key = pid to memberId
        fun stillMine() = lifestyleKey == key && isCurrentOwner(owner)
        if (lifestyleKey != key) {
            lifestyleKey = key
            _lifestyleState.value = UiState.Idle
        }
        _lifestyleState.value = _lifestyleState.value.refreshing()
        val parts = coroutineScope {
            val total = async { attempt { api.getWorkoutTypesTotal(pid, memberId).totalTypes } }
            val mostPopular = async { attempt { api.getWorkoutTypeMostPopular(pid, memberId) } }
            val longest = async { attempt { api.getWorkoutTypeLongestDuration(pid, memberId) } }
            val participation = async { attempt { api.getWorkoutTypeHighestParticipation(pid, null) } }
            val types = async { attempt { api.getWorkoutTypes(pid, 100, memberId) } }
            val timeline = async { attempt { api.getHealthTimeline("week", pid, memberId) } }
            val steps = async { attempt { api.getHealthSteps(pid, memberId) } }
            LifestyleParts(
                total.await(), mostPopular.await(), longest.await(), participation.await(),
                types.await(), timeline.await(), steps.await(),
            )
        }
        if (!stillMine()) return Result.success(Unit)   // the scope or the session changed mid-load
        val errors = parts.errors()
        if (errors.size == LifestyleParts.COUNT) {
            _lifestyleState.value = _lifestyleState.value.failing(errors.first().toAppError())
            return Result.failure(errors.first())
        }
        val data = parts.merge(_lifestyleState.value.dataOrNull)
        if (errors.isEmpty()) {
            _lifestyleState.value = UiState.fresh(data)
            return Result.success(Unit)
        }
        _lifestyleState.value = UiState.Stale(data, System.currentTimeMillis(), errors.first().toAppError())
        return Result.failure(errors.first())
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

    /** Polish #12: the catalog is written only while the program it was read for is still active (and the session is the
     *  same) — a late refresh can never put one program's catalog on another (ids act on the program they came from). */
    suspend fun loadAllProgramWorkouts(): Result<Unit> {
        val pid = _activeProgram.value?.id ?: return Result.success(Unit)
        val owner = sessionOwner()
        return runCatching {
            val list = api.getProgramWorkouts(pid)
            if (_activeProgram.value?.id == pid && isCurrentOwner(owner)) _programWorkoutsAll.value = list
            Unit
        }.recoverCatching { throw it.asApiError() }
    }

    /** Polish #12: a workout-type write is judged by the write alone — the local list changes at once (only if [pid], the
     *  program the write was made in, is still active), then refreshes in the background, so a failed refresh never
     *  reports a saved write as failed (a retry would flip it back). [refresh] = false when the caller re-reads through
     *  its own load (the add / edit sheet's screen), so there is one fetch, not two. */
    private fun afterWorkoutWrite(
        pid: String?,
        refresh: Boolean = true,
        local: (List<ProgramWorkoutDTO>) -> List<ProgramWorkoutDTO>,
    ) {
        if (pid == null || _activeProgram.value?.id != pid) return
        _programWorkoutsAll.value = local(_programWorkoutsAll.value)
        if (refresh) scope.launch { loadAllProgramWorkouts() }
    }

    suspend fun toggleWorkoutVisibility(libraryWorkoutId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.toggleWorkoutVisibility(ToggleWorkoutVisibilityRequest(pid, libraryWorkoutId)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess {
                afterWorkoutWrite(pid) { list ->
                    list.map { w -> if (w.libraryWorkoutId == libraryWorkoutId) w.copy(isHidden = !w.isHidden) else w }
                }
            }
    }

    suspend fun toggleCustomWorkoutVisibility(workoutId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
        return runCatching { api.toggleCustomWorkoutVisibility(workoutId); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid) { list -> list.map { w -> if (w.id == workoutId) w.copy(isHidden = !w.isHidden) else w } } }
    }

    suspend fun addCustomProgramWorkout(name: String): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.addCustomWorkout(AddCustomWorkoutRequest(pid, name)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid, refresh = false) { list -> list } }
    }

    suspend fun editCustomProgramWorkout(workoutId: String, name: String): Result<Unit> {
        val pid = _activeProgram.value?.id
        return runCatching { api.editCustomWorkout(workoutId, EditCustomWorkoutRequest(name)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid, refresh = false) { list -> list.map { w -> if (w.id == workoutId) w.copy(workoutName = name) else w } } }
    }

    suspend fun deleteCustomProgramWorkout(workoutId: String): Result<Unit> {
        val pid = _activeProgram.value?.id
        return runCatching { api.deleteCustomWorkout(workoutId); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { afterWorkoutWrite(pid) { list -> list.filterNot { w -> w.id == workoutId } } }
    }

    // ---- Program tab (Phase G) — account settings + admin program management ----
    // The My-Account settings actions + the admin program edit/leave/role mutations. Errors surface
    // (Result) for inline UI. Self-edits keep the cached identity (name/gender) in sync so the header +
    // account rows update without a reload.

    /** GET /members/:id — read the account profile (email + gender) for My Profile. */
    suspend fun fetchMember(memberId: String): Result<MemberDTO> =
        runCatching { api.getMember(memberId) }.recoverCatching { throw it.asApiError() }

    /** PUT /members/:id — edit own name/gender. Polish #44: a JsonObject body, so a cleared gender goes out as an explicit
     *  `"gender": null` (the global Json drops nulls — explicitNulls=false); [includeGender] = false leaves it unchanged
     *  (My Profile before its read loaded, #18). On self-edit, refresh the cached name + gender. */
    suspend fun updateMemberProfile(
        memberId: String,
        firstName: String,
        lastName: String,
        gender: String?,
        includeGender: Boolean = true,
    ): Result<Unit> = runCatching {
        val body = buildJsonObject {
            put("first_name", firstName)
            put("last_name", lastName)
            if (includeGender) put("gender", gender)
        }
        api.updateMemberProfile(memberId, body)
        if (memberId == loggedInMemberId) {
            val full = "$firstName $lastName".trim()
            _memberName.value = full
            session.saveIdentity(session.memberId, session.username, full, session.globalRole)
            if (includeGender) _loggedInGender.value = gender
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
                // D1 / X-2: the server's day fields belong to the old dates — drop them (the screens fall back to the
                // date math on the new dates) until the list re-read below brings the server's numbers.
                totalDays = null, elapsedDays = null,
            )
            _activeProgram.value = updated
            setPrograms(_programs.value.map { if (it.id == updated.id) updated else it })
            scope.launch { loadPrograms().onSuccess { reconcileActiveProgram() } }
            Unit
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
        stopNotificationStream()   // also resets the inbox (counts, list, preferences, toast, pending open)
        people.reset()
        session.clear()
        _invites.value = UiState.Idle
        _notificationPromptOpen.value = false
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
        resetProgramScope()
    }

    /** Program-scoped state (polish #10): cleared on a program switch ([selectProgram]) and by the sign-out teardown, so
     *  no screen ever shows the previous program's (or member's) numbers under the new name. Add new program-scoped
     *  state HERE, not to clearSession. */
    private fun resetProgramScope() {
        _memberMetrics.value = emptyList()
        _memberMetricsTotal.value = 0
        _memberMetricsRange.value = null to null
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
        _memberCardsHeld.value = emptyMap()
        _memberCardsLoad.value = MemberCardsLoad()
        _lifestyleState.value = UiState.Idle
        lifestyleKey = null
        _lifestyleViewAsId.value = null
        _lifestyleViewAsChosen.value = false
        _lifestyleDefaultedFor.value = null
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
