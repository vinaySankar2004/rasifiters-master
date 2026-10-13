package com.app.rasifiters.net

import com.app.rasifiters.BuildConfig
import okhttp3.Interceptor
import okhttp3.Response
import java.util.UUID

/** observability §4.1 identity headers + a fresh X-Request-Id, on EVERY OkHttp client (main, refresh, SSE).
 *  app-config D-C5 keys on X-App-Version, so a client without it would be 426'd once the switch is on. */
class ClientHeadersInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val builder = request.newBuilder()
            .header("X-App-Platform", "android")
            .header("X-App-Version", BuildConfig.VERSION_NAME)
            .header("X-App-Build", BuildConfig.VERSION_CODE.toString())
        if (request.header(REQUEST_ID) == null) builder.header(REQUEST_ID, UUID.randomUUID().toString())
        return chain.proceed(builder.build())
    }

    companion object { const val REQUEST_ID = "X-Request-Id" }
}
