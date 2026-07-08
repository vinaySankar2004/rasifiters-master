package com.app.rasifiters.ui.summary

import androidx.compose.foundation.Canvas
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
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppBlueLight
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppOrangeGradientEnd
import com.app.rasifiters.core.theme.AppRed
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

// Faithful 1:1 port of the iOS Summary cards (Features/Home/Tabs/SummaryCards.swift), rendered in the
// Material idiom: a flat rounded-surface card in place of iOS's glassy CardShell (blur has no cheap
// Compose analog and reads as noise on Android). Same content, same numbers, same change badges.

/** The shared rounded-surface card container — the Material analog of iOS `CardShell`. */
@Composable
fun SummaryCard(
    modifier: Modifier = Modifier,
    height: androidx.compose.ui.unit.Dp? = null,
    content: @Composable () -> Unit,
) {
    var m = modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(20.dp))
        .background(MaterialTheme.colorScheme.surface)
        .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f), RoundedCornerShape(20.dp))
    if (height != null) m = m.height(height)
    Box(modifier = m.padding(16.dp)) { content() }
}

// MARK: - Program progress

@Composable
fun ProgramProgressCard(progress: Int, elapsedDays: Int, totalDays: Int, status: String) {
    SummaryCard(height = 240.dp) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Program Progress",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(AppOrange.copy(alpha = 0.18f))
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                ) {
                    Text(
                        status.uppercase(Locale.US),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = AppOrange,
                    )
                }
            }
            Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                CompletionRing(progress = progress, modifier = Modifier.size(140.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("$progress%", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "$elapsedDays/$totalDays days",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
            }
        }
    }
}

@Composable
private fun CompletionRing(progress: Int, modifier: Modifier = Modifier) {
    val track = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)
    val fraction = (progress.coerceIn(0, 100)) / 100f
    Canvas(modifier = modifier) {
        val stroke = 12.dp.toPx()
        val inset = stroke / 2
        val arcSize = Size(size.width - stroke, size.height - stroke)
        drawArc(
            color = track,
            startAngle = 0f,
            sweepAngle = 360f,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = arcSize,
            style = Stroke(width = stroke),
        )
        drawArc(
            brush = Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd)),
            startAngle = -90f,
            sweepAngle = 360f * fraction,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = arcSize,
            style = Stroke(width = stroke, cap = StrokeCap.Round),
        )
    }
}

// MARK: - Change badge (shared by the 4 MTD metric cards; iOS duplicates it inline per card, F4)

@Composable
private fun ChangeBadge(change: Double) {
    val up = change >= 0
    val color = if (up) AppGreen else AppRed
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            if (up) Icons.Filled.ArrowUpward else Icons.Filled.ArrowDownward,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(14.dp),
        )
        Text(
            String.format(Locale.US, "%.1f%%", abs(change)),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = color,
        )
    }
}

/** A tall metric card: title · big value · change badge · "vs prior MTD". Optional secondary line (MTD). */
@Composable
private fun MetricCard(title: String, value: String, secondary: String?, change: Double) {
    SummaryCard(height = 240.dp) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            if (secondary != null) {
                Spacer(Modifier.height(4.dp))
                Text(
                    secondary,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
            Spacer(Modifier.weight(1f))
            ChangeBadge(change)
            Spacer(Modifier.height(6.dp))
            Text(
                "vs prior MTD",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
    }
}

@Composable
fun MtdParticipationCard(active: Int, total: Int, pct: Double, change: Double, modifier: Modifier = Modifier) {
    Box(modifier) {
        MetricCard("MTD Participation", "${pct.roundToInt()}%", "$active/$total members active", change)
    }
}

@Composable
fun TotalWorkoutsCard(total: Int, change: Double, modifier: Modifier = Modifier) {
    Box(modifier) { MetricCard("Total workouts", "$total", null, change) }
}

@Composable
fun TotalDurationCard(hours: Double, change: Double, modifier: Modifier = Modifier) {
    val whole = hours.roundToInt()
    val label = if (abs(hours - whole) < 0.05) "$whole" else String.format(Locale.US, "%.1f", hours)
    Box(modifier) { MetricCard("Total duration", "$label hrs", null, change) }
}

@Composable
fun AvgDurationCard(minutes: Int, change: Double, modifier: Modifier = Modifier) {
    Box(modifier) { MetricCard("Avg duration", "$minutes mins", null, change) }
}

/** A tall placeholder while a metric card's data is still loading (iOS `PlaceholderCard`). */
@Composable
fun MetricPlaceholderCard(title: String, modifier: Modifier = Modifier) {
    Box(modifier) {
        SummaryCard(height = 240.dp) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

// MARK: - Action cards (gradient; navigate to the log forms unless data-entry is locked)

@Composable
fun AddWorkoutCard(locked: Boolean, onClick: () -> Unit) {
    ActionCard(
        gradient = Brush.linearGradient(listOf(AppOrange, AppOrangeGradientEnd)),
        icon = Icons.Filled.Add,
        iconTint = Color.Black,
        title = "Add workouts",
        subtitle = "Log one or many sessions at once and keep progress up to date.",
        pillLabel = "Log sessions",
        pillIcon = Icons.Filled.Bolt,
        pillBg = AppOrange,
        onBrand = Color.Black,
        locked = locked,
        onClick = onClick,
    )
}

@Composable
fun AddDailyHealthCard(locked: Boolean, onClick: () -> Unit) {
    ActionCard(
        gradient = Brush.linearGradient(listOf(AppBlue, AppBlueLight)),
        icon = Icons.Filled.Bedtime,
        iconTint = Color.White,
        title = "Log daily health",
        subtitle = "Track sleep hours and diet quality for the day.",
        pillLabel = "Log day",
        pillIcon = Icons.Filled.Add,
        pillBg = Color.White.copy(alpha = 0.2f),
        onBrand = Color.White,
        locked = locked,
        onClick = onClick,
    )
}

@Composable
private fun ActionCard(
    gradient: Brush,
    icon: ImageVector,
    iconTint: Color,
    title: String,
    subtitle: String,
    pillLabel: String,
    pillIcon: ImageVector,
    pillBg: Color,
    onBrand: Color,
    locked: Boolean,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(200.dp)
            .alpha(if (locked) 0.5f else 1f)
            .clip(RoundedCornerShape(20.dp))
            .background(gradient)
            .clickable(enabled = !locked, onClick = onClick)
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.weight(1f))
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = onBrand.copy(alpha = 0.7f))
        }
        Spacer(Modifier.height(10.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = onBrand)
        Spacer(Modifier.height(4.dp))
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = onBrand.copy(alpha = 0.7f))
        Spacer(Modifier.weight(1f))
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(pillBg)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(pillIcon, contentDescription = null, tint = onBrand, modifier = Modifier.size(16.dp))
            Text(pillLabel, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = onBrand)
        }
    }
}
