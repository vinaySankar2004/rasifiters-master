package com.app.rasifiters.health

import androidx.health.connect.client.records.ExerciseSessionRecord
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.net.HealthSyncItemDTO
import com.app.rasifiters.net.HealthSyncStateRow
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** Item planning (health-sync §8 rules 3–4, 6): one item per sample (workouts) or day (sleep/steps) × eligible program
 *  (in-window D-S5, not excluded D-CONF, not admin-locked D-LOCK). Confirmed programs → upload; unconfirmed → a review page. */
internal object HealthSyncItems {
    const val INTEGRATION = "health_connect"

    data class PlanContext(
        val flow: HealthStore.Flow, val eligible: Set<String>, val lockHeld: Boolean,
        val windows: Map<String, Pair<String, String>>, val excluded: Set<String>, val confirmed: Set<String>,
    )

    data class FlowPlan(
        val upload: List<PlannedItem>,
        val reviewRows: Map<String, List<PendingSyncConfirmation.Row>>,
        val uploadPrograms: Set<String>,
        val lockHeld: Boolean,
    )

    /** [hadData] = Health returned anything for the window (before program filtering). */
    data class FlowRead(val plan: FlowPlan, val workoutToken: String?, val catchUpDays: Long, val hadData: Boolean)

    /** GET /state rows, read per (program, kind). */
    class ServerState(rows: List<HealthSyncStateRow>) {
        private val reviewed = rows.filter { it.reviewDoneAt != null }.map { "${it.programId}|${it.kind}" }.toSet()
        private val lastSuccess = rows.filter { it.integration == INTEGRATION && it.lastSuccessAt != null }
            .mapNotNull { r -> runCatching { Instant.parse(r.lastSuccessAt) }.getOrNull()?.let { "${r.programId}|${r.kind}" to it } }
            .toMap()

        /** rule 6: a review done on ANY integration counts. */
        fun isReviewed(pid: String, flow: HealthStore.Flow) = "$pid|${flow.kind}" in reviewed

        /** H1: this integration already synced the (program, kind) — a local confirm (no review after a reinstall). */
        fun hasLastSuccess(pid: String, flow: HealthStore.Flow) = "$pid|${flow.kind}" in lastSuccess

        /** rule 4: the oldest last_success_at among [pids]; null when any of them never synced (→ first-sync rule). */
        fun oldestLastSuccess(pids: Set<String>, flow: HealthStore.Flow): Instant? {
            if (pids.isEmpty()) return null
            val all = pids.map { lastSuccess["$it|${flow.kind}"] }
            return if (all.any { it == null }) null else all.filterNotNull().min()
        }
    }

    /** D-S5 windows `[start_date, min(end_date, today)]`; reloads programs when an id is missing (throws if that fails). */
    suspend fun loadSyncWindows(programContext: ProgramContext, ids: Set<String>): Map<String, Pair<String, String>> {
        var list = programContext.programs.value
        if (!ids.all { id -> list.any { it.id == id } }) {
            programContext.loadPrograms().getOrThrow()
            list = programContext.programs.value
        }
        val today = HealthDates.localYMD(System.currentTimeMillis())
        return list.filter { it.id in ids }.mapNotNull { p ->
            val start = p.startDate?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            val end = minOf(p.endDate ?: today, today)
            if (start <= end) p.id to (start to end) else null
        }.toMap()
    }

    /** Reads one flow's catch-up window (rule 4) and plans it. Throws on a Health Connect read failure. */
    suspend fun readAndPlan(manager: HealthConnectManager, store: HealthStore, ctx: PlanContext, oldest: Instant?, today: LocalDate): FlowRead =
        when (ctx.flow) {
            HealthStore.Flow.WORKOUTS -> {
                val connect = HealthDates.localDate(store.workoutConnectMillis)
                val firstSync = if (store.upgradeMarker) today.minusDays(HealthDates.CATCH_UP_CAP_DAYS) else connect
                var start = HealthDates.catchUpStart(oldest, firstSync, today)
                // H2: after a (re)connect the window never reaches back before the connect date (no silent import of
                // the disconnected period) — except on the upgrade path, which never uses the connect date (rule 4/9).
                if (!store.upgradeMarker) start = maxOf(start, connect)
                val fetch = manager.fetchWorkouts(store.workoutChangesToken, HealthDates.startOfDay(start))
                FlowRead(
                    planWorkouts(manager.aggregate(fetch.upserts), fetch.deletedIds, ctx), fetch.newToken,
                    if (fetch.readFrom != null) ChronoUnit.DAYS.between(start, today) else 0L,
                    fetch.upserts.isNotEmpty() || fetch.deletedIds.isNotEmpty(),
                )
            }
            HealthStore.Flow.SLEEP -> {
                val start = HealthDates.catchUpStart(oldest, today.minusDays(HealthDates.FIRST_SYNC_DAYS), today)
                val nights = manager.aggregateSleep(manager.fetchSleepSamples(HealthDates.startOfDay(start.minusDays(1))))
                    .filter { it.date >= start.toString() }
                FlowRead(planSleep(nights, ctx), null, ChronoUnit.DAYS.between(start, today), nights.isNotEmpty())
            }
            HealthStore.Flow.STEPS -> {
                val start = HealthDates.catchUpStart(oldest, today.minusDays(HealthDates.FIRST_SYNC_DAYS), today)
                val days = manager.fetchStepsDailyTotals(start)
                FlowRead(planSteps(days, ctx), null, ChronoUnit.DAYS.between(start, today), days.isNotEmpty())
            }
        }

