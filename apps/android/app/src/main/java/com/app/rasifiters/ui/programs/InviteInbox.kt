package com.app.rasifiters.ui.programs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.net.PendingInviteDTO
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** One pending invite (invites §3.1) — the iOS InviteCard content inside the sheet's existing card chrome. Global
 *  admins (All Invites, A10) also see who the invite is to and a Revoke pill. */
@Composable
fun InviteCard(
    invite: PendingInviteDTO,
    busy: Boolean,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
    onRevoke: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(invite.programName ?: "Unknown Program", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
        if (onRevoke != null) {
            (invite.invitedMemberName ?: invite.invitedUsername)?.let { name ->
                val handle = invite.invitedUsername?.takeIf { invite.invitedMemberName != null }?.let { " @$it" }.orEmpty()
                Text(
                    "To: $name$handle", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            inviteDateRange(invite.programStartDate, invite.programEndDate), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
        invite.invitedByName?.let {
            Text("Invited by $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
        }
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            InvitePill("Accept", AppOrange, enabled = !busy, onClick = onAccept)
            InvitePill("Decline", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), enabled = !busy, onClick = onDecline)
            onRevoke?.let { InvitePill("Revoke", AppRed, enabled = !busy, onClick = it) }
        }
    }
}

/** iOS DeclineInviteDialog parity: confirm + optional "Block future invites". */
@Composable
fun DeclineInviteDialog(programName: String, onDecline: (blockFuture: Boolean) -> Unit, onDismiss: () -> Unit) {
    var block by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Decline invitation?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(programName)
                Row(Modifier.fillMaxWidth().clickable { block = !block }, verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = block, onCheckedChange = { block = it }, colors = CheckboxDefaults.colors(checkedColor = AppOrange))
                    Text("Block future invites")
                }
            }
        },
        confirmButton = { TextButton(onClick = { onDecline(block) }) { Text("Decline", color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
internal fun InvitePill(label: String, color: Color, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        modifier = Modifier.clip(CircleShape).background(color.copy(alpha = 0.16f)).clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 8.dp),
    ) { Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = color) }
}

private val INVITE_DATE_OUT = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

/** "Oct 1, 2026 – Dec 31, 2026" (iOS InviteCard), "Start" / "End" when missing. */
private fun inviteDateRange(start: String?, end: String?): String {
    fun fmt(d: String?) = d?.let { runCatching { LocalDate.parse(it.take(10)).format(INVITE_DATE_OUT) }.getOrNull() }
    return "${fmt(start) ?: "Start"} – ${fmt(end) ?: "End"}"
}
