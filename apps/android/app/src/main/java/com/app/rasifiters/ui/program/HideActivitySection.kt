package com.app.rasifiters.ui.program

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch

/** What "Hide my activity" hides and from whom — the same sentence on web and iOS. */
private const val HIDE_ACTIVITY_HINT =
    "Hides your workouts, streaks and kudos from other members of your programs, and hides theirs from you. Program " +
        "admins and loggers still see everyone's."

/**
 * My Profile's "Hide my activity" switch (one switch for every program; only the member sets it). [hidden] = the saved
 * value from `GET /members/:id` (null = not loaded / a server without People → disabled). A change shows at once and goes
 * back if the save fails or isn't confirmed by the server (the kit message under it).
 */
@Composable
fun HideActivitySection(programContext: ProgramContext, hidden: Boolean?, onSaved: (Boolean) -> Unit) {
    val scope = rememberCoroutineScope()
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val memberId = programContext.loggedInMemberId
    val enabled = hidden != null && memberId != null && !saving

    fun change(next: Boolean) {
        val id = memberId ?: return
        val before = hidden == true
        onSaved(next); saving = true; error = null
        scope.launch {
            programContext.people.setHideActivity(id, next)
                .onSuccess { onSaved(it) }
                .onFailure { e -> onSaved(before); error = e.toAppError().message }
            saving = false
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .toggleable(value = hidden == true, enabled = enabled, role = Role.Switch, onValueChange = { change(it) }),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("Hide my activity", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    HIDE_ACTIVITY_HINT,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            Spacer(Modifier.width(12.dp))
            Switch(checked = hidden == true, onCheckedChange = null, enabled = enabled)
        }
        error?.let { FormErrorText(it) }
    }
}
