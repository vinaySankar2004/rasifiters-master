package com.app.rasifiters.core.kit

import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.AuthUnavailableException
import com.app.rasifiters.net.BulkRowError
import com.app.rasifiters.net.toApiException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.serialization.SerializationException
import retrofit2.HttpException
import java.io.IOException
import java.io.InterruptedIOException
import kotlin.coroutines.cancellation.CancellationException

/** The shared error vocabulary (frontend-kit SPEC §4) — identical kinds, status rules and copy on web
 *  (`src/lib/kit/app-error.ts`) and iOS (`Shared/Kit/AppError.swift`). The kit only LABELS errors; it never
 *  signs anyone out (sign-out policy is the sessions contract, DESIGN_BOARD §2).
 *
 *  Scope rule — credential endpoints (SPEC §4): on login, sign-up, OAuth, link/unlink, set/change password
 *  and the email re-auth, a 401 means wrong credentials, not an ended session. Those callers keep the
 *  server's own text and must NOT route a 401 through [toAppError] / [AppErrorKind.SIGNED_OUT]. */
enum class AppErrorKind {
    OFFLINE, TIMEOUT, SIGNED_OUT, FORBIDDEN, NOT_FOUND, CONFLICT, INVALID_INPUT, UPDATE_REQUIRED, UNAVAILABLE, SERVER, UNKNOWN,
}

data class AppError(
    val kind: AppErrorKind,
    /** User-facing copy (raw server text only for INVALID_INPUT or when [rowErrors] are present). */
    val message: String = KitCopy.messageFor(kind),
    val status: Int? = null,
    /** Backend machine code when known (session_invalid, auth_unavailable). Never changes [kind]. */
    val code: String? = null,
    /** Whole seconds from a Retry-After header (UNAVAILABLE). */
    val retryAfterSeconds: Int? = null,
    /** Per-row errors from the batch log endpoints (Add-workouts / Add-health row highlighting). */
    val rowErrors: List<BulkRowError>? = null,
) {
    val retryable: Boolean
        get() = when (kind) {
            AppErrorKind.OFFLINE, AppErrorKind.TIMEOUT, AppErrorKind.UNAVAILABLE,
            AppErrorKind.SERVER, AppErrorKind.UNKNOWN -> true
            AppErrorKind.SIGNED_OUT, AppErrorKind.FORBIDDEN, AppErrorKind.NOT_FOUND, AppErrorKind.CONFLICT,
            AppErrorKind.INVALID_INPUT, AppErrorKind.UPDATE_REQUIRED -> false
        }

    companion object {
        private const val GENERIC_SERVER_PREFIX = "Request failed ("

        /** Pure HTTP → AppError mapping: the status decides the kind; `code` is carried, never decisive. */
        fun fromHttp(
            status: Int,
            code: String? = null,
            retryAfterSeconds: Int? = null,
            serverMessage: String? = null,
            rowErrors: List<BulkRowError>? = null,
        ): AppError {
            val kind = kindFor(status)
            val rows = rowErrors?.takeIf { it.isNotEmpty() }
            val text = if (kind == AppErrorKind.INVALID_INPUT || rows != null) serverText(serverMessage) else null
            return AppError(
                kind = kind,
                message = text ?: KitCopy.messageFor(kind),
                status = status,
                code = code,
                retryAfterSeconds = retryAfterSeconds,
                rowErrors = rows,
            )
        }

        /** Retry-After → whole seconds; anything else (incl. an HTTP-date) → null. */
        fun parseRetryAfter(value: String?): Int? {
            val text = value?.trim().orEmpty()
            return if (text.isNotEmpty() && text.all { it in '0'..'9' }) text.toIntOrNull() else null
        }

        /** The server's text when it is specific (non-empty, not the generic "Request failed (N)"), else null. */
        private fun serverText(message: String?): String? {
            val text = message?.trim().orEmpty()
            return if (text.isEmpty() || text.startsWith(GENERIC_SERVER_PREFIX)) null else text
        }

        private fun kindFor(status: Int): AppErrorKind = when {
            status == 400 || status == 422 -> AppErrorKind.INVALID_INPUT
            status == 401 -> AppErrorKind.SIGNED_OUT
            status == 403 -> AppErrorKind.FORBIDDEN
            status == 404 -> AppErrorKind.NOT_FOUND
            status == 408 -> AppErrorKind.TIMEOUT
            status == 409 -> AppErrorKind.CONFLICT
            status == 426 -> AppErrorKind.UPDATE_REQUIRED
            status == 429 || status == 503 -> AppErrorKind.UNAVAILABLE
            status >= 500 -> AppErrorKind.SERVER
            else -> AppErrorKind.UNKNOWN
        }
    }
}

