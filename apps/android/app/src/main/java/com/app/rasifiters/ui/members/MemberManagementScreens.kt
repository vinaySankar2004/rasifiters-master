package com.app.rasifiters.ui.members

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppBlue
import com.app.rasifiters.core.theme.AppGreen
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.net.MembershipDetailDTO
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.summary.CircleBackButton
import com.app.rasifiters.ui.summary.DatePillField
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

// The member-management cluster (Program-tab targets, lit up early for the Members tab per the user).
// Invite (privacy-safe) · roster (searchable; global-admin rows tappable) · editor (global-admin only:
// joined-date + active toggle + remove). Faithful to program-member-management §4/§7.

// ---- Invite Member ----

@Composable
fun InviteMemberScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showToast by remember { mutableStateOf(false) }
    val valid = username.trim().isNotEmpty()

    LaunchedEffect(showToast) { if (showToast) { delay(1800); showToast = false } }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Invite Member")
            Text("Invite member", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(
                "Enter the exact username of the person you want to invite to this program.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
            FormFieldLabel("Username")
            AppTextField(
                label = "@username",
                value = username,
                onValueChange = { username = it.trim(); errorMessage = null },
            )
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(AppBlue.copy(alpha = 0.08f)).padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Filled.Info, contentDescription = null, tint = AppBlue, modifier = Modifier.size(18.dp))
                Text(
                    "The user must have an account to receive the invitation. They will see your invite in their pending invitations.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                )
            }
            errorMessage?.let { FormErrorText(it) }
            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(
                    label = "Send Invitation",
                    onClick = {
                        if (valid) {
                            sending = true; errorMessage = null
                            scope.launch {
                                programContext.sendProgramInvite(username)
                                    .onSuccess { sending = false; username = ""; showToast = true }
                                    .onFailure { e -> sending = false; errorMessage = e.message ?: "Network error. Please try again." }
                            }
                        }
                    },
                    enabled = valid,
                    loading = sending,
                )
            }
        }
        if (showToast) {
            Row(
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp)
                    .clip(CircleShape).background(MaterialTheme.colorScheme.surface)
                    .border(1.dp, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f), CircleShape)
                    .padding(horizontal = 18.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = AppGreen, modifier = Modifier.size(18.dp))
                Text("Invite sent", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// ---- Roster (View Members) ----

@Composable
fun ProgramMembersListScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val details by programContext.membershipDetails.collectAsStateWithLifecycle()
    val isGlobalAdmin = programContext.isGlobalAdmin
    var query by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { programContext.loadMembershipDetails() }

    val filtered = if (query.isBlank()) details
    else details.filter { it.memberName.contains(query.trim(), ignoreCase = true) }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Members")
            TextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text("Search members") },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
            )
            filtered.forEach { m ->
                RosterRow(
                    m = m,
                    clickable = isGlobalAdmin,
                    onClick = {
                        programContext.focusMember(m.memberId, m.memberName)
                        onNavigate(com.app.rasifiters.ui.Routes.MEMBER_EDIT)
                    },
                )
            }
        }
    }
}

@Composable
private fun RosterRow(m: MembershipDetailDTO, clickable: Boolean, onClick: () -> Unit) {
    val isAdmin = m.programRole == "admin"
    var mod = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface)
    if (clickable) mod = mod.clickable(onClick = onClick)
    Row(
        modifier = mod.padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MemberInitialsAvatar(m.memberName, 44, admin = isAdmin)
        Spacer(Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(m.memberName, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (isAdmin) Icon(Icons.Filled.Star, contentDescription = "Admin", tint = AppOrange, modifier = Modifier.size(15.dp))
            }
            m.username?.let { Text("@$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)) }
        }
        if (!m.isActive) {
            Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(AppRed.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                Text("Inactive", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = AppRed)
            }
        }
        if (clickable) Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f))
    }
}

// ---- Member editor (global-admin only) ----

@Composable
fun MemberDetailEditScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val details by programContext.membershipDetails.collectAsStateWithLifecycle()
    val focusId by programContext.focusedMemberId.collectAsStateWithLifecycle()
    val membership = details.firstOrNull { it.memberId == focusId }

    var joinedAt by remember(membership?.memberId) { mutableStateOf(parseDate(membership?.joinedAt) ?: LocalDate.now()) }
    var isActive by remember(membership?.memberId) { mutableStateOf(membership?.isActive ?: true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var confirmRemove by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp).padding(top = 16.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "Member Details")
            if (membership == null) {
                Text("Member not found.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                return@Column
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                MemberInitialsAvatar(membership.memberName, 60, admin = membership.programRole == "admin")
                Spacer(Modifier.size(14.dp))
                Column {
                    Text(membership.memberName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    membership.username?.let { Text("@$it", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)) }
                    if (membership.programRole == "admin") {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Filled.Star, contentDescription = null, tint = AppOrange, modifier = Modifier.size(14.dp))
                            Text("Program Admin", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = AppOrange)
                        }
                    }
                }
            }
            FactRow("Gender", membership.gender ?: "—")
            FactRow("Date of Birth", membership.dateOfBirth ?: "—")
            FactRow("Account Created", membership.dateJoined ?: "—")

            FormFieldLabel("Joined Program")
            DatePillField(date = joinedAt, onChange = { joinedAt = it; errorMessage = null }, allowFuture = false)

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    FormFieldLabel("Active Membership")
                    Text("Inactive members keep their history but stop counting toward participation.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
                Switch(checked = isActive, onCheckedChange = { isActive = it; errorMessage = null })
            }
            errorMessage?.let { FormErrorText(it) }

            Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                PillButton(
                    label = "Save changes",
                    onClick = {
                        saving = true; errorMessage = null
                        scope.launch {
                            programContext.editMembership(membership.memberId, isActive = isActive, joinedAt = joinedAt.toString())
                                .onSuccess { saving = false; onBack() }
                                .onFailure { e -> saving = false; errorMessage = e.message ?: "Couldn't save changes." }
                        }
                    },
                    enabled = !saving,
                    loading = saving,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(AppRed.copy(alpha = 0.12f))
                    .clickable(enabled = !saving) { confirmRemove = true }.padding(vertical = 14.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                Text("Remove from Program", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = AppRed)
            }
        }
    }

    if (confirmRemove && membership != null) {
        AlertDialog(
            onDismissRequest = { confirmRemove = false },
            title = { Text("Remove member") },
            text = { Text("This will remove ${membership.memberName} from the program.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmRemove = false; saving = true
                    scope.launch {
                        programContext.removeMember(membership.memberId)
                            .onSuccess { saving = false; onBack() }
                            .onFailure { e -> saving = false; errorMessage = e.message ?: "Couldn't remove member." }
                    }
                }) { Text("Remove", color = AppRed) }
            },
            dismissButton = { TextButton(onClick = { confirmRemove = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun FactRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

private fun parseDate(raw: String?): LocalDate? =
    raw?.takeIf { it.isNotBlank() }?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }
