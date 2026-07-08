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

/** Generic backend error envelope ({ error } or { message }); parsed for user-facing failures. */
@Serializable
data class ErrorBody(
    val error: String? = null,
    val message: String? = null,
)
