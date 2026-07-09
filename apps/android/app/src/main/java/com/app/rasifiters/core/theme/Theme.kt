package com.app.rasifiters.core.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val White = Color(0xFFFFFFFF)

// NOTE: the surface/container roles below are explicitly neutral. The M3 baseline palette is purple, so
// any role we DON'T set (surfaceVariant, the surfaceContainer* ramp, secondaryContainer, surfaceTint) would
// otherwise leak a lavender/pink tint into sheets, menus, the nav bar, chips, and elevated cards. Setting
// surfaceTint = surface also disables the tonal-elevation overlay so elevated surfaces keep their exact color.
private val LightColors = lightColorScheme(
    primary = AppOrange,
    onPrimary = White,
    secondary = AppGreen,
    onSecondary = White,
    secondaryContainer = LightSurfaceContainerHigh,
    onSecondaryContainer = LightOnSurface,
    background = LightBackground,
    onBackground = LightOnSurface,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceVariant,
    surfaceContainerLowest = LightSurfaceContainerLowest,
    surfaceContainerLow = LightSurfaceContainerLow,
    surfaceContainer = LightSurfaceContainer,
    surfaceContainerHigh = LightSurfaceContainerHigh,
    surfaceContainerHighest = LightSurfaceContainerHighest,
    surfaceTint = LightSurface,
    outline = LightOutline,
    outlineVariant = LightOutlineVariant,
)

private val DarkColors = darkColorScheme(
    primary = AppOrange,
    onPrimary = White,
    secondary = AppGreen,
    onSecondary = White,
    secondaryContainer = DarkSurfaceContainerHigh,
    onSecondaryContainer = DarkOnSurface,
    background = DarkBackground,
    onBackground = DarkOnSurface,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurfaceVariant,
    surfaceContainerLowest = DarkSurfaceContainerLowest,
    surfaceContainerLow = DarkSurfaceContainerLow,
    surfaceContainer = DarkSurfaceContainer,
    surfaceContainerHigh = DarkSurfaceContainerHigh,
    surfaceContainerHighest = DarkSurfaceContainerHighest,
    surfaceTint = DarkSurface,
    outline = DarkOutline,
    outlineVariant = DarkOutlineVariant,
)

/**
 * App theme. Appearance override (light/dark/system) flows in from `MainActivity` via [darkTheme].
 *
 * The root [Surface] is load-bearing: Compose's `LocalContentColor` defaults to **black** and only a
 * `Surface` (or a Material `Scaffold`, which wraps one) re-provides it as `onBackground`. Without this,
 * any `Text` drawn OUTSIDE a Scaffold (the program picker, the auth screens) renders black — invisible in
 * dark mode. Providing it once at the root makes every screen's default text theme-aware.
 */
@Composable
fun RaSiFitersTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(
        colorScheme = colors,
        typography = AppTypography,
    ) {
        Surface(color = colors.background, contentColor = colors.onBackground, content = content)
    }
}
