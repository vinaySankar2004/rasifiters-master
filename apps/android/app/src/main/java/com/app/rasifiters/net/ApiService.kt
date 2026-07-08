package com.app.rasifiters.net

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

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
    ): List<WorkoutTypeDTO>

    // ---- Log-form lookups ----
    @GET("program-memberships/members")
    suspend fun getProgramMembers(@Query("programId") programId: String): List<ProgramMemberDTO>

    @GET("program-workouts")
    suspend fun getProgramWorkouts(@Query("programId") programId: String): List<ProgramWorkoutDTO>

    // ---- Log-form writes ----
    @POST("workout-logs/batch")
    suspend fun addWorkoutLogsBatch(@Body body: BulkWorkoutRequest): BulkWorkoutResult

    @POST("daily-health-logs")
    suspend fun addDailyHealthLog(@Body body: DailyHealthRequest): MessageResponse
}
