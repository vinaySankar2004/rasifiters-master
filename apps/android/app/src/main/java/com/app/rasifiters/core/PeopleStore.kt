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

/** The kudos rate limit (429) — the same sentence on web and iOS. */
private const val KUDOS_RATE_LIMITED = "You've changed kudos too many times. Try again later."

/**
 * People — the active program's People list, the open profile, kudos give / undo, "Hide my activity", and the
 * device-local "Who can see your activity" notice flag (per member). The server decides every visibility rule
 * (`activity_visible`, `can_give`, `can_open_full_stats`); this store only shows them. Owned by ProgramContext; reset by
 * the sign-out teardown.
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

    /** The People list — a program switch drops the previous program's list first. */
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

    /** A profile — only for the focused person. */
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

    /** Toggles today's kudos on the open profile. Undo carries no count: −1 when `removed`. A 403 (`activity_hidden` —
     *  the person hid their activity meanwhile) re-fetches the profile; a 429 gets the kudos rate-limit sentence. */
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
        }.recoverCatching { e ->
            val error = e.toAppError()
            if (o == owner() && error.kind == AppErrorKind.FORBIDDEN) loadProfile(current.programId, current.memberId)
            throw AppErrorException(if (error.status == 429) error.copy(message = KUDOS_RATE_LIMITED) else error)
        }.map { }
    }

    /** `PUT /members/:id {hide_activity}` — the member's own switch. Returns the SAVED value. A server without People
     *  ignores the key and echoes nothing → a failure (never report a hide that didn't happen). */
    suspend fun setHideActivity(memberId: String, hide: Boolean): Result<Boolean> = runCatching {
        api.setHideActivity(memberId, HideActivityRequest(hide)).hideActivity
            ?: throw AppErrorException(AppError(AppErrorKind.SERVER))
    }

    /** The member's own saved "Hide my activity" (`GET /members/:id`); null when unknown (a failure, or no People). */
    suspend fun fetchHideActivity(memberId: String): Boolean? =
        runCatching { api.getMember(memberId).hideActivity }.getOrNull()

    /** The one-time "Who can see your activity" notice, per member, on this device. */
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
