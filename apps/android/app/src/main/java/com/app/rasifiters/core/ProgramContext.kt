package com.app.rasifiters.core

import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.ForgotPasswordRequest
import com.app.rasifiters.net.LoginRequest
import com.app.rasifiters.net.LogoutRequest
import com.app.rasifiters.net.MembershipUpdateRequest
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.net.ProgramOrderRequest
import com.app.rasifiters.net.RegisterRequest
import com.app.rasifiters.net.toApiException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

/**
 * App-scoped state hub — the analog of the iOS `ProgramContext` ObservableObject and the web
 * `AuthProvider`. Owns session/auth state and the account-level API actions. Feature state
 * (active program, rosters, analytics) is layered on in later phases.
 */
class ProgramContext(
    private val api: ApiService,
    private val session: Session,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private val _authToken = MutableStateFlow(session.accessToken)
    /** Drives the root auth gate: non-null → signed in. */
    val authToken: StateFlow<String?> = _authToken.asStateFlow()

    private val _globalRole = MutableStateFlow(session.globalRole)
    val globalRole: StateFlow<String?> = _globalRole.asStateFlow()

    private val _memberName = MutableStateFlow(session.memberName)
    val memberName: StateFlow<String?> = _memberName.asStateFlow()

    private val _memberUsername = MutableStateFlow(session.username)
    val memberUsername: StateFlow<String?> = _memberUsername.asStateFlow()

    val isGlobalAdmin: Boolean get() = _globalRole.value == "global_admin"

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
        session.saveTokens(resp.token, resp.refreshToken)
        session.saveIdentity(resp.memberId, resp.username, resp.memberName, resp.globalRole)
        _authToken.value = resp.token
        _globalRole.value = resp.globalRole
        _memberName.value = resp.memberName
        _memberUsername.value = resp.username
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

    private fun clearSession() {
        session.clear()
        _authToken.value = null
        _globalRole.value = null
        _memberName.value = null
        _memberUsername.value = null
        _programs.value = emptyList()
        _activeProgram.value = null
    }

    private fun Throwable.asApiError(): Throwable =
        if (this is HttpException) toApiException() else this
}
