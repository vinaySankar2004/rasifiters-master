package com.app.rasifiters.ui.summary

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Lock
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.SummaryData
import com.app.rasifiters.core.SummaryPart
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppOrangeGradientEnd
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.components.tapTarget
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * The Summary tab — the per-program workspace overview (Android analog of the iOS `AdminSummaryTab` /
 * web `/summary` landing). A scrollable card dashboard: program progress · MTD participation/workouts/
 * duration/avg · activity-timeline & distribution charts · top workout types · the two log action cards.
 * Shown identically to every enrolled role. Faithful 1:1 to the iOS SPEC + its web-parity data-lock banner + disabled
 * log cards. Kit (frontend-kit §5–6): this program's cached Summary shows first; the 7 reads run in parallel; a first
 * load that fails with no data → ErrorView (never zero cards); a stale reload → a floating "Couldn't refresh" banner
 * (offline is the app-wide banner); pull to refresh reloads now + runs a `pull_to_refresh` health sync.
 *
 * Android-idiom deviations (see specs/pages/android/summary/SPEC.md):
 *  • No card drag-reorder (iOS-only legacy nicety, web lacks it) — fixed vertical layout.
 *  • Progress read from the loaded ProgramDTO (progress_percent + date math), skipping the vestigial
 *    `analytics/summary` over-fetch (feeds only the deferred detail views — iOS F2 / web F5).
 * The 5 forward targets (activity / distribution / workout-types / log-workout / log-health) are stubs
 * this phase, per the iOS D-SCOPE landing-vs-details split.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummaryScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val state by programContext.summaryState.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var pulling by remember { mutableStateOf(false) }
    val memberName by programContext.memberName.collectAsStateWithLifecycle()
    val refreshToken by programContext.summaryRefreshToken.collectAsStateWithLifecycle()
    val locked = programContext.dataEntryLocked

    // Reload on program switch AND after a log-form save bumps summaryRefreshToken (D-C3).
    LaunchedEffect(program?.id, refreshToken) {
        if (program != null) programContext.loadSummary()
    }
    // D-KIT-13: back online → a failed / stale Summary reloads by itself.
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = programContext.summaryState.value
            if (st is UiState.Failed || st is UiState.Stale) programContext.loadSummary()
        }
    }

    val summary = state.dataOrNull
    // Offline is the app-wide banner (AppScaffold, A6); this screen adds only its own "Couldn't refresh".
    val staleBanner = online && state is UiState.Stale
    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { programContext.refreshSummary(); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Header(
                    programName = program?.name ?: "",
                    initials = initialsOf(memberName),
                    onOpenProfile = { onNavigate(Routes.PROGRAM_PROFILE) },
                )

                if (locked) DataLockBanner()

                val p = program
                ProgramProgressCard(
                    progress = (p?.progressPercent ?: 0).coerceIn(0, 100),
                    elapsedDays = elapsedDays(p),
                    totalDays = totalDays(p),
                    status = p?.status ?: "—",
                )

                AddWorkoutCard(locked = locked, onClick = { onNavigate(Routes.SUMMARY_LOG_WORKOUT) })
                AddDailyHealthCard(locked = locked, onClick = { onNavigate(Routes.SUMMARY_LOG_HEALTH) })

                val current = state
                when {
                    summary != null -> SummaryAnalytics(summary, onNavigate)
                    // polish-1 rule 6: no data while offline → the kit's offline view + Retry, never a spinner.
                    !online -> ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = { scope.launch { programContext.loadSummary() } })
                    current is UiState.Failed -> ErrorView(current.error, onRetry = { scope.launch { programContext.loadSummary() } })
                    else -> Box(Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }

                Spacer(Modifier.height(if (staleBanner) 84.dp else 8.dp))
            }
        }
        if (staleBanner) {
            FloatingBanner(
                FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter),
                onRetry = { scope.launch { programContext.loadSummary() } },
            )
        }
    }
}

/** The metric rows + the three chart cards (unchanged layout). A part that failed with no previous value shows "—"
 *  (A13 — never a fake zero / empty chart). */
