package com.app.rasifiters.net

import kotlinx.serialization.json.Json
import retrofit2.HttpException

/** User-facing API error, parsed from the backend's { error } / { message } envelope.
 *  Carries the batch endpoint's per-row errors when present (Add-workouts form row highlighting). */
class ApiException(
    val status: Int,
    override val message: String,
    val rowErrors: List<BulkRowError>? = null,
) : Exception(message)

private val errorJson = Json { ignoreUnknownKeys = true }

/** Map a Retrofit HttpException into an ApiException carrying the backend's message. */
fun HttpException.toApiException(): ApiException {
    val raw = try {
        response()?.errorBody()?.string()
    } catch (_: Exception) {
        null
    }
    val parsed = raw?.let {
        try {
            errorJson.decodeFromString<ErrorBody>(it)
        } catch (_: Exception) {
            null
        }
    }
    val msg = parsed?.error ?: parsed?.message ?: "Request failed (${code()})"
    return ApiException(code(), msg, parsed?.rowErrors)
}
