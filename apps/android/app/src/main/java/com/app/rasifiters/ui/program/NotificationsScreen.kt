package com.app.rasifiters.ui.program

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.summary.DetailTopBar
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

/**
 * "Notifications" — whether this phone lets RaSi Fiters notify, with a real way to fix it: **Enable Notifications** asks
 * in-app (Android 13+, until the member has said no twice), else **Open Settings** opens the app's notification
 * settings; re-checked on resume. Below it the category switches and the reminder time
 * ([NotificationPreferencesSection]). Kit: a failed refresh of loaded settings → "Couldn't refresh · Retry"; back online →
 * a failed / stale load reloads.
 */
@Composable
fun NotificationsScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val prefsState by programContext.inbox.preferences.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var enabled by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    var canAsk by remember { mutableStateOf(canAskPermission(context, programContext)) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        programContext.markNotificationPermissionAsked()
        programContext.registerPushTokenIfNeeded()
        enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        canAsk = canAskPermission(context, programContext)
    }

    // Re-check when returning from system settings.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
                canAsk = canAskPermission(context, programContext)
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    // D-KIT-13: back online → a failed / stale preferences load reloads by itself.
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = programContext.inbox.preferences.value
            if (st is UiState.Failed || st is UiState.Stale) programContext.inbox.loadPreferences()
        }
    }
    val staleBanner = online && prefsState is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Notifications")
            Column {
                Text("Notifications", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Choose what RaSi Fiters notifies you about.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            StatusCard(enabled)
            if (!enabled) {
                PillButton(
                    label = if (canAsk) "Enable Notifications" else "Open Settings",
                    onClick = {
                        if (canAsk) {
                            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        } else {
                            context.startActivity(
                                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
                            )
                        }
                    },
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                )
            }
            NotificationPreferencesSection(programContext)
            Spacer(Modifier.height(if (staleBanner) 72.dp else 0.dp))
        }
        if (staleBanner) {
            FloatingBanner(
                FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter),
                onRetry = { scope.launch { programContext.inbox.loadPreferences() } },
            )
        }
    }
}

@Composable
private fun StatusCard(enabled: Boolean) {
    val tint = if (enabled) AppOrange else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(modifier = Modifier.size(42.dp).background(tint.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(
                if (enabled) Icons.Filled.Notifications else Icons.Filled.NotificationsOff,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(18.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(if (enabled) "Enabled" else "Disabled", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                if (enabled) "You'll get alerts for the categories switched on below."
                else "Notifications are off for RaSi Fiters on this phone.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
    }
}

/** The in-app ask works on Android 13+ until the member has said no twice (no rationale left) — then only the system
 *  settings page can turn notifications on. Below Android 13 there is no runtime ask. */
private fun canAskPermission(context: Context, programContext: ProgramContext): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return false
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return false
    val activity = context.findActivity() ?: return false
    return programContext.shouldAskNotificationPermission() ||
        ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
