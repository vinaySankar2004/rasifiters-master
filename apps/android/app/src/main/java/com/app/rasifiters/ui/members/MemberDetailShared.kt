package com.app.rasifiters.ui.members

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.app.rasifiters.ui.summary.CircleBackButton
import java.io.File

// Shared chrome for the four writeable/exportable Members detail screens (metrics / workouts / health).

/** A CSV field, quoted + escaped per RFC 4180 (the iOS `exportCSV` faithful equivalent). */
fun csvField(value: String): String = "\"" + value.replace("\"", "\"\"") + "\""

/**
 * Write [content] to cache/exports/[filename] and fire an ACTION_SEND chooser — the Android analogue of the
 * iOS ShareSheet CSV export. Best-effort; failures are swallowed (export is a convenience, not a data path).
 */
fun shareCsv(context: Context, filename: String, content: String) {
    runCatching {
        val dir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(dir, filename)
        file.writeText(content)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Export CSV").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

/**
 * Back button + centered title + a trailing share (export) circle button. The title sits in a weighted
 * middle slot (between the two 44dp circles) with `maxLines=1` + auto-shrink so a long title like
 * "Member Performance Metrics" fits on narrow screens instead of clipping under the buttons.
 */
@Composable
fun DetailTopBarWithExport(onBack: () -> Unit, title: String, exportEnabled: Boolean, onExport: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().height(44.dp), verticalAlignment = Alignment.CenterVertically) {
        CircleBackButton(onBack)
        AutoFitTitle(title, modifier = Modifier.weight(1f).padding(horizontal = 8.dp))
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .alpha(if (exportEnabled) 1f else 0.4f)
                .clickable(enabled = exportEnabled, onClick = onExport),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.IosShare,
                contentDescription = "Export CSV",
                tint = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/** A centered bold title that shrinks its font (down to ~15sp) to stay on ONE line in the space it's given. */
@Composable
private fun AutoFitTitle(title: String, modifier: Modifier = Modifier) {
    var scaled by remember(title) { mutableStateOf(22.sp) }
    var settled by remember(title) { mutableStateOf(false) }
    Text(
        title,
        modifier = modifier,
        style = MaterialTheme.typography.titleLarge,
        fontSize = scaled,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        maxLines = 1,
        softWrap = false,
        onTextLayout = { result ->
            if (!settled && result.hasVisualOverflow && scaled > 15.sp) {
                scaled = (scaled.value - 1f).sp
            } else {
                settled = true
            }
        },
    )
}
