package com.app.rasifiters.net

import com.app.rasifiters.core.kit.AppError
import kotlinx.serialization.json.Json
import retrofit2.HttpException

/** User-facing API error, parsed from the backend's { error } / { message } envelope.
 *  Carries the batch endpoint's per-row errors when present (Add-workouts form row highlighting). */
class ApiException(
    val status: Int,
    override val message: String,
    val rowErrors: List<BulkRowError>? = null,
    val code: String? = null,
    val retryAfter: Int? = null,
    /** The response's X-Request-Id (else the one we sent) — quoted by client events (observability §8, D-KIT-5). */
    val requestId: String? = null,
) : Exception(message)

private val errorJson = Json { ignoreUnknownKeys = true }

/** Map a Retrofit HttpException into an ApiException carrying the backend's message. Reads the body ONCE. */
fun HttpException.toApiException(): ApiException {
    val resp = response()
    val raw = try { resp?.errorBody()?.string() } catch (_: Exception) { null }
    val parsed = raw?.let { try { errorJson.decodeFromString<ErrorBody>(it) } catch (_: Exception) { null } }
    return ApiException(
        status = code(),
        message = parsed?.error ?: parsed?.message ?: "Request failed (${code()})",
        rowErrors = parsed?.rowErrors,
        code = parsed?.code,
        retryAfter = AppError.parseRetryAfter(resp?.headers()?.get("Retry-After")),
        requestId = resp?.headers()?.get(ClientHeadersInterceptor.REQUEST_ID)
            ?: resp?.raw()?.request?.header(ClientHeadersInterceptor.REQUEST_ID),
    )
}
