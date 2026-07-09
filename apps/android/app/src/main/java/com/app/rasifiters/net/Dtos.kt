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

// ---- Lifestyle tab (Phase F) — health timeline + member-scoped workout-type analytics ----
// The Lifestyle tab reads workout-type stats scoped to the selected member (participation is always
// program-wide) + a sleep/diet health timeline. Same backend contract as web + iOS. Every count is
// COALESCEd server-side; defaults keep decode resilient.

/** One bucket of the sleep/diet health timeline (a day/week/month depending on `period`). */
@Serializable
data class HealthTimelinePoint(
    val date: String = "",
    val label: String = "",
    @SerialName("sleep_hours") val sleepHours: Double = 0.0,
    @SerialName("food_quality") val foodQuality: Double = 0.0,
)

/** GET /analytics/health/timeline — the Lifestyle-tab sleep-bars + diet-line chart + daily averages. */
@Serializable
data class HealthTimelineResponse(
    val mode: String? = null,
    val label: String = "",
    @SerialName("daily_average_sleep") val dailyAverageSleep: Double = 0.0,
    @SerialName("daily_average_food") val dailyAverageFood: Double = 0.0,
    val buckets: List<HealthTimelinePoint> = emptyList(),
    val start: String? = null,
    val end: String? = null,
)

/** GET /analytics-v2/workouts/types/total — the "Total workout types" card. */
@Serializable
data class WorkoutTypesTotalDTO(@SerialName("total_types") val totalTypes: Int = 0)

/** GET /analytics-v2/workouts/types/most-popular — the "Most popular" card (null name → no data). */
@Serializable
data class WorkoutTypeMostPopularDTO(
    @SerialName("workout_name") val workoutName: String? = null,
    val sessions: Int = 0,
)

/** GET /analytics-v2/workouts/types/longest-duration — the "Longest duration" card. */
@Serializable
data class WorkoutTypeLongestDurationDTO(
    @SerialName("workout_name") val workoutName: String? = null,
    @SerialName("avg_minutes") val avgMinutes: Int = 0,
)

/** GET /analytics-v2/workouts/types/highest-participation — the "Highest participation" card (program-wide). */
@Serializable
data class WorkoutTypeHighestParticipationDTO(
    @SerialName("workout_name") val workoutName: String? = null,
    val participants: Int = 0,
    @SerialName("participation_pct") val participationPct: Double = 0.0,
    @SerialName("total_members") val totalMembers: Int = 0,
)

// ---- Log-form lookups (member + workout pickers) ----

/** GET /program-memberships/members?programId — active roster for the log-form member picker. */
@Serializable
data class ProgramMemberDTO(
    val id: String,
    @SerialName("member_name") val memberName: String = "",
    val username: String? = null,
)

/**
 * GET /program-workouts?programId — the program's workout catalog. Log-form lookups filter `is_hidden`
 * out; the Lifestyle-tab workout-types manager (Phase F) keeps the full list so admins can show/hide.
 * `source` is "global" (library — hide/show only) or "custom" (per-program — edit/delete/hide).
 */
@Serializable
data class ProgramWorkoutDTO(
    val id: String? = null,
    @SerialName("workout_name") val workoutName: String = "",
    val source: String? = null,
    @SerialName("is_hidden") val isHidden: Boolean = false,
    @SerialName("library_workout_id") val libraryWorkoutId: String? = null,
) {
    val isGlobal: Boolean get() = source == "global"
    val isCustom: Boolean get() = source == "custom"
}

/** PUT /program-workouts/toggle-visibility — hide/show a GLOBAL (library) type in this program. */
@Serializable
data class ToggleWorkoutVisibilityRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("library_workout_id") val libraryWorkoutId: String,
)

/** POST /program-workouts/custom — add a per-program custom workout type. */
@Serializable
data class AddCustomWorkoutRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("workout_name") val workoutName: String,
)

/** PUT /program-workouts/{id} — rename a custom workout type. */
@Serializable
data class EditCustomWorkoutRequest(@SerialName("workout_name") val workoutName: String)

// ---- Writes: workout-logs batch + daily-health ----

/** One row of the multi-row Add-workouts form. `duration` is total minutes (positive whole number). */
@Serializable
data class BulkWorkoutEntry(
    @SerialName("member_id") val memberId: String,
    @SerialName("workout_name") val workoutName: String,
    val date: String,
    val duration: Int,
)

/** POST /workout-logs/batch body — atomic all-or-nothing multi-row insert. */
@Serializable
data class BulkWorkoutRequest(
    @SerialName("program_id") val programId: String,
    val entries: List<BulkWorkoutEntry>,
)

