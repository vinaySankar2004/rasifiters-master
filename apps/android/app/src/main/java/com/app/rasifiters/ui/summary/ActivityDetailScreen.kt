package com.app.rasifiters.ui.summary

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple
import com.app.rasifiters.net.ActivityTimelinePoint
import kotlin.math.roundToInt

private data class Period(val key: String, val short: String, val range: String)

private val PERIODS = listOf(
    Period("week", "W", "This Week"),
    Period("month", "M", "This Month"),
    Period("year", "Y", "This Year"),
    Period("program", "P", "Program to date"),
)

/**
 * The Workout Activity Timeline drill-down (iOS `ActivityTimelineDetailView`). Period-switchable
 * (W/M/Y/P), re-fetching the timeline on each change; a daily-average header + the workouts bars /
 * active-members line chart. Read-only analytics (activity-detail §7 — `admin_only_data_entry` N/A).
 */
@Composable
fun ActivityDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    var period by remember { mutableStateOf(PERIODS.first()) }
    var points by remember { mutableStateOf<List<ActivityTimelinePoint>>(emptyList()) }
    var dailyAverage by remember { mutableStateOf(0.0) }
    var serverLabel by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(period.key) {
        loading = true
        programContext.loadActivityTimeline(period.key).onSuccess {
            points = it.buckets
            dailyAverage = it.dailyAverage
            serverLabel = it.label
        }
        loading = false
    }

    // Week uses a friendly fixed label; month/year/program use the server's range label (iOS parity).
    val rangeLabel = if (period.key == "week") "This Week" else serverLabel.ifBlank { period.range }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleBackButton(onBack)
            Column {
                Text("Workout Activity Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Workouts · Active members",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            PeriodSelector(selected = period, onSelect = { period = it })

            Column {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "DAILY AVERAGE",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
                        modifier = Modifier.alignByBaseline(),
                    )
                    Text(
                        rangeLabel,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.alignByBaseline(),
                    )
                }
                Text(
                    formatAverage(dailyAverage),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = AppOrange,
                )
            }

            when {
                loading -> ChartCenter { CircularProgressIndicator(color = AppOrange) }
                points.isEmpty() -> ChartCenter { EmptyText("No data for this range yet.") }
                else -> BarLineChart(
                    values = points.map { it.workouts },
                    labels = axisLabels(points.map { it.label }, period.key),
                    lineValues = points.map { it.activeMembers },
                    barColor = AppOrange,
                    lineColor = com.app.rasifiters.core.theme.AppPurple,
                    barWidth = 14.dp,
                    modifier = Modifier.fillMaxWidth().height(360.dp),
                    tooltip = { i ->
                        val p = points[i]
                        TooltipData(
                            title = calloutTitle(p.date, p.label),
                            rows = listOf(
                                TooltipRow("${p.workouts} ${plural(p.workouts, "workout")}", AppOrange),
                                TooltipRow("${p.activeMembers} active", AppPurple),
                            ),
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun PeriodSelector(selected: Period, onSelect: (Period) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(11.dp))
            .background(MaterialTheme.colorScheme.surfaceContainerHigh)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        PERIODS.forEach { p ->
            val active = p.key == selected.key
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (active) MaterialTheme.colorScheme.surfaceContainerHighest else androidx.compose.ui.graphics.Color.Transparent)
                    .clickable { onSelect(p) }
                    .padding(vertical = 6.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    p.short,
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                    color = if (active) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

@Composable
private fun ChartCenter(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth().height(360.dp), contentAlignment = Alignment.Center) { content() }
}

@Composable
internal fun EmptyText(text: String) {
    Text(text, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
}

/** iOS `HeaderStats` shows the daily average as a whole number (6 / 2 / 1 / 4). */
private fun formatAverage(v: Double): String = v.roundToInt().toString()

/** Callout title: format the bucket's ISO date as "MMM d" (e.g. Jul 8); fall back to the bucket label. */
private fun calloutTitle(iso: String, fallback: String): String =
    runCatching { java.time.LocalDate.parse(iso.take(10)).format(java.time.format.DateTimeFormatter.ofPattern("MMM d")) }
        .getOrElse { fallback.ifBlank { "—" } }

internal fun plural(n: Int, noun: String): String = if (n == 1) noun else "${noun}s"
