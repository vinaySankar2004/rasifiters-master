package com.app.rasifiters.core

import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.AvgDurationMtdDTO
import com.app.rasifiters.net.BulkWorkoutEntry
import com.app.rasifiters.net.BulkWorkoutRequest
import com.app.rasifiters.net.DailyHealthRequest
import com.app.rasifiters.net.DistributionByDayDTO
import com.app.rasifiters.net.ForgotPasswordRequest
import com.app.rasifiters.net.LoginRequest
import com.app.rasifiters.net.LogoutRequest
import com.app.rasifiters.net.MembershipUpdateRequest
import com.app.rasifiters.net.MtdParticipationDTO
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.net.ProgramMemberDTO
import com.app.rasifiters.net.ProgramOrderRequest
import com.app.rasifiters.net.ProgramWorkoutDTO
import com.app.rasifiters.net.RegisterRequest
import com.app.rasifiters.net.ActivityTimelinePoint
import com.app.rasifiters.net.ActivityTimelineResponse
import com.app.rasifiters.net.TotalDurationMtdDTO
import com.app.rasifiters.net.TotalWorkoutsMtdDTO
import com.app.rasifiters.net.WorkoutTypeDTO
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

    // ---- Summary dashboard (Phase D) ----

    /** The active program's `admin_only_data_entry` lock bites only non-admins (web `isDataEntryLocked`). */
    val dataEntryLocked: Boolean
        get() {
            val program = _activeProgram.value ?: return false
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

    // ---- Log-form writes (both bump the Summary refresh on success — D-C3) ----

    /** POST /workout-logs/batch. On failure the mapped [com.app.rasifiters.net.ApiException] carries rowErrors. */
    suspend fun addWorkoutLogsBatch(entries: List<BulkWorkoutEntry>): Result<Unit> {
        val pid = _activeProgram.value?.id
            ?: return Result.failure(IllegalStateException("No active program."))
        return runCatching { api.addWorkoutLogsBatch(BulkWorkoutRequest(pid, entries)); Unit }
            .recoverCatching { throw it.asApiError() }
            .onSuccess { _summaryRefreshToken.value += 1 }
    }

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
            .onSuccess { _summaryRefreshToken.value += 1 }
    }

    private fun clearSession() {
        session.clear()
        _authToken.value = null
        _globalRole.value = null
        _memberName.value = null
        _memberUsername.value = null
        _programs.value = emptyList()
        _activeProgram.value = null
        _summary.value = SummaryData()
        _summaryError.value = null
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
