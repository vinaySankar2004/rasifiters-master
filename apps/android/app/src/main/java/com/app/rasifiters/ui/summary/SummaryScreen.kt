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
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppOrangeGradientEnd
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.Routes
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * The Summary tab — the per-program workspace overview (Android analog of the iOS `AdminSummaryTab` /
 * web `/summary` landing). A scrollable card dashboard: program progress · MTD participation/workouts/
 * duration/avg · activity-timeline & distribution charts · top workout types · the two log action cards.
 * Shown identically to every enrolled role. Faithful 1:1 to the iOS SPEC + its two web-parity reconciles
 * (error banner, `admin_only_data_entry` data-lock banner + disabled log cards).
 *
 * Android-idiom deviations (see specs/pages/android/summary/SPEC.md):
 *  • No card drag-reorder (iOS-only legacy nicety, web lacks it) — fixed vertical layout.
 *  • Header avatar shows the signed-in user's initials (web parity) rather than the program admin's (iOS).
 *  • Progress read from the loaded ProgramDTO (progress_percent + date math), skipping the vestigial
 *    `analytics/summary` over-fetch (feeds only the deferred detail views — iOS F2 / web F5).
 * The 5 forward targets (activity / distribution / workout-types / log-workout / log-health) are stubs
 * this phase, per the iOS D-SCOPE landing-vs-details split.
 */
@Composable
fun SummaryScreen(programContext: ProgramContext, onNavigate: (String) -> Unit) {
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val summary by programContext.summary.collectAsStateWithLifecycle()
    val error by programContext.summaryError.collectAsStateWithLifecycle()
    val memberName by programContext.memberName.collectAsStateWithLifecycle()
    val refreshToken by programContext.summaryRefreshToken.collectAsStateWithLifecycle()
    val locked = programContext.dataEntryLocked

    // Reload on program switch AND after a log-form save bumps summaryRefreshToken (D-C3).
    LaunchedEffect(program?.id, refreshToken) {
        if (program != null) programContext.loadSummary()
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Header(programName = program?.name ?: "", initials = initialsOf(memberName))

            error?.let { ErrorBanner(it) }
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

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                val mtd = summary.mtdParticipation
                if (mtd == null) {
                    MetricPlaceholderCard("MTD Participation", Modifier.weight(1f))
                } else {
                    MtdParticipationCard(
                        active = mtd.activeMembers,
                        total = mtd.totalMembers,
                        pct = mtd.participationPct,
                        change = mtd.changePct,
                        modifier = Modifier.weight(1f),
                    )
                }
                TotalWorkoutsCard(
                    total = summary.totalWorkouts?.totalWorkouts ?: 0,
                    change = summary.totalWorkouts?.changePct ?: 0.0,
                    modifier = Modifier.weight(1f),
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                TotalDurationCard(
                    hours = (summary.totalDuration?.totalMinutes ?: 0) / 60.0,
                    change = summary.totalDuration?.changePct ?: 0.0,
                    modifier = Modifier.weight(1f),
                )
                AvgDurationCard(
                    minutes = summary.avgDuration?.avgMinutes ?: 0,
                    change = summary.avgDuration?.changePct ?: 0.0,
                    modifier = Modifier.weight(1f),
                )
            }

            ActivityTimelineCard(points = summary.timeline, onClick = { onNavigate(Routes.SUMMARY_ACTIVITY) })
            DistributionByDayCard(
                orderedCounts = summary.distribution?.ordered() ?: emptyList(),
                onClick = { onNavigate(Routes.SUMMARY_DISTRIBUTION) },
            )
            WorkoutTypesCard(types = summary.workoutTypes, onClick = { onNavigate(Routes.SUMMARY_WORKOUT_TYPES) })

            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun Header(programName: String, initials: String) {
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
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd))),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = androidx.compose.ui.graphics.Color.Black)
        }
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.12f))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.error)
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