    fun planWorkouts(groups: List<AggregatedWorkout>, deletedIds: Set<String>, ctx: PlanContext): FlowPlan {
        val deletions = deletedIds.map {
            PlannedItem(HealthSyncItemDTO(kind = "workout", sampleId = it, deleted = true), HealthStore.Flow.WORKOUTS, null)
        }
        val kept = groups.mapNotNull { g -> g.samples.filterNot { it.uuid in deletedIds }.takeIf { it.isNotEmpty() }?.let { g.copy(samples = it) } }
        return plan(kept, ctx, deletions, { it.date }, { pid, g -> "$pid|${g.date}|${g.workoutName}" }, { g, pid -> workoutItems(g, pid) }) { g, key ->
            PendingSyncConfirmation.Row(
                g.workoutName, "${HealthSyncController.displayDate(g.date)} · ${g.durationMinutes} min", key,
                PendingSyncConfirmation.Payload.Workout(g),
            )
        }
    }

    fun planSleep(nights: List<AggregatedSleep>, ctx: PlanContext): FlowPlan =
        plan(nights, ctx, emptyList(), { it.date }, { pid, n -> "$pid|${n.date}" }, { n, pid -> listOf(sleepItem(n, pid)) }) { n, key ->
            PendingSyncConfirmation.Row(
                "Sleep", "${HealthSyncController.displayDate(n.date)} · ${HealthSyncController.formatHours(n.hours)}", key,
                PendingSyncConfirmation.Payload.Sleep(n),
            )
        }

    fun planSteps(days: List<AggregatedSteps>, ctx: PlanContext): FlowPlan =
        plan(days, ctx, emptyList(), { it.date }, { pid, d -> "$pid|${d.date}" }, { d, pid -> listOf(stepsItem(d, pid)) }) { d, key ->
            PendingSyncConfirmation.Row(
                "Steps", "${HealthSyncController.displayDate(d.date)} · ${HealthSyncController.formatSteps(d.count)}", key,
                PendingSyncConfirmation.Payload.Steps(d),
            )
        }

    /** A reviewed page's checked rows → items for that program (within its window). */
    fun pageItems(page: PendingSyncConfirmation.ProgramPage, window: Pair<String, String>): List<PlannedItem> =
        page.rows.filter { it.isChecked && HealthDates.isWithin(it.payload.ymd, window.first, window.second) }.flatMap { row ->
            when (val p = row.payload) {
                is PendingSyncConfirmation.Payload.Workout -> workoutItems(p.workout, page.id)
                is PendingSyncConfirmation.Payload.Sleep -> listOf(sleepItem(p.sleep, page.id))
                is PendingSyncConfirmation.Payload.Steps -> listOf(stepsItem(p.steps, page.id))
            }
        }

    /** rule 9: an old-ledger entry re-read from Health → a `legacy` item (date = the ledger's stored day). */
    fun legacyWorkout(record: ExerciseSessionRecord, entry: HealthStore.LedgerEntry): PlannedItem {
        val s = WorkoutSample.of(record)
        return PlannedItem(
            HealthSyncItemDTO(
                kind = "workout", programId = entry.programId, date = entry.date, sampleId = s.uuid, origin = s.origin,
                workoutName = HealthConnectWorkoutTypeMap.workoutName(record.exerciseType), value = JsonPrimitive(s.wholeMinutes),
                startAt = s.startAt.toString(), endAt = s.endAt.toString(), legacy = true,
            ),
            HealthStore.Flow.WORKOUTS, entry.programId, legacyKey = entry.key,
        )
    }

    private fun workoutItems(g: AggregatedWorkout, programId: String): List<PlannedItem> = g.samples.map { s ->
        PlannedItem(
            HealthSyncItemDTO(
                kind = "workout", programId = programId, date = g.date, sampleId = s.uuid, origin = s.origin,
                workoutName = g.workoutName, value = JsonPrimitive(s.wholeMinutes), startAt = s.startAt.toString(), endAt = s.endAt.toString(),
            ),
            HealthStore.Flow.WORKOUTS, programId,
        )
    }

    private fun sleepItem(n: AggregatedSleep, pid: String) =
        PlannedItem(HealthSyncItemDTO(kind = "sleep", programId = pid, date = n.date, value = JsonPrimitive(n.hours)), HealthStore.Flow.SLEEP, pid)

    private fun stepsItem(d: AggregatedSteps, pid: String) =
        PlannedItem(HealthSyncItemDTO(kind = "steps", programId = pid, date = d.date, value = JsonPrimitive(d.count)), HealthStore.Flow.STEPS, pid)

    private inline fun <T> plan(
        rows: List<T>, ctx: PlanContext, prefix: List<PlannedItem>,
        date: (T) -> String, key: (String, T) -> String,
        toItems: (T, String) -> List<PlannedItem>, toRow: (T, String) -> PendingSyncConfirmation.Row,
    ): FlowPlan {
        val upload = prefix.toMutableList()
        val review = LinkedHashMap<String, MutableList<PendingSyncConfirmation.Row>>()
        for (row in rows) for (pid in ctx.eligible) {
            val (start, end) = ctx.windows[pid] ?: continue
            if (!HealthDates.isWithin(date(row), start, end)) continue
            val k = key(pid, row)
            if (k in ctx.excluded) continue
            if (pid in ctx.confirmed) upload += toItems(row, pid) else review.getOrPut(pid) { mutableListOf() } += toRow(row, k)
        }
        return FlowPlan(upload, review, ctx.eligible.filter { it in ctx.confirmed }.toSet(), ctx.lockHeld)
    }
}
