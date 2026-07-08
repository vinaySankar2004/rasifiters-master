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

private val DAY_SHORT = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")

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
private fun topSixWithOthers(types: List<WorkoutTypeDTO>): List<WorkoutTypeDTO> {
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

// MARK: - Canvas bar + optional line chart
// A faithful analog of the iOS Swift Charts card: a left y-axis (nice ticks + faint gridlines), thin
// rounded orange bars, and (timeline only) a Catmull-Rom-smoothed active-members line with points.

@Composable
private fun BarLineChart(
    values: List<Int>,
    labels: List<String>,
    lineValues: List<Int>?,
    barColor: Color,
    lineColor: Color,
    barWidth: Dp,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    val axisColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
    val gridColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)
    val labelStyle = TextStyle(fontSize = 11.sp, color = axisColor)

    val dataMax = max(values.maxOrNull() ?: 0, lineValues?.maxOrNull() ?: 0).coerceAtLeast(1)
    val (axisMax, step) = niceAxis(dataMax)

    Canvas(modifier = modifier.fillMaxWidth()) {
        val leftPad = 30.dp.toPx()
        val bottomPad = 20.dp.toPx()
        val topPad = 8.dp.toPx()
        val plotLeft = leftPad
        val plotTop = topPad
        val plotBottom = size.height - bottomPad
        val plotW = size.width - leftPad
        val plotH = plotBottom - plotTop

        fun yFor(v: Float) = plotBottom - (v / axisMax) * plotH

        // Gridlines + y-axis tick labels
        var t = 0
        while (t <= axisMax) {
            val y = yFor(t.toFloat())
            drawLine(gridColor, Offset(plotLeft, y), Offset(size.width, y), strokeWidth = 1f)
            val layout = measurer.measure("$t", labelStyle)
            drawText(
                layout,
                topLeft = Offset(plotLeft - 6.dp.toPx() - layout.size.width, y - layout.size.height / 2f),
            )
            t += step
        }

        val n = values.size.coerceAtLeast(1)
        val slot = plotW / n
        val barW = min(barWidth.toPx(), slot * 0.7f)
        val radius = CornerRadius(barW * 0.45f, barW * 0.45f)

        values.forEachIndexed { i, v ->
            val cx = plotLeft + i * slot + slot / 2f
            val h = (v / axisMax.toFloat()) * plotH
            if (h > 0f) {
                drawRoundRect(
                    color = barColor,
                    topLeft = Offset(cx - barW / 2f, plotBottom - h),
                    size = Size(barW, h),
                    cornerRadius = radius,
                )
            }
            val labelLayout = measurer.measure(labels.getOrElse(i) { "" }, labelStyle)
            drawText(labelLayout, topLeft = Offset(cx - labelLayout.size.width / 2f, plotBottom + 4.dp.toPx()))
        }

        lineValues?.let { lv ->
            val pts = lv.mapIndexed { i, v -> Offset(plotLeft + i * slot + slot / 2f, yFor(v.toFloat())) }
            if (pts.size >= 2) {
                drawPath(smoothPath(pts), color = lineColor, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round))
            }
            pts.forEach { p ->
                drawCircle(Color.White, radius = 4.dp.toPx(), center = p)
                drawCircle(lineColor, radius = 3.dp.toPx(), center = p)
            }
        }
    }
}

/** A rounded max + step for ~4 y-axis ticks (the Swift Charts `automatic(desiredCount:)` analog). */
private fun niceAxis(maxV: Int): Pair<Int, Int> {
    val m = maxV.coerceAtLeast(1)
    val rawStep = (m / 4.0).coerceAtLeast(1.0)
    val magnitude = 10.0.pow(floor(log10(rawStep)))
    val norm = rawStep / magnitude
    val niceNorm = when {
        norm <= 1 -> 1.0
        norm <= 2 -> 2.0
        norm <= 5 -> 5.0
        else -> 10.0
    }
    val step = (niceNorm * magnitude).roundToInt().coerceAtLeast(1)
    val ticks = ceil(m.toDouble() / step).toInt().coerceAtLeast(1)
    return (step * ticks) to step
}

/** Catmull-Rom → cubic-bezier smoothing (the iOS `.interpolationMethod(.catmullRom)` analog). */
private fun smoothPath(pts: List<Offset>): Path {
    val path = Path()
    if (pts.isEmpty()) return path
    path.moveTo(pts[0].x, pts[0].y)
    for (i in 0 until pts.size - 1) {
        val p0 = pts[max(0, i - 1)]
        val p1 = pts[i]
        val p2 = pts[i + 1]
        val p3 = pts[min(pts.size - 1, i + 2)]
        val c1 = Offset(p1.x + (p2.x - p0.x) / 6f, p1.y + (p2.y - p0.y) / 6f)
        val c2 = Offset(p2.x - (p3.x - p1.x) / 6f, p2.y - (p3.y - p1.y) / 6f)
        path.cubicTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y)
    }
    return path
}

private fun Modifier.clickableCard(onClick: () -> Unit): Modifier = this.clickable(onClick = onClick)
