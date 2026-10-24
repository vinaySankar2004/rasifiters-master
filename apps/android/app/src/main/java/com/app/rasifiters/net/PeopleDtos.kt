package com.app.rasifiters.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// The People API contract — the list, a profile, kudos give / undo and the "Hide my activity" switch.

/** `GET /api/people?programId` — the People list. */
@Serializable
data class PeopleListDTO(
    @SerialName("program_id") val programId: String = "",
    val viewer: PeopleViewerDTO = PeopleViewerDTO(),
    val people: List<PersonRowDTO> = emptyList(),
)

@Serializable
data class PeopleViewerDTO(
    @SerialName("member_id") val memberId: String = "",
    @SerialName("is_staff") val isStaff: Boolean = false,
)

/** One People row — server order ("You" first, then A→Z); [lastActive] null when none or not visible. */
@Serializable
data class PersonRowDTO(
    @SerialName("member_id") val memberId: String,
    @SerialName("member_name") val memberName: String = "",
    val initials: String = "?",
    val username: String = "",
    @SerialName("program_role") val programRole: String = "member",
    @SerialName("is_you") val isYou: Boolean = false,
    @SerialName("activity_visible") val activityVisible: Boolean = false,
    @SerialName("last_active") val lastActive: String? = null,
)

/** `GET /api/people/:memberId?programId` — [stats] / [recentWorkouts] / [kudos] are null when not visible. */
@Serializable
data class PersonProfileDTO(
    @SerialName("program_id") val programId: String = "",
    @SerialName("member_id") val memberId: String,
    @SerialName("member_name") val memberName: String = "",
    val initials: String = "?",
    val username: String = "",
    @SerialName("program_role") val programRole: String = "member",
    @SerialName("is_you") val isYou: Boolean = false,
    @SerialName("joined_at") val joinedAt: String? = null,
    @SerialName("activity_visible") val activityVisible: Boolean = false,
    /** The viewer hid their own activity, so co-members' activity is hidden from them (the switch is reciprocal). */
    @SerialName("viewer_hides_activity") val viewerHidesActivity: Boolean = false,
    @SerialName("can_open_full_stats") val canOpenFullStats: Boolean = false,
    val stats: PersonStatsDTO? = null,
    @SerialName("recent_workouts") val recentWorkouts: List<PersonWorkoutDTO>? = null,
    val kudos: KudosDTO? = null,
)

@Serializable
data class PersonStatsDTO(
    @SerialName("current_streak") val currentStreak: Int = 0,
    @SerialName("longest_streak") val longestStreak: Int = 0,
    @SerialName("active_days_this_month") val activeDaysThisMonth: Int = 0,
    @SerialName("last_active") val lastActive: String? = null,
)

@Serializable
data class PersonWorkoutDTO(
    @SerialName("workout_type") val workoutType: String = "",
    val date: String = "",
    @SerialName("duration_minutes") val durationMinutes: Int = 0,
)

/** The profile's kudos block. */
@Serializable
data class KudosDTO(
    val count: Int = 0,
    @SerialName("given_today") val givenToday: Boolean = false,
    @SerialName("can_give") val canGive: Boolean = false,
)

/** The kudos give body. */
@Serializable
data class KudosGiveRequest(@SerialName("program_id") val programId: String)

/** Give: `{ kudos: { count, given_today } }` · undo: `{ kudos: { given_today, removed } }` (undo carries NO count). */
@Serializable
data class KudosResponse(val kudos: KudosResultDTO = KudosResultDTO())

@Serializable
data class KudosResultDTO(
    val count: Int? = null,
    @SerialName("given_today") val givenToday: Boolean = false,
    val removed: Boolean? = null,
)

/** `PUT /members/:id` with only the "Hide my activity" switch (no default → always encoded). */
@Serializable
data class HideActivityRequest(@SerialName("hide_activity") val hideActivity: Boolean)

/** The PUT's echo — null when the server predates People (it ignored the key): NOT saved (PeopleStore treats it as a
 *  failure). */
@Serializable
data class HideActivityResponse(@SerialName("hide_activity") val hideActivity: Boolean? = null)
