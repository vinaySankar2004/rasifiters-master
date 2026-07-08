package com.app.rasifiters.ui.summary

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple
import com.app.rasifiters.core.theme.workoutTypePaletteColor
import com.app.rasifiters.net.ActivityTimelinePoint
import com.app.rasifiters.net.WorkoutTypeDTO
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

// Faithful 1:1 port of the iOS Summary chart cards (Features/Home/Tabs/SummaryChartCards.swift).
// Swift Charts has no Compose equivalent, so bars/lines are drawn on a Canvas — same data, same
// orange bars + purple active-members line + categorical workout-type dots.

@Composable
private fun ChartCardHeader(title: String, subtitle: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
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
private fun NoDataYet() {
    Box(modifier = Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
        Text(
            "No data yet",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
    }
}

// MARK: - Activity timeline (bars = workouts, line + points = active members)

@Composable
fun ActivityTimelineCard(points: List<ActivityTimelinePoint>, onClick: () -> Unit) {
    val trimmed = points.takeLast(10)
    SummaryCard(height = 300.dp, modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(20.dp)).clickableCard(onClick)) {
        Column(modifier = Modifier.fillMaxWidth()) {
            ChartCardHeader("Workout Activity Timeline", "Workouts · Active members")
            Spacer(Modifier.height(12.dp))
            if (trimmed.isEmpty()) {
                NoDataYet()
            } else {
                BarLineChart(
                    values = trimmed.map { it.workouts },
                    labels = trimmed.map { it.label },
                    lineValues = trimmed.map { it.activeMembers },
                    barColor = AppOrange,
                    lineColor = AppPurple,
                    barWidth = 12.dp,
                    modifier = Modifier.fillMaxWidth().height(210.dp),
                )
            }
        }
    }
}

// MARK: - Distribution by day (7 fixed bars, Sun–Sat, non-interactive on the landing)

internal val DAY_SHORT = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

@Composable
fun DistributionByDayCard(orderedCounts: List<Int>, onClick: () -> Unit) {
    SummaryCard(height = 300.dp, modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(20.dp)).clickableCard(onClick)) {
        Column(modifier = Modifier.fillMaxWidth()) {
            ChartCardHeader("Workout Distribution by Day")
            Spacer(Modifier.height(12.dp))
            if (orderedCounts.isEmpty()) {
                NoDataYet()
            } else {
                BarLineChart(
                    values = orderedCounts,
                    labels = DAY_SHORT,
                    lineValues = null,
                    barColor = AppOrange,
                    lineColor = AppPurple,
                    barWidth = 16.dp,
                    modifier = Modifier.fillMaxWidth().height(220.dp),
                )
            }
        }
    }
}

// MARK: - Top workout types (top 5 + "Others")

@Composable
fun WorkoutTypesCard(types: List<WorkoutTypeDTO>, onClick: () -> Unit) {
    val rows = topSixWithOthers(types)
    SummaryCard(modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(20.dp)).clickableCard(onClick)) {
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ChartCardHeader("Top Workout Types")
            if (rows.isEmpty()) {
                Text(
                    "No workouts logged yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            } else {
                rows.forEach { t ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(workoutTypePaletteColor(t.workoutName)),
                        )
                        Spacer(Modifier.size(8.dp))
                        Text(
                            t.workoutName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Text("${t.sessions}", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

/** iOS `WorkoutTypesSummaryCard.topSixWithOthers`: top 5 by sessions + an "Others" rollup. */
internal fun topSixWithOthers(types: List<WorkoutTypeDTO>): List<WorkoutTypeDTO> {
    val sorted = types.sortedByDescending { it.sessions }
    val topFive = sorted.take(5)
    val others = sorted.drop(5)
    val list = topFive.toMutableList()
    if (others.isNotEmpty()) {
        val totalSessions = others.sumOf { it.sessions }
        val totalDuration = others.sumOf { it.totalDuration }
        val avg = if (totalSessions > 0) (totalDuration.toDouble() / totalSessions).roundToInt() else 0
        list.add(WorkoutTypeDTO("Others", totalSessions, totalDuration, avg))
    }
    return list.take(6)
}

private fun Modifier.clickableCard(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)
