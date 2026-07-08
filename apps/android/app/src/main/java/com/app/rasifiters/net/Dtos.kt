package com.app.rasifiters.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * DTOs for the RaSi Fiters backend contract (shared with web + iOS clients).
 * snake_case wire names ↔ camelCase Kotlin via @SerialName. Grown per phase; auth lives here.
 */

// ---- Auth ----

@Serializable
data class LoginRequest(
    val identifier: String,
    val password: String,
    @SerialName("push_token") val pushToken: String? = null,
    @SerialName("device_id") val deviceId: String? = null,
)

/** Response of POST /auth/login/app — the mobile login (carries member_id + identity). */
@Serializable
data class AppLoginResponse(
    val token: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("member_id") val memberId: String? = null,
    val username: String? = null,
    @SerialName("member_name") val memberName: String? = null,
    @SerialName("global_role") val globalRole: String? = null,
    val message: String? = null,
)

@Serializable
data class RefreshRequest(@SerialName("refresh_token") val refreshToken: String)

@Serializable
data class TokenRefreshResponse(
    val token: String,
    @SerialName("refresh_token") val refreshToken: String,
    val message: String? = null,
)

@Serializable
data class LogoutRequest(@SerialName("refresh_token") val refreshToken: String? = null)

/** GET /auth/me — DB-free identity echo used to self-heal member_id/global_role on relaunch. */
@Serializable
data class MeResponse(
    @SerialName("member_id") val memberId: String? = null,
    val username: String? = null,
    @SerialName("member_name") val memberName: String? = null,
    @SerialName("global_role") val globalRole: String? = null,
)

@Serializable
data class RegisterRequest(
    @SerialName("first_name") val firstName: String,
    @SerialName("last_name") val lastName: String,
    val username: String,
    val email: String,
    val password: String,
    val gender: String? = null,
)

@Serializable
data class MessageResponse(val message: String? = null)

@Serializable
data class ForgotPasswordRequest(val email: String)

// ---- Programs ----

/**
 * GET /programs row — the "My Programs" card model (shared with web + iOS).
 * The array arrives in the member's saved order (unordered trailing by start_date); rendered as-is.
 * `my_role`/`my_status` are null when a global_admin views a program they aren't a member of.
 * Members counts / progress are COALESCEd to 0 server-side, so the ints never arrive null.
 */
@Serializable
data class ProgramDTO(
    val id: String,
    val name: String,
    val status: String? = null,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("active_members") val activeMembers: Int = 0,
    @SerialName("total_members") val totalMembers: Int = 0,
    @SerialName("progress_percent") val progressPercent: Int = 0,
    @SerialName("my_role") val myRole: String? = null,
    @SerialName("my_status") val myStatus: String? = null,
    @SerialName("admin_only_data_entry") val adminOnlyDataEntry: Boolean = false,
)

/** PUT /programs/order — the full display order (invited/requested rows included). */
@Serializable
data class ProgramOrderRequest(@SerialName("program_ids") val programIds: List<String>)

/** PUT /program-memberships — inline invite Accept ("active") / Decline / Cancel ("removed"). */
@Serializable
data class MembershipUpdateRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("member_id") val memberId: String,
    val status: String,
)

// ---- Analytics (Summary dashboard) ----
// The 7 reads that feed the Summary tab cards (shared contract with web + iOS). Every count is
// COALESCEd server-side, so ints never arrive null; defaults keep decode resilient to sparse rows.

/** GET /analytics-v2/participation/mtd — the MTD participation card. */
@Serializable
data class MtdParticipationDTO(
    @SerialName("total_members") val totalMembers: Int = 0,
    @SerialName("active_members") val activeMembers: Int = 0,
    @SerialName("participation_pct") val participationPct: Double = 0.0,
    @SerialName("change_pct") val changePct: Double = 0.0,
)

/** GET /analytics/workouts/total — the Total Workouts (MTD) card. */
@Serializable
data class TotalWorkoutsMtdDTO(
    @SerialName("total_workouts") val totalWorkouts: Int = 0,
    @SerialName("change_pct") val changePct: Double = 0.0,
)

/** GET /analytics/duration/total — the Total Duration (MTD) card; minutes → hours client-side. */
@Serializable
data class TotalDurationMtdDTO(
    @SerialName("total_minutes") val totalMinutes: Int = 0,
    @SerialName("change_pct") val changePct: Double = 0.0,
)

/** GET /analytics/duration/average — the Avg Duration (MTD) card. */
@Serializable
data class AvgDurationMtdDTO(
    @SerialName("avg_minutes") val avgMinutes: Int = 0,
    @SerialName("change_pct") val changePct: Double = 0.0,
)

/** One bucket of the activity timeline (a day/week/month depending on `period`). */
@Serializable
data class ActivityTimelinePoint(
    val date: String = "",
    val label: String = "",
    val workouts: Int = 0,
    @SerialName("active_members") val activeMembers: Int = 0,
)

/** GET /analytics/timeline?period&programId — the activity-timeline chart card. */
@Serializable
data class ActivityTimelineResponse(
    val mode: String? = null,
    val label: String = "",
    @SerialName("daily_average") val dailyAverage: Double = 0.0,
    val buckets: List<ActivityTimelinePoint> = emptyList(),
)

/** GET /analytics/distribution/day — workouts-by-day-of-week (Sun–Sat) for the distribution chart. */
@Serializable
data class DistributionByDayDTO(
    @SerialName("Sunday") val sunday: Int = 0,
    @SerialName("Monday") val monday: Int = 0,
    @SerialName("Tuesday") val tuesday: Int = 0,
    @SerialName("Wednesday") val wednesday: Int = 0,
    @SerialName("Thursday") val thursday: Int = 0,
    @SerialName("Friday") val friday: Int = 0,
    @SerialName("Saturday") val saturday: Int = 0,
) {
    /** Sun→Sat ordered counts, ready for the 7-bar distribution chart. */
    fun ordered(): List<Int> = listOf(sunday, monday, tuesday, wednesday, thursday, friday, saturday)
}

/** GET /analytics/workouts/types — a workout type row for the Top Workout Types card. */
@Serializable
data class WorkoutTypeDTO(
    @SerialName("workout_name") val workoutName: String = "",
    val sessions: Int = 0,
    @SerialName("total_duration") val totalDuration: Int = 0,
    @SerialName("avg_duration_minutes") val avgDurationMinutes: Int = 0,
)

/** Generic backend error envelope ({ error } or { message }); parsed for user-facing failures. */
@Serializable
data class ErrorBody(
    val error: String? = null,
    val message: String? = null,
)
