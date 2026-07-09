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

    /** `yyyy-MM-dd` for an instant in the device-local zone (how the aggregators bucket dates). */
    fun localYMD(instant: Instant): String =
        LocalDate.ofInstant(instant, ZoneId.systemDefault()).toString()

    /** `yyyy-MM-dd` for an epoch-millis value in the device-local zone. */
    fun localYMD(epochMillis: Long): String =
        LocalDate.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneId.systemDefault()).toString()

    /** Whether an item's `yyyy-MM-dd` date falls inside a program window (inclusive). */
    fun isWithin(ymd: String, start: String, end: String): Boolean = ymd in start..end
}
