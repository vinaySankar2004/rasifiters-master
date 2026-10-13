package com.app.rasifiters.core

import android.content.Context
import com.app.rasifiters.BuildConfig
import com.app.rasifiters.core.events.ClientEventQueue
import com.app.rasifiters.core.events.forcedSignOut
import com.app.rasifiters.core.events.refreshFailed
import com.app.rasifiters.core.kit.ConnectivityObserver
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.Network
import com.app.rasifiters.net.TokenRefresher
import com.app.rasifiters.push.DeviceRegistry
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Manual DI root — one instance per process, held by [com.app.rasifiters.App].
 * Wires Session → TokenRefresher → ApiService → ProgramContext. No Hilt until the graph actually needs it.
 */
class AppContainer(context: Context) {
    private val appContext = context.applicationContext
    val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    val session: Session = Session(appContext)

    /** App-level light/dark/system appearance override (survives sign-out). */
    val appearanceStore: AppearanceStore = AppearanceStore(appContext)
    // Lambdas below dereference later properties only when they fire (a probe / a real refresh / a 426) — after
    // construction (the probe needs a request to prove offline first).
    private val connectivity = ConnectivityObserver(appContext, appScope, probe = { api.getAppConfig() })
    val isOnline: StateFlow<Boolean> = connectivity.isOnline

    val refresher = TokenRefresher(
        BuildConfig.API_BASE_URL, session, Network.refreshClient(connectivity),
        onRefreshFailed = { kind, status, code -> events.refreshFailed(kind, status, code) },
        onSessionInvalid = { programContext.onSessionInvalid() },
    )
    val api: ApiService = Network.build(
        BuildConfig.API_BASE_URL, session, refresher, connectivity, onUpgradeRequired = { versionGate.markRequired() },
    )
    val events = ClientEventQueue(appContext, api, appScope)
    val versionGate = VersionGate(appContext, api)
    val deviceRegistry = DeviceRegistry(appContext, api, session, appScope)
    val launchCache = LaunchCache(appContext)
    val programContext: ProgramContext = ProgramContext(
        api, session, BuildConfig.API_BASE_URL, appContext, refresher, events, deviceRegistry, launchCache, connectivity,
    )

    init {
        if (session.recoveredFromUnreadableStore) {
            events.forcedSignOut("token_store_unreadable")
            programContext.noteForcedSignOut()   // A2: the reset is explained on Login too
        }
        // A3: a refresh backoff never outlives a lost connection — every offline→online transition of the combined
        // (link + proven-offline) value clears it.
        appScope.launch {
            var wasOnline = isOnline.value
            isOnline.collect { online ->
                if (online && !wasOnline) refresher.reset()
                wasOnline = online
            }
        }
    }
}