@Composable
private fun SummaryAnalytics(summary: SummaryData, onNavigate: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        val mtd = summary.mtdParticipation
        if (mtd == null) {
            UnavailableCard("MTD Participation", Modifier.weight(1f), height = 240.dp)
        } else {
            MtdParticipationCard(
                active = mtd.activeMembers,
                total = mtd.totalMembers,
                pct = mtd.participationPct,
                change = mtd.changePct,
                modifier = Modifier.weight(1f),
            )
        }
        val total = summary.totalWorkouts
        if (total == null) UnavailableCard("Total workouts", Modifier.weight(1f), height = 240.dp)
        else TotalWorkoutsCard(total = total.totalWorkouts, change = total.changePct, modifier = Modifier.weight(1f))
    }

    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        val duration = summary.totalDuration
        if (duration == null) UnavailableCard("Total duration", Modifier.weight(1f), height = 240.dp)
        else TotalDurationCard(hours = duration.totalMinutes / 60.0, change = duration.changePct, modifier = Modifier.weight(1f))
        val avg = summary.avgDuration
        if (avg == null) UnavailableCard("Avg duration", Modifier.weight(1f), height = 240.dp)
        else AvgDurationCard(minutes = avg.avgMinutes, change = avg.changePct, modifier = Modifier.weight(1f))
    }

    if (SummaryPart.TIMELINE in summary.unavailable) UnavailableCard("Workout Activity Timeline", height = 300.dp)
    else ActivityTimelineCard(points = summary.timeline, onClick = { onNavigate(Routes.SUMMARY_ACTIVITY) })
    val distribution = summary.distribution
    if (distribution == null) UnavailableCard("Workout Distribution by Day", height = 300.dp)
    else DistributionByDayCard(orderedCounts = distribution.ordered(), onClick = { onNavigate(Routes.SUMMARY_DISTRIBUTION) })
    if (SummaryPart.TYPES in summary.unavailable) UnavailableCard("Top Workout Types")
    else WorkoutTypesCard(types = summary.workoutTypes, onClick = { onNavigate(Routes.SUMMARY_WORKOUT_TYPES) })
}

/** A card whose read failed with no previous value: its title + "—" (the stale banner explains + retries). */
@Composable
private fun UnavailableCard(title: String, modifier: Modifier = Modifier, height: Dp? = null) {
    Box(modifier) {
        SummaryCard(height = height) {
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(
                    "\u2014",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

@Composable
private fun Header(programName: String, initials: String, onOpenProfile: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text("Summary", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            Text(
                programName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        // Touch-up (c), D-PC1: the initials circle opens My Profile; system back pops back here. tapTarget goes first
        // (TapTarget.kt order rule); at 52dp the look is unchanged.
        Box(
            modifier = Modifier
                .tapTarget(label = "My Profile", shape = CircleShape, onClick = onOpenProfile)
                .size(52.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd))),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color.Black)
        }
    }
}

/** Web parity: `DATA_LOCK_MESSAGE` (lib/permissions.ts). */
private const val DATA_LOCK_MESSAGE =
    "Admin-only data entry is on for this program. Only program admins can add, edit, or delete data."

@Composable
private fun DataLockBanner() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            Icons.Filled.Lock,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            modifier = Modifier.size(18.dp),
        )
        Text(
            DATA_LOCK_MESSAGE,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
    }
}

// ---- Progress computeds (iOS ProgramContext date math; server progress_percent for the ring) ----

private fun parseDate(raw: String?): LocalDate? =
    raw?.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

private fun totalDays(p: ProgramDTO?): Int {
    val s = parseDate(p?.startDate) ?: return 0
    val e = parseDate(p?.endDate) ?: return 0
    return ChronoUnit.DAYS.between(s, e).toInt().coerceAtLeast(0)
}

private fun elapsedDays(p: ProgramDTO?): Int {
    val s = parseDate(p?.startDate) ?: return 0
    val total = totalDays(p)
    val today = LocalDate.now()
    if (!today.isAfter(s)) return 0
    return ChronoUnit.DAYS.between(s, today).toInt().coerceIn(0, total)
}

private fun initialsOf(name: String?): String {
    if (name.isNullOrBlank()) return "?"
    val initials = name.trim().split(Regex("\\s+"))
        .mapNotNull { it.firstOrNull()?.uppercaseChar() }
        .take(2)
        .joinToString("")
    return initials.ifEmpty { "?" }
}
