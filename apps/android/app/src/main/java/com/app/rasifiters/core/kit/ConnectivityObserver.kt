package com.app.rasifiters.core.kit

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.app.rasifiters.net.ReachabilityListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.cancellation.CancellationException

/**
 * One app-wide connectivity monitor (frontend-kit SPEC §5, polish-1) — the iOS `NetworkMonitor` / web
 * `useOnlineStatus` analog. `isOnline = linkUp && !provenOffline`:
 *  • linkUp — the default network has NET_CAPABILITY_INTERNET (not VALIDATED: a network that fails Android's own
 *    validation never shows a false "offline" by itself, D-KIT-7).
 *  • provenOffline — set when an API call fails with a no-connection error, cleared by any network HTTP response (both
 *    reported by the OkHttp layer, [ReachabilityListener]), a link down→up transition, or a successful probe.
 * While proven offline with the link up and the app in the foreground, [probe] (`GET /app-config`) runs at once, then
 * every 10 s, with a 5 s timeout; it stops when cleared, backgrounded or the link drops (the callback reports its return).
 */
class ConnectivityObserver(
    context: Context,
    scope: CoroutineScope,
    private val probe: suspend () -> Unit,
) : ReachabilityListener {

    private val connectivityManager: ConnectivityManager =
        context.applicationContext.getSystemService(ConnectivityManager::class.java)
    private val provenOffline = MutableStateFlow(false)
    private val foreground = MutableStateFlow(false)

    /** Link level: the current state, then every change. */
    private val linkUp: StateFlow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                trySend(capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
            }

            override fun onLost(network: Network) {
                trySend(false)
            }
        }
        trySend(currentlyOnline())
        connectivityManager.registerDefaultNetworkCallback(callback)
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }.distinctUntilChanged().stateIn(scope, SharingStarted.Eagerly, currentlyOnline())

    /** Hot, process-scoped: the offline banners, A6 suppression, the A3 backoff reset and the A4 SSE pause read it. */
    val isOnline: StateFlow<Boolean> = combine(linkUp, provenOffline) { up, proven -> up && !proven }
        .stateIn(scope, SharingStarted.Eagerly, linkUp.value && !provenOffline.value)

    init {
        // Only a link down→up transition clears proven-offline — capability churn on an up link does not.
        scope.launch {
            var wasUp = linkUp.value
            linkUp.collect { up ->
                if (up && !wasUp) provenOffline.value = false
                wasUp = up
            }
        }
        scope.launch {
            combine(linkUp, provenOffline, foreground) { up, proven, fg -> up && proven && fg }
                .distinctUntilChanged()
                .collectLatest { probing ->
                    if (!probing) return@collectLatest
                    while (currentCoroutineContext().isActive) {
                        probeOnce()
                        delay(PROBE_INTERVAL_MS)
                    }
                }
        }
    }

    /** RootScreen ON_START / ON_STOP (via ProgramContext) — the probe runs only in the foreground. */
    fun setForeground(value: Boolean) {
        foreground.value = value
    }

    override fun onResponse() {
        provenOffline.value = false
    }

    override fun onNoConnection() {
        provenOffline.value = true
    }

    /** The probe clears the flag only through the OkHttp hook ([onResponse] — a network answer, any status, never a
     *  cached one); a timeout or failure keeps probing (slow ≠ offline). */
    private suspend fun probeOnce() {
        try {
            withTimeout(PROBE_TIMEOUT_MS) { probe() }
        } catch (_: TimeoutCancellationException) {
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    private fun currentlyOnline(): Boolean {
        val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private companion object {
        const val PROBE_INTERVAL_MS = 10_000L
        const val PROBE_TIMEOUT_MS = 5_000L
    }
}
