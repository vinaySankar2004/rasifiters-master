package com.app.rasifiters.core.kit

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.stateIn

/**
 * One app-wide, link-level connectivity monitor (frontend-kit SPEC §5) — the iOS `NetworkMonitor` / web
 * `useOnlineStatus` analog. Online = the default network has NET_CAPABILITY_INTERNET (NOT VALIDATED, so a
 * network that fails Android's validation never shows a false "offline", D-KIT-7). NOT instantiated in
 * Phase 2; Phase 3 creates one in AppContainer.
 */
class ConnectivityObserver(context: Context) {

    private val connectivityManager: ConnectivityManager =
        context.applicationContext.getSystemService(ConnectivityManager::class.java)

    /** Emits the current state, then every change; unregisters when the collector stops. */
    val isOnline: Flow<Boolean> = callbackFlow {
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
    }.distinctUntilChanged()

    /** Hot, app-scoped state for Compose (`collectAsStateWithLifecycle()`). */
    fun onlineState(scope: CoroutineScope): StateFlow<Boolean> =
        isOnline.stateIn(scope, SharingStarted.WhileSubscribed(5_000), currentlyOnline())

    private fun currentlyOnline(): Boolean {
        val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
