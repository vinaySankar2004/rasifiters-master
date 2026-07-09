package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.ProgramDTO
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// Shared building blocks for the Program tab + its settings sub-screens. Faithful to the iOS
// ProgramCards.swift helpers (sectionHeader / settingsRow) + the neutral M3 surface ramp — brand tints
// only appear on the icon badges we set explicitly (memory: android-neutral-m3-surface-roles).

private val CardShape = RoundedCornerShape(20.dp)
private val RowShape = RoundedCornerShape(14.dp)

/**
 * Inner row/card fill. **Light** → white `surface` (the iOS white-card look; no grey "darkness").
 * **Dark** → the raised `surfaceContainerHigh` — left exactly as-is (dark mode is dialed in). Detected
 * from theme luminance so it's right whether dark came from the system OR the appearance override.
 */
@Composable
fun programRowColor(): Color =
    if (MaterialTheme.colorScheme.background.luminance() < 0.5f)
        MaterialTheme.colorScheme.surfaceContainerHigh
    else
        MaterialTheme.colorScheme.surface

/** The purple "Appearance" accent (iOS appPurple; kept an explicit brand tint, not an M3 role). */
val AppearancePurple = Color(0xFF8B7CF6)

/** Icon accent for the health/heart row (iOS appRed). */
val HealthRed = Color(0xFFE0554E)

/** The rounded outer section card (icon + title header, then [content]). iOS `sectionHeader` + card. */
@Composable
fun ProgramSectionCard(
    icon: ImageVector,
    title: String,
    tint: Color,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, CardShape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CardShape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
        content()
    }
}

/** A circular tinted icon badge (42dp) — the settings-row leading glyph. */
@Composable
fun ProgramIconBadge(icon: ImageVector, tint: Color, size: Int = 42) {
    Box(
        modifier = Modifier.size(size.dp).background(tint.copy(alpha = 0.14f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size((size * 0.43f).dp))
    }
}

/** A tappable settings row: icon badge + title/subtitle + chevron. iOS `settingsRow`. */
@Composable
fun ProgramSettingsRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), RowShape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RowShape)
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ProgramIconBadge(icon, tint)
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
        )
    }
}

/** The "My Profile" row — an initials avatar in place of an icon badge. */
@Composable
fun ProgramProfileRow(name: String, username: String?, initials: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), RowShape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RowShape)
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier.size(42.dp).background(AppOrange.copy(alpha = 0.18f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(initials, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = AppOrange)
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
            if (!username.isNullOrBlank()) {
                Text(
                    "@$username",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    maxLines = 1,
                )
            }
        }
        Icon(
            Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
        )
    }
}

/** A left label / right value row inside the read-only Program Info card. */
@Composable
fun ProgramInfoRow(label: String, valueContent: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
        )
        valueContent()
    }
}

/** The status capsule (Active/Planned/Completed) in the program's status color. */
@Composable
fun ProgramStatusPill(status: String?) {
    val color = programStatusColor(status)
    Box(
        modifier = Modifier
            .background(color, CircleShape)
            .padding(horizontal = 12.dp, vertical = 4.dp),
    ) {
        Text(
            (status ?: "").replaceFirstChar { it.uppercase() },
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
        )
    }
}

/** A thin hairline divider between Program Info rows. */
@Composable
fun ProgramRowDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outlineVariant),
    )
}

// ---- Status + progress helpers (iOS ProgramContext date math + statusColor) ----

fun programStatusColor(status: String?): Color = when (status?.lowercase()) {
    "completed" -> AppGreen
    "planned" -> Color(0xFF2F6FEB)
    else -> AppOrange
}

private val START_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d")
private val END_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy")

fun parseProgramDate(raw: String?): LocalDate? =
    raw?.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

/** "Jun 9 – Sep 17, 2026" (iOS dateRangeLabel). Falls back to em-dash when either date is missing. */
fun programDateRangeLabel(program: ProgramDTO?): String {
    val start = parseProgramDate(program?.startDate)
    val end = parseProgramDate(program?.endDate)
    if (start == null || end == null) return "—"
    return "${start.format(START_FMT)} – ${end.format(END_FMT)}"
}

private fun totalDays(program: ProgramDTO?): Int {
    val s = parseProgramDate(program?.startDate) ?: return 0
    val e = parseProgramDate(program?.endDate) ?: return 0
    return ChronoUnit.DAYS.between(s, e).toInt().coerceAtLeast(0)
}

fun programElapsedDays(program: ProgramDTO?): Int {
    val s = parseProgramDate(program?.startDate) ?: return 0
    val total = totalDays(program)
    val today = LocalDate.now()
    if (!today.isAfter(s)) return 0
    return ChronoUnit.DAYS.between(s, today).toInt().coerceIn(0, total)
}

fun programRemainingDays(program: ProgramDTO?): Int =
    (totalDays(program) - programElapsedDays(program)).coerceAtLeast(0)

fun programCompletionPercent(program: ProgramDTO?): Int {
    val total = totalDays(program)
    if (total <= 0) return 0
    return Math.round(programElapsedDays(program).toDouble() / total * 100).toInt()
}
