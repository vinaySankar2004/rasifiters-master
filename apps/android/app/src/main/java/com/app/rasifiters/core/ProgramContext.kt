package com.app.rasifiters.core

import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.ForgotPasswordRequest
import com.app.rasifiters.net.LoginRequest
import com.app.rasifiters.net.LogoutRequest
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

    val isGlobalAdmin: Boolean get() = _globalRole.value == "global_admin"

    /** Mobile login via POST /auth/login/app. Persists tokens + identity, flips the gate. */
    suspend fun login(identifier: String, password: String): Result<Unit> = runCatching {
        val resp = api.loginApp(LoginRequest(identifier = identifier, password = password))
        session.saveTokens(resp.token, resp.refreshToken)
        session.saveIdentity(resp.memberId, resp.username, resp.memberName, resp.globalRole)
        _authToken.value = resp.token
        _globalRole.value = resp.globalRole
        _memberName.value = resp.memberName
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

    private fun clearSession() {
        session.clear()
        _authToken.value = null
        _globalRole.value = null
        _memberName.value = null
    }

    private fun Throwable.asApiError(): Throwable =
        if (this is HttpException) toApiException() else this
}
