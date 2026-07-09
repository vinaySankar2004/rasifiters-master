package com.app.rasifiters.ui.lifestyle

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
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.net.HealthTimelinePoint
import com.app.rasifiters.ui.summary.BarLineChart
import com.app.rasifiters.ui.summary.CircleBackButton
import com.app.rasifiters.ui.summary.EmptyText
import com.app.rasifiters.ui.summary.PERIODS
import com.app.rasifiters.ui.summary.PeriodSelector
import com.app.rasifiters.ui.summary.TooltipData
import com.app.rasifiters.ui.summary.TooltipRow
import com.app.rasifiters.ui.summary.axisLabels
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Steps accent — teal on every surface (DC-8). */
private val StepsTeal = Color(0xFF14B8A6)

/**
 * The Steps Timeline drill-down (iOS `StepsTimelineDetailView`). Period-switchable (W/M/Y/P), re-fetching
 * per change; a daily-average-steps header + the single teal daily-steps bar series with the shared
 * tap/drag tooltip (memory: every chart gets the shared BarLineChart tooltip — never a bespoke callout).
 * Member-scoped (the "View as" pick, or self for non-admins). Read-only analytics.
 */
@Composable
fun StepsTimelineDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    // Same scoping as the tab: admins → the "View as" pick (null = program-wide); everyone else → self.
    val memberId = if (programContext.isProgramAdmin) programContext.lifestyleViewAsId.value
    else programContext.loggedInMemberId

    var period by remember { mutableStateOf(PERIODS.first()) }
    var points by remember { mutableStateOf<List<HealthTimelinePoint>>(emptyList()) }
    var avgSteps by remember { mutableStateOf(0) }
    var serverLabel by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(period.key) {
        loading = true
        programContext.loadHealthTimeline(period.key, memberId).onSuccess {
            points = it.buckets
            avgSteps = it.dailyAverageSteps
            serverLabel = it.label
        }
        loading = false
    }

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
                Text("Steps Timeline", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    "Daily steps",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            PeriodSelector(selected = period, onSelect = { period = it })

            DailyAverageHeader(rangeLabel = rangeLabel, avgSteps = avgSteps)

            when {
                loading -> ChartCenter { CircularProgressIndicator(color = StepsTeal) }
                points.isEmpty() -> ChartCenter { EmptyText("No data for this range yet.") }
                else -> {
                    BarLineChart(
                        values = points.map { it.steps },
                        labels = axisLabels(points.map { it.label }, period.key),
                        lineValues = null,
                        barColor = StepsTeal,
                        lineColor = StepsTeal,
                        barWidth = 14.dp,
                        modifier = Modifier.fillMaxWidth().height(320.dp),
                        tooltip = { i ->
                            val p = points[i]
                            TooltipData(
                                title = calloutTitle(p.date, p.label),
                                rows = listOf(TooltipRow(String.format(Locale.US, "Steps: %,d", p.steps), StepsTeal)),
                            )
                        },
                    )
                    ChartLegend()
                }
            }
        }
    }
}

/** "DAILY AVERAGE" + range on the right; then a single teal Steps stat column. */
@Composable
private fun DailyAverageHeader(rangeLabel: String, avgSteps: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "DAILY AVERAGE",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f),
            )
            Spacer(Modifier.weight(1f))
            Text(rangeLabel, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
        AverageStat("Steps", String.format(Locale.US, "%,d", avgSteps), StepsTeal)
    }
}

@Composable
private fun AverageStat(label: String, value: String, color: Color) {
    Column {
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
    }
}

/** The bottom legend: a single teal "Steps" dot. */
@Composable
private fun ChartLegend() {
    Row(horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(StepsTeal))
        Text("Steps", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
    }
}

@Composable
private fun ChartCenter(content: @Composable () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth().height(320.dp), contentAlignment = Alignment.Center) { content() }
}

/** Callout title: format the bucket's ISO date as "MMM d"; fall back to the bucket label. */
private fun calloutTitle(iso: String, fallback: String): String =
    runCatching { LocalDate.parse(iso.take(10)).format(DateTimeFormatter.ofPattern("MMM d")) }
        .getOrElse { fallback.ifBlank { "—" } }
