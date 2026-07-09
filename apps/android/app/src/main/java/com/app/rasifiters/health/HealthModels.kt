package com.app.rasifiters.health

import kotlin.math.roundToInt

/**
 * Value types shared across the Health Connect sync (the Android analog of the iOS
 * `HealthKitService.AggregatedWorkout/AggregatedSleep` + `PendingSyncConfirmation`).
 */

/** One contributing Health Connect exercise session — the idempotency-ledger identity (D-SUM) + its minutes. */
data class WorkoutSample(
    val uuid: String,     // ExerciseSessionRecord.metadata.id
    val minutes: Double,  // raw (unrounded) duration of this one session
)

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

/** Outcome of one sync run, consumed only by the manual "Sync Now" button (auto triggers discard it). */
sealed interface HealthSyncResult {
    data class Synced(val count: Int) : HealthSyncResult   // clean run; count = created + summed
    object Failed : HealthSyncResult                       // couldn't reach the server (or read HC)
    object Skipped : HealthSyncResult                      // a guard bailed (disabled / already syncing / pending)
}
