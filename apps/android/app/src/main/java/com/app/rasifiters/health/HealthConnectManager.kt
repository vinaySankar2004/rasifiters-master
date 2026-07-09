package com.app.rasifiters.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
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
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

/**
 * Health Connect access for workout + sleep auto-sync — the Android analog of iOS `HealthKitService`
 * (+`+Sleep`): availability, read authorization, incremental (changes-token) workout fetch,
 * rolling-window sleep fetch, and same-type/same-day (workouts) / per-night (sleep) aggregation.
 *
 * Anchor integrity: `fetchNewWorkouts` returns the new changes token to the caller (the sync
 * orchestration), which commits it via [HealthStore.workoutChangesToken] ONLY after the backend sync
 * succeeds — so a failed upload is retried on the next trigger instead of being silently skipped (iOS
 * `commitAnchor` after success).
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

    // MARK: - Workouts (incremental via the changes token — the anchored-query analog)

    data class WorkoutFetchResult(val records: List<ExerciseSessionRecord>, val newToken: String?)

    /**
     * Fetch exercise sessions added/changed since the saved changes token. On the first sync (null token)
     * only sessions from the connect date forward are read (no arbitrary backfill), then a fresh token is
     * minted for future incremental fetches. Does NOT persist the token — the caller commits it after a
     * successful sync. An expired token falls back to a full read from the connect date + a fresh token.
     */
    suspend fun fetchNewWorkouts(connectMillis: Long, savedToken: String?): WorkoutFetchResult {
        val client = clientOrNull() ?: return WorkoutFetchResult(emptyList(), savedToken)
        val recordTypes = setOf(ExerciseSessionRecord::class)

        if (savedToken == null) {
            val records = readWorkoutsSince(client, connectMillis)
            val token = client.getChangesToken(ChangesTokenRequest(recordTypes))
            return WorkoutFetchResult(records, token)
        }

        var token: String = savedToken
        val records = mutableListOf<ExerciseSessionRecord>()
        while (true) {
            val response = client.getChanges(token)
            if (response.changesTokenExpired) {
                val full = readWorkoutsSince(client, connectMillis)
                val fresh = client.getChangesToken(ChangesTokenRequest(recordTypes))
                return WorkoutFetchResult(full, fresh)
            }
            response.changes.forEach { change ->
                if (change is UpsertionChange) (change.record as? ExerciseSessionRecord)?.let(records::add)
            }
            token = response.nextChangesToken
            if (!response.hasMore) break
        }
        return WorkoutFetchResult(records, token)
    }

    private suspend fun readWorkoutsSince(client: HealthConnectClient, connectMillis: Long): List<ExerciseSessionRecord> {
        val start = if (connectMillis > 0) Instant.ofEpochMilli(connectMillis) else Instant.EPOCH
        return client.readRecords(
            ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.after(start)),
        ).records
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
            val minutes = Duration.between(record.startTime, record.endTime).seconds / 60.0
            grouped.getOrPut("$name||$date") { mutableListOf() }
                .add(WorkoutSample(uuid = record.metadata.id, minutes = minutes))
        }
        return grouped.mapNotNull { (key, samples) ->
            val parts = key.split("||")
            if (parts.size != 2) null else AggregatedWorkout(parts[0], parts[1], samples)
        }
    }

    // MARK: - Sleep (rolling look-back window — NOT anchored, NOT connect-date floored)

    /** How many days back each sleep sync re-queries — a rolling ~2-week window (iOS `sleepRecentDays`). */
    val sleepRecentDays: Int = 14

    /**
     * Re-query sleep sessions across the last [sleepRecentDays] so each night is recomputed from its full
     * sample set. Starts at the START OF DAY [sleepRecentDays] ago (so the earliest night is whole) — NOT
     * floored at the connect date (which would collapse same-day connects to `[today, today]`). Which of
     * these nights land in a program is decided per-program at write time.
     */
    suspend fun fetchSleepSamples(): List<SleepSessionRecord> {
        val client = clientOrNull() ?: return emptyList()
        val now = Instant.now()
        val startOfToday = LocalDate.now(ZoneId.systemDefault()).atStartOfDay(ZoneId.systemDefault()).toInstant()
        val start = startOfToday.minus(sleepRecentDays.toLong(), ChronoUnit.DAYS)
        return client.readRecords(
            ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, now)),
        ).records
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

    // MARK: - Steps (rolling look-back window — same rolling shape as sleep, aggregated per day)

    /** How many days back each steps sync re-queries — a rolling ~2-week window (iOS `stepsRecentDays`). */
    val stepsRecentDays: Int = 14

    /**
     * Total steps per local calendar day across the last [stepsRecentDays], via
     * `aggregateGroupByPeriod` with `StepsRecord.COUNT_TOTAL` (the HC analogue of HKStatistics
     * cumulative-sum: it dedups overlapping sources so a phone + a watch don't double-count). Emits a row
     * only when the day's total is > 0. Which of these days land in a program is decided per-program at
     * write time.
     */
    suspend fun fetchStepsDailyTotals(): List<AggregatedSteps> {
        val client = clientOrNull() ?: return emptyList()
        val zone = ZoneId.systemDefault()
        val start = LocalDate.now(zone).minusDays(stepsRecentDays.toLong()).atStartOfDay()
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
