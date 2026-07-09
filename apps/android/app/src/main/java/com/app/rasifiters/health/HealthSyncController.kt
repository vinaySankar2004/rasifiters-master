package com.app.rasifiters.health

import android.content.Context
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.net.ApiService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Health Connect auto-sync lifecycle — the Android analog of the iOS Apple-Health orchestration
 * (`ProgramContext+HealthKit` + `+HealthKitSleep` + `+HealthKitWindows` + `+HealthSyncGating`, plus the
 * `APIClient+Workouts/+DailyHealth` write classification). Owns the sync run for both flows: single-flight
 * guard, per-program date-window scoping (D-S5), admin-lock skip (D-LOCK), first-sync confirmation gating
 * (D-CONF), the sum-on-conflict applied-sample ledger (D-SUM), and silent auto-retry (D-SIL).
 *
 * Reads [ProgramContext] for the live token / identity / programs / per-program lock; persists all sync
 * state in [HealthStore]; reads Health Connect via [HealthConnectManager]; writes via [ApiService]'s raw
 * status-code endpoints. Deviation: Android Health Connect has no HealthKit-style immediate background
 * delivery, so sync runs on app triggers (launch / auth / foreground / program entry) via [onTrigger].
 */
class HealthSyncController(
    private val context: Context,
    private val api: ApiService,
    private val programContext: ProgramContext,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val store = HealthStore(context)
    val manager = HealthConnectManager(context)

    // ── Public state for the settings screen ──
    private val _workoutEnabled = MutableStateFlow(store.workoutEnabled)
    val workoutEnabled: StateFlow<Boolean> = _workoutEnabled.asStateFlow()
    private val _workoutProgramIds = MutableStateFlow(store.workoutProgramIds)
    val workoutProgramIds: StateFlow<Set<String>> = _workoutProgramIds.asStateFlow()
    private val _lastWorkoutSyncMillis = MutableStateFlow(store.lastWorkoutSyncMillis.takeIf { it > 0 })
    val lastWorkoutSyncMillis: StateFlow<Long?> = _lastWorkoutSyncMillis.asStateFlow()
    private val _lastWorkoutSyncCount = MutableStateFlow(store.lastWorkoutSyncCount)
    val lastWorkoutSyncCount: StateFlow<Int> = _lastWorkoutSyncCount.asStateFlow()
    private val _lastWorkoutSyncFailed = MutableStateFlow(store.lastWorkoutSyncFailed)
    val lastWorkoutSyncFailed: StateFlow<Boolean> = _lastWorkoutSyncFailed.asStateFlow()

    private val _sleepEnabled = MutableStateFlow(store.sleepEnabled)
    val sleepEnabled: StateFlow<Boolean> = _sleepEnabled.asStateFlow()
    private val _sleepProgramIds = MutableStateFlow(store.sleepProgramIds)
    val sleepProgramIds: StateFlow<Set<String>> = _sleepProgramIds.asStateFlow()
    private val _lastSleepSyncMillis = MutableStateFlow(store.lastSleepSyncMillis.takeIf { it > 0 })
    val lastSleepSyncMillis: StateFlow<Long?> = _lastSleepSyncMillis.asStateFlow()
    private val _lastSleepSyncCount = MutableStateFlow(store.lastSleepSyncCount)
    val lastSleepSyncCount: StateFlow<Int> = _lastSleepSyncCount.asStateFlow()
    private val _lastSleepSyncFailed = MutableStateFlow(store.lastSleepSyncFailed)
    val lastSleepSyncFailed: StateFlow<Boolean> = _lastSleepSyncFailed.asStateFlow()

    /** The confirmation currently presented (globally, from RootScreen); a sleep flow computed while
     *  workouts are showing waits in [deferredSleep] (workouts get priority). */
    private val _pendingConfirmation = MutableStateFlow<PendingSyncConfirmation?>(null)
    val pendingConfirmation: StateFlow<PendingSyncConfirmation?> = _pendingConfirmation.asStateFlow()
    private var deferredSleep: PendingSyncConfirmation? = null

    val isAvailable: Boolean get() = manager.isAvailable
    val workoutPermissions: Set<String> get() = manager.workoutPermissions
    val sleepPermissions: Set<String> get() = manager.sleepPermissions

    private val workoutSyncing = AtomicBoolean(false)
    private val sleepSyncing = AtomicBoolean(false)

    // Stashed while a first-sync confirmation awaits the user: the fetch's new changes token commits only
    // after the whole flow finishes cleanly (see [commitPendingWorkoutTokenIfClean]).
    private var pendingWorkoutToken: String? = null
    private var pendingWorkoutHadRetryable = false
    private var pendingWorkoutLockHeld = false

    // MARK: - Triggers

    /** Run both syncs if enabled (launch / auth / foreground / program entry). Guards make this cheap. */
    fun onTrigger() {
        scope.launch { performWorkoutSync() }
        scope.launch { performSleepSync() }
    }

    // MARK: - Connect / disconnect

    fun enableWorkoutsAfterPermission() {
        store.workoutEnabled = true
        if (store.workoutConnectMillis == 0L) {
            store.workoutConnectMillis = System.currentTimeMillis()
            store.clearConfirmedPrograms(HealthStore.Flow.WORKOUTS) // fresh (re)connect → re-gate every program
        }
        publishWorkoutState()
        scope.launch { performWorkoutSync() }
    }

    fun disconnectWorkouts() {
        store.workoutEnabled = false
        store.workoutProgramIds = emptySet()
        store.lastWorkoutSyncMillis = 0L
        store.lastWorkoutSyncCount = 0
        store.lastWorkoutSyncFailed = false
        store.workoutConnectMillis = 0L
        store.workoutChangesToken = null
        store.ledgerClear()                                          // safe on reconnect (fresh connect date bounds fetch)
        store.clearConfirmedPrograms(HealthStore.Flow.WORKOUTS)
        store.clearExcludedKeys(HealthStore.Flow.WORKOUTS)
        pendingWorkoutToken = null; pendingWorkoutHadRetryable = false; pendingWorkoutLockHeld = false
        publishWorkoutState()
    }

    fun toggleWorkoutProgram(id: String) {
        val set = store.workoutProgramIds
        store.workoutProgramIds = if (id in set) set - id else set + id
        publishWorkoutState()
    }

    fun enableSleepAfterPermission() {
        store.sleepEnabled = true
        if (store.sleepConnectMillis == 0L) {
            store.sleepConnectMillis = System.currentTimeMillis()
            store.clearConfirmedPrograms(HealthStore.Flow.SLEEP)
        }
        publishSleepState()
        scope.launch { performSleepSync() }
    }

    fun disconnectSleep() {
        store.sleepEnabled = false
        store.sleepProgramIds = emptySet()
        store.lastSleepSyncMillis = 0L
        store.lastSleepSyncCount = 0
        store.lastSleepSyncFailed = false
        store.sleepConnectMillis = 0L
        store.clearConfirmedPrograms(HealthStore.Flow.SLEEP)
        store.clearExcludedKeys(HealthStore.Flow.SLEEP)
        publishSleepState()
    }

    fun toggleSleepProgram(id: String) {
        val set = store.sleepProgramIds
        store.sleepProgramIds = if (id in set) set - id else set + id
        publishSleepState()
    }

    // MARK: - Workout sync

    suspend fun performWorkoutSync(): HealthSyncResult {
        if (!store.workoutEnabled || !manager.isAvailable) return HealthSyncResult.Skipped
        val token = programContext.authToken.value?.takeIf { it.isNotEmpty() } ?: return HealthSyncResult.Skipped
        val memberName = programContext.loggedInMemberName?.takeIf { it.isNotEmpty() } ?: return HealthSyncResult.Skipped
        val programIds = store.workoutProgramIds
        if (programIds.isEmpty()) return HealthSyncResult.Skipped
        if (_pendingConfirmation.value?.flow == PendingSyncConfirmation.Flow.WORKOUTS) return HealthSyncResult.Skipped
        if (!workoutSyncing.compareAndSet(false, true)) return HealthSyncResult.Skipped
        token.let {} // keep token in scope (the OkHttp layer attaches it); guard above proves signed-in

        try {
            store.ledgerPrune()

            val fetch = try {
                manager.fetchNewWorkouts(store.workoutConnectMillis, store.workoutChangesToken)
            } catch (e: Exception) {
                return HealthSyncResult.Failed  // couldn't read HC — local condition, flag stays as-is
            }

            if (fetch.records.isEmpty()) {
                store.workoutChangesToken = fetch.newToken
                store.lastWorkoutSyncMillis = System.currentTimeMillis()
                store.lastWorkoutSyncFailed = false
                publishWorkoutState()
                return HealthSyncResult.Synced(0)
            }

            val aggregated = manager.aggregate(fetch.records)
            val windows = loadSyncWindows(programIds)
            if (windows.isEmpty()) {
                store.lastWorkoutSyncFailed = true; publishWorkoutState()
                return HealthSyncResult.Failed
            }

            var synced = 0
            var hadRetryable = false
            var lockHeld = false
            val pageRows = HashMap<String, MutableList<PendingSyncConfirmation.Row>>()
            val confirmed = store.confirmedProgramIds(HealthStore.Flow.WORKOUTS)
            val excluded = store.excludedKeys(HealthStore.Flow.WORKOUTS)

            for (workout in aggregated) {
                for (pid in programIds) {
                    val window = windows[pid] ?: continue
                    if (!HealthDates.isWithin(workout.date, window.first, window.second)) continue
                    val key = workoutExclusionKey(pid, workout.date, workout.workoutName)
                    if (key in excluded) continue
                    if (programContext.isDataEntryLocked(pid)) { lockHeld = true; continue }

                    if (pid in confirmed) {
                        val unapplied = workout.samples.filter { !store.ledgerIsApplied(it.uuid, pid) }
                        if (unapplied.isEmpty()) continue
                        when (writeWorkout(memberName, workout.workoutName, workout.date, AggregatedWorkout.minutes(unapplied), pid)) {
                            WorkoutOutcome.CREATED, WorkoutOutcome.SUMMED -> {
                                synced++
                                store.ledgerMarkApplied(unapplied.map { it.uuid }, pid, workout.date)
                            }
                            WorkoutOutcome.DUPLICATE, WorkoutOutcome.SKIPPED -> Unit
                            WorkoutOutcome.RETRYABLE -> hadRetryable = true
                        }
                    } else {
                        pageRows.getOrPut(pid) { mutableListOf() }.add(
                            PendingSyncConfirmation.Row(
                                title = workout.workoutName,
                                subtitle = "${displayDate(workout.date)} · ${workout.durationMinutes} min",
                                exclusionKey = key,
                                payload = PendingSyncConfirmation.Payload.Workout(workout),
                            ),
                        )
                    }
                }
            }

            // Unconfirmed programs with no rows (0-row first sync) confirm silently — never a locked one.
            for (pid in programIds) {
                if (pid !in confirmed && pageRows[pid] == null && !programContext.isDataEntryLocked(pid)) {
                    store.markProgramConfirmed(pid, HealthStore.Flow.WORKOUTS)
                }
            }

            store.lastWorkoutSyncCount += synced

            val pages = buildConfirmationPages(pageRows)
            if (pages.isEmpty()) {
                if (!hadRetryable && !lockHeld) store.workoutChangesToken = fetch.newToken
                store.lastWorkoutSyncMillis = System.currentTimeMillis()
                store.lastWorkoutSyncFailed = hadRetryable
                publishWorkoutState()
                HealthSyncNotifier.notifyWorkoutSuccess(context, synced)
                return if (hadRetryable) HealthSyncResult.Failed else HealthSyncResult.Synced(synced)
            }

            pendingWorkoutToken = fetch.newToken
            pendingWorkoutHadRetryable = hadRetryable
            pendingWorkoutLockHeld = lockHeld
            store.lastWorkoutSyncFailed = hadRetryable
            publishWorkoutState()
            enqueuePendingConfirmation(PendingSyncConfirmation(PendingSyncConfirmation.Flow.WORKOUTS, pages))
            return if (hadRetryable) HealthSyncResult.Failed else HealthSyncResult.Synced(synced)
        } finally {
            workoutSyncing.set(false)
        }
    }

    // MARK: - Sleep sync

    suspend fun performSleepSync(): HealthSyncResult {
        if (!store.sleepEnabled || !manager.isAvailable) return HealthSyncResult.Skipped
        val token = programContext.authToken.value?.takeIf { it.isNotEmpty() } ?: return HealthSyncResult.Skipped
        val programIds = store.sleepProgramIds
        if (programIds.isEmpty()) return HealthSyncResult.Skipped
        if (_pendingConfirmation.value?.flow == PendingSyncConfirmation.Flow.SLEEP || deferredSleep != null) return HealthSyncResult.Skipped
        if (!sleepSyncing.compareAndSet(false, true)) return HealthSyncResult.Skipped
        token.let {}

        try {
            store.pruneSleepExcludedKeys(manager.sleepRecentDays)

            val samples = try {
                manager.fetchSleepSamples()
            } catch (e: Exception) {
                return HealthSyncResult.Failed
            }

            val aggregated = manager.aggregateSleep(samples)
            if (aggregated.isEmpty()) {
                store.lastSleepSyncMillis = System.currentTimeMillis()
                store.lastSleepSyncFailed = false
                publishSleepState()
                return HealthSyncResult.Synced(0)
            }

            val windows = loadSyncWindows(programIds)
            if (windows.isEmpty()) {
                store.lastSleepSyncFailed = true; publishSleepState()
                return HealthSyncResult.Failed
            }

            var created = 0
            var hadRetryable = false
            val pageRows = HashMap<String, MutableList<PendingSyncConfirmation.Row>>()
            val confirmed = store.confirmedProgramIds(HealthStore.Flow.SLEEP)
            val excluded = store.excludedKeys(HealthStore.Flow.SLEEP)

            for (night in aggregated) {
                for (pid in programIds) {
                    val window = windows[pid] ?: continue
                    if (!HealthDates.isWithin(night.date, window.first, window.second)) continue
                    val key = sleepExclusionKey(pid, night.date)
                    if (key in excluded) continue
                    if (programContext.isDataEntryLocked(pid)) continue  // rolling window self-heals on unlock

                    if (pid in confirmed) {
                        when (writeSleep(night.date, night.hours, pid)) {
                            SleepOutcome.CREATED -> created++
                            SleepOutcome.UPDATED, SleepOutcome.SKIPPED -> Unit
                            SleepOutcome.RETRYABLE -> hadRetryable = true
                        }
                    } else {
                        pageRows.getOrPut(pid) { mutableListOf() }.add(
                            PendingSyncConfirmation.Row(
                                title = "Sleep",
                                subtitle = "${displayDate(night.date)} · ${formatHours(night.hours)}",
                                exclusionKey = key,
                                payload = PendingSyncConfirmation.Payload.Sleep(night),
                            ),
                        )
                    }
                }
            }

            for (pid in programIds) {
                if (pid !in confirmed && pageRows[pid] == null && !programContext.isDataEntryLocked(pid)) {
                    store.markProgramConfirmed(pid, HealthStore.Flow.SLEEP)
                }
            }

            store.lastSleepSyncMillis = System.currentTimeMillis()
            store.lastSleepSyncCount += created
            store.lastSleepSyncFailed = hadRetryable
            publishSleepState()

            val pages = buildConfirmationPages(pageRows)
            if (pages.isEmpty()) {
                HealthSyncNotifier.notifySleepSuccess(context, created)
                return if (hadRetryable) HealthSyncResult.Failed else HealthSyncResult.Synced(created)
            }
            enqueuePendingConfirmation(PendingSyncConfirmation(PendingSyncConfirmation.Flow.SLEEP, pages))
            return if (hadRetryable) HealthSyncResult.Failed else HealthSyncResult.Synced(created)
        } finally {
            sleepSyncing.set(false)
        }
    }

    // MARK: - Confirmation queue + per-page commit

    private fun enqueuePendingConfirmation(confirmation: PendingSyncConfirmation) {
        if (confirmation.pages.isEmpty()) return
        val current = _pendingConfirmation.value
        if (current == null) {
            if (confirmation.flow == PendingSyncConfirmation.Flow.SLEEP && deferredSleep != null) {
                deferredSleep = confirmation
            } else {
                _pendingConfirmation.value = confirmation
            }
            return
        }
        when {
            confirmation.flow == current.flow -> Unit                               // already showing this flow
            confirmation.flow == PendingSyncConfirmation.Flow.WORKOUTS -> {          // workouts win; sleep waits
                deferredSleep = current
                _pendingConfirmation.value = confirmation
            }
            else -> deferredSleep = confirmation                                     // sleep waits behind workouts
        }
    }

    /** Called by the confirmation screen when it finishes (committed) or is dismissed (deferred). */
    fun finishConfirmation(flow: PendingSyncConfirmation.Flow, committed: Boolean) {
        if (flow == PendingSyncConfirmation.Flow.WORKOUTS) {
            if (committed) {
                commitPendingWorkoutTokenIfClean()
            } else {
                pendingWorkoutToken = null; pendingWorkoutHadRetryable = false; pendingWorkoutLockHeld = false
            }
        }
        promoteDeferredConfirmation()
    }

    private fun promoteDeferredConfirmation() {
        val sleep = deferredSleep
        if (sleep != null) {
            deferredSleep = null
            val pages = sleep.pages.filter { it.id in store.sleepProgramIds }
            _pendingConfirmation.value = if (pages.isEmpty()) null else PendingSyncConfirmation(PendingSyncConfirmation.Flow.SLEEP, pages)
        } else {
            _pendingConfirmation.value = null
        }
    }

    private fun commitPendingWorkoutTokenIfClean() {
        if (!pendingWorkoutHadRetryable && !pendingWorkoutLockHeld && pendingWorkoutToken != null) {
            store.workoutChangesToken = pendingWorkoutToken
            store.lastWorkoutSyncMillis = System.currentTimeMillis()
            publishWorkoutState()
        }
        pendingWorkoutToken = null; pendingWorkoutHadRetryable = false; pendingWorkoutLockHeld = false
    }

    /** Commit ONE workout program's checked rows. Returns false (retry, stays unconfirmed) on offline
     *  window resolution / lock / retryable write; true marks the program confirmed. Never touches the token. */
    suspend fun commitWorkoutPage(page: PendingSyncConfirmation.ProgramPage): Boolean {
        programContext.authToken.value?.takeIf { it.isNotEmpty() } ?: return false
        val memberName = programContext.loggedInMemberName?.takeIf { it.isNotEmpty() } ?: return false
        val window = loadSyncWindows(setOf(page.id))[page.id] ?: return false
        if (programContext.isDataEntryLocked(page.id)) return false

        store.addExcludedKeys(page.rows.filterNot { it.isChecked }.map { it.exclusionKey }, HealthStore.Flow.WORKOUTS)

        var hadRetryable = false
        var synced = 0
        for (row in page.rows.filter { it.isChecked }) {
            val workout = (row.payload as? PendingSyncConfirmation.Payload.Workout)?.workout ?: continue
            if (!HealthDates.isWithin(workout.date, window.first, window.second)) continue
            val unapplied = workout.samples.filter { !store.ledgerIsApplied(it.uuid, page.id) }
            if (unapplied.isEmpty()) continue
            when (writeWorkout(memberName, workout.workoutName, workout.date, AggregatedWorkout.minutes(unapplied), page.id)) {
                WorkoutOutcome.CREATED, WorkoutOutcome.SUMMED -> {
                    synced++
                    store.ledgerMarkApplied(unapplied.map { it.uuid }, page.id, workout.date)
                }
                WorkoutOutcome.DUPLICATE, WorkoutOutcome.SKIPPED -> Unit
                WorkoutOutcome.RETRYABLE -> hadRetryable = true
            }
        }

        if (hadRetryable) return false
        store.markProgramConfirmed(page.id, HealthStore.Flow.WORKOUTS)
        store.lastWorkoutSyncCount += synced
        publishWorkoutState()
        return true
    }

    /** Commit ONE sleep program's checked nights (POST-then-PUT upsert). Sleep has no token, so each page
     *  commit is fully self-contained. */
    suspend fun commitSleepPage(page: PendingSyncConfirmation.ProgramPage): Boolean {
        programContext.authToken.value?.takeIf { it.isNotEmpty() } ?: return false
        val window = loadSyncWindows(setOf(page.id))[page.id] ?: return false
        if (programContext.isDataEntryLocked(page.id)) return false

        store.addExcludedKeys(page.rows.filterNot { it.isChecked }.map { it.exclusionKey }, HealthStore.Flow.SLEEP)

        var hadRetryable = false
        var created = 0
        for (row in page.rows.filter { it.isChecked }) {
            val night = (row.payload as? PendingSyncConfirmation.Payload.Sleep)?.sleep ?: continue
            if (!HealthDates.isWithin(night.date, window.first, window.second)) continue
            when (writeSleep(night.date, night.hours, page.id)) {
                SleepOutcome.CREATED -> created++
                SleepOutcome.UPDATED, SleepOutcome.SKIPPED -> Unit
                SleepOutcome.RETRYABLE -> hadRetryable = true
            }
        }

        if (hadRetryable) return false
        store.markProgramConfirmed(page.id, HealthStore.Flow.SLEEP)
        store.lastSleepSyncCount += created
        publishSleepState()
        return true
    }

    // MARK: - Per-program date windows (D-S5)

    private suspend fun loadSyncWindows(ids: Set<String>): Map<String, Pair<String, String>> {
        if (ids.isEmpty()) return emptyMap()
        var list = programContext.programs.value
        if (!ids.all { id -> list.any { it.id == id } }) {
            runCatching { programContext.loadPrograms() }
            list = programContext.programs.value
        }
        val today = HealthDates.localYMD(System.currentTimeMillis())
        val windows = HashMap<String, Pair<String, String>>()
        for (program in list) {
            if (program.id !in ids) continue
            val start = program.startDate?.takeIf { it.isNotEmpty() } ?: continue
            val end = minOf(program.endDate ?: today, today)
            if (start <= end) windows[program.id] = start to end
        }
        return windows
    }

    // MARK: - Writes (status-code classification)

    private enum class WorkoutOutcome { CREATED, SUMMED, DUPLICATE, SKIPPED, RETRYABLE }
    private enum class SleepOutcome { CREATED, UPDATED, SKIPPED, RETRYABLE }

    private suspend fun writeWorkout(memberName: String, name: String, date: String, minutes: Int, programId: String): WorkoutOutcome {
        val body = buildJsonObject {
            put("member_name", memberName)
            put("workout_name", name)
            put("date", date)
            put("duration", minutes)
            put("program_id", programId)
            put("on_duplicate", "sum")                  // later same-type workouts ADD minutes to the day's row (D-SUM)
            programContext.loggedInMemberId?.let { put("member_id", it) }
        }
        return try {
            when (val code = api.postWorkoutLog(body).code()) {
                200 -> WorkoutOutcome.SUMMED           // sum-on-conflict resolved a same-day collision
                in 201..299 -> WorkoutOutcome.CREATED
                409 -> WorkoutOutcome.DUPLICATE        // old backend / delete race; nothing added (ledger NOT marked)
                400, 403, 404 -> WorkoutOutcome.SKIPPED
                else -> { code; WorkoutOutcome.RETRYABLE }
            }
        } catch (e: Exception) {
            WorkoutOutcome.RETRYABLE
        }
    }

    private suspend fun writeSleep(date: String, hours: Double, programId: String): SleepOutcome {
        val body = buildJsonObject {
            put("program_id", programId)
            put("log_date", date)
            put("sleep_hours", hours)
            programContext.loggedInMemberId?.let { put("member_id", it) }
        }
        val postCode = try { api.postDailyHealthLogRaw(body).code() } catch (e: Exception) { return SleepOutcome.RETRYABLE }
        return when (postCode) {
            in 200..299 -> SleepOutcome.CREATED
            400, 403, 404 -> SleepOutcome.SKIPPED
            409 -> {
                val putCode = try { api.putDailyHealthLogRaw(body).code() } catch (e: Exception) { return SleepOutcome.RETRYABLE }
                when (putCode) {
                    in 200..299 -> SleepOutcome.UPDATED
                    400, 403, 404 -> SleepOutcome.SKIPPED
                    else -> SleepOutcome.RETRYABLE
                }
            }
            else -> SleepOutcome.RETRYABLE
        }
    }

    // MARK: - Gating / display helpers

    private fun workoutExclusionKey(programId: String, date: String, name: String) = "$programId|$date|$name"
    private fun sleepExclusionKey(programId: String, date: String) = "$programId|$date"

    private fun buildConfirmationPages(pageRows: Map<String, List<PendingSyncConfirmation.Row>>): List<PendingSyncConfirmation.ProgramPage> {
        val nameById = programContext.programs.value.associate { it.id to it.name }
        return pageRows.mapNotNull { (pid, rows) ->
            if (rows.isEmpty()) null
            else PendingSyncConfirmation.ProgramPage(
                id = pid,
                programName = nameById[pid] ?: "Program",
                rows = rows.sortedByDescending { it.payload.ymd },
            )
        }.sortedBy { it.programName.lowercase(Locale.getDefault()) }
    }

    private fun publishWorkoutState() {
        _workoutEnabled.value = store.workoutEnabled
        _workoutProgramIds.value = store.workoutProgramIds
        _lastWorkoutSyncMillis.value = store.lastWorkoutSyncMillis.takeIf { it > 0 }
        _lastWorkoutSyncCount.value = store.lastWorkoutSyncCount
        _lastWorkoutSyncFailed.value = store.lastWorkoutSyncFailed
    }

    private fun publishSleepState() {
        _sleepEnabled.value = store.sleepEnabled
        _sleepProgramIds.value = store.sleepProgramIds
        _lastSleepSyncMillis.value = store.lastSleepSyncMillis.takeIf { it > 0 }
        _lastSleepSyncCount.value = store.lastSleepSyncCount
        _lastSleepSyncFailed.value = store.lastSleepSyncFailed
    }

    companion object {
        private val displayFormatter = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault())

        /** `yyyy-MM-dd` → e.g. "Tue, Jul 1"; falls back to the raw string. */
        fun displayDate(ymd: String): String = try {
            LocalDate.parse(ymd).format(displayFormatter)
        } catch (e: Exception) {
            ymd
        }

        fun formatHours(hours: Double): String = String.format(Locale.getDefault(), "%.1f h", hours)
    }
}
