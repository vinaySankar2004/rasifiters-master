package com.app.rasifiters.health

import androidx.health.connect.client.records.ExerciseSessionRecord

/**
 * Maps every Health Connect `ExerciseSessionRecord` exercise type to a RaSi Fiters `workouts_library`
 * name — the Android analog of iOS `HealthKitWorkoutTypeMap` (specs/features/health-connect).
 *
 * Reconciliation policy (same as Apple Health):
 *   * ADDITIVE — the library keeps its existing curated names; a Health Connect type with a close
 *     existing equivalent REUSES that name (Cycling/Rowing/Boxing/Swim/HIIT Intervals/…), everything
 *     else uses the Apple Title-Case name that `apps/backend/sql/004_seed_healthkit_workout_types.sql`
 *     already seeded into the library.
 *   * INVARIANT — every string returned here MUST exist in `workouts_library` after migration 004, so a
 *     synced log resolves to a library-backed program workout (never an ad-hoc custom row). All targets
 *     below are a subset of the iOS map's targets, which are seeded/curated (verified against 004).
 */
object HealthConnectWorkoutTypeMap {

    /** The default-case name; also seeded into the library by migration 004. */
    const val FALLBACK_NAME = "Other Workout"

    fun workoutName(exerciseType: Int): String = when (exerciseType) {
        // ── Reuse existing curated library rows (close equivalents, no new row) ──
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING,
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Running"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING,
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Cycling"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING,
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "Rowing"
        ExerciseSessionRecord.EXERCISE_TYPE_BOXING -> "Boxing"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL,
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "Swim"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "HIIT Intervals"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "Yoga Flow"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "Pilates Core"
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "Dance Cardio"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING,
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "Stair Climber"
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "Stretching"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING,
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "Traditional Strength Training"
        ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS -> "Functional Training"

        // ── Map onto the Apple Title-Case library rows seeded by migration 004 ──
        ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AMERICAN -> "American Football"
        ExerciseSessionRecord.EXERCISE_TYPE_FOOTBALL_AUSTRALIAN -> "Australian Football"
        ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON -> "Badminton"
        ExerciseSessionRecord.EXERCISE_TYPE_BASEBALL -> "Baseball"
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "Basketball"
        ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING -> "Climbing"
        ExerciseSessionRecord.EXERCISE_TYPE_CRICKET -> "Cricket"
        ExerciseSessionRecord.EXERCISE_TYPE_FRISBEE_DISC -> "Disc Sports"
        ExerciseSessionRecord.EXERCISE_TYPE_SKIING -> "Downhill Skiing"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "Elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_FENCING -> "Fencing"
        ExerciseSessionRecord.EXERCISE_TYPE_GOLF -> "Golf"
        ExerciseSessionRecord.EXERCISE_TYPE_GYMNASTICS -> "Gymnastics"
        ExerciseSessionRecord.EXERCISE_TYPE_HANDBALL -> "Handball"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "Hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_ICE_HOCKEY,
        ExerciseSessionRecord.EXERCISE_TYPE_ROLLER_HOCKEY -> "Hockey"
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "Martial Arts"
        ExerciseSessionRecord.EXERCISE_TYPE_PADDLING -> "Paddle Sports"
        ExerciseSessionRecord.EXERCISE_TYPE_RACQUETBALL -> "Racquetball"
        ExerciseSessionRecord.EXERCISE_TYPE_RUGBY -> "Rugby"
        ExerciseSessionRecord.EXERCISE_TYPE_SAILING -> "Sailing"
        ExerciseSessionRecord.EXERCISE_TYPE_ICE_SKATING,
        ExerciseSessionRecord.EXERCISE_TYPE_SKATING -> "Skating Sports"
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWSHOEING -> "Snow Sports"
        ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING -> "Snowboarding"
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER -> "Soccer"
        ExerciseSessionRecord.EXERCISE_TYPE_SOFTBALL -> "Softball"
        ExerciseSessionRecord.EXERCISE_TYPE_SQUASH -> "Squash"
        ExerciseSessionRecord.EXERCISE_TYPE_SURFING -> "Surfing Sports"
        ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS -> "Table Tennis"
        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS -> "Tennis"
        ExerciseSessionRecord.EXERCISE_TYPE_SCUBA_DIVING -> "Underwater Diving"
        ExerciseSessionRecord.EXERCISE_TYPE_VOLLEYBALL -> "Volleyball"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Walking"
        ExerciseSessionRecord.EXERCISE_TYPE_WATER_POLO -> "Water Polo"
        ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR -> "Wheelchair Walk Pace"

        // `OTHER_WORKOUT`, boot camp, exercise class, guided breathing, paragliding, and any future/
        // unmapped case fall back — mirrors the iOS `.other` → "Other Workout".
        else -> FALLBACK_NAME
    }
}
