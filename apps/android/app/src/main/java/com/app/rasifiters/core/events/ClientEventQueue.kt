package com.app.rasifiters.core.events

import android.content.Context
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.eventKind
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.net.ApiException
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.ClientEvent
import com.app.rasifiters.net.ClientEventBatch
import com.app.rasifiters.net.Network
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException

/**
 * observability §8 sender: a persisted queue (noBackupFilesDir — never backed up, survives sign-out) posted to
 * POST /api/client-events in batches of ≤ 25 with the current Bearer when one exists (the route never 401s). Ids are
 * client UUIDs kept across retries. 429 → wait Retry-After · 413 → halve (a single event that still 413s is dropped) ·
 * 400 / 415 → drop · 5xx / network → exponential backoff (30 s … 15 min). Thread-safe enqueue (called from OkHttp threads too).
 */
class ClientEventQueue(context: Context, private val api: ApiService, private val scope: CoroutineScope) {
    private val file = File(context.applicationContext.noBackupFilesDir, "client_events.json")
    private val serializer = ListSerializer(ClientEvent.serializer())
    private val lock = Any()
    private var cache: MutableList<ClientEvent>? = null
    private val flushMutex = Mutex()
    @Volatile private var nextAttemptAtMs = 0L
    private var failures = 0
    private var flushJob: Job? = null

    fun enqueue(type: String, props: JsonObject = JsonObject(emptyMap()), requestId: String? = null) {
        val event = ClientEvent(UUID.randomUUID().toString(), type, Instant.now().toString(), requestId, props)
        scope.launch {
            withContext(Dispatchers.IO) { mutate { list -> list += event; while (list.size > MAX_QUEUED) list.removeAt(0) } }
            flushSoon()
        }
    }

    /** Debounced (2 s); called after enqueue and on every foreground. */
    fun flushSoon() {
        if (flushJob?.isActive == true) return
        flushJob = scope.launch { delay(FLUSH_DELAY_MS); flush() }
    }

    private suspend fun flush() = flushMutex.withLock {
        var batchSize = MAX_BATCH
        while (System.currentTimeMillis() >= nextAttemptAtMs) {
            val batch = withContext(Dispatchers.IO) { snapshot().take(batchSize) }
            if (batch.isEmpty()) return@withLock
            val response = try {
                api.postClientEvents(ClientEventBatch(batch))
            } catch (e: CancellationException) { throw e } catch (_: Exception) { backOff(); return@withLock }
            when (response.code()) {
                in 200..299, 400, 415 -> { withContext(Dispatchers.IO) { remove(batch) }; failures = 0; batchSize = MAX_BATCH }
                413 -> { if (batch.size == 1) withContext(Dispatchers.IO) { remove(batch) } else { batchSize = maxOf(1, batch.size / 2) } }
                429 -> {
                    val wait = AppError.parseRetryAfter(response.headers()["Retry-After"]) ?: 60
                    nextAttemptAtMs = System.currentTimeMillis() + wait * 1000L
                    return@withLock
                }
                else -> { backOff(); return@withLock }
            }
        }
    }

    private fun backOff() {
        failures++
        nextAttemptAtMs = System.currentTimeMillis() + minOf(30_000L shl (failures - 1).coerceAtMost(5), 900_000L)
    }

    private fun snapshot(): List<ClientEvent> = synchronized(lock) { loaded().toList() }
    private fun remove(sent: List<ClientEvent>) { val ids = sent.map { it.id }.toSet(); mutate { list -> list.removeAll { it.id in ids } } }
    private fun mutate(block: (MutableList<ClientEvent>) -> Unit) = synchronized(lock) { val list = loaded(); block(list); persist(list) }
    private fun loaded(): MutableList<ClientEvent> = cache
        ?: (runCatching { Network.json.decodeFromString(serializer, file.readText()) }.getOrNull()?.toMutableList() ?: mutableListOf())
            .also { cache = it }
    private fun persist(list: List<ClientEvent>) { runCatching { file.writeText(Network.json.encodeToString(serializer, list)) } }

    private companion object {
        const val MAX_BATCH = 25
        const val MAX_QUEUED = 200
        const val FLUSH_DELAY_MS = 2_000L
    }
}

/** auth.sign_in_failed — [error] is the already-mapped failure (ApiException / IOException). */
fun ClientEventQueue.signInFailed(method: String, error: Throwable) {
    if (error is CancellationException) return
    val app = error.toAppError()
    enqueue("auth.sign_in_failed", buildJsonObject {
        put("method", method); put("kind", app.eventKind())
        app.status?.let { put("status", it) }; app.code?.let { put("code", it.take(64)) }
    }, requestId = (error as? ApiException)?.requestId)
}

fun ClientEventQueue.signInProviderFailed(method: String, sdkCode: String) =
    enqueue("auth.sign_in_failed", buildJsonObject { put("method", method); put("kind", "provider"); put("code", sdkCode.take(64)) })

fun ClientEventQueue.forcedSignOut(reason: String, status: Int? = null, code: String? = null) =
    enqueue("auth.forced_sign_out", buildJsonObject { put("reason", reason); status?.let { put("status", it) }; code?.let { put("code", it) } })

fun ClientEventQueue.refreshFailed(kind: String, status: Int?, code: String?) =
    enqueue("auth.refresh_failed", buildJsonObject { put("kind", kind); status?.let { put("status", it) }; code?.let { put("code", it.take(64)) } })
