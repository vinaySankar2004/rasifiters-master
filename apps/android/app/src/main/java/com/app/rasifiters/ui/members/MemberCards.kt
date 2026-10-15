package com.app.rasifiters.ui.members

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.FormatListBulleted
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.outlined.Timelapse
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.MemberCardKey
import com.app.rasifiters.core.MemberCardPart
import com.app.rasifiters.core.MemberCardsLoad
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.theme.AppBlueLight
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple
import com.app.rasifiters.core.theme.AppYellow
import com.app.rasifiters.net.MemberMetricsDTO
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.programs.initialsOf
import com.app.rasifiters.ui.summary.BarLineChart
import com.app.rasifiters.ui.summary.SummaryCard
import com.app.rasifiters.ui.summary.TooltipData
import com.app.rasifiters.ui.summary.TooltipRow
import com.app.rasifiters.ui.summary.axisLabels
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.roundToInt

// Faithful 1:1 port of the iOS Members inline cards (MemberCards.swift / MemberOverviewPicker.swift),
// rendered in the Material idiom (flat SummaryCard in place of iOS's glassy CardShell — the established
// Android deviation). Same content, ordering, labels, empty copy. Every card reads ProgramContext state
// loaded upstream by the tab; each is a chevron-header drill-down (a NavigationLink push on iOS).
// S5 (polish #32): each card takes a [CardState] — its data, a placeholder, or "—" (never a fake empty / 0-day streak).

// ---- Metrics sort model (iOS SortField / SortDirection — MemberOverviewPicker.swift:200) ----

enum class MetricSortField(val api: String, val label: String) {
    WORKOUTS("workouts", "Workouts"),
    TOTAL_DURATION("total_duration", "Total Duration"),
    AVG_DURATION("avg_duration", "Avg Duration"),
    AVG_SLEEP("avg_sleep_hours", "Avg Sleep"),
    ACTIVE_DAYS("active_days", "Active Days"),
    WORKOUT_TYPES("workout_types", "Workout Types"),
    CURRENT_STREAK("current_streak", "Current Streak"),
    LONGEST_STREAK("longest_streak", "Longest Streak"),
    AVG_FOOD("avg_food_quality", "Avg Diet Quality"),
    AVG_STEPS("avg_steps", "Avg Steps"),
}

enum class SortDir(val api: String, val label: String) {
    DESC("desc", "Descending"),
    ASC("asc", "Ascending"),
}

/** The hero value for a metric, formatted per the sort field (iOS `MemberMetricsCard.heroValue`). */
fun heroValue(field: MetricSortField, m: MemberMetricsDTO): String = when (field) {
    MetricSortField.WORKOUTS -> "${m.workouts}"
    MetricSortField.TOTAL_DURATION -> "${m.totalDuration} min"
    MetricSortField.AVG_DURATION -> "${m.avgDuration} min"
    MetricSortField.AVG_SLEEP -> m.avgSleepHours?.let { String.format(Locale.US, "%.1f hrs", it) } ?: "—"
    MetricSortField.ACTIVE_DAYS -> "${m.activeDays}"
    MetricSortField.WORKOUT_TYPES -> "${m.workoutTypes}"
    MetricSortField.CURRENT_STREAK -> "${m.currentStreak}"
    MetricSortField.LONGEST_STREAK -> "${m.longestStreak}"
    MetricSortField.AVG_FOOD -> m.avgFoodQuality?.let { "$it / 5" } ?: "—"
    MetricSortField.AVG_STEPS -> m.avgSteps?.let { String.format(Locale.US, "%,d", it) } ?: "—"
}

/** "Xh Ym" / "Xh" / "Ym" / "0m" — iOS `formatDuration` (MemberCards.swift:6). */
fun formatDurationHM(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return when {
        h > 0 && m > 0 -> "${h}h ${m}m"
        h > 0 -> "${h}h"
        else -> "${m}m"
    }
}

// ---- Shared bits ----

