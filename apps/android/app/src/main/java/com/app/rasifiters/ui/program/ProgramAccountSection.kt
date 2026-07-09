package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.LightMode
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MonitorHeart
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.AppLinks
import com.app.rasifiters.core.AppearanceMode
import com.app.rasifiters.core.AppearanceStore
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.AppRed
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.programs.initialsOf

/**
 * The "My Account" section shared by both Program-tab variants — the Android analog of iOS
 * `ProgramMyAccountSection`. Profile / Change Password / Appearance / Notifications rows push their
 * settings screens; the Health Connect row pushes the sync settings; Privacy Policy + Support open
 * external links; Sign Out asks for confirmation via [onSignOut].
 */
@Composable
fun ProgramAccountSection(
    programContext: ProgramContext,
    appearanceStore: AppearanceStore,
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    val name by programContext.memberName.collectAsStateWithLifecycle()
    val username by programContext.memberUsername.collectAsStateWithLifecycle()
    val appearance by appearanceStore.mode.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current

    ProgramSectionCard(Icons.Filled.Person, "My Account", MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)) {
        ProgramProfileRow(
            name = name ?: "My Profile",
            username = username,
            initials = initialsOf(name),
            onClick = { onNavigate(Routes.PROGRAM_PROFILE) },
        )
        ProgramSettingsRow(
            icon = Icons.Filled.Lock,
            tint = AppOrange,
            title = "Change Password",
            subtitle = "Update your account password",
            onClick = { onNavigate(Routes.PROGRAM_PASSWORD) },
        )
        ProgramSettingsRow(
            icon = appearance.icon(),
            tint = AppearancePurple,
            title = "Appearance",
            subtitle = appearance.displayName,
            onClick = { onNavigate(Routes.PROGRAM_APPEARANCE) },
        )
        ProgramSettingsRow(
            icon = Icons.Filled.Notifications,
            tint = AppOrange,
            title = "Notifications",
            subtitle = "Manage push notifications",
            onClick = { onNavigate(Routes.PROGRAM_NOTIFICATIONS) },
        )
        ProgramSettingsRow(
            icon = Icons.Filled.MonitorHeart,
            tint = AppRed,
            title = "Health Connect",
            subtitle = "Sync workouts and sleep",
            onClick = { onNavigate(Routes.HEALTH_CONNECT) },
        )
        ProgramSettingsRow(
            icon = Icons.Filled.Description,
            tint = AppOrange,
            title = "Privacy Policy",
            subtitle = "Learn how we handle your data",
            onClick = { uriHandler.openUri(AppLinks.privacyPolicyUri.toString()) },
        )
        ProgramSettingsRow(
            icon = Icons.AutoMirrored.Filled.HelpOutline,
            tint = AppOrange,
            title = "Support",
            subtitle = "Get help or contact us",
            onClick = { uriHandler.openUri(AppLinks.supportUri.toString()) },
        )
        SignOutRow(onSignOut)
    }
}

@Composable
private fun SignOutRow(onClick: () -> Unit) {
    val red = MaterialTheme.colorScheme.error
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(programRowColor(), shape)
            .border(1.dp, red.copy(alpha = 0.35f), shape)
            .clickable(onClick = onClick)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ProgramIconBadge(Icons.AutoMirrored.Filled.Logout, red)
        Text("Sign Out", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = red)
    }
}

private fun AppearanceMode.icon(): ImageVector = when (this) {
    AppearanceMode.SYSTEM -> Icons.Filled.Settings
    AppearanceMode.LIGHT -> Icons.Filled.LightMode
    AppearanceMode.DARK -> Icons.Filled.DarkMode
}