/** POST /workout-logs/batch success envelope. */
@Serializable
data class BulkWorkoutResult(
    val created: Int = 0,
    val updated: Int = 0,
    @SerialName("total_minutes") val totalMinutes: Int = 0,
    val groups: Int = 0,
    @SerialName("total_entries") val totalEntries: Int = 0,
)

/** Per-row batch validation/duplicate error (indexed by submit order); `field:"duplicate"` is row-level. */
@Serializable
data class BulkRowError(
    val index: Int = 0,
    val field: String = "",
    val message: String = "",
)

/** POST /daily-health-logs body. `food_quality` is omitted (≡ null) when cleared; sleep omitted when blank. */
@Serializable
data class DailyHealthRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("log_date") val logDate: String,
    @SerialName("member_id") val memberId: String? = null,
    @SerialName("sleep_hours") val sleepHours: Double? = null,
    @SerialName("food_quality") val foodQuality: Int? = null,
)

// ---- Members tab (Phase E) — metrics / history / streaks / recent / health / membership ----
// The member-analytics reads. NOTE the wire-casing split (faithful to the backend contract):
//   • member-metrics + member-history responses use snake_case keys → @SerialName.
//   • member-streaks + member-recent + daily-health-logs responses use camelCase keys → no @SerialName.
// Every count is COALESCEd server-side; defaults keep decode resilient. Optional metrics arrive null.

/** One member's row in the performance-metrics leaderboard (GET /member-metrics). */
@Serializable
data class MemberMetricsDTO(
    @SerialName("member_id") val memberId: String = "",
    @SerialName("member_name") val memberName: String = "",
    val username: String? = null,
    val workouts: Int = 0,
    @SerialName("total_duration") val totalDuration: Int = 0,
    @SerialName("avg_duration") val avgDuration: Int = 0,
    @SerialName("avg_sleep_hours") val avgSleepHours: Double? = null,
    @SerialName("active_days") val activeDays: Int = 0,
    @SerialName("workout_types") val workoutTypes: Int = 0,
    @SerialName("current_streak") val currentStreak: Int = 0,
    @SerialName("longest_streak") val longestStreak: Int = 0,
    @SerialName("avg_food_quality") val avgFoodQuality: Int? = null,
    @SerialName("mtd_workouts") val mtdWorkouts: Int? = null,
    @SerialName("total_hours") val totalHours: Int? = null,
    @SerialName("favorite_workout") val favoriteWorkout: String? = null,
)

/** GET /member-metrics envelope. `members.first()` (with `memberId` filter) IS the selected-member overview. */
@Serializable
data class MemberMetricsResponse(
    @SerialName("program_id") val programId: String? = null,
    val total: Int = 0,
    val filtered: Int = 0,
    val sort: String? = null,
    val direction: String? = null,
    @SerialName("date_range") val dateRange: DateRangeDTO? = null,
    val members: List<MemberMetricsDTO> = emptyList(),
)

@Serializable
data class DateRangeDTO(val start: String? = null, val end: String? = null)

/** One bucket of a member's workout-history timeline (GET /member-history). */
@Serializable
data class MemberHistoryPoint(
    val date: String = "",
    val label: String = "",
    val workouts: Int = 0,
)

/** GET /member-history envelope (per-member W/M/Y/P chart). */
@Serializable
data class MemberHistoryResponse(
    val period: String = "",
    val label: String = "",
    @SerialName("daily_average") val dailyAverage: Double = 0.0,
    val start: String = "",
    val end: String = "",
    val buckets: List<MemberHistoryPoint> = emptyList(),
)

/** GET /member-streaks — server-computed current/longest streaks + the milestone ladder (camelCase wire). */
@Serializable
data class MemberStreaksResponse(
    val currentStreakDays: Int = 0,
    val longestStreakDays: Int = 0,
    val milestones: List<MilestoneDTO> = emptyList(),
)

@Serializable
data class MilestoneDTO(val dayValue: Int = 0, val achieved: Boolean = false)

/** One row of a member's recent-workouts list (GET /member-recent; camelCase wire). */
@Serializable
data class MemberRecentItem(
    val id: String = "",
    val workoutType: String = "",
    val workoutDate: String = "",
    val durationMinutes: Int = 0,
)

@Serializable
data class MemberRecentWorkoutsResponse(
    val items: List<MemberRecentItem> = emptyList(),
    val total: Int = 0,
)

/** One row of a member's daily-health list (GET /daily-health-logs; camelCase wire). */
@Serializable
data class MemberHealthItem(
    val id: String = "",
    val logDate: String = "",
    val sleepHours: Double? = null,
    val foodQuality: Int? = null,
)