@Composable
fun MemberInitialsAvatar(name: String?, size: Int, admin: Boolean = false) {
    val bg = if (admin) AppOrange.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant
    Box(
        modifier = Modifier.size(size.dp).clip(CircleShape).background(bg),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initialsOf(name),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = if (admin) AppOrange else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** Clickable card wrapper + a chevron header row — the drill-down idiom (iOS `NavigationLink` push). */
@Composable
private fun DrillCard(onClick: () -> Unit, content: @Composable () -> Unit) {
    SummaryCard(modifier = Modifier.clip(RoundedCornerShape(20.dp)).clickable(onClick = onClick)) { content() }
}

@Composable
private fun CardChevronHeader(title: String, subtitle: String?) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
        Icon(
            Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
        )
    }
}

@Composable
private fun StatTile(icon: ImageVector, label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(
                icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                modifier = Modifier.size(15.dp),
            )
            Text(
                label,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

/** A compact, icon-less stat tile (label over value) — the metrics-preview mini tiles (iOS parity). */
@Composable
private fun MiniStatTile(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(4.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun EmptyLine(text: String) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
}

// ---- S5 (polish #32): the cards' load state ----

private const val UNAVAILABLE_TEXT = "—"

/** What a Members card shows: its data, a loading placeholder (its read for THIS member is still running), or "—" (that
 *  read failed and nothing of this member's is held). Never a fake empty / 0-day streak, never another member's values. */
enum class CardState { DATA, PENDING, UNAVAILABLE }

/** A card body that isn't [CardState.DATA]: the placeholder block or "—". */
@Composable
private fun CardStateBody(state: CardState, height: Dp = 90.dp) {
    if (state == CardState.UNAVAILABLE) {
        EmptyLine(UNAVAILABLE_TEXT)
    } else {
        Box(
            modifier = Modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
        )
    }
}

/** The five per-member cards (the admin body, a logger / member's own, People "Open full stats"). */
internal val MEMBER_PARTS: Set<MemberCardPart> = setOf(
    MemberCardPart.OVERVIEW, MemberCardPart.HISTORY, MemberCardPart.STREAKS, MemberCardPart.RECENT, MemberCardPart.HEALTH,
)
/** Recent + Health — a logger's View-as re-scopes only these. */
internal val LOGS_PARTS: Set<MemberCardPart> = setOf(MemberCardPart.RECENT, MemberCardPart.HEALTH)

/**
 * One screen's view of its cards (the S5 data rule): [want] = the program + member each card is for; [held] = whose data
 * each shared flow holds (ProgramContext.memberCardsHeld); [load] = the latest read per part (ProgramContext.memberCardsLoad).
 */
internal class MemberCardsView(
    private val want: Map<MemberCardPart, MemberCardKey>,
    private val held: Map<MemberCardPart, MemberCardKey>,
    private val load: MemberCardsLoad,
) {
    private fun hasData(part: MemberCardPart): Boolean = want[part] != null && held[part] == want[part]
    private fun lastFailed(part: MemberCardPart): Boolean =
        want[part] != null && load.keys[part] == want[part] && part in load.failed

    fun stateOf(part: MemberCardPart): CardState = when {
        hasData(part) -> CardState.DATA
        lastFailed(part) -> CardState.UNAVAILABLE
        else -> CardState.PENDING
    }

    /** Something of this program / member is on screen. */
    val anyData: Boolean get() = want.keys.any { hasData(it) }
    /** Every card's read failed and none holds this member's data → the ErrorView. */
    val allFailed: Boolean get() = want.isNotEmpty() && want.keys.all { !hasData(it) && lastFailed(it) }
    /** A refresh failed while data shows → "Couldn't refresh · Retry" (the previous values stay — A13). */
    val stale: Boolean get() = anyData && want.keys.any { lastFailed(it) }
    /** Back online: anything missing or failed reloads. */
    val needsReload: Boolean get() = want.keys.any { !hasData(it) || lastFailed(it) }
    val error: AppError? get() = load.error
}

// ---- Member Overview (F2: reads selectedMemberOverview; the passed member is vestigial) ----

@Composable
fun MemberOverviewCard(programContext: ProgramContext, state: CardState = CardState.DATA) {
    val overview by programContext.selectedMemberOverview.collectAsStateWithLifecycle()
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    SummaryCard {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text("Member Overview", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(12.dp))
            val o = overview
            if (state != CardState.DATA) {
                CardStateBody(state)
            } else if (o == null) {
                EmptyLine("No workouts logged yet.")
            } else {
                val totalDays = programTotalDays(program)
                val progress = if (totalDays > 0) ((o.activeDays.toDouble() / totalDays) * 100).roundToInt().coerceIn(0, 100) else 0  // D2 clamp
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MemberInitialsAvatar(o.memberName, 48)
                    Spacer(Modifier.size(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(o.memberName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "MTD Workouts: ${o.mtdWorkouts ?: 0}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("$progress%", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = AppOrange)
                        Text("PTD MP %", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                    }
                }
                Spacer(Modifier.height(14.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val totalHrs = o.totalHours ?: (o.totalDuration / 60)
                    StatTile(Icons.Outlined.Timelapse, "Total Time", "$totalHrs hrs", Modifier.weight(1f))
                    StatTile(Icons.Filled.Star, "Favorite", o.favoriteWorkout ?: "—", Modifier.weight(1f))
                }
                Spacer(Modifier.height(14.dp))
                Text("PTD - Member Progress", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = { if (totalDays > 0) (o.activeDays.toFloat() / totalDays).coerceIn(0f, 1f) else 0f },
                    modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
                    color = AppOrange,
                    trackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    "${o.activeDays} / $totalDays days",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

// ---- Member Metrics card (self, in the standard tab) — hero + 4×2 grid + streak chip ----

@Composable
fun MemberMetricsCard(metric: MemberMetricsDTO, hero: MetricSortField) {
    SummaryCard {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MemberInitialsAvatar(metric.memberName, 44)
                Spacer(Modifier.size(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(metric.memberName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "Workouts ${metric.workouts}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(heroValue(hero, metric), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = AppOrange)
                    Text(hero.label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
            }
            Spacer(Modifier.height(14.dp))
            MetricsGrid(metric)
        }
    }
}

@Composable
private fun MetricsGrid(m: MemberMetricsDTO) {
    val avgSleep = m.avgSleepHours?.let { String.format(Locale.US, "%.1f", it) } ?: "—"
    val avgDiet = m.avgFoodQuality?.let { "$it / 5" } ?: "—"  // A7: as the hero + iOS + web
    val avgSteps = m.avgSteps?.let { String.format(Locale.US, "%,d", it) } ?: "—"
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile(Icons.Filled.CalendarMonth, "Active Days", "${m.activeDays}", Modifier.weight(1f))
            StatTile(Icons.Filled.FitnessCenter, "Workouts", "${m.workouts}", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile(Icons.Filled.FormatListBulleted, "Workout Types", "${m.workoutTypes}", Modifier.weight(1f))
            StatTile(Icons.Filled.Timer, "Total Duration", "${m.totalDuration} min", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile(Icons.Outlined.Timelapse, "Avg Duration", "${m.avgDuration} min", Modifier.weight(1f))
            StatTile(Icons.Filled.EmojiEvents, "Longest Streak", "${m.longestStreak}", Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile(Icons.Filled.Bedtime, "Avg Sleep", avgSleep, Modifier.weight(1f))
            StatTile(Icons.Filled.Restaurant, "Avg Diet Quality", avgDiet, Modifier.weight(1f))
        }
        // Row 5 (steps feature): Avg Steps tile + the current-streak chip promoted into the grid (DC-9/DC-10).
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StatTile(Icons.AutoMirrored.Filled.DirectionsWalk, "Avg Steps", avgSteps, Modifier.weight(1f))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                StreakChip(m.currentStreak)
            }
        }
    }
}

@Composable
private fun StreakChip(current: Int) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(AppOrange.copy(alpha = 0.15f))
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.Filled.LocalFireDepartment, contentDescription = null, tint = AppOrange, modifier = Modifier.size(16.dp))
        Text("Current Streak $current", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = AppOrange)
    }
}

// ---- Member Metrics PREVIEW card (admin tab) — over-fetches, renders top member + count (F4) ----

@Composable
fun MemberMetricsPreviewCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {
    val metrics by programContext.memberMetrics.collectAsStateWithLifecycle()
    val total by programContext.memberMetricsTotal.collectAsStateWithLifecycle()
    // S5: loaded by the tab with the member cards (ProgramContext.loadMemberCards, METRICS) — shown only when it is this
    // program's; else a placeholder, or "—" when the read failed. Never another program's leaderboard.
    val count = if (total > 0) total else metrics.size
    val subtitle = when (state) {
        CardState.DATA -> "$count ${if (count == 1) "member" else "members"}"
        CardState.PENDING -> null
        CardState.UNAVAILABLE -> UNAVAILABLE_TEXT
    }
    DrillCard(onClick = onClick) {
        Column(modifier = Modifier.fillMaxWidth()) {
            CardChevronHeader("Member Performance Metrics", subtitle)
            Spacer(Modifier.height(12.dp))
            val top = metrics.firstOrNull()
            when {
                state != CardState.DATA -> CardStateBody(state)
                top == null -> EmptyLine("No members to display")
                else -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Star, contentDescription = null, tint = AppOrange, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(
                            top.memberName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Column(horizontalAlignment = Alignment.End) {
                            Text("${top.activeDays}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = AppOrange)
                            Text("Active Days", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    // Icon-less mini tiles here (matches iOS preview) so "Active Days" stays on one line.
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MiniStatTile("Active Days", "${top.activeDays}", Modifier.weight(1f))
                        MiniStatTile("Workouts", "${top.workouts}", Modifier.weight(1f))
                        MiniStatTile("Types", "${top.workoutTypes}", Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

// ---- Workout Activity Timeline card (per-member) — chart preview → history detail ----

@Composable
fun MemberHistoryCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {
    val history by programContext.memberHistory.collectAsStateWithLifecycle()
    DrillCard(onClick = onClick) {
        Column(modifier = Modifier.fillMaxWidth()) {
            CardChevronHeader("Workout Activity Timeline", "Workouts")
            Spacer(Modifier.height(12.dp))
            val buckets = history?.buckets ?: emptyList()
            if (state != CardState.DATA) {
                CardStateBody(state, height = 200.dp)
            } else if (buckets.isEmpty()) {
                EmptyLine("No workouts logged yet.")
            } else {
                // No tooltip on the tab-level preview — the card is a drill-down, so a tap must navigate,
                // not intercept for a callout (matches the Summary tab's timeline card). Tooltip lives in
                // the Workout History detail. See [[chart-tooltips-mandatory]] (detail charts only for previews).
                BarLineChart(
                    values = buckets.map { it.workouts },
                    labels = axisLabels(buckets.map { it.label }, history?.period ?: "week"),
                    lineValues = null,
                    barColor = AppOrange,
                    lineColor = AppPurple,
                    barWidth = 14.dp,
                    modifier = Modifier.fillMaxWidth().height(200.dp),
                )
            }
        }
    }
}

// ---- Streak Stats card ----

@Composable
fun MemberStreakCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {
    val streaks by programContext.memberStreaks.collectAsStateWithLifecycle()
    DrillCard(onClick = onClick) {
        Column(modifier = Modifier.fillMaxWidth()) {
            CardChevronHeader("Streak Stats", "Current and longest")
            Spacer(Modifier.height(12.dp))
            val s = streaks
            if (state != CardState.DATA || s == null) {
                // S5: not loaded / failed → a placeholder or "—", never a fake 0-day streak.
                CardStateBody(if (state == CardState.DATA) CardState.UNAVAILABLE else state, height = 80.dp)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StreakTile(Icons.Filled.LocalFireDepartment, AppOrange, "Current", "${s.currentStreakDays} days", Modifier.weight(1f))
                    StreakTile(Icons.Filled.EmojiEvents, AppYellow, "Longest", "${s.longestStreakDays} days", Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
fun StreakTile(icon: ImageVector, tint: Color, label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
        }
        Spacer(Modifier.height(8.dp))
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
    }
}

// ---- View Workouts card (per-member recent, top 3) ----

@Composable
fun MemberRecentCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {
    val recent by programContext.memberRecent.collectAsStateWithLifecycle()
    DrillCard(onClick = onClick) {
        Column(modifier = Modifier.fillMaxWidth()) {
            CardChevronHeader("View Workouts", "All workouts")
            Spacer(Modifier.height(12.dp))
            if (state != CardState.DATA) {
                CardStateBody(state)
            } else if (recent.isEmpty()) {
                EmptyLine("No workouts logged yet.")
            } else {
                recent.take(3).forEach { w ->
                    ListLine(dotColor = AppOrange, title = w.workoutType, subtitle = w.workoutDate, trailing = formatDurationHM(w.durationMinutes))
                }
            }
        }
    }
}

// ---- View Health card (per-member health logs, top 3) ----

@Composable
fun MemberHealthCard(programContext: ProgramContext, state: CardState = CardState.DATA, onClick: () -> Unit) {
    val logs by programContext.memberHealthLogs.collectAsStateWithLifecycle()
    DrillCard(onClick = onClick) {
        Column(modifier = Modifier.fillMaxWidth()) {
            CardChevronHeader("View Health", "Daily health logs")
            Spacer(Modifier.height(12.dp))
            if (state != CardState.DATA) {
                CardStateBody(state)
            } else if (logs.isEmpty()) {
                EmptyLine("No daily health logs yet.")
            } else {
                // DC-10 row: date on top; one muted Sleep · Diet · Steps metrics line below ("—" when unset).
                logs.take(3).forEach { h ->
                    val sleep = h.sleepHours?.let { String.format(Locale.US, "%.1f hrs", it) } ?: "—"
                    val diet = h.foodQuality?.let { "$it/5" } ?: "—"
                    val steps = h.steps?.let { String.format(Locale.US, "%,d", it) } ?: "—"
                    ListLine(
                        dotColor = AppBlueLight,
                        title = h.logDate,
                        subtitle = "Sleep $sleep · Diet $diet · Steps $steps",
                        trailing = "",
                    )
                }
            }
        }
    }
}

@Composable
private fun ListLine(dotColor: Color, title: String, subtitle: String, trailing: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(dotColor))
        Spacer(Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        }
        Text(trailing, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

// ---- PTD (D2, Members page SPEC): days so far = start → min(end, today) inclusive, min 1, in the device's local calendar day (log dates are local days); 0 when a date is missing ----

internal fun programTotalDays(program: ProgramDTO?): Int {
    val start = parseIso(program?.startDate) ?: return 0
    val end = parseIso(program?.endDate) ?: return 0
    val today = LocalDate.now()
    val upper = if (end.isBefore(today)) end else today
    if (upper.isBefore(start)) return 1
    return (ChronoUnit.DAYS.between(start, upper).toInt() + 1).coerceAtLeast(1)
}

private fun parseIso(raw: String?): LocalDate? =
    raw?.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

// ---- Chart tooltip (shared by the member-history card + detail; iOS callout parity — every chart has one) ----

private val TOOLTIP_DATE_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d")

internal fun memberWorkoutsTooltip(iso: String, label: String, workouts: Int): TooltipData {
    val title = runCatching { LocalDate.parse(iso.take(10)).format(TOOLTIP_DATE_FMT) }.getOrElse { label.ifBlank { "—" } }
    return TooltipData(
        title = title,
        rows = listOf(TooltipRow("$workouts ${if (workouts == 1) "workout" else "workouts"}", AppOrange)),
    )
}
