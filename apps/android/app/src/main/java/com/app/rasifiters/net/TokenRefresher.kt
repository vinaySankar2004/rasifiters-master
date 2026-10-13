package com.app.rasifiters.net

import android.util.Base64
import com.app.rasifiters.core.Session
import com.app.rasifiters.core.kit.AppError
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.io.InterruptedIOException

/** Refresh couldn't complete for infrastructure reasons — the session is KEPT (auth §3.1 rule 3). [kind] is the failure
 *  class (`offline` / `timeout` / `unavailable` / `server` / …) so the kit maps an offline refresh to OFFLINE (D-KIT-4). */
class AuthUnavailableException(val kind: String, val retryAfterSeconds: Int?) :
    IOException("Authentication service temporarily unavailable")

/**
 * The ONE refresh path (board §2 client rules 1–3), shared by the request interceptor, the 401 authenticator and SSE:
 * single-flight; proactive when the access token expires within 60 s (lifetime-based: receivedAt + (exp − iat), so a
 * wrong device clock can't loop); one quick retry after min(Retry-After ?: 2, 5) s, then backoff 30 / 60 / 120 / 300 s
 * with no network refresh; sign-out ONLY on `401 session_invalid`. Writes go through Session's compare-and-set, so a
 * refresh that lands after a sign-out is discarded. Blocking — call from OkHttp / IO threads only.
 */
