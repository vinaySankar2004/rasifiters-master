package com.app.rasifiters.net

import kotlinx.serialization.json.JsonObject
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.Header
import retrofit2.http.Headers
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

    /** This device's session only (D-C14) — the Bearer and/or the body refresh token; called after the local teardown. */
    @POST("auth/logout")
    suspend fun logout(@Header("Authorization") bearer: String?, @Body body: LogoutRequest): MessageResponse

    @GET("auth/me")
    suspend fun me(): MeResponse

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): MessageResponse

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): MessageResponse

    // Social sign-in: exchange a Google id_token (existing member → login; new user → needs_profile + pending
    // session), then complete the pending profile. Both return the nullable-refresh OAuthResponse.
    @POST("auth/oauth")
    suspend fun oauth(@Body body: OAuthRequest): OAuthResponse

    @POST("auth/oauth/complete")
    suspend fun oauthComplete(@Header("Authorization") bearer: String, @Body body: OAuthCompleteRequest): OAuthResponse

    // Auth phase-2 (D-C10) — linked sign-in identities. Bearer auto-injected by the OkHttp auth layer.
    @GET("auth/identities")
    suspend fun listIdentities(): IdentitiesResponse

    @POST("auth/link")
    suspend fun linkIdentity(@Body body: LinkRequest): IdentitiesResponse

    @POST("auth/unlink")
    suspend fun unlinkIdentity(@Body body: UnlinkRequest): IdentitiesResponse

    @Headers("X-One-Shot: 1")
    @POST("auth/set-password")
    suspend fun setPassword(@Body body: SetPasswordRequest): IdentitiesResponse

    // ---- Programs ----
    @GET("programs")
    suspend fun getPrograms(): List<ProgramDTO>

    @POST("programs")
    suspend fun createProgram(@Body body: CreateProgramRequest): CreateProgramResponse

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

    @GET("analytics/health/steps")
    suspend fun getHealthSteps(
        @Query("programId") programId: String,
        @Query("memberId") memberId: String? = null,
    ): StepsStatsDTO

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

    @POST("daily-health-logs/batch")
    suspend fun addDailyHealthLogsBatch(@Body body: BulkHealthRequest): BulkHealthResult

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
        @Query("minSteps") minSteps: Int? = null,
        @Query("maxSteps") maxSteps: Int? = null,
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

    // JsonObject body so an explicit "gender": null survives explicitNulls=false (polish #44, as updateDailyHealthLog).
    @PUT("members/{id}")
    suspend fun updateMemberProfile(@Path("id") id: String, @Body body: JsonObject): MessageResponse

    @Headers("X-One-Shot: 1")
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

    // ---- Notifications — the inbox, unread counts, read marks, preferences (the /stream route is opened by
    // NotificationStreamClient with ?inbox=1; /unacknowledged + /:id/acknowledge are no longer used). ----
    @GET("notifications/inbox")
    suspend fun getInbox(@Query("limit") limit: Int? = null, @Query("before") before: String? = null): InboxPageDTO

    @GET("notifications/inbox/unread-count")
    suspend fun getUnreadCounts(): UnreadCountsDTO

    @POST("notifications/inbox/read")
    suspend fun markInboxRead(@Body body: InboxReadRequest): UnreadCountsDTO

    /** Remove one of this member's own items (404 = unknown / already gone) → fresh counts. */
    @DELETE("notifications/inbox/{id}")
    suspend fun removeInboxItem(@Path("id") id: String): UnreadCountsDTO

    /** Clear all — every notification (the invitations are separate and stay) → fresh counts. */
    @DELETE("notifications/inbox/all")
    suspend fun clearInbox(): UnreadCountsDTO

    @GET("notifications/preferences")
    suspend fun getNotificationPreferences(): NotificationPreferencesDTO

    @PUT("notifications/preferences")
    suspend fun putNotificationPreferences(@Body body: NotificationPreferencesUpdate): NotificationPreferencesDTO

    // FCM device-token lifecycle (notifications §3.1).
    @PUT("notifications/device")
    suspend fun registerDevice(@Body body: DeviceRegisterRequest): MessageResponse

    @POST("notifications/device/unregister")
    suspend fun unregisterDevice(@Body body: DeviceUnregisterRequest): MessageResponse

    // ---- Reliability Phase 3 (auth §3.1, invites §3.1, app-config §3, observability §8, health-sync §3) ----
    @POST("auth/logout-all")
    suspend fun logoutAll(): MessageResponse

    @GET("program-memberships/my-invites")
    suspend fun getMyInvites(): List<PendingInviteDTO>

    /** Global admins only (403 otherwise). */
    @GET("program-memberships/all-invites")
    suspend fun getAllInvites(): List<PendingInviteDTO>

    @PUT("program-memberships/invite-response")
    suspend fun respondToInvite(@Body body: InviteResponseRequest): MessageResponse

    @GET("app-config")
    suspend fun getAppConfig(): AppConfigResponse

    @POST("client-events")
    suspend fun postClientEvents(@Body body: ClientEventBatch): Response<ClientEventsResponse>

    @POST("health-sync/batch")
    suspend fun healthSyncBatch(@Body body: HealthSyncBatchRequest): HealthSyncBatchResponse

    @GET("health-sync/state")
    suspend fun getHealthSyncState(): HealthSyncStateResponse

    @PUT("health-sync/state")
    suspend fun putHealthSyncState(@Body body: HealthSyncStatePut): HealthSyncStateResponse

    // ---- People (list, profile, kudos give / undo, "Hide my activity") ----
    @GET("people")
    suspend fun getPeople(@Query("programId") programId: String): PeopleListDTO

    @GET("people/{memberId}")
    suspend fun getPerson(@Path("memberId") memberId: String, @Query("programId") programId: String): PersonProfileDTO

    @POST("people/{memberId}/kudos")
    suspend fun giveKudos(@Path("memberId") memberId: String, @Body body: KudosGiveRequest): KudosResponse

    @DELETE("people/{memberId}/kudos")
    suspend fun undoKudos(@Path("memberId") memberId: String): KudosResponse

    /** The "Hide my activity" switch only (own profile). */
    @PUT("members/{id}")
    suspend fun setHideActivity(@Path("id") id: String, @Body body: HideActivityRequest): HideActivityResponse
}
