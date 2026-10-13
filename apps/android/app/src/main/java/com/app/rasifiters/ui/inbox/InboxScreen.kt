package com.app.rasifiters.ui.inbox

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.InboxTarget
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.programs.InvitePill
import com.app.rasifiters.ui.summary.DetailTopBar
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d", Locale.US)
private val DAY_YEAR_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

/**
 * The Inbox screen — the account menu's Inbox row (picker sheet + Program tab) and a push / toast `inbox` target. The
 * same [InboxList] as the "+" sheet's tab. Kit: pull to refresh; stale → "Couldn't refresh · Retry"; back online → a
 * failed / stale list reloads. [inShell] = the Program tab's copy: a row for the program already open closes the inbox
 * and returns to the shell (the routing rule's stay-put guard). Registered in both graphs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(programContext: ProgramContext, onBack: () -> Unit, inShell: Boolean = false) {
    val itemsState by programContext.inbox.items.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var pulling by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = programContext.inbox.items.value
            if (st is UiState.Failed || st is UiState.Stale) reloadInbox(programContext)
        }
    }
    val staleBanner = online && itemsState is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { reloadInbox(programContext); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp).padding(top = 20.dp)) {
                DetailTopBar(onBack = onBack, centerTitle = "Inbox")
                Spacer(Modifier.height(16.dp))
                InboxList(
                    programContext = programContext,
                    onOpenItem = { item ->
                        programContext.inbox.openItem(item)
                        val openProgram = programContext.activeProgram.value?.id
                        if (inShell && InboxTarget.parse(item.target) == InboxTarget.PROGRAM && item.programId == openProgram) onBack()
                    },
                    onAccepted = {},
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    bottomPadding = if (staleBanner) 96.dp else 24.dp,
                )
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { scope.launch { reloadInbox(programContext) } })
        }
    }
}

/** The member's own join request (a "requested" program) — kept on every surface with its Cancel Request (A10). */
@Composable
internal fun RequestedRow(program: ProgramDTO, onCancel: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(program.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
        Text(
            "Request pending approval",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
        InvitePill("Cancel Request", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), onClick = onCancel)
    }
}

/** No notifications (shown in the Notifications section even while invitations show). */
@Composable
internal fun InboxEmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))
            .padding(vertical = 32.dp, horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            Icons.Filled.Inbox,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
            modifier = Modifier.size(40.dp),
        )
        Text("No notifications yet", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(
            "Program updates, kudos, reminders and announcements show up here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            textAlign = TextAlign.Center,
        )
    }
}

/** "Just now" · "5m ago" · "3h ago" · "Yesterday" · "Oct 12" · "Oct 12, 2025" (device time zone). */
internal fun inboxTime(iso: String?, now: Instant = Instant.now()): String {
    val at = iso?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
    val minutes = Duration.between(at, now).toMinutes().coerceAtLeast(0)
    val zone = ZoneId.systemDefault()
    val day = at.atZone(zone).toLocalDate()
    val today = now.atZone(zone).toLocalDate()
    return when {
        minutes < 1 -> "Just now"
        minutes < 60 -> "${minutes}m ago"
        day == today -> "${minutes / 60}h ago"
        day == today.minusDays(1) -> "Yesterday"
        day.year == today.year -> day.format(DAY_FMT)
        else -> day.format(DAY_YEAR_FMT)
    }
}
