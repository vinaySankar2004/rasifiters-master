package com.app.rasifiters.net

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import kotlin.random.Random

/**
 * notifications §3.3 stream client (`GET /notifications/stream`, Bearer header): foreground only (start on ON_START,
 * stop on ON_STOP); every close or error is a reconnect with exponential backoff + full jitter (1 s base, ×2, 30 s cap),
 * paused while offline; a fresh token before each connect (a 401 forces a refresh); `ready` resets the backoff and
 * triggers the /unacknowledged re-fetch. The client's 60 s read timeout (pings every 25 s) detects a dead stream.
 * State is mutated on [scope] (Main) only.
 */
class NotificationStreamClient(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val scope: CoroutineScope,
    /** Suspends until the device is online (reconnects pause while offline — A4). */
    private val awaitOnline: suspend () -> Unit,
    /** Blocking, run on Dispatchers.IO. true = force a refresh (the server rejected the last token). */
    private val tokenProvider: (forceRefresh: Boolean) -> String?,
) {
    var onNotification: ((NotificationDTO) -> Unit)? = null
    var onReady: (() -> Unit)? = null

    @Volatile var isConnected: Boolean = false
        private set
    @Volatile private var running = false
    @Volatile private var forceRefresh = false
    private var attempt = 0
    private var eventSource: EventSource? = null
    private var connectJob: Job? = null

    fun start() {
        if (running) return
        running = true; attempt = 0; connect(0L)
    }

    fun stop() {
        running = false; isConnected = false
        connectJob?.cancel(); connectJob = null
        eventSource?.cancel(); eventSource = null
    }

    private fun connect(delayMs: Long) {
        connectJob?.cancel()
        connectJob = scope.launch {
            if (delayMs > 0) delay(delayMs)
            awaitOnline()
            val token = withContext(Dispatchers.IO) { tokenProvider(forceRefresh) }
            forceRefresh = false
            if (!running) return@launch
            if (token == null) { scheduleReconnect(); return@launch }
            val request = Request.Builder().url(streamUrl())
                .header("Accept", "text/event-stream").header("Authorization", "Bearer $token").build()
            eventSource?.cancel()
            eventSource = EventSources.createFactory(client).newEventSource(request, listener)
        }
    }

    private fun scheduleReconnect() {
        isConnected = false
        if (!running) return
        val cap = minOf(MAX_DELAY_MS, BASE_DELAY_MS shl attempt.coerceAtMost(6))
        attempt++
        connect(Random.nextLong(0, cap + 1))
    }

    private val listener = object : EventSourceListener() {
        override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
            when (type) {
                "ready" -> scope.launch {
                    if (eventSource !== this@NotificationStreamClient.eventSource) return@launch
                    attempt = 0; isConnected = true; onReady?.invoke()
                }
                "notification" -> {
                    if (data.isBlank() || data == "{}") return
                    runCatching { Network.json.decodeFromString(NotificationDTO.serializer(), data) }.getOrNull()
                        ?.let { dto -> scope.launch { onNotification?.invoke(dto) } }
                }
            }
        }

        override fun onClosed(eventSource: EventSource) {
            scope.launch { if (eventSource === this@NotificationStreamClient.eventSource) scheduleReconnect() }
        }

        override fun onFailure(eventSource: EventSource, t: Throwable?, response: okhttp3.Response?) {
            if (response?.code == 401) forceRefresh = true
            scope.launch { if (eventSource === this@NotificationStreamClient.eventSource) scheduleReconnect() }
        }
    }

    private fun streamUrl(): String = (if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/") + "notifications/stream"

    private companion object {
        const val BASE_DELAY_MS = 1_000L
        const val MAX_DELAY_MS = 30_000L
    }
}
