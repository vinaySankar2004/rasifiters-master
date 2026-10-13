package com.app.rasifiters.health

import android.content.Context
import android.os.SystemClock
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.events.ClientEventQueue
import com.app.rasifiters.net.ApiService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.coroutines.cancellation.CancellationException

/**
 * Health Connect sync lifecycle — the Android analog of the iOS Apple-Health orchestration. Owns the settings state
 * (connect / disconnect / program selection), the first-sync review queue (D-CONF) and the run triggers; one v2 run
 * ([HealthSyncRunner], health-sync §8) is in flight per device. Android Health Connect has no background delivery, so
 * runs fire on app triggers (`launch` / `foreground` / `program_entry` — ≥ 60 s apart) and user actions (`connect` /
 * `manual` / `pull_to_refresh` — they wait for an in-flight run, H4).
 */
class HealthSyncController(
    private val context: Context,
    api: ApiService,
    private val programContext: ProgramContext,
    events: ClientEventQueue,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val store = HealthStore(context) { programContext.loggedInMemberId }
    val manager = HealthConnectManager(context)
    private val runner = HealthSyncRunner(api, store, manager, programContext, events)
    private val runMutex = Mutex()
    private var lastRunStartMs = 0L
    /** The in-flight run — cancelled by the sign-out teardown ([cancelRun]). */
    private var runJob: Job? = null

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

    private val _stepsEnabled = MutableStateFlow(store.stepsEnabled)
    val stepsEnabled: StateFlow<Boolean> = _stepsEnabled.asStateFlow()
    private val _stepsProgramIds = MutableStateFlow(store.stepsProgramIds)
    val stepsProgramIds: StateFlow<Set<String>> = _stepsProgramIds.asStateFlow()
    private val _lastStepsSyncMillis = MutableStateFlow(store.lastStepsSyncMillis.takeIf { it > 0 })
    val lastStepsSyncMillis: StateFlow<Long?> = _lastStepsSyncMillis.asStateFlow()
    private val _lastStepsSyncCount = MutableStateFlow(store.lastStepsSyncCount)
    val lastStepsSyncCount: StateFlow<Int> = _lastStepsSyncCount.asStateFlow()
    private val _lastStepsSyncFailed = MutableStateFlow(store.lastStepsSyncFailed)
    val lastStepsSyncFailed: StateFlow<Boolean> = _lastStepsSyncFailed.asStateFlow()

    /** Flows whose Health Connect permission is no longer granted → "Reconnect Health Connect" (board §4.8). */
    private val _missingPermissions = MutableStateFlow<Set<HealthStore.Flow>>(emptySet())
    val missingPermissions: StateFlow<Set<HealthStore.Flow>> = _missingPermissions.asStateFlow()

    /** The confirmation currently presented (globally, from RootScreen). A sleep/steps flow computed while a
     *  higher-priority flow is showing waits in [deferredSleep]/[deferredSteps] (priority workouts > sleep > steps). */
    private val _pendingConfirmation = MutableStateFlow<PendingSyncConfirmation?>(null)
    val pendingConfirmation: StateFlow<PendingSyncConfirmation?> = _pendingConfirmation.asStateFlow()
    private var deferredSleep: PendingSyncConfirmation? = null
    private var deferredSteps: PendingSyncConfirmation? = null

    val isAvailable: Boolean get() = manager.isAvailable
    val workoutPermissions: Set<String> get() = manager.workoutPermissions
    val sleepPermissions: Set<String> get() = manager.sleepPermissions
    val stepsPermissions: Set<String> get() = manager.stepsPermissions

    // Held while a first-sync review awaits the user: the run's changes token commits only after the review finishes
    // and the run was clean (see [commitPendingWorkoutTokenIfClean]).
    private var pendingWorkoutToken: String? = null
    private var pendingWorkoutClean = false

    init {
        programContext.loggedInMemberId?.let(store::adoptLegacyKeys)
        publishAll()
    }

    // MARK: - Triggers

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

    /** health-sync §8 rule 1: one run in flight per device. Automatic triggers skip when one is running and run ≥ 60 s
     *  apart (D-C12 limiter headroom); user triggers wait for the in-flight run, then run (H4). */
    private suspend fun runOnce(trigger: String): HealthSyncRunner.RunResult? {
        if (!programContext.isSignedIn.value || !isAvailable) return null
        if (trigger in AUTOMATIC_TRIGGERS) {
            val now = SystemClock.elapsedRealtime()
            if (lastRunStartMs != 0L && now - lastRunStartMs < MIN_AUTO_INTERVAL_MS) return null
            if (!runMutex.tryLock()) return null
        } else {
            runMutex.lock()
        }
        try {
            val memberId = programContext.loggedInMemberId ?: return null
            val inputs = HealthStore.Flow.entries.filter { enabled(it) && !awaitingReview(it) }
                .map { HealthSyncRunner.FlowInput(it, programIds(it)) }
            if (inputs.isEmpty() || !programContext.isSignedIn.value) return null
            lastRunStartMs = SystemClock.elapsedRealtime()
            val job = scope.async { runner.run(trigger, inputs, memberId) }
            runJob = job
            val result = try {
                job.await()
            } catch (e: CancellationException) {
                if (job.isCancelled && currentCoroutineContext().isActive) return null   // cancelled by the teardown
                throw e
            } finally {
                if (runJob === job) runJob = null
            } ?: return null
            // Applied only to the member the run was for (the run itself aborts once the session moves on).
            if (!isCurrentMember(memberId)) return null
            applyResult(result)
            return result
        } finally { runMutex.unlock() }
    }

    /** Sign-out teardown: stop the in-flight run (it would otherwise keep uploading for a signed-out member). */
    fun cancelRun() { runJob?.cancel() }

    private fun isCurrentMember(memberId: String) = programContext.isSignedIn.value && programContext.loggedInMemberId == memberId

    private fun applyResult(result: HealthSyncRunner.RunResult) {
        _missingPermissions.value = result.missingPermissions
        val now = System.currentTimeMillis()
        result.flows.forEach { (flow, f) ->
            if (!f.attempted && !f.failed) return@forEach
            // A held workout review advances "Last Synced" only on commit (commitPendingWorkoutTokenIfClean).
            if (f.advanced && (flow != HealthStore.Flow.WORKOUTS || f.reviewRows.isEmpty())) setLastSync(flow, now)
            setFailed(flow, f.failed)
            val n = if (flow == HealthStore.Flow.WORKOUTS) f.counts.applied else f.counts.created
            addCount(flow, n)
            notifySynced(flow, n)
            if (f.reviewRows.isNotEmpty()) {
                val pages = buildConfirmationPages(f.reviewRows)
                if (pages.isNotEmpty()) enqueuePendingConfirmation(PendingSyncConfirmation(flow.confirmationFlow(), pages))
            }
        }
        result.heldWorkoutToken?.let { pendingWorkoutToken = it; pendingWorkoutClean = result.heldWorkoutTokenClean }
        publishAll()
    }

    /** "Reconnect Health Connect" state — re-read on the settings screen and after a grant. */
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

    // MARK: - Connect / disconnect (H2: Disconnect keeps exclusions + confirmed reviews and sends nothing; a reconnect
    // no longer re-gates — the server's review_done_at is the record — and reads from the reconnect date at most.)

    fun enableWorkoutsAfterPermission() {
        store.workoutEnabled = true
        if (store.workoutConnectMillis == 0L) store.workoutConnectMillis = System.currentTimeMillis()
        publishAll()
        onTrigger("connect"); scope.launch { refreshPermissionState() }
    }

    fun disconnectWorkouts() {
        store.workoutEnabled = false
        store.workoutProgramIds = emptySet()
        store.lastWorkoutSyncMillis = 0L
        store.lastWorkoutSyncCount = 0
        store.lastWorkoutSyncFailed = false
        store.workoutConnectMillis = 0L
        store.workoutChangesToken = null
        store.upgradeMarker = false   // a reconnect is a new connect: its window floors at the reconnect date (H2)
        pendingWorkoutToken = null; pendingWorkoutClean = false
        _missingPermissions.value = _missingPermissions.value - HealthStore.Flow.WORKOUTS
        publishAll()
    }

    fun toggleWorkoutProgram(id: String) {
        val set = store.workoutProgramIds
        store.workoutProgramIds = if (id in set) set - id else set + id
        publishAll()
    }

    fun enableSleepAfterPermission() {
        store.sleepEnabled = true
        if (store.sleepConnectMillis == 0L) store.sleepConnectMillis = System.currentTimeMillis()
        publishAll()
        onTrigger("connect"); scope.launch { refreshPermissionState() }
    }

    fun disconnectSleep() {
        store.sleepEnabled = false
        store.sleepProgramIds = emptySet()
        store.lastSleepSyncMillis = 0L
        store.lastSleepSyncCount = 0
        store.lastSleepSyncFailed = false
        store.sleepConnectMillis = 0L
        _missingPermissions.value = _missingPermissions.value - HealthStore.Flow.SLEEP
        publishAll()
    }

    fun toggleSleepProgram(id: String) {
        val set = store.sleepProgramIds
        store.sleepProgramIds = if (id in set) set - id else set + id
        publishAll()
    }

    fun enableStepsAfterPermission() {
        store.stepsEnabled = true
        if (store.stepsConnectMillis == 0L) store.stepsConnectMillis = System.currentTimeMillis()
        publishAll()
        onTrigger("connect"); scope.launch { refreshPermissionState() }
    }

    fun disconnectSteps() {
        store.stepsEnabled = false
        store.stepsProgramIds = emptySet()
        store.lastStepsSyncMillis = 0L
        store.lastStepsSyncCount = 0
        store.lastStepsSyncFailed = false
        store.stepsConnectMillis = 0L
        _missingPermissions.value = _missingPermissions.value - HealthStore.Flow.STEPS
        publishAll()
    }

    fun toggleStepsProgram(id: String) {
        val set = store.stepsProgramIds
        store.stepsProgramIds = if (id in set) set - id else set + id
        publishAll()
    }

    // MARK: - Confirmation queue + per-page commit

    private fun enqueuePendingConfirmation(confirmation: PendingSyncConfirmation) {
        if (confirmation.pages.isEmpty()) return
        val current = _pendingConfirmation.value
        if (current == null) {
            _pendingConfirmation.value = confirmation
            return
        }
        if (confirmation.flow == current.flow) return                               // already showing this flow
        // Priority workouts > sleep > steps: a higher-priority arrival preempts; lower-priority waits.
        when (confirmation.flow) {
            PendingSyncConfirmation.Flow.WORKOUTS -> {                              // workouts win over anything
                stashDeferred(current)
                _pendingConfirmation.value = confirmation
            }
            PendingSyncConfirmation.Flow.SLEEP -> {
                if (current.flow == PendingSyncConfirmation.Flow.WORKOUTS) {
                    deferredSleep = confirmation                                    // sleep waits behind workouts
                } else {                                                            // current is steps → sleep preempts
                    deferredSteps = current
                    _pendingConfirmation.value = confirmation
                }
            }
            PendingSyncConfirmation.Flow.STEPS -> deferredSteps = confirmation      // steps waits behind either
        }
    }

    /** Stash a preempted confirmation back into its flow's deferred slot (workouts never defers). */
    private fun stashDeferred(c: PendingSyncConfirmation) {
        when (c.flow) {
            PendingSyncConfirmation.Flow.SLEEP -> deferredSleep = c
            PendingSyncConfirmation.Flow.STEPS -> deferredSteps = c
            PendingSyncConfirmation.Flow.WORKOUTS -> Unit
        }
    }

    /** Called by the confirmation screen when it finishes (committed) or is dismissed (deferred). */
    fun finishConfirmation(flow: PendingSyncConfirmation.Flow, committed: Boolean) {
        if (flow == PendingSyncConfirmation.Flow.WORKOUTS) {
            if (committed) commitPendingWorkoutTokenIfClean() else { pendingWorkoutToken = null; pendingWorkoutClean = false }
        }
        promoteDeferredConfirmation()
    }

    private fun promoteDeferredConfirmation() {
        // Priority: promote deferred sleep before deferred steps (workouts > sleep > steps).
        deferredSleep?.let { sleep ->
            deferredSleep = null
            val pages = sleep.pages.filter { it.id in store.sleepProgramIds }
            if (pages.isNotEmpty()) {
                _pendingConfirmation.value = PendingSyncConfirmation(PendingSyncConfirmation.Flow.SLEEP, pages)
                return
            }
        }
        deferredSteps?.let { steps ->
            deferredSteps = null
            val pages = steps.pages.filter { it.id in store.stepsProgramIds }
            if (pages.isNotEmpty()) {
                _pendingConfirmation.value = PendingSyncConfirmation(PendingSyncConfirmation.Flow.STEPS, pages)
                return
            }
        }
        _pendingConfirmation.value = null
    }

    private fun commitPendingWorkoutTokenIfClean() {
        if (pendingWorkoutClean && pendingWorkoutToken != null) {
            store.workoutChangesToken = pendingWorkoutToken
            store.lastWorkoutSyncMillis = System.currentTimeMillis()
            publishAll()
        }
        pendingWorkoutToken = null; pendingWorkoutClean = false
    }

    /** Commit ONE program's checked rows (rule 6). false = retry (offline / lock / a non-final result); true marks the
     *  program reviewed (locally + PUT review_done). Never touches the token. */
    suspend fun commitWorkoutPage(page: PendingSyncConfirmation.ProgramPage) = commitPage(HealthStore.Flow.WORKOUTS, page)
    suspend fun commitSleepPage(page: PendingSyncConfirmation.ProgramPage) = commitPage(HealthStore.Flow.SLEEP, page)
    suspend fun commitStepsPage(page: PendingSyncConfirmation.ProgramPage) = commitPage(HealthStore.Flow.STEPS, page)

    private suspend fun commitPage(flow: HealthStore.Flow, page: PendingSyncConfirmation.ProgramPage): Boolean {
        if (!programContext.isSignedIn.value) return false
        val memberId = programContext.loggedInMemberId ?: return false
        val counts = runMutex.withLock { runner.commitPage(flow, page, memberId) } ?: return false
        if (!isCurrentMember(memberId)) return false
        addCount(flow, if (flow == HealthStore.Flow.WORKOUTS) counts.applied else counts.created)
        publishAll()
        return true
    }

    // MARK: - Per-flow helpers

    private fun enabled(flow: HealthStore.Flow) = when (flow) {
        HealthStore.Flow.WORKOUTS -> store.workoutEnabled
        HealthStore.Flow.SLEEP -> store.sleepEnabled
        HealthStore.Flow.STEPS -> store.stepsEnabled
    }

    private fun programIds(flow: HealthStore.Flow) = when (flow) {
        HealthStore.Flow.WORKOUTS -> store.workoutProgramIds
        HealthStore.Flow.SLEEP -> store.sleepProgramIds
        HealthStore.Flow.STEPS -> store.stepsProgramIds
    }

    /** A flow whose review is showing / queued doesn't run again until it finishes (faithful D-CONF gating). */
    private fun awaitingReview(flow: HealthStore.Flow): Boolean =
        _pendingConfirmation.value?.flow == flow.confirmationFlow() ||
            (flow == HealthStore.Flow.SLEEP && deferredSleep != null) ||
            (flow == HealthStore.Flow.STEPS && deferredSteps != null)

    private fun setLastSync(flow: HealthStore.Flow, millis: Long) = when (flow) {
        HealthStore.Flow.WORKOUTS -> store.lastWorkoutSyncMillis = millis
        HealthStore.Flow.SLEEP -> store.lastSleepSyncMillis = millis
        HealthStore.Flow.STEPS -> store.lastStepsSyncMillis = millis
    }

    private fun setFailed(flow: HealthStore.Flow, failed: Boolean) = when (flow) {
        HealthStore.Flow.WORKOUTS -> store.lastWorkoutSyncFailed = failed
        HealthStore.Flow.SLEEP -> store.lastSleepSyncFailed = failed
        HealthStore.Flow.STEPS -> store.lastStepsSyncFailed = failed
    }

    private fun addCount(flow: HealthStore.Flow, n: Int) {
        if (n <= 0) return
        when (flow) {
            HealthStore.Flow.WORKOUTS -> store.lastWorkoutSyncCount += n
            HealthStore.Flow.SLEEP -> store.lastSleepSyncCount += n
            HealthStore.Flow.STEPS -> store.lastStepsSyncCount += n
        }
    }

    private fun notifySynced(flow: HealthStore.Flow, n: Int) = when (flow) {
        HealthStore.Flow.WORKOUTS -> HealthSyncNotifier.notifyWorkoutSuccess(context, n)
        HealthStore.Flow.SLEEP -> HealthSyncNotifier.notifySleepSuccess(context, n)
        HealthStore.Flow.STEPS -> HealthSyncNotifier.notifyStepsSuccess(context, n)
    }

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

    private fun publishAll() {
        _workoutEnabled.value = store.workoutEnabled
        _workoutProgramIds.value = store.workoutProgramIds
        _lastWorkoutSyncMillis.value = store.lastWorkoutSyncMillis.takeIf { it > 0 }
        _lastWorkoutSyncCount.value = store.lastWorkoutSyncCount
        _lastWorkoutSyncFailed.value = store.lastWorkoutSyncFailed
        _sleepEnabled.value = store.sleepEnabled
        _sleepProgramIds.value = store.sleepProgramIds
        _lastSleepSyncMillis.value = store.lastSleepSyncMillis.takeIf { it > 0 }
        _lastSleepSyncCount.value = store.lastSleepSyncCount
        _lastSleepSyncFailed.value = store.lastSleepSyncFailed
        _stepsEnabled.value = store.stepsEnabled
        _stepsProgramIds.value = store.stepsProgramIds
        _lastStepsSyncMillis.value = store.lastStepsSyncMillis.takeIf { it > 0 }
        _lastStepsSyncCount.value = store.lastStepsSyncCount
        _lastStepsSyncFailed.value = store.lastStepsSyncFailed
    }

    companion object {
        private val AUTOMATIC_TRIGGERS = setOf("launch", "foreground", "program_entry")
        private const val MIN_AUTO_INTERVAL_MS = 60_000L
        private val displayFormatter = DateTimeFormatter.ofPattern("EEE, MMM d", Locale.getDefault())

        /** `yyyy-MM-dd` → e.g. "Tue, Jul 1"; falls back to the raw string. */
        fun displayDate(ymd: String): String = try {
            LocalDate.parse(ymd).format(displayFormatter)
        } catch (e: Exception) {
            ymd
        }

        fun formatHours(hours: Double): String = String.format(Locale.getDefault(), "%.1f h", hours)

        fun formatSteps(count: Int): String = String.format(Locale.getDefault(), "%,d steps", count)
    }
}
