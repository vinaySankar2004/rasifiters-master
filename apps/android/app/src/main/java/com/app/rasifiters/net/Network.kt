package com.app.rasifiters.net

import com.app.rasifiters.core.Session
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

/**
 * Builds the single ApiService. Mirrors the iOS APIClient: a Bearer header is attached to every
 * request and a 401 triggers a single-flight refresh + one retry (see AuthAuthenticator).
 */
object Network {

    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    fun build(baseUrl: String, session: Session, onAuthFailure: () -> Unit): ApiService {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthHeaderInterceptor(session))
            .authenticator(AuthAuthenticator(baseUrl, session, onAuthFailure))
            .addInterceptor(logging)
            .build()

        return Retrofit.Builder()
            .baseUrl(normalizeBase(baseUrl))
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ApiService::class.java)
    }

    /** Retrofit needs a trailing slash on the base for relative endpoint paths to resolve. */
    private fun normalizeBase(base: String) = if (base.endsWith("/")) base else "$base/"
}

/** Attaches Authorization: Bearer <access token> to every request that doesn't already carry one. */
private class AuthHeaderInterceptor(private val session: Session) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("Authorization") != null) return chain.proceed(request)
        val token = session.accessToken ?: return chain.proceed(request)
        val authed = request.newBuilder()
            .header("Authorization", "Bearer $token")
            .build()
        return chain.proceed(authed)
    }
}

/**
 * On a 401, refresh the Supabase token once and retry. Single-flight: concurrent 401s
 * synchronize on the same lock; if another thread already refreshed, the loser just retries
 * with the fresh token. Refresh failure clears the session and signals sign-out.
 */
private class AuthAuthenticator(
    baseUrl: String,
    private val session: Session,
    private val onAuthFailure: () -> Unit,
) : Authenticator {

    private val refreshUrl = (if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/") + "auth/refresh"
    private val bareClient = OkHttpClient()
    private val json = Network.json
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        val storedRefresh = session.refreshToken ?: return null
        val failedToken = response.request.header("Authorization")?.removePrefix("Bearer ")

        synchronized(lock) {
            // Another thread may have already refreshed while we waited on the lock.
            val current = session.accessToken
            if (current != null && current != failedToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $current")
                    .build()
            }

            val newTokens = refreshBlocking(session.refreshToken ?: storedRefresh)
            if (newTokens == null) {
                session.clear()
                onAuthFailure()
                return null
            }
            session.saveTokens(newTokens.token, newTokens.refreshToken)
            return response.request.newBuilder()
                .header("Authorization", "Bearer ${newTokens.token}")
                .build()
        }
    }

    private fun refreshBlocking(refreshToken: String): TokenRefreshResponse? {
        return try {
            val payload = json.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken))
            val request = Request.Builder()
                .url(refreshUrl)
                .post(payload.toRequestBody("application/json".toMediaType()))
                .build()
            bareClient.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) return null
                val body = resp.body?.string() ?: return null
                json.decodeFromString(TokenRefreshResponse.serializer(), body)
            }
        } catch (_: Exception) {
            null
        }
    }
}
