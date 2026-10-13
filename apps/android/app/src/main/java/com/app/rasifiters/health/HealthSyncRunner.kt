package com.app.rasifiters.health

import android.os.SystemClock
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.events.ClientEventQueue
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.errorClass
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.HealthSyncBatchRequest
import com.app.rasifiters.net.HealthSyncStateEntry
import com.app.rasifiters.net.HealthSyncStatePut
import kotlinx.coroutines.delay
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.util.IdentityHashMap
import kotlin.coroutines.cancellation.CancellationException

/**
 * One health-sync v2 run (health-sync §8 rules 2–10): read Health Connect → plan → ONE upload (≤ 300 items per request,
 * halved on 413; legacy items first) → PUT /state → one `sync.run`. Holds on `skipped_locked` (rule 5); never signs out
 * (rule 8). review_done is sent ONLY from store.pendingReviewDone (rule-9 carry-over + user confirms) — a silent 0-row
 * confirm stays local (H1). A run is tied to the member it started for: it works on a store pinned to that member and
 * aborts (no report, nothing applied) before any API call or store write once that member is no longer signed in.
 */
internal class HealthSyncRunner(
    private val api: ApiService,
    private val baseStore: HealthStore,
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

    /** Thrown (as a cancellation, so every `catch (CancellationException) { throw e }` passes it up) to abort a run. */
    private class MemberChangedException : CancellationException("health sync: the signed-in member changed")

    private fun guardFor(memberId: String): () -> Unit = {
        if (!programContext.isSignedIn.value || programContext.loggedInMemberId != memberId) throw MemberChangedException()
    }

    /** One run for [memberId]; null = aborted because the session moved on (sign-out / another member). */
    suspend fun run(trigger: String, inputs: List<FlowInput>, memberId: String): RunResult? {
        val guard = guardFor(memberId)
        val store = baseStore.pinnedTo(memberId, guard)
        return try { runFor(trigger, inputs, store, HealthSyncUpgrade(store, manager), guard) } catch (_: MemberChangedException) { null }
    }

    private suspend fun runFor(
        trigger: String, inputs: List<FlowInput>, store: HealthStore, upgrade: HealthSyncUpgrade, guard: () -> Unit,
    ): RunResult {
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
            guard()
            state = HealthSyncItems.ServerState(api.getHealthSyncState().states)
            guard()
            windows = HealthSyncItems.loadSyncWindows(programContext, runnable.flatMap { it.programIds }.toSet())
        } catch (e: CancellationException) { throw e } catch (e: Exception) { return done("failed", e.toAppError().errorClass(), missing) }

        val today = LocalDate.now()
        val plans = LinkedHashMap<HealthStore.Flow, HealthSyncItems.FlowPlan>()
        val readFailed = mutableSetOf<HealthStore.Flow>()
        val noWindow = mutableSetOf<HealthStore.Flow>()
        var workoutToken: String? = null
        for (input in runnable) {
            val flow = input.flow
            if (flow != HealthStore.Flow.WORKOUTS) store.pruneExcludedKeys(flow, HealthDates.EXCLUSION_KEEP_DAYS)
            val inWindow = input.programIds.filter { it in windows }.toSet()
            val locked = inWindow.filter { programContext.isDataEntryLocked(it) }.toSet()
            val eligible = inWindow - locked
            // rule 6 (a review on any integration) + H1 (this integration already synced it) → confirmed locally.
            eligible.filter { state.isReviewed(it, flow) || state.hasLastSuccess(it, flow) }.forEach { store.markProgramConfirmed(it, flow) }
            val confirmed = store.confirmedProgramIds(flow)
            val ctx = HealthSyncItems.PlanContext(flow, eligible, locked.isNotEmpty(), windows, store.excludedKeys(flow), confirmed)
            val read = try { HealthSyncItems.readAndPlan(manager, store, ctx, state.oldestLastSuccess(eligible, flow), today) }
            catch (e: CancellationException) { throw e } catch (_: Exception) { readFailed += flow; flows[flow] = FlowResult(failed = true); continue }
            tally.catchUpDays = maxOf(tally.catchUpDays, read.catchUpDays)
            // H4 (faithful 1.4): data but no selected program resolves a window → hold the token, report failed.
            if (inWindow.isEmpty() && read.hadData) { noWindow += flow; flows[flow] = FlowResult(failed = true); continue }
            if (flow == HealthStore.Flow.WORKOUTS) workoutToken = read.workoutToken
            plans[flow] = read.plan
            // D-CONF 0-row first sync confirms silently — LOCAL ONLY (H1: review_done needs a user confirm).
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
        if (plans.isEmpty()) return done("failed", if (readFailed.isNotEmpty()) "health_read_failed" else null, missing)

        val items = legacy + plans.values.flatMap { it.upload }
        val upload = if (items.isEmpty()) Upload(emptyList(), null, 0) else upload(items, guard)
        tally.batches = upload.batches
        upgrade.retire(upload.results)
        if (legacy.isNotEmpty()) tally.legacyRecorded = upload.results.count { it.first.legacyKey != null && it.second == "recorded" }

        // Rule 5: advance the token only when every item of the run came back final and nothing was held.
        val complete = upload.error == null && upload.results.size == items.size
        val returned = IdentityHashMap<PlannedItem, String>().apply { upload.results.forEach { (item, status) -> put(item, status) } }
        val pendingReviews = store.pendingReviewDone
        val stateEntries = pendingReviews.mapNotNull { k ->
            k.split('|').takeIf { it.size == 2 }?.let { HealthSyncStateEntry(it[0], it[1], reviewDone = true) }
        }.toMutableList()
        for ((flow, plan) in plans) {
            val mine = upload.results.filter { it.first.flow == flow && it.first.legacyKey == null }
            val counts = KindCounts().also { c -> mine.forEach { c.add(it.second) } }
            val serverHeld = upload.results.filter { it.first.flow == flow && it.second == STATUS_LOCKED }
            val advanced = complete && !plan.lockHeld && serverHeld.isEmpty()
            // H4 / rule 2: sync_success per (program, kind) whose every item came back final, minus held keys.
            val heldPrograms = serverHeld.map { it.first.programId }.toSet()
            if (null !in heldPrograms) plan.uploadPrograms.filter { it !in heldPrograms }.forEach { pid ->
                if (items.filter { it.flow == flow && it.programId == pid }.all { returned.containsKey(it) }) {
                    stateEntries += HealthSyncStateEntry(pid, flow.kind, syncSuccess = true)
                }
            }
            flows[flow] = FlowResult(attempted = true, advanced = advanced, failed = !complete, counts = counts, reviewRows = plan.reviewRows)
        }
        if (putState(stateEntries, guard)) store.pendingReviewDone = store.pendingReviewDone - pendingReviews

        var heldToken: String? = null
        var heldClean = false
        plans[HealthStore.Flow.WORKOUTS]?.let { plan ->
            val clean = flows.getValue(HealthStore.Flow.WORKOUTS).advanced
            if (plan.reviewRows.isNotEmpty()) { heldToken = workoutToken; heldClean = clean }
            else if (clean) store.workoutChangesToken = workoutToken
        }
        val anyHeld = plans.values.any { it.lockHeld } || upload.results.any { it.second == STATUS_LOCKED }
        val outcome = when {
            upload.error != null && upload.results.isEmpty() -> "failed"
            upload.error != null || readFailed.isNotEmpty() || noWindow.isNotEmpty() || missing.isNotEmpty() || anyHeld -> "partial"
            items.isEmpty() && plans.values.all { it.reviewRows.isEmpty() } -> "skipped"
            else -> "success"
        }
        val errorClass = upload.error?.errorClass()
            ?: if (readFailed.isNotEmpty()) "health_read_failed" else if (missing.isNotEmpty()) "permission_missing" else null
        return done(outcome, errorClass, missing, heldToken, heldClean)
    }

    /** A reviewed page (rule 6): upload the checked rows, then record the exclusions (only after a successful upload —
     *  C2#10) and mark the review done locally + on the server (queued in pendingReviewDone until PUT /state accepts). */
    suspend fun commitPage(flow: HealthStore.Flow, page: PendingSyncConfirmation.ProgramPage, memberId: String): KindCounts? {
        val guard = guardFor(memberId)
        val store = baseStore.pinnedTo(memberId, guard)
        return try { commitPageFor(flow, page, store, guard) } catch (_: MemberChangedException) { null }
    }

    private suspend fun commitPageFor(
        flow: HealthStore.Flow, page: PendingSyncConfirmation.ProgramPage, store: HealthStore, guard: () -> Unit,
    ): KindCounts? {
        guard()
        val window = (try { HealthSyncItems.loadSyncWindows(programContext, setOf(page.id))[page.id] }
            catch (e: CancellationException) { throw e } catch (_: Exception) { null }) ?: return null
        if (programContext.isDataEntryLocked(page.id)) return null
        val items = HealthSyncItems.pageItems(page, window)
        val upload = if (items.isEmpty()) Upload(emptyList(), null, 0) else upload(items, guard)
        if (upload.error != null || upload.results.size < items.size || upload.results.any { it.second == STATUS_LOCKED }) return null
        store.addExcludedKeys(page.rows.filterNot { it.isChecked }.map { it.exclusionKey }, flow)
        store.markProgramConfirmed(page.id, flow)
        store.addPendingReviewDone(page.id, flow)
        val key = "${page.id}|${flow.kind}"
        if (putState(listOf(HealthSyncStateEntry(page.id, flow.kind, reviewDone = true)), guard)) {
            store.pendingReviewDone = store.pendingReviewDone - key
        }
        return KindCounts().also { c -> upload.results.forEach { c.add(it.second) } }
    }

    /** Sequential batches; stops at the first failure (legacy items first → adds never precede their adoption).
     *  413 → halve; 429 / 503 with Retry-After ≤ 5 s → wait and resend once (rule 8). */
    private suspend fun upload(items: List<PlannedItem>, guard: () -> Unit): Upload {
        val results = ArrayList<Pair<PlannedItem, String>>(items.size)
        val queue = ArrayDeque(items.chunked(MAX_ITEMS))
        var batches = 0
        var waited = false
        while (queue.isNotEmpty()) {
            val chunk = queue.removeFirst()
            guard()
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
    private suspend fun putState(entries: List<HealthSyncStateEntry>, guard: () -> Unit): Boolean {
        val merged = entries.groupBy { it.programId to it.kind }.map { (k, list) ->
            HealthSyncStateEntry(
                k.first, k.second,
                reviewDone = list.any { it.reviewDone == true }.takeIf { it },
                syncSuccess = list.any { it.syncSuccess == true }.takeIf { it },
            )
        }
        for (chunk in merged.chunked(MAX_STATE_ENTRIES)) {
            guard()
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
                if (r.attempted && r.counts.sent > 0) put(flow.kind, buildJsonObject {
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
