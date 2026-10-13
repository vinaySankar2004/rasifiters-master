package com.app.rasifiters.ui.program

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.NotificationPreferencesUpdate
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** One category switch (the category key + label) with its one-line explanation — the same copy on web and iOS. */
private data class CategoryRow(val key: String, val title: String, val hint: String, val default: Boolean)

private val CATEGORY_ROWS = listOf(
    CategoryRow("program", "Program & invites", "Invites, role changes and updates to your programs.", true),
    CategoryRow("activity", "Activity", "Kudos from people in your programs.", true),
    CategoryRow("reminders", "Reminders", "One reminder a day around your chosen time, only if you haven't logged a workout that day.", false),
    CategoryRow("digest", "Weekly digest", "A recap of your past week, every Monday morning.", false),
    CategoryRow("announcements", "Announcements", "News and messages from the RaSi Fiters team.", true),
)

/** Honest opt-in wording — the same on all three. */
private const val OPT_IN_NOTE =
    "Reminders and the weekly digest are off until you turn them on. With Program & invites or Announcements off, " +
        "you get no alert, but they still appear in your Inbox."

/**
 * The notification preferences — the five category switches and, while Reminders is on, the reminder time (the M3
 * time picker in a dialog; default 19:00). The time zone is never picked: it rides every request (X-Time-Zone).
 * Kit: loading → spinner, failed → ErrorView + Retry (offline copy while offline); a change moves at once and goes back
 * on failure (the kit message under the list). The stale banner is the host screen's (NotificationsScreen).
 */
@Composable
fun NotificationPreferencesSection(programContext: ProgramContext) {
    val inbox = programContext.inbox
    val state by inbox.preferences.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { inbox.loadPreferences() }

    fun save(update: NotificationPreferencesUpdate) {
        error = null
        scope.launch { inbox.savePreferences(update).onFailure { error = it.toAppError().message } }
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Notify me about", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        val current = state
        val prefs = current.dataOrNull
        when {
            prefs != null -> {
                CATEGORY_ROWS.forEach { row ->
                    PreferenceRow(row.title, row.hint, checked = prefs.categories[row.key] ?: row.default) { on ->
                        save(NotificationPreferencesUpdate(categories = mapOf(row.key to on)))
                    }
                }
                if (prefs.categories["reminders"] == true) {
                    ReminderTimeRow(prefs.reminderTime) { picked -> save(NotificationPreferencesUpdate(reminderTime = picked)) }
                }
                Text(
                    OPT_IN_NOTE,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
                error?.let { FormErrorText(it) }
            }
            !online -> ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = { scope.launch { inbox.loadPreferences() } })
            current is UiState.Failed -> ErrorView(current.error, onRetry = { scope.launch { inbox.loadPreferences() } })
            else -> Box(Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AppOrange)
            }
        }
    }
}

@Composable
private fun PreferenceRow(title: String, hint: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onChange)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        Switch(checked = checked, onCheckedChange = null)
    }
}

/** The reminder time — the M3 time picker inside a dialog (themed like the app's date pickers). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReminderTimeRow(time: String, onPick: (String) -> Unit) {
    val context = LocalContext.current
    val local = runCatching { LocalTime.parse(time) }.getOrDefault(LocalTime.of(19, 0))
    var open by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .clickable { open = true }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Reminder time", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "Uses your phone's time zone.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        Text(
            local.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = AppOrange,
        )
    }
    if (open) {
        val pickerState = rememberTimePickerState(local.hour, local.minute, DateFormat.is24HourFormat(context))
        // Full width minus 16dp margins: the platform dialog width clips the 12-hour AM/PM toggle at 360dp.
        AlertDialog(
            onDismissRequest = { open = false },
            properties = DialogProperties(usePlatformDefaultWidth = false),
            modifier = Modifier.padding(horizontal = 16.dp),
            confirmButton = {
                TextButton(onClick = {
                    open = false
                    onPick(String.format(Locale.US, "%02d:%02d", pickerState.hour, pickerState.minute))
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
            title = { Text("Reminder time") },
            text = { TimePicker(state = pickerState) },
        )
    }
}
