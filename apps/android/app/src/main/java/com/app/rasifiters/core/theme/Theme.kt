package com.app.rasifiters.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val White = Color(0xFFFFFFFF)

private val LightColors = lightColorScheme(
    primary = AppOrange,
    onPrimary = White,
    secondary = AppGreen,
    onSecondary = White,
    background = LightBackground,
    onBackground = LightOnSurface,
    surface = LightSurface,
    onSurface = LightOnSurface,
)

private val DarkColors = darkColorScheme(
    primary = AppOrange,
    onPrimary = White,
    secondary = AppGreen,
    onSecondary = White,
    background = DarkBackground,
    onBackground = DarkOnSurface,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
)

/** App theme. Appearance override (light/dark/system) is wired in the Program/Settings phase. */
@Composable
fun RaSiFitersTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        content = content,
    )
}
