package com.app.rasifiters

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.app.rasifiters.core.theme.RaSiFitersTheme
import com.app.rasifiters.ui.RootScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as App).container
        container.programContext.healIdentityIfNeeded()
        setContent {
            RaSiFitersTheme {
                RootScreen(programContext = container.programContext)
            }
        }
    }
}
