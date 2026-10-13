package com.app.rasifiters.ui.programs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.app.rasifiters.core.ProgramContext
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.ui.OFFLINE_BANNER_RESERVE
import com.app.rasifiters.ui.auth.AppDropdownField
import com.app.rasifiters.ui.auth.AppTextField
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.inbox.InboxList
import com.app.rasifiters.ui.summary.DatePillField
import com.app.rasifiters.ui.summary.FormErrorText
import com.app.rasifiters.ui.summary.FormFieldLabel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val STATUS_OPTIONS = listOf("Planned", "Active", "Completed")
private val ISO: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

// The tab-content region is pinned to the taller (Create) tab's height so the sheet doesn't shrink/grow
// when toggling to Inbox — the shorter tab just top-anchors within the same box.
private val TAB_CONTENT_HEIGHT = 500.dp

/**
 * The "+" actions sheet on the picker — the Android analog of the iOS `ProgramActionsSheet`: a two-tab segmented control
 * over **Inbox** and **Create** (the new-program form). The Inbox tab (it grew out of "My Invites") is the shared
 * [InboxList]: pending invites first with their actions (`/my-invites`; global admins `/all-invites` + Revoke — A10), the
 * member's own join requests (Cancel Request), then the notifications. Opens on Inbox when the badge is above 0 or for an
 * `invites` push / toast target ([openOnInbox]), else on Create; opened before the counts arrive, the badge decides once
 * they do (unless the member already switched tabs).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgramActionsSheet(
    programContext: ProgramContext,
    onDismiss: () -> Unit,
    openOnInbox: Boolean = false,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val invitesState by programContext.invites.collectAsStateWithLifecycle()
    val counts by programContext.inbox.counts.collectAsStateWithLifecycle()
    // Until the counts load: the member's own invites (0 for global admins — their badge counts only their own).
    val badge = counts?.badge ?: if (programContext.isGlobalAdmin) 0 else invitesState.dataOrNull?.size ?: 0
    var selectedTab by remember { mutableIntStateOf(if (openOnInbox || badge > 0) 0 else 1) }
    var switchedByHand by remember { mutableStateOf(false) }
    LaunchedEffect(openOnInbox) { if (openOnInbox) selectedTab = 0 }
    val countsLoaded = counts != null
    LaunchedEffect(countsLoaded) {
        if (countsLoaded && !switchedByHand && !openOnInbox) selectedTab = if ((counts?.badge ?: 0) > 0) 0 else 1
    }
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    // The sheet is its own window above the toast: the toast is cleared and withheld while it is up.
    DisposableEffect(Unit) {
        programContext.inbox.coverShown()
        onDispose { programContext.inbox.coverHidden() }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        // Polish #2 (D-KIT-17): the sheet is its own window, so the root offline banner can't show over it — it carries
        // its own, and the tab area gives up the banner's band (the sheet keeps its height) so nothing sits under it.
        Box(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 16.dp),
            ) {
                SegmentedToggle(
                    left = "Inbox",
                    right = "Create",
                    selectedIndex = selectedTab,
                    onSelect = { selectedTab = it; switchedByHand = true },
                )
                Spacer(Modifier.height(16.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(TAB_CONTENT_HEIGHT)
                        .padding(bottom = if (online) 0.dp else OFFLINE_BANNER_RESERVE),
                ) {
                    when (selectedTab) {
                        0 -> InboxTab(programContext, onDismiss)
                        else -> CreateProgramTab(programContext, onCreated = onDismiss)
                    }
                }
            }
            if (!online) {
                FloatingBanner(FloatingBannerVariant.Offline, Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
            }
        }
    }
}

/** The Inbox tab: a title over the shared [InboxList]; an item that leads somewhere closes the sheet first. */
@Composable
private fun InboxTab(programContext: ProgramContext, onDismiss: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Inbox", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Invites and notifications",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }
        InboxList(
            programContext = programContext,
            onOpenItem = { item -> onDismiss(); programContext.inbox.openItem(item) },
            onAccepted = onDismiss,
            modifier = Modifier.fillMaxWidth().weight(1f),
        )
    }
}

@Composable
private fun SegmentedToggle(left: String, right: String, selectedIndex: Int, onSelect: (Int) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceContainerHigh, CircleShape)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        listOf(left, right).forEachIndexed { index, label ->
            val selected = index == selectedIndex
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(CircleShape)
                    .background(if (selected) MaterialTheme.colorScheme.surface else Color.Transparent)
                    .clickable { onSelect(index) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                    color = if (selected) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                )
            }
        }
    }
}

// ---- Create tab ----

@Composable
private fun CreateProgramTab(programContext: ProgramContext, onCreated: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("planned") }
    var startDate by remember { mutableStateOf(LocalDate.now()) }
    var endDate by remember { mutableStateOf(LocalDate.now().plusMonths(3)) }
    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val dateError = if (!startDate.isBefore(endDate)) "End date must be after the start date." else null
    // Typed input makes this an open form for the routing rule: an `invites` tap must not flip the tab and lose it.
    val hasInput = name.isNotBlank()
    DisposableEffect(hasInput) {
        programContext.inbox.draftOpen.value = hasInput
        onDispose { programContext.inbox.draftOpen.value = false }
    }
    val canSave = name.trim().isNotEmpty() && dateError == null && !isSaving

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Create Program", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "Set up a new fitness program.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
            )
        }

        FormFieldLabel("Program name")
        AppTextField("e.g. Summer 2026 Challenge", name, { name = it })

        FormFieldLabel("Status")
        AppDropdownField(
            placeholder = "Select status",
            value = status.replaceFirstChar { it.titlecase(Locale.US) },
            options = STATUS_OPTIONS,
            onSelect = { status = it.lowercase(Locale.US) },
        )

        FormFieldLabel("Start date")
        DatePillField(date = startDate, onChange = { startDate = it }, allowFuture = true)

        FormFieldLabel("End date")
        DatePillField(date = endDate, onChange = { endDate = it }, allowFuture = true)

        dateError?.let { FormErrorText(it) }
        errorMessage?.let { FormErrorText(it) }

        Button(
            onClick = {
                isSaving = true; errorMessage = null
                scope.launch {
                    programContext.createProgram(name.trim(), status, startDate.format(ISO), endDate.format(ISO))
                        .onSuccess { onCreated() }
                        .onFailure { errorMessage = it.toAppError().message }
                    isSaving = false
                }
            },
            enabled = canSave,
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(
                containerColor = AppOrange,
                contentColor = Color.Black,
                disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
            ),
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (isSaving) CircularProgressIndicator(strokeWidth = 2.dp, color = Color.Black, modifier = Modifier.size(20.dp))
            else Text("Create Program", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
    }
}
