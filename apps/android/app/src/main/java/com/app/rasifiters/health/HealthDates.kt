package com.app.rasifiters.health

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Local-calendar date helpers shared by the workout/sleep aggregators and the per-program window
 * scoping (D-S5) — the Android analog of `ProgramContext.localYMD` / `date(_:isWithin:)`. ISO
 * `yyyy-MM-dd` strings sort lexicographically, so window checks are plain string comparison.
 */
object HealthDates {
    const val CATCH_UP_CAP_DAYS = 30L
    const val FIRST_SYNC_DAYS = 14L
    /** Exclusions older than the widest re-read window can never come back. */
    const val EXCLUSION_KEEP_DAYS = 31L

    /** `yyyy-MM-dd` for an instant in the device-local zone (how the aggregators bucket dates). */
    fun localYMD(instant: Instant): String = instant.atZone(ZoneId.systemDefault()).toLocalDate().toString()

    /** `yyyy-MM-dd` for an epoch-millis value in the device-local zone. */
    fun localYMD(epochMillis: Long): String = localDate(epochMillis).toString()

    fun localDate(epochMillis: Long): LocalDate = Instant.ofEpochMilli(epochMillis).atZone(ZoneId.systemDefault()).toLocalDate()

    fun startOfDay(date: LocalDate): Instant = date.atStartOfDay(ZoneId.systemDefault()).toInstant()

    /** Whether an item's `yyyy-MM-dd` date falls inside a program window (inclusive). */
    fun isWithin(ymd: String, start: String, end: String): Boolean = ymd in start..end

    /** health-sync §8 rule 4: max(start of the local day of lastSuccess − 1 day, today − 30 days); null → [firstSync] (also capped). */
    fun catchUpStart(lastSuccess: Instant?, firstSync: LocalDate, today: LocalDate = LocalDate.now()): LocalDate {
        val cap = today.minusDays(CATCH_UP_CAP_DAYS)
        val start = lastSuccess?.atZone(ZoneId.systemDefault())?.toLocalDate()?.minusDays(1) ?: firstSync
        return maxOf(start, cap)
    }
}
