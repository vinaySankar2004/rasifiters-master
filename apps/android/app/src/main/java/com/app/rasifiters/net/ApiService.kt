package com.app.rasifiters.net

import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.QueryMap

/**
 * Retrofit surface for the backend. One method per endpoint; grown per phase.
 * Auth header + 401 refresh are handled transparently by the OkHttp layer (see Network.kt),
 * so callers never thread the token manually.
 */
interface ApiService {

    // ---- Auth ----
    @POST("auth/login/app")
    suspend fun loginApp(@Body body: LoginRequest): AppLoginResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenRefreshResponse

    @POST("auth/logout")
    suspend fun logout(@Body body: LogoutRequest): MessageResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): MessageResponse

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): MessageResponse

    // ---- Programs ----
    @GET("programs")
    suspend fun getPrograms(): List<ProgramDTO>

    @PUT("programs/order")
    suspend fun saveProgramOrder(@Body body: ProgramOrderRequest): MessageResponse

    @DELETE("programs/{id}")
    suspend fun deleteProgram(@Path("id") id: String): MessageResponse

    @PUT("program-memberships")
    suspend fun updateMembership(@Body body: MembershipUpdateRequest): MessageResponse

    // ---- Analytics (Summary dashboard reads) ----
    @GET("analytics-v2/participation/mtd")
    suspend fun getMtdParticipation(@Query("programId") programId: String): MtdParticipationDTO

    @GET("analytics/workouts/total")
    suspend fun getTotalWorkoutsMtd(@Query("programId") programId: String): TotalWorkoutsMtdDTO

    @GET("analytics/duration/total")
    suspend fun getTotalDurationMtd(@Query("programId") programId: String): TotalDurationMtdDTO

    @GET("analytics/duration/average")
    suspend fun getAvgDurationMtd(@Query("programId") programId: String): AvgDurationMtdDTO

    @GET("analytics/timeline")
    suspend fun getActivityTimeline(
        @Query("period") period: String,
        @Query("programId") programId: String,
    ): ActivityTimelineResponse

    @GET("analytics/distribution/day")
    suspend fun getDistributionByDay(@Query("programId") programId: String): DistributionByDayDTO

    @GET("analytics/workouts/types")
    suspend fun getWorkoutTypes(
        @Query("programId") programId: String,
        @Query("limit") limit: Int = 100,
        @Query("memberId") memberId: String? = null,
    ): List<WorkoutTypeDTO>

    // ---- Lifestyle tab (Phase F) — health timeline + member-scoped workout-type analytics ----
    @GET("analytics/health/timeline")
    suspend fun getHealthTimeline(
        @Query("period") period: String,
        @Query("programId") programId: String,
        @Query("memberId") memberId: String? = null,
    ): HealthTimelineResponse

    @GET("analytics-v2/workouts/types/total")
    suspend fun getWorkoutTypesTotal(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String? = null,
    ): WorkoutTypesTotalDTO

    @GET("analytics-v2/workouts/types/most-popular")
    suspend fun getWorkoutTypeMostPopular(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String? = null,
    ): WorkoutTypeMostPopularDTO

    @GET("analytics-v2/workouts/types/longest-duration")
    suspend fun getWorkoutTypeLongestDuration(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String? = null,
    ): WorkoutTypeLongestDurationDTO

    @GET("analytics-v2/workouts/types/highest-participation")
    suspend fun getWorkoutTypeHighestParticipation(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String? = null,
    ): WorkoutTypeHighestParticipationDTO

    // ---- Log-form lookups ----
    @GET("program-memberships/members")
    suspend fun getProgramMembers(@Query("programId") programId: String): List<ProgramMemberDTO>

    @GET("program-workouts")
    suspend fun getProgramWorkouts(@Query("programId") programId: String): List<ProgramWorkoutDTO>

    // ---- Workout-types management (Lifestyle tab → manage; Phase F) ----
    @PUT("program-workouts/toggle-visibility")
    suspend fun toggleWorkoutVisibility(@Body body: ToggleWorkoutVisibilityRequest): MessageResponse

    @PUT("program-workouts/{id}/toggle-visibility")
    suspend fun toggleCustomWorkoutVisibility(@Path("id") id: String): MessageResponse

    @POST("program-workouts/custom")
    suspend fun addCustomWorkout(@Body body: AddCustomWorkoutRequest): MessageResponse

    @PUT("program-workouts/{id}")
    suspend fun editCustomWorkout(@Path("id") id: String, @Body body: EditCustomWorkoutRequest): MessageResponse

    @DELETE("program-workouts/{id}")
    suspend fun deleteCustomWorkout(@Path("id") id: String): MessageResponse

    // ---- Log-form writes ----
    @POST("workout-logs/batch")
    suspend fun addWorkoutLogsBatch(@Body body: BulkWorkoutRequest): BulkWorkoutResult

    @POST("daily-health-logs")
    suspend fun addDailyHealthLog(@Body body: DailyHealthRequest): MessageResponse

    // ---- Members tab (Phase E) — reads ----
    // Metrics carries ~20 optional filter params → a QueryMap of only the present (non-null) params.
    @GET("member-metrics")
    suspend fun getMemberMetrics(@QueryMap params: Map<String, String>): MemberMetricsResponse

    @GET("member-history")
    suspend fun getMemberHistory(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String,
        @Query("period") period: String,
    ): MemberHistoryResponse

    @GET("member-streaks")
    suspend fun getMemberStreaks(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String,
    ): MemberStreaksResponse

    @GET("member-recent")
    suspend fun getMemberRecent(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String,
        @Query("limit") limit: Int,
        @Query("startDate") startDate: String? = null,
        @Query("endDate") endDate: String? = null,
        @Query("sortBy") sortBy: String? = null,
        @Query("sortDir") sortDir: String? = null,
        @Query("workoutType") workoutType: String? = null,
        @Query("minDuration") minDuration: Int? = null,
        @Query("maxDuration") maxDuration: Int? = null,
    ): MemberRecentWorkoutsResponse

    @GET("daily-health-logs")
    suspend fun getMemberHealthLogs(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String,
        @Query("limit") limit: Int,
        @Query("startDate") startDate: String? = null,
        @Query("endDate") endDate: String? = null,
        @Query("sortBy") sortBy: String? = null,
        @Query("sortDir") sortDir: String? = null,
        @Query("minSleepHours") minSleepHours: Double? = null,
        @Query("maxSleepHours") maxSleepHours: Double? = null,
        @Query("minFoodQuality") minFoodQuality: Int? = null,
        @Query("maxFoodQuality") maxFoodQuality: Int? = null,
    ): MemberHealthLogResponse

    @GET("program-memberships/details")
    suspend fun getMembershipDetails(@Query("programId") programId: String): List<MembershipDetailDTO>

    // ---- Members tab (Phase E) — writes (Recent/Health edit-delete + membership + invite) ----
    @PUT("workout-logs")
    suspend fun updateWorkoutLog(@Body body: WorkoutLogUpdateRequest): MessageResponse

    @HTTP(method = "DELETE", path = "workout-logs", hasBody = true)
    suspend fun deleteWorkoutLog(@Body body: WorkoutLogDeleteRequest): MessageResponse

    // JsonObject body so explicit nulls survive (global Json has explicitNulls=false) — the backend
    // distinguishes present-null (clear the metric) from absent (leave unchanged) via hasOwnProperty.
    @PUT("daily-health-logs")
    suspend fun updateDailyHealthLog(@Body body: JsonObject): MessageResponse

    @HTTP(method = "DELETE", path = "daily-health-logs", hasBody = true)
    suspend fun deleteDailyHealthLog(@Body body: DailyHealthDeleteRequest): MessageResponse

    @PUT("program-memberships")
    suspend fun editMembership(@Body body: MembershipEditRequest): MessageResponse

    @HTTP(method = "DELETE", path = "program-memberships", hasBody = true)
    suspend fun removeMember(@Body body: MembershipRemoveRequest): MessageResponse

    @POST("program-memberships/invite")
    suspend fun sendInvite(@Body body: InviteRequest): MessageResponse

    // ---- Program tab (Phase G) — account settings + admin program management ----
    @GET("members/{id}")
    suspend fun getMember(@Path("id") id: String): MemberDTO

    @PUT("members/{id}")
    suspend fun updateMemberProfile(@Path("id") id: String, @Body body: UpdateMemberProfileRequest): MessageResponse

    @PUT("auth/change-password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): MessageResponse

    @PUT("auth/email")
    suspend fun changeEmail(@Body body: ChangeEmailRequest): ChangeEmailResponse

    @DELETE("auth/account")
    suspend fun deleteAccount(): MessageResponse

    @PUT("programs/{id}")
    suspend fun updateProgram(@Path("id") id: String, @Body body: UpdateProgramRequest): MessageResponse

    @PUT("program-memberships/leave")
    suspend fun leaveProgram(@Body body: LeaveProgramRequest): MessageResponse
}
