package com.app.rasifiters.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppYellow
import com.app.rasifiters.net.KudosDTO
import com.app.rasifiters.net.PersonProfileDTO
import com.app.rasifiters.net.PersonStatsDTO
import com.app.rasifiters.net.PersonWorkoutDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.members.formatDurationHM
import com.app.rasifiters.ui.program.ProgramSettingsRow
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.SummaryCard
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

private const val HIDDEN_LINE = "This member keeps their activity private."

/**
 * A person's profile — workouts only: streaks, active days this month, last active, the last 10 workouts, and kudos
 * (one per day, undoable, a count). Hidden from this viewer → name only + [HIDDEN_LINE]. Staff get "Open full stats" (the
 * Members cards); global admins also "Edit membership". Kit: loading → spinner, failed → ErrorView + Retry, stale →
 * "Couldn't refresh · Retry", pull to refresh, reload on reconnect.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonProfileScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val people = programContext.people
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val memberId by people.focusedId.collectAsStateWithLifecycle()
    val state by people.profile.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var pulling by remember { mutableStateOf(false) }
    var kudosBusy by remember { mutableStateOf(false) }
    var kudosError by remember { mutableStateOf<String?>(null) }
    val programId = program?.id

    suspend fun reload() {
        val pid = programId ?: return
        val mid = memberId ?: return
        people.loadProfile(pid, mid)
    }
    LaunchedEffect(programId, memberId) { reload() }
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = people.profile.value
            if (st is UiState.Failed || st is UiState.Stale) reload()
        }
    }

    val current = state
    val profile = current.dataOrNull
    val staleBanner = online && current is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { reload(); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp).padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                DetailTopBar(onBack = onBack, centerTitle = "Profile")
                when {
                    profile != null -> ProfileContent(
                        p = profile,
                        kudosBusy = kudosBusy,
                        kudosError = kudosError,
                        onKudos = {
                            kudosBusy = true; kudosError = null
                            scope.launch {
                                people.toggleKudos().onFailure { kudosError = it.toAppError().message }
                                kudosBusy = false
                            }
                        },
                        onFullStats = {
                            programContext.focusMember(profile.memberId, profile.memberName)
                            onNavigate(Routes.MEMBER_FULL_STATS)
                        },
                        onEditMembership = if (programContext.isGlobalAdmin) ({
                            programContext.focusMember(profile.memberId, profile.memberName)
                            onNavigate(Routes.MEMBER_EDIT)
                        }) else null,
                    )
                    !online -> ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = { scope.launch { reload() } })
                    current is UiState.Failed -> ErrorView(current.error, onRetry = { scope.launch { reload() } })
                    else -> Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = AppOrange)
                    }
                }
                Spacer(Modifier.height(if (staleBanner) 96.dp else 24.dp))
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { scope.launch { reload() } })
        }
    }
}

@Composable
private fun ProfileContent(
    p: PersonProfileDTO,
    kudosBusy: Boolean,
    kudosError: String?,
    onKudos: () -> Unit,
    onFullStats: () -> Unit,
    onEditMembership: (() -> Unit)?,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        PersonInitials(p.initials, 64, accent = p.programRole == "admin")
        Spacer(Modifier.width(14.dp))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(p.memberName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (p.username.isNotBlank()) {
                Text("@${p.username}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (p.isYou || roleLabel(p.programRole) != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) { PeopleMarkers(p.isYou, p.programRole) }
            }
        }
    }
    if (!p.activityVisible) {
        SummaryCard {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Icon(Icons.Filled.VisibilityOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                Text(HIDDEN_LINE, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
            }
        }
    } else {
        p.stats?.let { StatsGrid(it) }
        p.kudos?.let { KudosCard(it, kudosBusy, kudosError, onKudos) }
        p.recentWorkouts?.let { RecentWorkoutsCard(it) }
    }
    if (p.canOpenFullStats) {
        ProgramSettingsRow(Icons.Filled.BarChart, AppOrange, "Open full stats", "History, streaks, health", onClick = onFullStats)
    }
    onEditMembership?.let {
        ProgramSettingsRow(Icons.Filled.Edit, AppBlue, "Edit membership", "Joined date, status, remove", onClick = it)
    }
}

private fun days(n: Int): String = if (n == 1) "1 day" else "$n days"

/** 2×2 compact tiles — one-line label over one-line value, so both tiles of a row share a height and fit at 360dp. */
@Composable
private fun StatsGrid(s: PersonStatsDTO) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileStat(Icons.Filled.LocalFireDepartment, AppOrange, "Current streak", days(s.currentStreak), Modifier.weight(1f))
            ProfileStat(Icons.Filled.EmojiEvents, AppYellow, "Longest streak", days(s.longestStreak), Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProfileStat(Icons.Filled.CalendarMonth, AppBlue, "This month", days(s.activeDaysThisMonth), Modifier.weight(1f))
            ProfileStat(Icons.Filled.History, AppGreen, "Last active", peopleDay(s.lastActive) ?: "—", Modifier.weight(1f))
        }
    }
}

@Composable
private fun ProfileStat(icon: ImageVector, tint: Color, label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(6.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun KudosCard(kudos: KudosDTO, busy: Boolean, error: String?, onToggle: () -> Unit) {
    SummaryCard {
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.ThumbUp, contentDescription = null, tint = AppOrange, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text("${kudos.count} kudos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (kudos.canGive) KudosButton(kudos.givenToday, busy, onToggle)
            }
            if (kudos.canGive && kudos.givenToday) {
                Text(
                    "You gave kudos today. Tap again to undo.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            error?.let { FormErrorText(it) }
        }
    }
}

@Composable
private fun KudosButton(given: Boolean, busy: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(CircleShape)
            .background(if (given) AppOrange.copy(alpha = 0.16f) else AppOrange)
            .clickable(enabled = !busy, role = Role.Button, onClick = onClick)
            .padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (busy) {
            CircularProgressIndicator(strokeWidth = 2.dp, color = if (given) AppOrange else Color.Black, modifier = Modifier.size(18.dp))
        } else {
            Text(
                if (given) "Kudos given" else "Give kudos",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = if (given) AppOrange else Color.Black,
            )
        }
    }
}

@Composable
private fun RecentWorkoutsCard(workouts: List<PersonWorkoutDTO>) {
    SummaryCard {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text("Recent workouts", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            if (workouts.isEmpty()) {
                Text("No workouts logged yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            } else {
                workouts.forEach { w ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(w.workoutType, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(peopleDay(w.date) ?: w.date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                        Text(formatDurationHM(w.durationMinutes), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
