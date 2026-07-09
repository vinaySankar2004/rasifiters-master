package com.app.rasifiters.ui.health

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.HeartBroken
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.health.HealthSyncResult
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.program.programRowColor
import com.app.rasifiters.ui.summary.DetailTopBar
import kotlinx.coroutines.launch

/**
 * Health Connect settings — connect toggle, per-program sync selection, sync status, disconnect, for
 * both workouts and sleep (independent toggles on one screen). The Android analog of iOS
 * `AppleHealthSettingsView`. Sync itself runs from [com.app.rasifiters.health.HealthSyncController]
 * (app-lifecycle triggers); this screen configures it. Permission is granted via the Health Connect
 * permission UI (PermissionController), not a runtime dialog.
 */
@Composable
fun HealthConnectSettingsScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val health = programContext.health
    val scope = rememberCoroutineScope()

    val programs by programContext.programs.collectAsStateWithLifecycle()
    val workoutEnabled by health.workoutEnabled.collectAsStateWithLifecycle()
    val workoutProgramIds by health.workoutProgramIds.collectAsStateWithLifecycle()
    val sleepEnabled by health.sleepEnabled.collectAsStateWithLifecycle()
    val sleepProgramIds by health.sleepProgramIds.collectAsStateWithLifecycle()
    val stepsEnabled by health.stepsEnabled.collectAsStateWithLifecycle()
    val stepsProgramIds by health.stepsProgramIds.collectAsStateWithLifecycle()

    var isSyncingWorkouts by remember { mutableStateOf(false) }
    var isSyncingSleep by remember { mutableStateOf(false) }
    var isSyncingSteps by remember { mutableStateOf(false) }
    var workoutSyncError by remember { mutableStateOf<String?>(null) }
    var sleepSyncError by remember { mutableStateOf<String?>(null) }
    var stepsSyncError by remember { mutableStateOf<String?>(null) }

    // Ensure the program list is loaded so the selection + window scoping can resolve (iOS .task).
    LaunchedEffect(Unit) { if (programs.isEmpty()) runCatching { programContext.loadPrograms() } }

    val workoutPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted -> if (granted.containsAll(health.workoutPermissions)) health.enableWorkoutsAfterPermission() }

    val sleepPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted -> if (granted.containsAll(health.sleepPermissions)) health.enableSleepAfterPermission() }

    val stepsPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { granted -> if (granted.containsAll(health.stepsPermissions)) health.enableStepsAfterPermission() }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Health Connect")

            Header("Health Connect", "Automatically sync workouts, sleep, and steps from Health Connect")

            if (!health.isAvailable) {
                UnavailableCard()
            } else {
                // ── Workouts ──
                if (workoutEnabled) {
                    ConnectedRow(Icons.Filled.Favorite, "Workouts will sync automatically")
                    ProgramSelection(programs, workoutProgramIds, programContext) { health.toggleWorkoutProgram(it) }
                    SyncStatus(
                        lastSyncMillis = health.lastWorkoutSyncMillis.collectAsStateWithLifecycle().value,
                        count = health.lastWorkoutSyncCount.collectAsStateWithLifecycle().value,
                        countLabel = "Workouts Synced",
                        isSyncing = isSyncingWorkouts,
                        onSyncNow = {
                            isSyncingWorkouts = true; workoutSyncError = null
                            scope.launch {
                                if (health.performWorkoutSync() is HealthSyncResult.Failed) workoutSyncError = SYNC_NOW_ERROR
                                isSyncingWorkouts = false
                            }
                        },
                        lockedCount = lockedCount(workoutProgramIds, programContext),
                        inlineError = workoutSyncError,
                        autoRetryFailed = health.lastWorkoutSyncFailed.collectAsStateWithLifecycle().value,
                    )
                    DisconnectRow(Icons.Filled.HeartBroken, "Disconnect Workouts", "Stop syncing and clear settings") { health.disconnectWorkouts() }
                } else {
                    ConnectButton(Icons.Filled.Favorite, AppRed, "Connect Workouts", "Grant access to read your workouts") {
                        workoutPermissionLauncher.launch(health.workoutPermissions)
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                // ── Sleep (independent toggle, same screen) ──
                Header("Sleep", "Automatically log your nightly time asleep", small = true)
                if (sleepEnabled) {
                    ConnectedRow(Icons.Filled.Bedtime, "Sleep will sync automatically")
                    ProgramSelection(programs, sleepProgramIds, programContext) { health.toggleSleepProgram(it) }
                    SyncStatus(
                        lastSyncMillis = health.lastSleepSyncMillis.collectAsStateWithLifecycle().value,
                        count = health.lastSleepSyncCount.collectAsStateWithLifecycle().value,
                        countLabel = "Nights Synced",
                        isSyncing = isSyncingSleep,
                        onSyncNow = {
                            isSyncingSleep = true; sleepSyncError = null
                            scope.launch {
                                if (health.performSleepSync() is HealthSyncResult.Failed) sleepSyncError = SYNC_NOW_ERROR
                                isSyncingSleep = false
                            }
                        },
                        lockedCount = lockedCount(sleepProgramIds, programContext),
                        inlineError = sleepSyncError,
                        autoRetryFailed = health.lastSleepSyncFailed.collectAsStateWithLifecycle().value,
                    )
                    DisconnectRow(Icons.Filled.Bedtime, "Disconnect Sleep", "Stop syncing sleep and clear settings") { health.disconnectSleep() }
                } else {
                    ConnectButton(Icons.Filled.Bedtime, AppBlue, "Connect Sleep", "Grant access to read your sleep") {
                        sleepPermissionLauncher.launch(health.sleepPermissions)
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)

                // ── Steps (independent toggle, same screen) ──
                Header("Steps", "Automatically log your daily step count", small = true)
                if (stepsEnabled) {
                    ConnectedRow(Icons.AutoMirrored.Filled.DirectionsWalk, "Steps will sync automatically")
                    ProgramSelection(programs, stepsProgramIds, programContext) { health.toggleStepsProgram(it) }
                    SyncStatus(
                        lastSyncMillis = health.lastStepsSyncMillis.collectAsStateWithLifecycle().value,
                        count = health.lastStepsSyncCount.collectAsStateWithLifecycle().value,
                        countLabel = "Days Synced",
                        isSyncing = isSyncingSteps,
                        onSyncNow = {
                            isSyncingSteps = true; stepsSyncError = null
                            scope.launch {
                                if (health.performStepsSync() is HealthSyncResult.Failed) stepsSyncError = SYNC_NOW_ERROR
                                isSyncingSteps = false
                            }
                        },
                        lockedCount = lockedCount(stepsProgramIds, programContext),
                        inlineError = stepsSyncError,
                        autoRetryFailed = health.lastStepsSyncFailed.collectAsStateWithLifecycle().value,
                    )
                    DisconnectRow(Icons.AutoMirrored.Filled.DirectionsWalk, "Disconnect Steps", "Stop syncing steps and clear settings") { health.disconnectSteps() }
                } else {
                    ConnectButton(Icons.AutoMirrored.Filled.DirectionsWalk, StepsTeal, "Connect Steps", "Grant access to read your steps") {
                        stepsPermissionLauncher.launch(health.stepsPermissions)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

private const val SYNC_NOW_ERROR = "Couldn't reach the server. Check your connection and try again."
private const val AUTO_RETRY_TEXT = "Last sync couldn't reach the server — will retry automatically."

/** Steps accent — teal on every surface (DC-8). */
private val StepsTeal = Color(0xFF14B8A6)

private fun lockedCount(ids: Set<String>, programContext: ProgramContext): Int =
    ids.count { programContext.isDataEntryLocked(it) }

@Composable
private fun Header(title: String, subtitle: String, small: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            title,
            style = if (small) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
        )
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    }
}

@Composable
private fun UnavailableCard() {
    Text(
        "Health Connect isn't available on this device. Install or update Health Connect to sync.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        modifier = cardModifier().padding(14.dp),
    )
}

@Composable
private fun ConnectButton(icon: ImageVector, tint: Color, title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        modifier = cardModifier(tint.copy(alpha = 0.3f)).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        IconCircle(icon, tint)
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        Icon(Icons.Filled.ArrowForward, contentDescription = null, tint = tint)
    }
}

@Composable
private fun ConnectedRow(icon: ImageVector, subtitle: String) {
    Row(
        modifier = cardModifier(AppGreen.copy(alpha = 0.3f)).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        IconCircle(icon, AppGreen)
        Column {
            Text("Connected", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}

@Composable
private fun ProgramSelection(
    programs: List<ProgramDTO>,
    selected: Set<String>,
    programContext: ProgramContext,
    onToggle: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Sync to Programs", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        if (programs.isEmpty()) {
            Text(
                "No programs available. Join or create a program first.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                modifier = cardModifier().padding(14.dp),
            )
        } else {
            Column(modifier = cardModifier()) {
                programs.forEachIndexed { index, program ->
                    val locked = programContext.isDataEntryLocked(program.id)
                    val isSelected = program.id in selected
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable(enabled = !locked) { onToggle(program.id) }
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp),
                    ) {
                        Icon(
                            when {
                                locked -> Icons.Filled.Lock
                                isSelected -> Icons.Filled.CheckCircle
                                else -> Icons.Filled.RadioButtonUnchecked
                            },
                            contentDescription = null,
                            tint = if (locked) MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                            else if (isSelected) AppOrange else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(program.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (locked) "Admin-only — can't sync" else (program.status ?: "Active"),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                            )
                        }
                    }
                    if (index != programs.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(start = 50.dp))
                }
            }
        }
    }
}

@Composable
private fun SyncStatus(
    lastSyncMillis: Long?,
    count: Int,
    countLabel: String,
    isSyncing: Boolean,
    onSyncNow: () -> Unit,
    lockedCount: Int,
    inlineError: String?,
    autoRetryFailed: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Sync Status", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Column(modifier = cardModifier()) {
            StatusRow("Last Synced", lastSyncMillis?.let { DateUtils.getRelativeTimeSpanString(it).toString() } ?: "Never")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(start = 14.dp))
            StatusRow(countLabel, "$count")
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(start = 14.dp))
            Row(
                modifier = Modifier.fillMaxWidth().clickable(enabled = !isSyncing, onClick = onSyncNow).padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Sync Now", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = AppOrange, modifier = Modifier.weight(1f))
                if (isSyncing) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                else Icon(Icons.Filled.Sync, contentDescription = null, tint = AppOrange, modifier = Modifier.size(18.dp))
            }
        }
        if (lockedCount > 0) {
            Text(
                "$lockedCount program${if (lockedCount == 1) "" else "s"} are admin-locked and won't sync",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        // Auto-sync failures are silent (D-SIL) — this passive line (or the Sync Now inline error) is where a
        // "couldn't reach the server" state surfaces.
        if (inlineError != null) {
            Text(inlineError, style = MaterialTheme.typography.bodySmall, color = AppRed)
        } else if (autoRetryFailed) {
            Text(AUTO_RETRY_TEXT, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}

@Composable
private fun StatusRow(title: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
    }
}

@Composable
private fun DisconnectRow(icon: ImageVector, title: String, subtitle: String, onClick: () -> Unit) {
    val red = MaterialTheme.colorScheme.error
    Row(
        modifier = cardModifier(red.copy(alpha = 0.3f)).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        IconCircle(icon, red)
        Column {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = red)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
    }
}

@Composable
private fun IconCircle(icon: ImageVector, tint: Color) {
    Box(
        modifier = Modifier.size(42.dp).background(tint.copy(alpha = 0.14f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun cardModifier(borderColor: Color = MaterialTheme.colorScheme.outlineVariant): Modifier {
    val shape = RoundedCornerShape(14.dp)
    return Modifier.fillMaxWidth().background(programRowColor(), shape).border(1.dp, borderColor, shape)
}
