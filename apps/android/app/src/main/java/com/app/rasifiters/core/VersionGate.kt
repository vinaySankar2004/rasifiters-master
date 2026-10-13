package com.app.rasifiters.core

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.edit
import com.app.rasifiters.BuildConfig
import com.app.rasifiters.net.ApiService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlin.coroutines.cancellation.CancellationException

/** app-config §3 Android consumption: installed versionCode < min_android_version_code (or any 426) → blocking
 *  "Update required"; else < latest_android_version_code → dismissable "Update available" (once per version). A failed
 *  read changes nothing — the gate never blocks on an error. */
class VersionGate(context: Context, private val api: ApiService) {
    private val prefs = context.applicationContext.getSharedPreferences("rasi.fiters.prefs", Context.MODE_PRIVATE)
    private val mutex = Mutex()
    private var lastCheckMs = 0L
    private var latestCode: Int? = null
    @Volatile private var blockedByServer = false

    private val _required = MutableStateFlow(false)
    val required: StateFlow<Boolean> = _required.asStateFlow()
    private val _updateAvailable = MutableStateFlow(false)
    val updateAvailable: StateFlow<Boolean> = _updateAvailable.asStateFlow()

    /** Launch, foreground, before a widget replay (throttled to once a minute). */
    suspend fun check() = mutex.withLock {
        val now = System.currentTimeMillis()
        if (now - lastCheckMs < THROTTLE_MS) return@withLock
        val config = try { api.getAppConfig() } catch (e: CancellationException) { throw e } catch (_: Exception) { return@withLock }
        lastCheckMs = now
        val min = config.minAndroidVersionCode
        _required.value = blockedByServer || (min != null && BuildConfig.VERSION_CODE < min)
        latestCode = config.latestAndroidVersionCode
        refreshNudge()
    }

    /** The OkHttp layer saw a 426 (app-config D-C5) — block for the rest of this process. Thread-safe. */
    fun markRequired() {
        blockedByServer = true
        _required.value = true
        _updateAvailable.value = false
    }

    fun dismissUpdate() {
        latestCode?.let { prefs.edit { putInt(KEY_DISMISSED, it) } }
        _updateAvailable.value = false
    }

    /** Plain Play Store intent (no in-app update library — A7 / app-config D-rule); https fallback when no store app. */
    fun openStore(context: Context) {
        val id = BuildConfig.APPLICATION_ID
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$id")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            runCatching {
                context.startActivity(
                    Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$id")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }
    }

    private fun refreshNudge() {
        val latest = latestCode
        _updateAvailable.value = !_required.value && latest != null && BuildConfig.VERSION_CODE < latest &&
            prefs.getInt(KEY_DISMISSED, 0) != latest
    }

    private companion object {
        const val THROTTLE_MS = 60_000L
        const val KEY_DISMISSED = "update.dismissed_version_code"
    }
}
