package com.app.rasifiters.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import kotlin.math.roundToInt

/**
 * Health Connect access for workout + sleep + steps sync — the Android analog of iOS `HealthKitService`:
 * availability, read authorization, incremental (changes-token) workout fetch incl. deletions, paged window reads
 * (health-sync §8 rule 4), and same-type/same-day (workouts, review display) / per-night (sleep) aggregation.
 *
 * Anchor integrity: [fetchWorkouts] returns the new changes token to the caller (the sync runner), which commits it
 * via [HealthStore.workoutChangesToken] ONLY after a run that may advance (rule 5).
 */
class HealthConnectManager(private val context: Context) {

    val workoutPermissions: Set<String> =
        setOf(HealthPermission.getReadPermission(ExerciseSessionRecord::class))
    val sleepPermissions: Set<String> =
        setOf(HealthPermission.getReadPermission(SleepSessionRecord::class))
    val stepsPermissions: Set<String> =
        setOf(HealthPermission.getReadPermission(StepsRecord::class))

    /** Whether the Health Connect SDK + a usable provider are available on this device (gates the UI). */
    val isAvailable: Boolean
        get() = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    private fun clientOrNull(): HealthConnectClient? =
        if (isAvailable) HealthConnectClient.getOrCreate(context) else null

    suspend fun grantedPermissions(): Set<String> =
        clientOrNull()?.permissionController?.getGrantedPermissions() ?: emptySet()

    suspend fun hasWorkoutPermission(): Boolean = grantedPermissions().containsAll(workoutPermissions)
    suspend fun hasSleepPermission(): Boolean = grantedPermissions().containsAll(sleepPermissions)
    suspend fun hasStepsPermission(): Boolean = grantedPermissions().containsAll(stepsPermissions)

    fun permissionsFor(flow: HealthStore.Flow): Set<String> = when (flow) {
        HealthStore.Flow.WORKOUTS -> workoutPermissions
        HealthStore.Flow.SLEEP -> sleepPermissions
        HealthStore.Flow.STEPS -> stepsPermissions
    }

    // MARK: - Workouts (incremental via the changes token — the anchored-query analog)

    /** readFrom != null → a window read (no / expired token). The caller commits newToken only when the run may advance (rule 5). */
    data class WorkoutFetch(val upserts: List<ExerciseSessionRecord>, val deletedIds: Set<String>, val newToken: String?, val readFrom: Instant?)

    /** Changes since [savedToken] (upserts + DeletionChange ids, every page). No / expired token → mint a fresh token FIRST,
     *  then read every session since [fallbackStart] (paged) — health-sync §8 rule 4. Throws on a read failure. */
    suspend fun fetchWorkouts(savedToken: String?, fallbackStart: Instant): WorkoutFetch {
        val client = clientOrNull() ?: return WorkoutFetch(emptyList(), emptySet(), savedToken, null)
        if (savedToken != null) {
            var token: String = savedToken
            val upserts = LinkedHashMap<String, ExerciseSessionRecord>()
            val deleted = LinkedHashSet<String>()
            while (true) {
                val response = client.getChanges(token)
                if (response.changesTokenExpired) return fullRead(client, fallbackStart)
                response.changes.forEach { change ->
                    when (change) {
                        is UpsertionChange -> (change.record as? ExerciseSessionRecord)?.let { upserts[it.metadata.id] = it; deleted.remove(it.metadata.id) }
                        is DeletionChange -> { deleted += change.recordId; upserts.remove(change.recordId) }
                    }
                }
                token = response.nextChangesToken
                if (!response.hasMore) break
            }
            return WorkoutFetch(upserts.values.toList(), deleted, token, null)
        }
        return fullRead(client, fallbackStart)
    }

