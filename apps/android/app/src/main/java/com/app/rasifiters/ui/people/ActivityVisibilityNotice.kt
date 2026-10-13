package com.app.rasifiters.ui.people

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch

/** The notice copy — the same on web and iOS. */
private const val NOTICE_TITLE = "Who can see your activity"
private const val NOTICE_BODY =
    "Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or " +
        "Health Connect. Sleep, diet and steps stay private to you and your program's staff."

/**
 * Shows the one-time "Who can see your activity" notice when [enabled] (the first People open; on the program picker,
 * members already syncing Health Connect workouts) — the activity-notice rule: once per member on this device, skipped
 * when the member already hides their activity, never before the first-start notification prompt has been answered and
 * never over the Health Connect review.
 */
@Composable
fun ActivityVisibilityNoticeHost(programContext: ProgramContext, enabled: Boolean) {
    val context = LocalContext.current
    val promptOpen by programContext.notificationPromptOpen.collectAsStateWithLifecycle()
    val pendingReview by programContext.health.pendingConfirmation.collectAsStateWithLifecycle()
    val memberId = programContext.loggedInMemberId
    var show by remember { mutableStateOf(false) }
    val ready = enabled && !promptOpen && permissionAnswered(context, programContext) && pendingReview == null

    LaunchedEffect(ready, memberId) {
        val id = memberId
        if (!ready || id == null || show) return@LaunchedEffect
        val people = programContext.people
        if (people.activityNoticeSeen(id)) return@LaunchedEffect
        when (people.fetchHideActivity(id)) {
            false -> show = true
            true -> people.markActivityNoticeSeen(id)   // already hidden: nothing to tell
            null -> Unit                                 // unknown (offline, or no People on the server yet): later
        }
    }
    if (show && pendingReview == null) ActivityVisibilityNotice(programContext, onDone = { show = false })
}

/** The first-start POST_NOTIFICATIONS ask is behind us: no runtime ask below Android 13, already granted, or asked. */
private fun permissionAnswered(context: Context, programContext: ProgramContext): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED ||
        !programContext.shouldAskNotificationPermission()

/**
 * The notice itself: [Keep visible] closes it; [Hide my activity] saves the switch (`PUT /members/:id`) and only a
 * confirmed save closes it. It counts as seen only once a choice landed, so it can't be dismissed without one (the iOS
 * alert's behaviour).
 */
@Composable
private fun ActivityVisibilityNotice(programContext: ProgramContext, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val memberId = programContext.loggedInMemberId

    fun finish() {
        programContext.people.markActivityNoticeSeen(memberId)
        onDone()
    }

    AlertDialog(
        onDismissRequest = {},
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false),
        title = { Text(NOTICE_TITLE) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(NOTICE_BODY)
                error?.let { FormErrorText(it) }
            }
        },
        confirmButton = { TextButton(enabled = !saving, onClick = { finish() }) { Text("Keep visible") } },
        dismissButton = {
            TextButton(
                enabled = !saving && memberId != null,
                onClick = {
                    val id = memberId ?: return@TextButton
                    saving = true; error = null
                    scope.launch {
                        programContext.people.setHideActivity(id, true)
                            .onSuccess { finish() }
                            .onFailure { e -> error = e.toAppError().message; saving = false }
                    }
                },
            ) { Text("Hide my activity") }
        },
    )
}
