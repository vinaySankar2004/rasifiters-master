package com.app.rasifiters.net

import com.app.rasifiters.core.Session
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import okio.BufferedSink
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Builds the single ApiService + the refresh and SSE clients. Every client sends the observability §4.1 identity
 * headers. The Bearer comes from the ONE token store (proactive refresh at < 60 s), a 401 triggers one single-flight
 * refresh + one retry ([TokenRefresher]), and a 426 opens the blocking update screen (app-config D-C5).
 */
object Network {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    /** frontend-kit adoption: a request times out at 15 s end to end (callTimeout, not per phase). */
    private const val REQUEST_TIMEOUT_S = 15L
    private const val REFRESH_TIMEOUT_S = 10L
    /** notifications §3.3: the server pings every 25 s, so 60 s of silence = a dead stream → reconnect. */
    private const val STREAM_IDLE_TIMEOUT_S = 60L

    /** Main client. Order: identity headers → one-shot bodies → bearer (proactive refresh) → 426 gate → logging; 401 → [AuthAuthenticator]. */
    fun build(baseUrl: String, session: Session, refresher: TokenRefresher, onUpgradeRequired: () -> Unit): ApiService {
        val client = OkHttpClient.Builder()
            .callTimeout(REQUEST_TIMEOUT_S, TimeUnit.SECONDS)
            .addInterceptor(ClientHeadersInterceptor())
            .addInterceptor(OneShotBodyInterceptor())
            .addInterceptor(AuthHeaderInterceptor(session, refresher))
            .addInterceptor(UpgradeRequiredInterceptor(onUpgradeRequired))
            .authenticator(AuthAuthenticator(refresher))
            .addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
            .build()
        return Retrofit.Builder().baseUrl(normalizeBase(baseUrl)).client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(ApiService::class.java)
    }

    /** The refresh call's own client — no auth layer (no loops), still the §4.1 headers. */
    fun refreshClient(): OkHttpClient = OkHttpClient.Builder()
        .callTimeout(REFRESH_TIMEOUT_S, TimeUnit.SECONDS)
        .addInterceptor(ClientHeadersInterceptor()).build()

    /** SSE client: 60 s idle timeout (pings every 25 s keep it alive), §4.1 headers. */
    fun streamClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(REQUEST_TIMEOUT_S, TimeUnit.SECONDS)
        .readTimeout(STREAM_IDLE_TIMEOUT_S, TimeUnit.SECONDS)
        .addInterceptor(ClientHeadersInterceptor()).build()

    /** Retrofit needs a trailing slash on the base for relative endpoint paths to resolve. */
    private fun normalizeBase(base: String) = if (base.endsWith("/")) base else "$base/"
}

/** Paths that must never trigger a refresh (no loops; logout / unregister / events work without a valid login). */
private val NO_REFRESH_SUFFIXES = listOf(
    "/auth/refresh", "/auth/logout", "/auth/login/app", "/auth/oauth", "/auth/oauth/complete",
    "/auth/register", "/auth/forgot-password", "/notifications/device/unregister", "/client-events", "/app-config",
)

private fun String.isNoRefreshPath() = NO_REFRESH_SUFFIXES.any { endsWith(it) }

internal const val ONE_SHOT_HEADER = "X-One-Shot"

/** auth §3.1 rule 6: requests tagged X-One-Shot (password writes) get a one-shot body → OkHttp never re-sends them. */
private class OneShotBodyInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header(ONE_SHOT_HEADER) == null) return chain.proceed(request)
        val stripped = request.newBuilder().removeHeader(ONE_SHOT_HEADER)
        val body = request.body ?: return chain.proceed(stripped.build())
        val oneShot = object : RequestBody() {
            override fun contentType() = body.contentType()
            override fun contentLength() = body.contentLength()
            override fun writeTo(sink: BufferedSink) = body.writeTo(sink)
            override fun isOneShot() = true
        }
        return chain.proceed(stripped.method(request.method, oneShot).build())
    }
}

/** Bearer from the ONE store, refreshed first when it expires within 60 s (skipped for no-refresh paths). */
private class AuthHeaderInterceptor(private val session: Session, private val refresher: TokenRefresher) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("Authorization") != null) return chain.proceed(request)
        val token = if (request.url.encodedPath.isNoRefreshPath()) session.accessToken else refresher.tokenForRequest()
        token ?: return chain.proceed(request)
        return chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
    }
}

/** app-config D-C5: any 426 opens the blocking update screen. */
private class UpgradeRequiredInterceptor(private val onUpgradeRequired: () -> Unit) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response =
        chain.proceed(chain.request()).also { if (it.code == 426) onUpgradeRequired() }
}

/** 401 → one single-flight refresh + one retry. Unavailable → AuthUnavailableException (session kept); session_invalid → null (signed out). */
private class AuthAuthenticator(private val refresher: TokenRefresher) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.isNoRefreshPath()) return null
        if (response.priorResponse != null) return null
        val failed = response.request.header("Authorization")?.removePrefix("Bearer ") ?: return null
        return when (val outcome = refresher.refresh(failedToken = failed)) {
            is TokenRefresher.Outcome.Refreshed ->
                response.request.newBuilder().header("Authorization", "Bearer ${outcome.accessToken}").build()
            is TokenRefresher.Outcome.Unavailable -> throw AuthUnavailableException(outcome.kind, outcome.retryAfterSeconds)
            else -> null
        }
    }
}
