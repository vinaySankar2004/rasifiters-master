package com.app.rasifiters.ui.summary

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.workoutTypePaletteColor
import com.app.rasifiters.net.WorkoutTypeDTO
import kotlin.math.roundToInt

/**
 * The Workout Types drill-down (iOS `WorkoutTypesDetailView`). A horizontal %-share chart (top 5 +
 * "Others") over a scrollable breakdown of every type (dot · name · sessions · avg · share bar).
 * Program-wide, program-to-date. Reads the types already loaded by the Summary tab. Read-only (§7).
 */
@Composable
fun WorkoutTypesDetailScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val summary by programContext.summary.collectAsStateWithLifecycle()
    val types = summary.workoutTypes.sortedByDescending { it.totalDuration }
    val total = types.sumOf { it.totalDuration }.coerceAtLeast(1)
    val chartRows = topSixWithOthers(summary.workoutTypes)

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleBackButton(onBack)
            Column {
                Text("Workout Types", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                Text(
                    "Time spent (Program to date)",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }

            if (types.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) {
                    EmptyText("No workouts logged yet.")
                }
                return@Column
            }

            // %-share chart (top 5 + Others)
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                chartRows.forEach { t ->
                    val fraction = (t.totalDuration.toFloat() / total).coerceIn(0f, 1f)
                    val pct = (fraction * 100).roundToInt()
                    val color = if (t.workoutName == "Others") MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f)
                    else workoutTypePaletteColor(t.workoutName)
                    ShareRow(name = t.workoutName, fraction = fraction, pct = pct, color = color)
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f))

            Text(
                "Breakdown",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )

            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                types.forEach { t -> BreakdownRow(type = t, fraction = (t.totalDuration.toFloat() / total).coerceIn(0f, 1f)) }
            }
        }
    }
}

@Composable
private fun ShareRow(name: String, fraction: Float, pct: Int, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            name,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .weight(fraction.coerceAtLeast(0.02f))
                    .height(12.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(color),
            )
            Spacer(Modifier.size(8.dp))
            Text("$pct%", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight((1f - fraction).coerceAtLeast(0.02f)))
        }
    }
}

@Composable
private fun BreakdownRow(type: WorkoutTypeDTO, fraction: Float) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(workoutTypePaletteColor(type.workoutName)))
            Spacer(Modifier.size(10.dp))
            Text(
                type.workoutName,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Column(horizontalAlignment = Alignment.End) {
                Text(formatWorkoutDuration(type.totalDuration), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "${type.sessions} sessions",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(3.dp))
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(fraction)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(3.dp))
                    .background(workoutTypePaletteColor(type.workoutName)),
            )
        }
    }
}
