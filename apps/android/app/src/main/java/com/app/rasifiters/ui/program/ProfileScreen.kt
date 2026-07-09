package com.app.rasifiters.ui.program

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.AppPasswordField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.auth.PillButton
import com.app.rasifiters.ui.auth.isEmailValid
import com.app.rasifiters.ui.programs.initialsOf
import com.app.rasifiters.ui.summary.DetailTopBar
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.launch

private val GENDER_OPTIONS = listOf("Male", "Female", "Non-binary", "Prefer not to say")

/**
 * "My Profile" — edit first/last name + gender, change email (web-parity, password-confirmed), delete
 * account. Faithful 1:1 to the iOS MyProfileView. Name is seeded by splitting the cached display name;
 * gender + email come from a GET /members/:id read.
 */
@Composable
fun MyProfileScreen(programContext: ProgramContext, onBack: () -> Unit) {
    val memberName by programContext.memberName.collectAsStateWithLifecycle()
    val username by programContext.memberUsername.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("") }
    var currentEmail by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    var isDeleting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var successMessage by remember { mutableStateOf<String?>(null) }
    var showDelete by remember { mutableStateOf(false) }

    // Email change (collapsible, password-confirmed).
    var showEmailForm by remember { mutableStateOf(false) }
    var newEmail by remember { mutableStateOf("") }
    var emailPassword by remember { mutableStateOf("") }
    var emailVisible by remember { mutableStateOf(false) }
    var isChangingEmail by remember { mutableStateOf(false) }
    var emailError by remember { mutableStateOf<String?>(null) }
    var emailSuccess by remember { mutableStateOf(false) }

    LaunchedEffect(memberName) {
        val parts = (memberName ?: "").trim().split(Regex("\\s+"), limit = 2)
        firstName = parts.getOrNull(0) ?: ""
        lastName = parts.getOrNull(1) ?: ""
    }
    LaunchedEffect(Unit) {
        val id = programContext.loggedInMemberId ?: return@LaunchedEffect
        programContext.fetchMember(id).onSuccess { member ->
            currentEmail = member.email
            member.gender?.let { gender = it }
        }
    }

    val isProgramAdmin = programContext.isProgramAdmin
    val isGlobalAdmin = programContext.isGlobalAdmin
    val roleLabel = if (isGlobalAdmin) "Global Admin" else if (isProgramAdmin) "Program Admin" else "Member"

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            DetailTopBar(onBack = onBack, centerTitle = "My Profile")

            // Header: avatar + name + @username + role
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(
                    modifier = Modifier.size(70.dp).background(AppOrange.copy(alpha = 0.18f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        initialsOf("$firstName $lastName".trim().ifBlank { memberName }),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = AppOrange,
                    )
                }
                Column {
                    Text(
                        "$firstName $lastName".trim().ifBlank { memberName ?: "" },
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    if (!username.isNullOrBlank()) {
                        Text(
                            "@$username",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    Text(roleLabel, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = AppOrange)
                }
            }

            SectionDivider()

            FormFieldLabel("First name")
            AppTextField("Enter first name", firstName, { firstName = it })
            FormFieldLabel("Last name")
            AppTextField("Enter last name", lastName, { lastName = it })
            FormFieldLabel("Gender")
            AppDropdownField(
                placeholder = "Select gender",
                value = gender,
                options = GENDER_OPTIONS + "Clear",
                onSelect = { picked -> gender = if (picked == "Clear") "" else picked },
            )

            errorMessage?.let { FormErrorText(it) }
            successMessage?.let { Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = com.app.rasifiters.core.theme.AppGreen) }

            PillButton(
                label = "Save changes",
                onClick = {
                    val id = programContext.loggedInMemberId ?: return@PillButton
                    val f = firstName.trim(); val l = lastName.trim()
                    when {
                        f.isEmpty() -> { errorMessage = "First name is required"; return@PillButton }
                        l.isEmpty() -> { errorMessage = "Last name is required"; return@PillButton }
                    }
                    isSaving = true; errorMessage = null; successMessage = null
                    scope.launch {
                        programContext.updateMemberProfile(id, f, l, gender.ifEmpty { null })
                            .onSuccess { successMessage = "Profile updated successfully" }
                            .onFailure { errorMessage = it.message ?: "Couldn't save your profile." }
                        isSaving = false
                    }
                },
                modifier = Modifier.align(Alignment.CenterHorizontally),
                enabled = !isSaving,
                loading = isSaving,
            )

            // Email section
            SectionDivider()
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Email", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        currentEmail?.takeIf { it.isNotBlank() } ?: "—",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        maxLines = 1,
                    )
                }
                TextButton(onClick = {
                    showEmailForm = !showEmailForm
                    emailError = null; emailSuccess = false; newEmail = ""; emailPassword = ""
                }) {
                    Text(if (showEmailForm) "Cancel" else "Change email", color = AppOrange, fontWeight = FontWeight.SemiBold)
                }
            }
            if (emailSuccess) {
                Text("Email updated successfully.", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = com.app.rasifiters.core.theme.AppGreen)
            }
            if (showEmailForm) {
                FormFieldLabel("New email")
                AppTextField("you@example.com", newEmail, { newEmail = it }, keyboardType = KeyboardType.Email)
                FormFieldLabel("Current password")
                AppPasswordField("Current password", emailPassword, { emailPassword = it }, emailVisible, { emailVisible = !emailVisible })
                emailError?.let { FormErrorText(it) }
                val canSubmitEmail = isEmailValid(newEmail) && emailPassword.isNotEmpty() && !isChangingEmail
                PillButton(
                    label = "Update email",
                    onClick = {
                        isChangingEmail = true; emailError = null
                        scope.launch {
                            programContext.changeEmail(newEmail.trim(), emailPassword)
                                .onSuccess { updated ->
                                    currentEmail = updated ?: newEmail.trim()
                                    emailSuccess = true; showEmailForm = false; newEmail = ""; emailPassword = ""
                                }
                                .onFailure { emailError = it.message ?: "Couldn't change your email." }
                            isChangingEmail = false
                        }
                    },
                    modifier = Modifier.align(Alignment.CenterHorizontally),
                    enabled = canSubmitEmail,
                    loading = isChangingEmail,
                )
            }

            // Delete account (not shown to global admins, matching iOS)
            if (!isGlobalAdmin) {
                SectionDivider()
                Button(
                    onClick = { showDelete = true },
                    enabled = !isDeleting,
                    shape = CircleShape,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = androidx.compose.ui.graphics.Color.White,
                    ),
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    if (isDeleting) CircularProgressIndicator(strokeWidth = 2.dp, color = androidx.compose.ui.graphics.Color.White, modifier = Modifier.size(20.dp))
                    else Text("Delete Account", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                }
                Text(
                    "This will permanently delete your account and all associated data.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }

    if (showDelete) {
        AlertDialog(
            onDismissRequest = { showDelete = false },
            title = { Text("Delete Account?") },
            text = { Text("This action cannot be undone. All your data, including workout logs, health logs, and program memberships will be permanently deleted.") },
            confirmButton = {
                TextButton(onClick = {
                    showDelete = false; isDeleting = true; errorMessage = null
                    scope.launch {
                        programContext.deleteAccount().onFailure {
                            errorMessage = it.message ?: "Couldn't delete your account."
                            isDeleting = false
                        }
                        // On success the session clears → the root swaps to the auth graph.
                    }
                }) { Text("Delete", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDelete = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SectionDivider() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(MaterialTheme.colorScheme.outlineVariant),
    )
}
