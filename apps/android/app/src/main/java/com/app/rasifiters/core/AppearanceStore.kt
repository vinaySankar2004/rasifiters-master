package com.app.rasifiters.core

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Light/dark/system appearance choice — the analog of the iOS `ThemeManager.AppearanceMode`. */
enum class AppearanceMode(val id: String, val displayName: String) {
    SYSTEM("system", "System"),
    LIGHT("light", "Light"),
    DARK("dark", "Dark");

    companion object {
        fun from(id: String?): AppearanceMode = entries.firstOrNull { it.id == id } ?: SYSTEM
    }
}

/**
 * App-level appearance preference. The Android analog of the iOS `ThemeManager` — an app-scoped
 * override read by [com.app.rasifiters.core.theme.RaSiFitersTheme] at the root. Persisted in a plain
 * (non-encrypted, not sensitive) prefs file that is NOT wiped on sign-out, so the choice survives login
 * changes. Exposed as a StateFlow so the theme recomposes the moment the user picks a mode.
 */
class AppearanceStore(context: Context) {
    private val prefs = context.getSharedPreferences("rasi.fiters.prefs", Context.MODE_PRIVATE)

    private val _mode = MutableStateFlow(AppearanceMode.from(prefs.getString(KEY, null)))
    val mode: StateFlow<AppearanceMode> = _mode.asStateFlow()

    fun setMode(mode: AppearanceMode) {
        _mode.value = mode
        prefs.edit().putString(KEY, mode.id).apply()
    }

    private companion object {
        const val KEY = "appearance_mode"
    }
}
