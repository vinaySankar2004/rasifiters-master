package com.app.rasifiters.ui.components.kit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.core.theme.RaSiFitersTheme
import com.app.rasifiters.core.theme.rfPalette

/** Which kit banner to show (frontend-kit SPEC §6). */
sealed interface FloatingBannerVariant {
    data object Offline : FloatingBannerVariant
    data object Stale : FloatingBannerVariant
    data class Error(val error: AppError) : FloatingBannerVariant
    data object UpdateAvailable : FloatingBannerVariant
}

/**
 * Slim floating status banner — net-new, not placed on any screen until Phase 3 adoption. Place it inside the
 * screen's Box: `FloatingBanner(variant, Modifier.align(Alignment.BottomCenter))`. Inside AppScaffold the
 * innerPadding already clears the NavigationBar; screens outside it (edge-to-edge, e.g. the program picker) also
 * pass `Modifier.navigationBarsPadding()`. [bottomInset] lifts it above bottom-anchored floating actions
 * (program picker: 146.dp = 56 + 14 + 56 + 20) — D-KIT-8. Min height 52dp, 48dp tap targets. Neutral M3 surface
 * roles only. Distinct from the private `ErrorBanner`s in SummaryScreen / ProgramPickerScreen (untouched).
 * The message is never clamped (web parity): the offline error copy beside Retry + × wraps to ~3 lines at 360dp.
 */
@Composable
fun FloatingBanner(
    variant: FloatingBannerVariant,
    modifier: Modifier = Modifier,
    bottomInset: Dp = 0.dp,
    onRetry: (() -> Unit)? = null,
    onDismiss: (() -> Unit)? = null,
    onUpdate: (() -> Unit)? = null,
) {
    val palette = rfPalette()
    val message = when (variant) {
        FloatingBannerVariant.Offline -> KitCopy.BANNER_OFFLINE
        FloatingBannerVariant.Stale -> KitCopy.BANNER_STALE
        is FloatingBannerVariant.Error -> variant.error.message
        FloatingBannerVariant.UpdateAvailable -> KitCopy.BANNER_UPDATE
    }
    val dotColor = when (variant) {
        FloatingBannerVariant.Offline, FloatingBannerVariant.Stale -> palette.warning
        is FloatingBannerVariant.Error -> palette.danger
        FloatingBannerVariant.UpdateAvailable -> palette.accent
    }
    val action: Pair<String, () -> Unit>? = when (variant) {
        FloatingBannerVariant.Offline -> null
        FloatingBannerVariant.Stale -> onRetry?.let { KitCopy.RETRY to it }
        is FloatingBannerVariant.Error -> onRetry?.takeIf { variant.error.retryable }?.let { KitCopy.RETRY to it }
        FloatingBannerVariant.UpdateAvailable -> onUpdate?.let { KitCopy.UPDATE to it }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 12.dp + bottomInset),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .fillMaxWidth()
                .semantics { liveRegion = LiveRegionMode.Polite },
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            shadowElevation = 6.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Row(
                modifier = Modifier
                    .heightIn(min = 52.dp)
                    .padding(start = 16.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(dotColor))
                Text(
                    message,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                action?.let { (label, run) ->
                    TextButton(onClick = run) {
                        Text(label, color = palette.accent, fontWeight = FontWeight.SemiBold)
                    }
                }
                onDismiss?.let { dismiss ->
                    IconButton(onClick = dismiss) {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = KitCopy.DISMISS,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}

/** Every variant, worst case (offline error copy + Retry + ×) included, for the 360/412dp fit check. */
@Composable
private fun FloatingBannerPreviewContent(darkTheme: Boolean) {
    RaSiFitersTheme(darkTheme = darkTheme) {
        Column {
            FloatingBanner(FloatingBannerVariant.Offline)
            FloatingBanner(FloatingBannerVariant.Stale, onRetry = {}, onDismiss = {})
            FloatingBanner(FloatingBannerVariant.Error(AppError(AppErrorKind.OFFLINE)), onRetry = {}, onDismiss = {})
            FloatingBanner(FloatingBannerVariant.Error(AppError(AppErrorKind.UPDATE_REQUIRED)), onDismiss = {})
            FloatingBanner(FloatingBannerVariant.UpdateAvailable, onDismiss = {}, onUpdate = {})
        }
    }
}

@Preview(name = "Banner 360dp light", widthDp = 360, showBackground = true)
@Preview(name = "Banner 412dp light", widthDp = 412, showBackground = true)
@Composable
private fun FloatingBannerPreview() {
    FloatingBannerPreviewContent(darkTheme = false)
}

@Preview(name = "Banner 360dp dark", widthDp = 360, showBackground = true)
@Preview(name = "Banner 412dp dark", widthDp = 412, showBackground = true)
@Composable
private fun FloatingBannerDarkPreview() {
    FloatingBannerPreviewContent(darkTheme = true)
}