class TokenRefresher(
    baseUrl: String,
    private val session: Session,
    private val client: OkHttpClient,
    private val onRefreshFailed: (kind: String, status: Int?, code: String?) -> Unit,
    private val onSessionInvalid: () -> Unit,
) {
    sealed interface Outcome {
        data class Refreshed(val accessToken: String) : Outcome
        data object SessionInvalid : Outcome
        data class Unavailable(val kind: String, val retryAfterSeconds: Int?) : Outcome
        data object NoSession : Outcome
    }

    private sealed interface Attempt {
        data class Ok(val access: String, val refresh: String) : Attempt
        data object Invalid : Attempt
        data class Transient(val kind: String, val status: Int?, val code: String?, val retryAfter: Int?) : Attempt
    }

    private val refreshUrl = (if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/") + "auth/refresh"
    private val lock = Any()
    // Written under [lock] by the refresh path; [reset] writes them lock-free from the main thread (never blocks
    // behind an in-flight refresh — no ANR), hence volatile.
    @Volatile private var consecutiveFailures = 0
    @Volatile private var blockedUntilMs = 0L
    @Volatile private var lastFailureKind = "unavailable"
    @Volatile private var claimsCache: Pair<String, LongArray?>? = null

    /** The token to attach: refreshed first when it expires within 60 s. Throws when it is already expired and the
     *  refresh is unavailable; null when signed out. */
    @Throws(AuthUnavailableException::class)
    fun tokenForRequest(): String? {
        val current = session.tokens.value ?: return null
        if (!expiresWithin(current, PROACTIVE_WINDOW_S)) return current.access
        return when (val outcome = refresh(failedToken = current.access)) {
            is Outcome.Refreshed -> outcome.accessToken
            is Outcome.Unavailable ->
                if (expiresWithin(current, 0)) throw AuthUnavailableException(outcome.kind, outcome.retryAfterSeconds) else current.access
            Outcome.SessionInvalid, Outcome.NoSession -> null
        }
    }

    /** Single-flight. [failedToken] = the access token the caller used; if the store already holds a different one, it
     *  is returned as-is (no clock test). */
    fun refresh(failedToken: String?): Outcome = synchronized(lock) { refreshLocked(failedToken) }

    private fun refreshLocked(failedToken: String?): Outcome {
        val current = session.tokens.value ?: return Outcome.NoSession
        if (current.access != failedToken) return Outcome.Refreshed(current.access)
        val now = System.currentTimeMillis()
        if (now < blockedUntilMs) return Outcome.Unavailable(lastFailureKind, ((blockedUntilMs - now + 999) / 1000).toInt())

        var attempt = call(current.refresh)
        if (attempt is Attempt.Transient) {
            try {
                Thread.sleep(minOf(attempt.retryAfter ?: QUICK_RETRY_S, QUICK_RETRY_MAX_S).coerceAtLeast(0) * 1000L)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt(); return Outcome.Unavailable(attempt.kind, null)
            }
            attempt = call(current.refresh)
        }
        return when (attempt) {
            is Attempt.Ok -> {
                reset()
                if (session.rotateTokens(current.refresh, attempt.access, attempt.refresh)) Outcome.Refreshed(attempt.access)
                else Outcome.NoSession   // signed out / re-signed-in meanwhile → never resurrect
            }
            Attempt.Invalid -> {
                reset()
                if (session.clearIfRefresh(current.refresh)) onSessionInvalid()
                Outcome.SessionInvalid
            }
            is Attempt.Transient -> {
                consecutiveFailures++
                lastFailureKind = attempt.kind
                blockedUntilMs = System.currentTimeMillis() + backoffMs(consecutiveFailures)
                onRefreshFailed(attempt.kind, attempt.status, attempt.code)
                Outcome.Unavailable(attempt.kind, attempt.retryAfter)
            }
        }
    }

    /** Sign-in, every sign-out teardown and every offline→online transition: no backoff (A3). Lock-free — safe to
     *  call on the main thread while a refresh holds the lock. */
    fun reset() { consecutiveFailures = 0; blockedUntilMs = 0L }

    /** Lifetime-based when iat + receivedAt are known; else exp vs the device clock (1.0.0-written tokens). */
    fun expiresWithin(tokens: Session.Tokens, seconds: Long): Boolean {
        val c = claims(tokens.access) ?: return false
        val exp = c[0]
        val iat = c[1]
        if (exp <= 0) return false
        val expiresAtMs = if (iat in 1 until exp && tokens.receivedAtMs > 0) tokens.receivedAtMs + (exp - iat) * 1000 else exp * 1000
        return expiresAtMs - System.currentTimeMillis() <= seconds * 1000
    }

    private fun call(refreshToken: String): Attempt {
        val body = Network.json.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken)).toRequestBody(JSON)
        val request = Request.Builder().url(refreshUrl).post(body).build()
        return try {
            client.newCall(request).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (resp.isSuccessful) {
                    val parsed = runCatching { Network.json.decodeFromString(TokenRefreshResponse.serializer(), text) }.getOrNull()
                    if (parsed != null) Attempt.Ok(parsed.token, parsed.refreshToken)
                    else Attempt.Transient("unknown", resp.code, null, null)
                } else {
                    val code = runCatching { Network.json.decodeFromString(ErrorBody.serializer(), text).code }.getOrNull()
                    if (resp.code == 401 && code == SESSION_INVALID) Attempt.Invalid
                    else Attempt.Transient(kindFor(resp.code), resp.code, code, AppError.parseRetryAfter(resp.header("Retry-After")))
                }
            }
        } catch (_: InterruptedIOException) {
            Attempt.Transient("timeout", null, null, null)
        } catch (_: IOException) {
            Attempt.Transient("offline", null, null, null)
        }
    }

    private fun kindFor(status: Int) = when {
        status == 408 -> "timeout"
        status == 429 || status == 503 -> "unavailable"
        status >= 500 -> "server"
        status == 400 || status == 422 -> "invalid_input"
        status == 409 -> "conflict"
        else -> "unknown"
    }

    /** [exp, iat] (0 = absent); one-entry cache keyed by the token string. */
    private fun claims(token: String): LongArray? {
        claimsCache?.let { (t, c) -> if (t == token) return c }
        val parsed = try {
            token.split('.').getOrNull(1)?.let {
                val obj = Network.json.parseToJsonElement(
                    String(Base64.decode(it, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP), Charsets.UTF_8),
                ).jsonObject
                longArrayOf(obj["exp"]?.jsonPrimitive?.longOrNull ?: 0L, obj["iat"]?.jsonPrimitive?.longOrNull ?: 0L)
            }
        } catch (_: Exception) { null }
        claimsCache = token to parsed
        return parsed
    }

    private companion object {
        const val PROACTIVE_WINDOW_S = 60L
        const val QUICK_RETRY_S = 2
        const val QUICK_RETRY_MAX_S = 5
        const val SESSION_INVALID = "session_invalid"
        val JSON = "application/json".toMediaType()
        private val BACKOFF_MS = longArrayOf(30_000L, 60_000L, 120_000L, 300_000L)
        fun backoffMs(failures: Int): Long = BACKOFF_MS[(failures - 1).coerceIn(0, BACKOFF_MS.lastIndex)]
    }
}
