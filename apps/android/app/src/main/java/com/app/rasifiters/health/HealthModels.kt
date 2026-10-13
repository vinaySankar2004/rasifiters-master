package com.app.rasifiters.health

import androidx.health.connect.client.records.ExerciseSessionRecord
import com.app.rasifiters.net.HealthSyncItemDTO
import java.time.Duration
import java.time.Instant
import kotlin.math.roundToInt

/**
 * Value types shared across the Health Connect sync (the Android analog of the iOS
 * `HealthKitService.AggregatedWorkout/AggregatedSleep` + `PendingSyncConfirmation`).
 */

/** One Health Connect exercise session — a health-sync item of its own (one item per sample, §3.2). */
data class WorkoutSample(
    val uuid: String,       // ExerciseSessionRecord.metadata.id → sample_id
    val minutes: Double,    // raw (unrounded) duration of this one session
    val startAt: Instant,
    val endAt: Instant,
    val origin: String,     // metadata.dataOrigin.packageName
) {
    /** health-sync §3.2 `value`: max(1, round(seconds / 60)) per sample. */
    val wholeMinutes: Int get() = maxOf(1, minutes.roundToInt())

    companion object {
        fun of(r: ExerciseSessionRecord) = WorkoutSample(
            r.metadata.id, Duration.between(r.startTime, r.endTime).seconds / 60.0, r.startTime, r.endTime,
            r.metadata.dataOrigin.packageName,
        )
    }
}

/** A (mapped library name, calendar day) group of exercise sessions — one backend log per group. */
data class AggregatedWorkout(
    val workoutName: String,
    val date: String,               // yyyy-MM-dd (local)
    val samples: List<WorkoutSample>,
) {
    /** Whole-group minutes (min 1) — used for the confirmation-row display. */
    val durationMinutes: Int get() = minutes(samples)

    companion object {
        /** Rounded, floored-at-1 minutes for a subset (the per-program unapplied slice). */
        fun minutes(samples: List<WorkoutSample>): Int =
            maxOf(samples.sumOf { it.minutes }.roundToInt(), 1)
    }
}

/** A night's total time-asleep, bucketed by local wake-date. */
data class AggregatedSleep(
    val date: String,   // yyyy-MM-dd — local calendar date the sample ended on (the day you woke up)
    val hours: Double,  // total time asleep, 2 dp, clamped 0..24
)

/** A day's total step count, bucketed by local calendar date. */
data class AggregatedSteps(
    val date: String,   // yyyy-MM-dd (local)
    val count: Int,     // total steps for the day (the aggregate API dedups overlapping sources)
)

/**
 * A queued first-sync confirmation for ONE flow (workouts OR sleep), one page per program. Built by the
 * compute half of a sync and consumed by the confirmation screen, which commits a page's CHECKED rows
 * before advancing. Mirrors iOS `PendingSyncConfirmation`.
 */
data class PendingSyncConfirmation(
    val flow: Flow,
    val pages: List<ProgramPage>,
) {
    enum class Flow { WORKOUTS, SLEEP, STEPS }

    data class ProgramPage(
        val id: String,               // programId
        val programName: String,
        val rows: List<Row>,
    ) {
        val checkedCount: Int get() = rows.count { it.isChecked }
    }

    /** One displayable, selectable item. Carries the underlying aggregate so commit re-uses the exact
     *  same write call the silent path uses — no re-fetch, no drift. */
    data class Row(
        val title: String,            // workout name OR "Sleep"
        val subtitle: String,         // "Tue, Jul 1 · 42 min" OR "Tue, Jul 1 · 7.5 h"
        val exclusionKey: String,     // "programId|date|workoutName" OR "programId|date"
        val payload: Payload,
        val isChecked: Boolean = true,
    )

    sealed interface Payload {
        val ymd: String
        data class Workout(val workout: AggregatedWorkout) : Payload {
            override val ymd: String get() = workout.date
        }
        data class Sleep(val sleep: AggregatedSleep) : Payload {
            override val ymd: String get() = sleep.date
        }
        data class Steps(val steps: AggregatedSteps) : Payload {
            override val ymd: String get() = steps.date
        }
    }
}

/** One batch item + what its result feeds locally. programId null = a deletion; legacyKey = the old-ledger key it retires. */
data class PlannedItem(val dto: HealthSyncItemDTO, val flow: HealthStore.Flow, val programId: String?, val legacyKey: String? = null)

/** Per-kind result counts for sync.run (observability §8.1); `created` also feeds the sleep/steps "Synced N" count. */
class KindCounts {
    var sent = 0; var applied = 0; var created = 0; var unchanged = 0; var duplicate = 0
    var skipped = 0; var removed = 0; var invalid = 0

    fun add(status: String) {
        sent++
        when (status) {
            "created" -> { applied++; created++ }
            "updated" -> applied++
            "unchanged" -> unchanged++
            "duplicate", "recorded" -> duplicate++
            "removed" -> removed++
            "not_found" -> Unit
            "invalid" -> invalid++
            else -> if (status.startsWith("skipped")) skipped++
        }
    }
}

fun HealthStore.Flow.confirmationFlow(): PendingSyncConfirmation.Flow = when (this) {
    HealthStore.Flow.WORKOUTS -> PendingSyncConfirmation.Flow.WORKOUTS
    HealthStore.Flow.SLEEP -> PendingSyncConfirmation.Flow.SLEEP
    HealthStore.Flow.STEPS -> PendingSyncConfirmation.Flow.STEPS
}

/** Outcome of one sync run, consumed by "Sync Now" and Summary pull-to-refresh (auto triggers discard it). */
sealed interface HealthSyncResult {
    data class Synced(val count: Int) : HealthSyncResult   // count = applied (created + updated)
    object Failed : HealthSyncResult                       // couldn't reach the server (or read HC)
    object Skipped : HealthSyncResult                      // a guard bailed (disabled / already syncing / pending)
}
