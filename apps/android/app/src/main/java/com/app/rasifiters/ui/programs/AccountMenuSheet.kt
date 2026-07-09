package com.app.rasifiters.ui.programs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.AppLinks
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.Routes

/** Icon-badge accent for the health row (the HealthKit heart analog). */
private val HealthRed = Color(0xFFE0554E)
private val AppearancePurple = Color(0xFF8B7CF6)

/**
 * The inline account sheet reached from the picker header avatar — the Android analog of the iOS
 * `AccountMenuSheet`. Profile + Change Password / Appearance / Notifications rows push their settings
 * screens (via [onNavigate], reusing the Program-tab destinations); Privacy Policy / Support open external
 * links; Sign Out asks for confirmation via [onSignOut]. Health Connect stays deferred (not built on
 * Android yet — Phase H/J). Mirrors iOS §4 `AccountMenuSheet`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountMenuSheet(
    programContext: ProgramContext,
    onDismiss: () -> Unit,
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val uriHandler = LocalUriHandler.current
    val name by programContext.memberName.collectAsStateWithLifecycle()
    val username by programContext.memberUsername.collectAsStateWithLifecycle()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                IconBadge(Icons.Filled.Person, MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f))
                Column {
                    Text("My Account", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "Manage your profile and preferences.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                    )
                }
            }
            Spacer(Modifier.height(4.dp))

            // Profile row (initials avatar) → My Profile
            ProfileRow(
                name = name ?: "Your Profile",
                username = username,
                onClick = { onNavigate(Routes.PROGRAM_PROFILE) },
            )

            AccountRow(Icons.Filled.Lock, AppOrange, "Change Password", "Update your account password") { onNavigate(Routes.PROGRAM_PASSWORD) }
            AccountRow(Icons.Filled.Palette, AppearancePurple, "Appearance", "Choose light or dark mode") { onNavigate(Routes.PROGRAM_APPEARANCE) }
            AccountRow(Icons.Filled.Notifications, AppOrange, "Notifications", "Manage push notifications") { onNavigate(Routes.PROGRAM_NOTIFICATIONS) }
            // Health Connect is deferred (not built on Android yet — Phase H/J). Omitted here to match the
            // Program-tab account section rather than show a dead row.
            AccountRow(Icons.Filled.Description, AppOrange, "Privacy Policy", "Learn how we handle your data") {
                uriHandler.openUri(AppLinks.privacyPolicyUri.toString())
            }
            AccountRow(Icons.AutoMirrored.Filled.HelpOutline, AppOrange, "Support", "Get help or contact us") {
                uriHandler.openUri(AppLinks.supportUri.toString())
            }

            SignOutRow(onClick = onSignOut)
        }
    }
}

@Composable
private fun IconBadge(icon: ImageVector, tint: Color) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .background(tint.copy(alpha = 0.16f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun rowContainer(): Modifier = Modifier
    .fillMaxWidth()
    .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(16.dp))

@Composable
private fun ProfileRow(name: String, username: String?, onClick: () -> Unit) {
    Row(
        modifier = rowContainer().clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier.size(44.dp).background(AppOrange.copy(alpha = 0.9f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                initialsOf(name),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = Color.White,
            )
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

@Composable
private fun AccountRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    Row(
        modifier = rowContainer().clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        IconBadge(icon, tint)
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        Icon(
            Icons.Filled.ChevronRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f),
        )
    }
}

@Composable
private fun SignOutRow(onClick: () -> Unit) {
    val red = MaterialTheme.colorScheme.error
    Row(
        modifier = rowContainer().clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        IconBadge(Icons.AutoMirrored.Filled.Logout, red)
        Text("Sign Out", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = red)
    }
}

/** Up-to-two-letter initials from a display name (falls back to "?"). Shared by the picker avatar. */
fun initialsOf(name: String?): String {
    val parts = name?.trim().orEmpty().split(Regex("\\s+")).filter { it.isNotBlank() }
    return when {
        parts.isEmpty() -> "?"
        parts.size == 1 -> parts[0].take(1).uppercase()
        else -> (parts.first().take(1) + parts.last().take(1)).uppercase()
    }
}