@Serializable
data class MemberHealthLogResponse(
    val items: List<MemberHealthItem> = emptyList(),
    val total: Int = 0,
)

/** GET /program-memberships/details — the roster editor's rich membership row (snake_case wire). */
@Serializable
data class MembershipDetailDTO(
    @SerialName("member_id") val memberId: String = "",
    @SerialName("member_name") val memberName: String = "",
    val username: String? = null,
    val gender: String? = null,
    @SerialName("date_of_birth") val dateOfBirth: String? = null,
    @SerialName("date_joined") val dateJoined: String? = null,
    @SerialName("global_role") val globalRole: String? = null,
    @SerialName("program_role") val programRole: String = "member",
    @SerialName("is_active") val isActive: Boolean = true,
    val status: String? = null,
    @SerialName("joined_at") val joinedAt: String? = null,
)

/** PUT /workout-logs — edit a log's duration (member_name only when editing another member's log; F3). */
@Serializable
data class WorkoutLogUpdateRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("member_name") val memberName: String? = null,
    @SerialName("workout_name") val workoutName: String,
    val date: String,
    val duration: Int,
)

/** DELETE /workout-logs (body). `member_id` scopes to the target member; falls back to requester. */
@Serializable
data class WorkoutLogDeleteRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("member_id") val memberId: String? = null,
    @SerialName("member_name") val memberName: String? = null,
    @SerialName("workout_name") val workoutName: String,
    val date: String,
)

/** DELETE /daily-health-logs (body). `member_id` always sent (F3). */
@Serializable
data class DailyHealthDeleteRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("member_id") val memberId: String? = null,
    @SerialName("log_date") val logDate: String,
)

/** PUT /program-memberships — global-admin membership edit (role optional; is_active + joined_at). */
@Serializable
data class MembershipEditRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("member_id") val memberId: String,
    val role: String? = null,
    @SerialName("is_active") val isActive: Boolean? = null,
    @SerialName("joined_at") val joinedAt: String? = null,
)

/** DELETE /program-memberships (body) — remove a member from the program. */
@Serializable
data class MembershipRemoveRequest(
    @SerialName("program_id") val programId: String,
    @SerialName("member_id") val memberId: String,
)

/** POST /program-memberships/invite — privacy-safe username invite (backend swallows non-AppError → 200). */
@Serializable
data class InviteRequest(
    @SerialName("program_id") val programId: String,
    val username: String,
)

// ---- Program tab (Phase G) — account + program-management mutations ----
// The account settings + admin program-edit contracts. Same backend as web + iOS.

/** GET /members/:id — the account-profile read. Only this endpoint returns `email` (list endpoints omit
 *  it); My Profile reads it for the web-parity email-change form. `member_name` splits into first/last. */
@Serializable
data class MemberDTO(
    val id: String = "",
    @SerialName("member_name") val memberName: String = "",
    val username: String? = null,
    val gender: String? = null,
    @SerialName("date_of_birth") val dateOfBirth: String? = null,
    @SerialName("date_joined") val dateJoined: String? = null,
    val email: String? = null,
)

/** PUT /members/:id — edit own profile (first/last/gender). Omitted (null) fields are left unchanged. */
@Serializable
data class UpdateMemberProfileRequest(
    @SerialName("first_name") val firstName: String? = null,
    @SerialName("last_name") val lastName: String? = null,
    val gender: String? = null,
)

/** PUT /auth/change-password — set a new password for the authenticated user. */
@Serializable
data class ChangePasswordRequest(@SerialName("new_password") val newPassword: String)

/** PUT /auth/email — direct, password-confirmed email change (no verification email; mirrors web). */
@Serializable
data class ChangeEmailRequest(
    @SerialName("new_email") val newEmail: String,
    val password: String,
)

@Serializable
data class ChangeEmailResponse(val email: String? = null, val message: String? = null)

/** PUT /programs/:id — admin program edit. Omitted (null) fields unchanged (explicitNulls=false). */
@Serializable
data class UpdateProgramRequest(
    val name: String? = null,
    val status: String? = null,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    @SerialName("admin_only_data_entry") val adminOnlyDataEntry: Boolean? = null,
)

/** PUT /program-memberships/leave — soft leave (workout/health data preserved for a possible rejoin). */
@Serializable
data class LeaveProgramRequest(@SerialName("program_id") val programId: String)

/** Generic backend error envelope ({ error } or { message }); parsed for user-facing failures.
 *  `rowErrors` rides along on the batch endpoint's 400/409 so the form can highlight offending rows. */
@Serializable
data class ErrorBody(
    val error: String? = null,
    val message: String? = null,
    val rowErrors: List<BulkRowError>? = null,
)
