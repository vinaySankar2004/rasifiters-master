package com.app.rasifiters.ui.lifestyle

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.core.theme.workoutTypePaletteColor
import com.app.rasifiters.net.HealthTimelineResponse
import com.app.rasifiters.net.WorkoutTypeDTO
import com.app.rasifiters.ui.summary.SleepDietChart
import com.app.rasifiters.ui.summary.SummaryCard
import java.util.Locale

// Faithful 1:1 port of the iOS Lifestyle (workout-types) cards (Features/Home/Tabs/WorkoutTypesCards.swift),
// in the Material idiom: SummaryCard shells (the iOS CardShell analog), brand-accent value + chip per card.
// The popularity card ports WorkoutPopularityLogic/Components; the preview card ports LifestyleTimelineCardSummary.

// ---- The 4 stat cards (2×2 grid) ----

/** The small "Program to date" accent pill under each card title. */
@Composable
private fun AccentChip(label: String, accent: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(accent.copy(alpha = 0.18f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = accent)
    }
}

/** A single Lifestyle stat card: title · "Program to date" chip · accent value · footnote. */
@Composable
private fun StatCard(
    title: String,
    accent: Color,
    value: String,
    footnote: String,
    bigNumber: Boolean,
    modifier: Modifier = Modifier,
) {
    Box(modifier) {
        SummaryCard(height = 172.dp) {
            Column(modifier = Modifier.fillMaxHeight()) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                AccentChip("Program to date", accent)
                Spacer(Modifier.weight(1f))
                Text(
                    value,
                    style = if (bigNumber) MaterialTheme.typography.headlineMedium else MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = accent,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.weight(1f))
                Text(
                    footnote,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

@Composable
fun WorkoutTypesTotalCard(total: Int, modifier: Modifier = Modifier) =
    StatCard("Total workout types", AppOrange, "$total", "different exercises", bigNumber = true, modifier = modifier)

@Composable
fun WorkoutTypeMostPopularCard(name: String?, sessions: Int, modifier: Modifier = Modifier) =
    StatCard(
        "Most popular", AppPurple, name ?: "N/A",
        if (name == null) "No data" else "$sessions workouts", bigNumber = false, modifier = modifier,
    )

@Composable
fun WorkoutTypeLongestDurationCard(name: String?, avgMinutes: Int, modifier: Modifier = Modifier) =
    StatCard(
        "Longest duration", AppRed, name ?: "N/A",
        if (name == null) "No data" else "$avgMinutes mins avg", bigNumber = false, modifier = modifier,
    )

@Composable
fun WorkoutTypeHighestParticipationCard(name: String?, participationPct: Double, modifier: Modifier = Modifier) =
    StatCard(
        "Highest participation", AppGreen, name ?: "N/A",
        if (name == null) "No data" else String.format(Locale.US, "%.1f%% of members", participationPct),
        bigNumber = false, modifier = modifier,
    )

// ---- Workout Type Popularity card (segmented metric + ranked bars) ----

/** The metric the popularity chart ranks by (iOS `WorkoutPopularityMetric`). */
enum class PopularityMetric(val title: String, val axisLabel: String) {
    COUNT("Count", "Workouts"),
    TOTAL_MINUTES("Total Minutes", "Minutes"),
    AVG_MINUTES("Avg Minutes", "Avg mins");

    fun value(t: WorkoutTypeDTO): Int = when (this) {
        COUNT -> t.sessions
        TOTAL_MINUTES -> t.totalDuration
        AVG_MINUTES -> t.avgDurationMinutes
    }

    fun formatted(t: WorkoutTypeDTO): String = when (this) {
        COUNT -> "${t.sessions}"
        TOTAL_MINUTES -> "${t.totalDuration} mins"
        AVG_MINUTES -> "${t.avgDurationMinutes} mins"
    }
}

@Composable
fun WorkoutTypePopularityCard(types: List<WorkoutTypeDTO>) {
    var metric by remember { mutableStateOf(PopularityMetric.COUNT) }
    var showAll by remember { mutableStateOf(false) }

    SummaryCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Workout Type Popularity", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)

            if (types.isEmpty()) {
                Text(
                    "No workouts logged yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            } else {
                MetricSegmented(selected = metric, onSelect = { metric = it })

                Text(
                    metric.axisLabel,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )

                val sorted = types.sortedByDescending { metric.value(it) }
                val shown = if (showAll) sorted else sorted.take(6)
                val maxValue = shown.maxOfOrNull { metric.value(it) }?.coerceAtLeast(1) ?: 1

                shown.forEach { t ->
                    RankedBarRow(
                        name = t.workoutName,
                        displayValue = metric.formatted(t),
                        fraction = (metric.value(t).toFloat() / maxValue).coerceIn(0f, 1f),
                        color = workoutTypePaletteColor(t.workoutName),
                    )
                }

                if (sorted.size > 6) {
                    Text(
                        if (showAll) "Show top 6" else "Show all",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = AppOrange,
                        modifier = Modifier.clickable { showAll = !showAll },
                    )
                }
            }
        }
    }
}

/** One ranked-bar row: name (left) · value (right) · a full-width track with a colored fill (iOS `RankedBarList`). */
@Composable
private fun RankedBarRow(name: String, displayValue: String, fraction: Float, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.size(8.dp))
            Text(
                displayValue,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(4.dp))
                    .background(color),
            )
        }
    }
}

/** The 3-segment Count / Total Minutes / Avg Minutes picker (iOS `SegmentedMetricPicker`). */
@Composable
private fun MetricSegmented(selected: PopularityMetric, onSelect: (PopularityMetric) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(11.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        PopularityMetric.entries.forEach { m ->
            val active = m == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (active) MaterialTheme.colorScheme.surfaceContainerHighest else Color.Transparent)
                    .clickable { onSelect(m) }
                    .padding(vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    m.title,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    maxLines = 1,
                )
            }
        }
    }
}

// ---- Lifestyle Timeline preview card (tap → the drill-down) ----

/** The tappable Lifestyle-timeline preview: sleep bars + diet line over the recent window (iOS `LifestyleTimelineCardSummary`). */
@Composable
fun LifestyleTimelinePreviewCard(timeline: HealthTimelineResponse?, onClick: () -> Unit) {
    val points = timeline?.buckets ?: emptyList()
    SummaryCard(modifier = Modifier.clickable(onClick = onClick), height = 300.dp) {
        Column(modifier = Modifier.fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Lifestyle Timeline", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "Sleep · Diet quality",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
                Icon(
                    Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f),
                )
            }

            if (points.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text(
                        "No data yet",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
            } else {
                val trimmed = points.takeLast(10)
                SleepDietChart(
                    labels = trimmed.map { it.label },
                    sleepHours = trimmed.map { it.sleepHours },
                    dietQuality = trimmed.map { it.foodQuality },
                    dualAxis = false,
                    barColor = AppBlue.copy(alpha = 0.9f),
                    lineColor = AppGreen,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                )
            }
        }
    }
}
