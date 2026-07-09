package com.app.rasifiters

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.AppearanceMode
import com.app.rasifiters.core.theme.RaSiFitersTheme
import com.app.rasifiters.ui.RootScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as App).container
        container.programContext.healIdentityIfNeeded()
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
                )
            }
        }
    }
}
