package com.app.rasifiters.ui.components.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.core.theme.RaSiFitersTheme
import com.app.rasifiters.ui.auth.PillButton

/** Error-with-no-data view (frontend-kit SPEC §6): never an endless spinner, never fake zeros. Retry shows
 *  only when a handler is given AND the error is retryable (D-KIT-8). Uses the app's capsule CTA
 *  ([PillButton]). */
@Composable
fun ErrorView(error: AppError, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null) {
    Column(
        modifier = modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            KitCopy.ERROR_VIEW_TITLE,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            error.message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null && error.retryable) {
            PillButton(label = KitCopy.RETRY, onClick = onRetry, modifier = Modifier.widthIn(max = 160.dp))
        }
    }
}

/** Retryable (with the pill) and non-retryable (no pill) cases, for the 360/412dp fit check. */
@Composable
private fun ErrorViewPreviewContent(darkTheme: Boolean) {
    RaSiFitersTheme(darkTheme = darkTheme) {
        Column {
            ErrorView(error = AppError(AppErrorKind.SERVER), onRetry = {})
            ErrorView(error = AppError(AppErrorKind.OFFLINE), onRetry = {})
            ErrorView(error = AppError(AppErrorKind.FORBIDDEN), onRetry = {})
        }
    }
}

@Preview(name = "ErrorView 360dp light", widthDp = 360, showBackground = true)
@Preview(name = "ErrorView 412dp light", widthDp = 412, showBackground = true)
@Composable
private fun ErrorViewPreview() {
    ErrorViewPreviewContent(darkTheme = false)
}

@Preview(name = "ErrorView 360dp dark", widthDp = 360, showBackground = true)
@Preview(name = "ErrorView 412dp dark", widthDp = 412, showBackground = true)
@Composable
private fun ErrorViewDarkPreview() {
    ErrorViewPreviewContent(darkTheme = true)
}
