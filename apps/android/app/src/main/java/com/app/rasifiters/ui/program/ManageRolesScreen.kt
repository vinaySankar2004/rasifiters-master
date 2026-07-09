package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.MembershipDetailDTO
import com.app.rasifiters.ui.programs.initialsOf
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import kotlinx.coroutines.launch

/**
 * "Manage Roles" — set each member's program role (Admin / Logger / Member). Faithful 1:1 to the iOS
 * ManageRolesView: per-member spinner lock, the last-active-admin guard, and refresh-after-mutation.
 */
@Composable
fun ManageRolesScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val members by programContext.membershipDetails.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var updatingId by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { programContext.loadMembershipDetails() }

    val activeAdminCount = members.count { it.programRole == "admin" && it.status == "active" }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Manage Roles")
            errorMessage?.let { FormErrorText(it) }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(18.dp))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(18.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                members.forEachIndexed { index, member ->
                    if (index > 0) {
                        Box(modifier = Modifier.fillMaxWidth().size(1.dp).background(MaterialTheme.colorScheme.outlineVariant))
                    }
                    val isLastActiveAdmin = member.programRole == "admin" && member.status == "active" && activeAdminCount <= 1
                    RoleMemberRow(
                        member = member,
                        updating = updatingId == member.memberId,
                        isLastActiveAdmin = isLastActiveAdmin,
                        onSelect = { role ->
                            if (member.programRole == role) return@RoleMemberRow
                            updatingId = member.memberId; errorMessage = null
                            scope.launch {
                                programContext.updateMemberRole(member.memberId, role)
                                    .onFailure { errorMessage = it.message ?: "Couldn't update the role." }
                                updatingId = null
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun RoleMemberRow(
    member: MembershipDetailDTO,
    updating: Boolean,
    isLastActiveAdmin: Boolean,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val roleColor = roleColor(member.programRole)
            Box(
                modifier = Modifier.size(44.dp).background(roleColor.copy(alpha = 0.2f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(initialsOf(member.memberName), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = roleColor)
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(member.memberName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    roleDisplayName(member.programRole),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }

        if (updating) {
            Box(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RolePill("Admin", member.programRole == "admin", AppOrange, isLastActiveAdmin, Modifier.weight(1f)) { onSelect("admin") }
                RolePill("Logger", member.programRole == "logger", AppBlue, isLastActiveAdmin, Modifier.weight(1f)) { onSelect("logger") }
                RolePill("Member", member.programRole == "member", MaterialTheme.colorScheme.onSurface, isLastActiveAdmin, Modifier.weight(1f)) { onSelect("member") }
            }
        }
    }
}

@Composable
private fun RolePill(
    title: String,
    selected: Boolean,
    color: Color,
    disabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val enabled = !selected && !disabled
    Row(
        modifier = modifier
            .background(if (selected) color else color.copy(alpha = 0.15f), CircleShape)
            .border(1.dp, if (selected) color.copy(alpha = 0.8f) else color.copy(alpha = 0.3f), CircleShape)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (selected) {
            Icon(Icons.Filled.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        }
        Text(
            title,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
            color = if (selected) Color.White else color,
            modifier = Modifier.padding(start = if (selected) 4.dp else 0.dp),
        )
    }
}

@Composable
private fun roleColor(role: String): Color = when (role) {
    "admin" -> AppOrange
    "logger" -> AppBlue
    else -> MaterialTheme.colorScheme.onSurface
}

private fun roleDisplayName(role: String): String = when (role) {
    "admin" -> "Program Admin"
    "logger" -> "Logger"
    else -> "Member"
}
