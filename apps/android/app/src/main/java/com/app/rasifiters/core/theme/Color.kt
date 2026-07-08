package com.app.rasifiters.core.theme

import androidx.compose.ui.graphics.Color

// Brand tokens — mirror the web rf-* palette / iOS Color.appOrange / Color.appGreen.
// Refined against the web design tokens as screens are ported.
val AppOrange = Color(0xFFF5761A)
val AppOrangeDark = Color(0xFFD9640E)
val AppOrangeGradientEnd = Color(0xFFFFC043)
val AppGreen = Color(0xFF2E9E5B)
val AppGreenDark = Color(0xFF24824A)

// Secondary accents used by the Summary charts + action cards (mirror iOS appBlue / appPurple / appRed).
val AppBlue = Color(0xFF2F6FEB)
val AppBlueLight = Color(0xFF64B5F6)
val AppPurple = Color(0xFF8E5BD9)
val AppRed = Color(0xFFE5484D)

// Categorical palette for workout-type dots (djb2-hashed by name) — the iOS Color.chartPalette port.
val ChartPalette: List<Color> = listOf(
    Color(0xFFF29900), Color(0xFF0099E6), Color(0xFF33B34D), Color(0xFF9959CC),
    Color(0xFFF24D59), Color(0xFF0DBFB3), Color(0xFFF273B3), Color(0xFF5973E6),
    Color(0xFFD98C26), Color(0xFF8CCC33), Color(0xFF1A8C80), Color(0xFFCC3380),
)

/** Stable per-name color for a workout type (djb2 hash → palette index) — matches iOS/web dot colors. */
fun workoutTypePaletteColor(name: String): Color {
    var hash = 5381
    for (ch in name) hash = (hash shl 5) + hash + ch.code
    val idx = (if (hash < 0) -hash else hash) % ChartPalette.size
    return ChartPalette[idx]
}

val LightBackground = Color(0xFFF7F7F8)
val LightSurface = Color(0xFFFFFFFF)
val LightOnSurface = Color(0xFF1A1A1A)

val DarkBackground = Color(0xFF0E0F11)
val DarkSurface = Color(0xFF1A1C1F)
val DarkOnSurface = Color(0xFFF2F2F3)

// Neutral surface/container ramp — OVERRIDES the M3 baseline (purple-tinted) roles so no lavender/pink
// ever leaks into any Material component (sheets, menus, nav bar, chips, tonal buttons, elevated cards).
// These are grey-neutral by construction; brand tints only appear where we apply them explicitly.
val LightSurfaceVariant = Color(0xFFECEDEF)
val LightSurfaceContainerLowest = Color(0xFFFFFFFF)
val LightSurfaceContainerLow = Color(0xFFF4F4F6)
val LightSurfaceContainer = Color(0xFFEFEFF1)
val LightSurfaceContainerHigh = Color(0xFFE9E9EC)
val LightSurfaceContainerHighest = Color(0xFFE3E3E6)
val LightOnSurfaceVariant = Color(0xFF45464B)
val LightOutline = Color(0xFFC4C5C9)
val LightOutlineVariant = Color(0xFFE1E2E5)

val DarkSurfaceVariant = Color(0xFF2A2C30)
val DarkSurfaceContainerLowest = Color(0xFF0A0B0D)
val DarkSurfaceContainerLow = Color(0xFF16181B)
val DarkSurfaceContainer = Color(0xFF1B1D20)
val DarkSurfaceContainerHigh = Color(0xFF242629)
val DarkSurfaceContainerHighest = Color(0xFF2E3034)
val DarkOnSurfaceVariant = Color(0xFFB8BABF)
val DarkOutline = Color(0xFF48494E)
val DarkOutlineVariant = Color(0xFF2C2E32)
