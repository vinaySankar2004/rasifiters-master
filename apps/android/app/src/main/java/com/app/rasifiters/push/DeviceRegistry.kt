package com.app.rasifiters.push

import android.content.Context
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.edit
import com.app.rasifiters.core.Session
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.DeviceRegisterRequest
import com.app.rasifiters.net.DeviceUnregisterRequest
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import retrofit2.HttpException
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlin.coroutines.resume

/**
 * notifications §3.1 device registry: install id in noBackupFilesDir/install_id; registration state + the one-time
 * permission flag in `rasi.push` (excluded from backup, survives process death); ONE serial queue (Mutex) for
 * PUT /device and POST /device/unregister (no login; one retry, then drop). PUT at most once per 12 h unless the token
 * or the permission changed; unregister once per denial (the cleared registration is the memo — A12). A sign-in waits
 * for an in-flight unregister and drops a pending retry (generation check); after an unregister the cached token +
 * memo are forgotten.
 */
class DeviceRegistry(context: Context, private val api: ApiService, private val session: Session, private val scope: CoroutineScope) {
    /** [generation] = the sign-in it belongs to — a later sign-in / sign-out voids [markRegistered]. */
    data class RideAlong(val pushToken: String?, val deviceId: String, val generation: Int)

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val mutex = Mutex()
    @Volatile private var cachedPushToken: String? = null
    @Volatile private var signInGeneration = 0
    private var pendingRetry: Job? = null

    private var registeredToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(v) = prefs.edit { if (v == null) remove(KEY_TOKEN) else putString(KEY_TOKEN, v) }
    private var registeredAtMs: Long
        get() = prefs.getLong(KEY_AT, 0L)
        set(v) = prefs.edit { putLong(KEY_AT, v) }

    val installId: String by lazy { readOrCreateInstallId() }

    /** Start of every sign-in: drop a pending unregister retry, wait out an in-flight one, return the ride-along fields. */
    suspend fun beginSignIn(): RideAlong {
        val generation = ++signInGeneration
        pendingRetry?.cancel(); pendingRetry = null
        mutex.withLock { }
        val token = if (notificationsEnabled()) currentPushToken() else null
        return RideAlong(token, withContext(Dispatchers.IO) { installId }, generation)
    }

    /** The login / OAuth ride-along registered its token for this device — recorded only if that sign-in is still the
     *  current one and still signed in (a sign-out meanwhile already unregistered it). */
    fun markRegistered(ride: RideAlong) {
        if (ride.pushToken != null && ride.generation == signInGeneration && session.signedIn.value) markRegistered(ride.pushToken)
    }

    private fun markRegistered(token: String) { registeredToken = token; registeredAtMs = System.currentTimeMillis() }

    /** Launch / foreground / onNewToken / permission result: register while signed in + notifications enabled; unregister
     *  when notifications were turned off (survives process death). */
    fun sync(newToken: String? = null) {
        newToken?.let { cachedPushToken = it }
        scope.launch {
            if (!session.signedIn.value) return@launch
            if (!notificationsEnabled()) { if (registeredToken != null) unregisterNow(); return@launch }
            val token = currentPushToken() ?: return@launch
            val deviceId = withContext(Dispatchers.IO) { installId }
            mutex.withLock {
                if (!session.signedIn.value) return@withLock
                if (token == registeredToken && System.currentTimeMillis() - registeredAtMs < REREGISTER_AFTER_MS) return@withLock
                try {
                    api.registerDevice(DeviceRegisterRequest(pushToken = token, platform = "android", deviceId = deviceId))
                    markRegistered(token)
                } catch (e: CancellationException) { throw e } catch (e: Exception) { Log.w(TAG, "PUT /device failed", e) }
            }
        }
    }

    /** Every sign-out path (board §2 client rule 5) — works without a login. Voids any in-flight sign-in's ride-along. */
    fun unregister() {
        signInGeneration++
        scope.launch { unregisterNow() }
    }

    fun shouldAskNotificationPermission(): Boolean = !prefs.getBoolean(KEY_ASKED, false)
    fun markNotificationPermissionAsked() = prefs.edit { putBoolean(KEY_ASKED, true) }

    private suspend fun unregisterNow() {
        // No cached / registered token (e.g. a 1.0.0 row registered without device_id) → ask FCM (≤ 2 s) so the
        // unregister still matches by token.
        val token = cachedPushToken ?: registeredToken ?: currentPushToken()
        val generation = signInGeneration
        cachedPushToken = null; registeredToken = null; registeredAtMs = 0L
        val deviceId = withContext(Dispatchers.IO) { installId }
        val ok = mutex.withLock { attempt(token, deviceId) }
        if (!ok) pendingRetry = scope.launch {
            delay(RETRY_DELAY_MS)
            mutex.withLock { if (generation == signInGeneration) attempt(token, deviceId) }
        }
    }

    /** true = done (200, or a 4xx retrying can't fix); false = network / 5xx → the one retry. */
    private suspend fun attempt(token: String?, deviceId: String): Boolean = try {
        api.unregisterDevice(DeviceUnregisterRequest(pushToken = token, deviceId = deviceId)); true
    } catch (e: CancellationException) { throw e
    } catch (e: HttpException) { e.code() < 500
    } catch (e: IOException) { false }

    private fun notificationsEnabled() = NotificationManagerCompat.from(appContext).areNotificationsEnabled()

    private suspend fun currentPushToken(): String? = cachedPushToken ?: withTimeoutOrNull(TOKEN_TIMEOUT_MS) {
        suspendCancellableCoroutine<String?> { cont ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { t ->
                if (cont.isActive) cont.resume(if (t.isSuccessful) t.result else null)
            }
        }
    }?.also { cachedPushToken = it }

    private fun readOrCreateInstallId(): String {
        val file = File(appContext.noBackupFilesDir, "install_id")
        runCatching { file.readText().trim() }.getOrNull()?.takeIf { runCatching { UUID.fromString(it) }.isSuccess }?.let { return it }
        return UUID.randomUUID().toString().also { id -> runCatching { file.writeText(id) } }
    }

    private companion object {
        const val TAG = "RaSiPush"
        const val PREFS = "rasi.push"
        const val KEY_TOKEN = "registered_token"
        const val KEY_AT = "registered_at"
        const val KEY_ASKED = "permission_asked"
        const val REREGISTER_AFTER_MS = 12 * 60 * 60 * 1000L
        const val RETRY_DELAY_MS = 5_000L
        const val TOKEN_TIMEOUT_MS = 2_000L
    }
}
