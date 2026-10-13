package com.app.rasifiters.ui.inbox

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.InboxItemDTO
import kotlinx.coroutines.delay

private const val TOAST_MS = 5_000L

/**
 * The notification toast (the kit's toast rule — it replaces the blocking pop-up queue): "<title> · View · ×" at the TOP
 * of the screen for 5 s (a deliberate exception to the kit's bottom placement: the bottom holds the offline / stale
 * banner, the nav and FABs); the newest replaces the previous (the rest wait in the Inbox). View opens the item (marks
 * it read + routes); × or the time running out just hides it (it stays unread). Shown only for categories switched on,
 * never while an inbox, a form, a sheet or a cover is on screen (it is cleared then, never shown late). Chrome = the kit banner's (neutral surface, 1px border, soft shadow, max 520 wide,
 * ≥ 48dp tap targets); announced politely to screen readers.
 */
@Composable
fun BoxScope.NotificationToast(programContext: ProgramContext) {
    val inbox = programContext.inbox
    val item by inbox.toast.collectAsStateWithLifecycle()
    val inboxVisible by inbox.inboxVisible.collectAsStateWithLifecycle()
    val formOpen by inbox.formOpen.collectAsStateWithLifecycle()
    LaunchedEffect(item?.id) {
        val id = item?.id ?: return@LaunchedEffect
        delay(TOAST_MS)
        inbox.dismissToast(id)
    }
    AnimatedContent(
        targetState = item?.takeIf { !inboxVisible && !formOpen },
        transitionSpec = { fadeIn() togetherWith fadeOut() },
        contentKey = { it?.id },
        label = "notificationToast",
        modifier = Modifier
            .align(Alignment.TopCenter)
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) { shown ->
        if (shown != null) {
            ToastCard(shown, onView = { inbox.openItem(shown) }, onDismiss = { inbox.dismissToast(shown.id) })
        }
    }
}

@Composable
private fun ToastCard(item: InboxItemDTO, onView: () -> Unit, onDismiss: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 6.dp,
        modifier = Modifier
            .widthIn(max = 520.dp)
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Row(
            modifier = Modifier.heightIn(min = 52.dp).padding(start = 16.dp, end = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(AppOrange))
            Spacer(Modifier.width(10.dp))
            Text(
                item.title.ifBlank { "New notification" },
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onView, modifier = Modifier.heightIn(min = 48.dp)) {
                Text("View", color = AppOrange, fontWeight = FontWeight.SemiBold)
            }
            IconButton(onClick = onDismiss) {
                Icon(
                    Icons.Filled.Close,
                    contentDescription = "Dismiss",
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}
