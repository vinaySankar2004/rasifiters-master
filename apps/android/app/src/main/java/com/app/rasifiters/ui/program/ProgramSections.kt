package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.ManageAccounts
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppPurple
import com.app.rasifiters.net.MembershipDetailDTO
import com.app.rasifiters.net.ProgramDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.programs.initialsOf

private val AppBlueTint = AppBlue

// ---- Standard (non-admin) variant ----

/** Read-only Program Info card: Name / Status / Duration / Progress / Active Members (iOS StandardProgramTab). */
@Composable
fun ProgramInfoReadOnlyCard(program: ProgramDTO?) {
    ProgramSectionCard(Icons.Filled.Info, "Program Info", AppBlueTint) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(programRowColor(), RoundedCornerShape(14.dp))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ProgramInfoRow("Name") {
                Text(
                    program?.name ?: "",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
            ProgramRowDivider()
            ProgramInfoRow("Status") { ProgramStatusPill(program?.status) }
            ProgramRowDivider()
            ProgramInfoRow("Duration") {
                Text(programDateRangeLabel(program), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            }
            ProgramRowDivider()
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ProgramInfoRow("Progress") {
                    Text("${programCompletionPercent(program)}%", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                }
                LinearProgressIndicator(
                    progress = { programCompletionPercent(program) / 100f },
                    color = programStatusColor(program?.status),
                    trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(
                        "${programElapsedDays(program)} days elapsed",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                    )
                    Text(
                        "${programRemainingDays(program)} days remaining",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                    )
                }
            }
            ProgramRowDivider()
            ProgramInfoRow("Active Members") {
                Text("${program?.activeMembers ?: 0}", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

/** Standalone "Switch Program" card (standard variant). */
@Composable
fun SwitchProgramCard(onClick: () -> Unit) {
    ProgramSettingsRow(Icons.Filled.SwapHoriz, AppOrange, "Switch Program", "View a different program", onClick)
}

/** Standalone "Leave Program" card — no chevron, shows a spinner while leaving. */
@Composable
fun LeaveProgramRow(isLeaving: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .clickable(enabled = !isLeaving, onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ProgramIconBadge(Icons.AutoMirrored.Filled.ArrowBack, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
        Column(modifier = Modifier.weight(1f)) {
            Text("Leave Program", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "Your data will be preserved",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        if (isLeaving) CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
    }
}

// ---- Admin variant sections ----

/** Program Info section for admins: Select Program + Edit Program Details (if canEdit) + Leave (if not global). */
@Composable
fun AdminProgramInfoSection(
    canEdit: Boolean,
    canLeave: Boolean,
    program: ProgramDTO?,
    isLeaving: Boolean,
    onSelect: () -> Unit,
    onEdit: () -> Unit,
    onLeave: () -> Unit,
) {
    ProgramSectionCard(Icons.Filled.Info, "Program Info", AppBlueTint) {
        ProgramSettingsRow(Icons.Filled.SwapHoriz, AppOrange, "Select Program", "Switch to a different program", onSelect)
        if (canEdit) {
            ProgramSettingsRow(
                Icons.Filled.Edit,
                AppBlue,
                "Edit Program Details",
                "${(program?.status ?: "")} • ${programDateRangeLabel(program)}",
                onEdit,
            )
        }
        if (canLeave) LeaveProgramRow(isLeaving, onLeave)
    }
}

/** Members section: View Members (everyone) + Invite Member (admins only). */
@Composable
fun MembersSection(memberCount: Int, canInvite: Boolean, onNavigate: (String) -> Unit) {
    ProgramSectionCard(Icons.Filled.Groups, "Members", AppGreen) {
        ProgramSettingsRow(Icons.Filled.Groups, AppGreen, "View Members", "$memberCount enrolled") {
            onNavigate(Routes.MEMBER_ROSTER)
        }
        if (canInvite) {
            ProgramSettingsRow(Icons.Filled.MailOutline, AppBlue, "Invite Member", "Send program invitation") {
                onNavigate(Routes.MEMBER_INVITE)
            }
        }
    }
}

/** Role Management section (canEdit only): admins/loggers preview + Manage Roles row. */
@Composable
fun RoleManagementSection(details: List<MembershipDetailDTO>, onNavigate: (String) -> Unit) {
    val admins = details.filter { it.programRole == "admin" }
    val loggers = details.filter { it.programRole == "logger" }
    ProgramSectionCard(Icons.Filled.ManageAccounts, "Role Management", AppPurple) {
        if (admins.isNotEmpty()) {
            RoleGroup("Admins", Icons.Filled.Star, AppOrange, admins, AppOrange)
        }
        if (loggers.isNotEmpty()) {
            RoleGroup("Loggers", Icons.Filled.Edit, AppBlue, loggers, AppBlue)
        }
        if (admins.isEmpty() && loggers.isEmpty()) {
            Text(
                "No admins or loggers assigned",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            )
        }
        ProgramSettingsRow(
            Icons.Filled.ManageAccounts,
            AppPurple,
            "Manage Roles",
            "Set admin, logger, or member roles",
        ) { onNavigate(Routes.PROGRAM_ROLES) }
    }
}

@Composable
private fun RoleGroup(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    labelColor: Color,
    members: List<MembershipDetailDTO>,
    avatarColor: Color,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, contentDescription = null, tint = labelColor, modifier = Modifier.size(13.dp))
            Text(
                label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        members.forEach { member ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(programRowColor(), RoundedCornerShape(12.dp))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Box(
                    modifier = Modifier.size(40.dp).background(avatarColor.copy(alpha = 0.2f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(initialsOf(member.memberName), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = avatarColor)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(member.memberName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                    if (member.globalRole == "global_admin") {
                        Text(
                            "Global Admin",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                }
            }
        }
    }
}

/** Workout Types section: a single row into the shared workout-types manager (reused from Lifestyle). */
@Composable
fun WorkoutTypesSection(visibleCount: Int, customCount: Int, onNavigate: (String) -> Unit) {
    val subtitle = if (customCount > 0) "$visibleCount available, $customCount custom" else "$visibleCount types available"
    ProgramSectionCard(Icons.Filled.FitnessCenter, "Workout Types", AppPurple) {
        ProgramSettingsRow(Icons.AutoMirrored.Filled.List, AppPurple, "Workout Types", subtitle) {
            onNavigate(Routes.LIFESTYLE_WORKOUT_TYPES)
        }
    }
}
