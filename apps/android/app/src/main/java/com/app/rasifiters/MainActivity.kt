package com.app.rasifiters

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.AppearanceMode
import com.app.rasifiters.core.WidgetRoute
import com.app.rasifiters.core.theme.RaSiFitersTheme
import com.app.rasifiters.ui.RootScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as App).container
        container.programContext.healIdentityIfNeeded()
        // Polish #20: the widget link is used once — a recreation (rotation, the nightly dark-mode switch) or a relaunch
        // from Recents re-delivers the original intent and must not reopen the form.
        val fromHistory = (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
        if (savedInstanceState == null && !fromHistory) handleDeepLink(intent)
        if (savedInstanceState == null) handlePushTap(intent)
        setContent {
            val appearance by container.appearanceStore.mode.collectAsStateWithLifecycle()
            val darkTheme = when (appearance) {
                AppearanceMode.SYSTEM -> isSystemInDarkTheme()
                AppearanceMode.LIGHT -> false
                AppearanceMode.DARK -> true
            }
            RaSiFitersTheme(darkTheme = darkTheme) {
                RootScreen(
                    programContext = container.programContext,
                    appearanceStore = container.appearanceStore,
                    versionGate = container.versionGate,
                )
            }
        }
    }

    // MainActivity is launchMode="singleTop", so a widget tap while the app is already running re-delivers
    // the deep-link here (not a fresh onCreate) — mirror the iOS `.onOpenURL` handling on both paths.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
        handlePushTap(intent)
    }

    /** FCM tap (tray or our foreground post): extras carry notification_id / type / target / program_id → mark read + open
     *  (the push-tap routing rule). A background push's data keys arrive as the same extras. */
    private fun handlePushTap(intent: Intent?) {
        val id = intent?.getStringExtra("notification_id")?.takeIf { it.isNotEmpty() } ?: return
        (application as App).container.programContext.onPushTap(
            notificationId = id,
            type = intent.getStringExtra("type"),
            target = intent.getStringExtra("target"),
            programId = intent.getStringExtra("program_id"),
        )
        intent.removeExtra("notification_id")
    }

    /** Resolve a `rasifiters://quick-add-*` widget deep-link and stash it for RootScreen to replay. */
    private fun handleDeepLink(intent: Intent?) {
        val route = WidgetRoute.fromUri(intent?.data) ?: return
        (application as App).container.programContext.setWidgetRoute(route)
        intent?.data = null   // consumed — never replayed (#20)
    }
}
