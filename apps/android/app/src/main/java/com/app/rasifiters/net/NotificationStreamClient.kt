package com.app.rasifiters.net

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import java.util.concurrent.TimeUnit

/**
 * The real-time notification stream — the Android analog of the iOS `NotificationStreamClient`
 * (URLSession) and the web `EventSource`. Opens an SSE connection to `GET /notifications/stream`
 * with a Bearer header (the D-C2 stream auth accepts header OR `?token=`; we send the header),
 * and surfaces each `event: notification` payload as a decoded [NotificationDTO].
 *
 * Self-contained (its own OkHttpClient with no read timeout, like the iOS client's own URLSession) so
 * the streaming socket never trips the normal request timeout. The token is re-read on each [connect]
 * so a session refresh is picked up when the stream is restarted (on relaunch / resume). Faithful to
 * iOS: transport errors are swallowed (`onError` no-op there) and recovery is a restart, not an
 * internal reconnect loop.
 */
class NotificationStreamClient(
    private val baseUrl: String,
    private val tokenProvider: () -> String?,
) {
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS) // no read timeout — the server holds the socket open + pings.
        .retryOnConnectionFailure(true)
        .build()

    private var eventSource: EventSource? = null

    var onNotification: ((NotificationDTO) -> Unit)? = null

    fun connect() {
        disconnect()
        val token = tokenProvider()?.takeIf { it.isNotEmpty() } ?: return
        val request = Request.Builder()
            .url(streamUrl())
            .header("Accept", "text/event-stream")
            .header("Authorization", "Bearer $token")
            .build()
        eventSource = EventSources.createFactory(client).newEventSource(request, listener)
    }

    fun disconnect() {
        eventSource?.cancel()
        eventSource = null
    }

    private val listener = object : EventSourceListener() {
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            // The server emits `event: ready` (handshake) + `event: notification` (payload). Only the
            // latter carries a NotificationDTO; ready/keep-alive frames are ignored.
            if (type != "notification") return
            if (data.isBlank() || data == "{}") return
            val dto = runCatching { Network.json.decodeFromString(NotificationDTO.serializer(), data) }.getOrNull()
            if (dto != null) onNotification?.invoke(dto)
        }
        // Transport fail/close are swallowed (iOS parity) — recovery is a restart on resume.
    }

    private fun streamUrl(): String {
        val base = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return base + "notifications/stream"
    }
}