    private suspend fun fullRead(client: HealthConnectClient, start: Instant): WorkoutFetch {
        val token = client.getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))
        return WorkoutFetch(readWorkoutsSince(start), emptySet(), token, start)
    }

    /** Every session starting at/after [start] — all pages. */
    suspend fun readWorkoutsSince(start: Instant): List<ExerciseSessionRecord> {
        val client = clientOrNull() ?: return emptyList()
        val out = mutableListOf<ExerciseSessionRecord>()
        var page: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.after(start), pageToken = page),
            )
            out += response.records
            page = response.pageToken
        } while (page != null)
        return out
    }

    /**
     * Group sessions by (mapped library name, local calendar day) so multiple sessions of the same type on
     * one day collapse into a single log matching the backend's composite PK. Each group keeps its
     * contributing samples (uuid + minutes) so the write sites can filter out samples already applied to a
     * program (see [HealthStore] ledger) and send only the unapplied remainder (iOS `aggregate`, D-SUM).
     */
    fun aggregate(records: List<ExerciseSessionRecord>): List<AggregatedWorkout> {
        val grouped = LinkedHashMap<String, MutableList<WorkoutSample>>()
        for (record in records) {
            val name = HealthConnectWorkoutTypeMap.workoutName(record.exerciseType)
            val date = HealthDates.localYMD(record.startTime)
            grouped.getOrPut("$name||$date") { mutableListOf() }.add(WorkoutSample.of(record))
        }
        return grouped.mapNotNull { (key, samples) ->
            val parts = key.split("||")
            if (parts.size != 2) null else AggregatedWorkout(parts[0], parts[1], samples)
        }
    }

    // MARK: - Sleep (catch-up window, health-sync §8 rule 4)

    /** Every sleep session from [start] to now — all pages. Throws on a read failure. */
    suspend fun fetchSleepSamples(start: Instant): List<SleepSessionRecord> {
        val client = clientOrNull() ?: return emptyList()
        val out = mutableListOf<SleepSessionRecord>()
        val now = Instant.now()
        var page: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, now), pageToken = page),
            )
            out += response.records
            page = response.pageToken
        } while (page != null)
        return out
    }

    /**
     * Total *time asleep* per night, bucketed by the local calendar date of each stage's END (the "day you
     * woke up"), 2 dp, clamped 0..24. Prefers the precise asleep stages (sleeping/light/deep/REM). When a
     * session has NO asleep-stage data — sleep added manually or a phone-only session — it falls back to
     * that session's whole in-bed duration so the night still syncs (asleep wins, no double-count). Mirrors
     * iOS `aggregateSleep` + the In-Bed fallback (D-S6).
     */
    fun aggregateSleep(records: List<SleepSessionRecord>): List<AggregatedSleep> {
        val asleepByDate = HashMap<String, Double>()   // seconds
        val inBedByDate = HashMap<String, Double>()     // seconds
        for (session in records) {
            val asleepStages = session.stages.filter { isAsleep(it.stage) }
            if (asleepStages.isNotEmpty()) {
                for (stage in asleepStages) {
                    val date = HealthDates.localYMD(stage.endTime)
                    asleepByDate[date] = (asleepByDate[date] ?: 0.0) +
                        Duration.between(stage.startTime, stage.endTime).seconds
                }
            } else {
                val date = HealthDates.localYMD(session.endTime)
                inBedByDate[date] = (inBedByDate[date] ?: 0.0) +
                    Duration.between(session.startTime, session.endTime).seconds
            }
        }
        val dates = asleepByDate.keys + inBedByDate.keys
        return dates.mapNotNull { date ->
            val asleep = asleepByDate[date] ?: 0.0
            val seconds = if (asleep > 0) asleep else (inBedByDate[date] ?: 0.0)
            if (seconds <= 0) return@mapNotNull null
            val hours = (seconds / 3600.0).coerceIn(0.0, 24.0)
            AggregatedSleep(date, (hours * 100).roundToInt() / 100.0)
        }
    }

    // MARK: - Steps (catch-up window, aggregated per day)

    /**
     * Total steps per local calendar day from [startDate] to now, via `aggregateGroupByPeriod` with
     * `StepsRecord.COUNT_TOTAL` (the HC analogue of HKStatistics cumulative-sum: it dedups overlapping sources so a
     * phone + a watch don't double-count). Emits a row only when the day's total is > 0. Throws on a read failure.
     */
    suspend fun fetchStepsDailyTotals(startDate: LocalDate): List<AggregatedSteps> {
        val client = clientOrNull() ?: return emptyList()
        val start = startDate.atStartOfDay()
        val response = client.aggregateGroupByPeriod(
            AggregateGroupByPeriodRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(start, LocalDateTime.now()),
                timeRangeSlicer = Period.ofDays(1),
            ),
        )
        return response.mapNotNull { bucket ->
            val count = bucket.result[StepsRecord.COUNT_TOTAL] ?: return@mapNotNull null
            if (count <= 0) return@mapNotNull null
            AggregatedSteps(bucket.startTime.toLocalDate().toString(), count.toInt())
        }
    }

    /** Asleep stages counted toward "time asleep": sleeping (unspecified) + light/deep/REM. Excludes awake/in-bed. */
    private fun isAsleep(stage: Int): Boolean = when (stage) {
        SleepSessionRecord.STAGE_TYPE_SLEEPING,
        SleepSessionRecord.STAGE_TYPE_LIGHT,
        SleepSessionRecord.STAGE_TYPE_DEEP,
        SleepSessionRecord.STAGE_TYPE_REM -> true
        else -> false
    }
}
