package com.app.rasifiters.core.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance

/**
 * The shared brand palette = web's rf-* tokens, light / dark (frontend-kit SPEC §7, DESIGN_BOARD W7-D1).
 * NEW tokens only — `AppOrange` (Color.kt) and the M3 `primary` (Theme.kt) stay as-is until Phase 3 adoption
 * (repointing them restyles every screen, D-KIT-1 / D-KIT-10).
 */
@Immutable
data class RfPalette(
    val accent: Color,
    val accentStrong: Color,
    val danger: Color,
    val success: Color,
    val warning: Color,
    val info: Color,
)

val RfLightPalette = RfPalette(
    accent = Color(0xFFFF8B1F),
    accentStrong = Color(0xFFFF7A00),
    danger = Color(0xFFEF4444),
    success = Color(0xFF2FB861),
    warning = Color(0xFFF59E0B),
    info = Color(0xFF2563EB),
)

val RfDarkPalette = RfPalette(
    accent = Color(0xFFFF9C3A),
    accentStrong = Color(0xFFFF8B1F),
    danger = Color(0xFFF87171),
    success = Color(0xFF36C56F),
    warning = Color(0xFFFBBF24),
    info = Color(0xFF60A5FA),
)

/** The palette for the active theme — reads the colorScheme (not the system setting), so the in-app
 *  Appearance override wins. */
@Composable
@ReadOnlyComposable
fun rfPalette(): RfPalette =
    if (MaterialTheme.colorScheme.background.luminance() < 0.5f) RfDarkPalette else RfLightPalette