/** Any throwable → AppError (D-KIT-4). Cancellation is never an error: it is always rethrown — except a
 *  `withTimeout` expiry, which is a [CancellationException] subtype and must be checked first (→ TIMEOUT).
 *  Not for credential endpoints (see the scope rule on [AppErrorKind]). */
fun Throwable.toAppError(): AppError = when (this) {
    is TimeoutCancellationException -> AppError(AppErrorKind.TIMEOUT)
    is CancellationException -> throw this
    is AppErrorException -> error
    is ApiException -> AppError.fromHttp(status, code = code, retryAfterSeconds = retryAfter, serverMessage = message, rowErrors = rowErrors)
    is HttpException -> toApiException().toAppError()
    // The refresh couldn't run: offline / timeout keep their kit kinds (D-KIT-4); anything else = busy.
    is AuthUnavailableException -> when (kind) {
        "offline" -> AppError(AppErrorKind.OFFLINE)
        "timeout" -> AppError(AppErrorKind.TIMEOUT)
        else -> AppError(AppErrorKind.UNAVAILABLE, retryAfterSeconds = retryAfterSeconds)
    }
    is InterruptedIOException -> AppError(AppErrorKind.TIMEOUT)
    is IOException -> AppError(AppErrorKind.OFFLINE)
    is SerializationException -> AppError(AppErrorKind.UNKNOWN)
    else -> AppError(AppErrorKind.UNKNOWN)
}

/** Carries an already-mapped [AppError] through a `Result`; its message is the kit copy (or invalidInput server text). */
class AppErrorException(val error: AppError) : Exception(error.message)

/** observability §8 `kind` for auth.* events (a 401 on a sign-in route = wrong_credentials). */
fun AppError.eventKind(): String = when (kind) {
    AppErrorKind.OFFLINE -> "offline"
    AppErrorKind.TIMEOUT -> "timeout"
    AppErrorKind.SIGNED_OUT -> "wrong_credentials"
    AppErrorKind.INVALID_INPUT -> "invalid_input"
    AppErrorKind.CONFLICT -> "conflict"
    AppErrorKind.UNAVAILABLE -> "unavailable"
    AppErrorKind.SERVER -> "server"
    else -> "unknown"
}

/** observability §8.1 `error_class` (frontend-kit kind names). */
fun AppError.errorClass(): String = when (kind) {
    AppErrorKind.OFFLINE -> "offline"
    AppErrorKind.TIMEOUT -> "timeout"
    AppErrorKind.SIGNED_OUT -> "signedOut"
    AppErrorKind.UNAVAILABLE -> "unavailable"
    AppErrorKind.SERVER -> "server"
    AppErrorKind.INVALID_INPUT -> "invalidInput"
    AppErrorKind.UPDATE_REQUIRED -> "updateRequired"
    else -> "unknown"
}

private val CREDENTIAL_TEXT_STATUSES = setOf(400, 401, 409, 422)

/** Credential screens (frontend-kit §4 scope rule, A8): the server's own text for 400/401/409/422 on the PUBLIC sign-in
 *  routes, the kit copy otherwise. [authenticated] routes (password / email / link) map a 401 through the kit (it is the
 *  session, never the credential — auth §3.1 rule 2), so "Invalid token." never reaches the user. */
fun Throwable.toCredentialMessage(authenticated: Boolean = false): String {
    val app = toAppError()
    val api = this as? ApiException ?: return app.message
    if (authenticated && api.status == 401) return app.message
    val text = api.message.trim()
    return if (api.status in CREDENTIAL_TEXT_STATUSES && text.isNotEmpty() && !text.startsWith("Request failed (")) text else app.message
}

/** auth §3.1 rule 6: the password write may have landed (timeout / dropped connection / 408 / 5xx). */
fun Throwable.isUnconfirmedWrite(): Boolean = when (this) {
    is AuthUnavailableException, is java.net.UnknownHostException, is java.net.ConnectException -> false
    is IOException -> true
    is ApiException -> status == 408 || status >= 500
    else -> false
}

/** auth §3.1 rule 6: a manual retry answered "must be different" proves the first attempt landed. */
fun Throwable.isSamePasswordRejection(): Boolean =
    this is ApiException && status == 400 && message.contains("must be different", ignoreCase = true)
