package com.app.rasifiters.net

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

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
}
