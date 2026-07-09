package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.AppearanceMode
import com.app.rasifiters.core.AppearanceStore
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.summary.DetailTopBar

/**
 * "Appearance" — System / Light / Dark chooser + a live preview card. Faithful to the iOS
 * AppearanceSettingsView; writes to [AppearanceStore], which drives the app theme at the root.
 */
@Composable
fun AppearanceScreen(appearanceStore: AppearanceStore, onBack: () -> Unit) {
    val mode by appearanceStore.mode.collectAsStateWithLifecycle()

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Appearance")
            Column {
                Text("Appearance", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Choose how RaSi Fit'ers looks to you",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppearanceMode.entries.forEach { option ->
                    AppearanceOption(
                        icon = option.icon(),
                        title = option.displayName,
                        description = option.description(),
                        selected = option == mode,
                        onClick = { appearanceStore.setMode(option) },
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Preview",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(programRowColor(), RoundedCornerShape(14.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Box(
                        modifier = Modifier.size(48.dp).background(AppOrange.copy(alpha = 0.16f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.BarChart, contentDescription = null, tint = AppOrange, modifier = Modifier.size(22.dp))
                    }
                    Column {
                        Text("Sample Card", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            "This is how cards will appear",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AppearanceOption(
    icon: ImageVector,
    title: String,
    description: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, if (selected) AppOrange.copy(alpha = 0.6f) else MaterialTheme.colorScheme.outlineVariant, shape)
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .background(if (selected) AppOrange.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceContainerHighest, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (selected) AppOrange else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        if (selected) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = AppOrange, modifier = Modifier.size(22.dp))
        }
    }
}

private fun AppearanceMode.icon(): ImageVector = when (this) {
    AppearanceMode.SYSTEM -> Icons.Filled.Settings
    AppearanceMode.LIGHT -> Icons.Filled.LightMode
    AppearanceMode.DARK -> Icons.Filled.DarkMode
}

private fun AppearanceMode.description(): String = when (this) {
    AppearanceMode.SYSTEM -> "Follows your device settings"
    AppearanceMode.LIGHT -> "Always use light appearance"
    AppearanceMode.DARK -> "Always use dark appearance"
}
