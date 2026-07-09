package com.app.rasifiters.core

import android.content.Context
import com.app.rasifiters.BuildConfig
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.Network

/**
 * Manual DI root — one instance per process, held by [com.app.rasifiters.App].
 * Wires Session → ApiService → ProgramContext. No Hilt until the graph actually needs it.
 */
class AppContainer(context: Context) {

    val session: Session = Session(context)

    /** App-level light/dark/system appearance override (survives sign-out). */
    val appearanceStore: AppearanceStore = AppearanceStore(context)

    // The 401-refresh-failure callback flips the state hub to signed-out. programContext is
    // created just below, so the lambda only dereferences it after init (on a real 401).
    val api: ApiService = Network.build(
        baseUrl = BuildConfig.API_BASE_URL,
        session = session,
        onAuthFailure = { programContext.onAuthFailure() },
    )

    val programContext: ProgramContext = ProgramContext(api, session, BuildConfig.API_BASE_URL)
}
