package com.app.rasifiters.ui.people

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.net.PersonRowDTO
import com.app.rasifiters.ui.Routes
import com.app.rasifiters.ui.components.kit.ErrorView
import com.app.rasifiters.ui.components.kit.FloatingBanner
import com.app.rasifiters.ui.components.kit.FloatingBannerVariant
import com.app.rasifiters.ui.program.ProgramSettingsRow
import com.app.rasifiters.ui.summary.DetailTopBar
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val DAY_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d", Locale.US)
private val DAY_YEAR_FMT: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM d, yyyy", Locale.US)

/**
 * People — the active program's members, opened from the Members header (every role) and the Program tab's "People"
 * row (the roster grew into this). "You" first, then A→Z (server order); initials only; each row shows last active (or
 * that the person keeps their activity private) and opens their profile. Program admins / global admins also get
 * "Invite member" here. Kit (the Summary recipe): loading → spinner, failed → ErrorView + Retry (offline copy while
 * offline), stale → "Couldn't refresh · Retry", pull to refresh, back online → a failed / stale list reloads. The one-time
 * "Who can see your activity" notice shows on the first open.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PeopleListScreen(programContext: ProgramContext, onNavigate: (String) -> Unit, onBack: () -> Unit) {
    val people = programContext.people
    val program by programContext.activeProgram.collectAsStateWithLifecycle()
    val state by people.list.collectAsStateWithLifecycle()
    val online by programContext.isOnline.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    // Survives a profile push + back (the persist-selections rule).
    var query by rememberSaveable { mutableStateOf("") }
    var pulling by remember { mutableStateOf(false) }
    val programId = program?.id

    suspend fun reload() { if (programId != null) people.loadList(programId) }
    LaunchedEffect(programId) { reload() }
    LaunchedEffect(Unit) {
        programContext.isOnline.drop(1).filter { it }.collect {
            val st = people.list.value
            if (st is UiState.Failed || st is UiState.Stale) reload()
        }
    }

    val current = state
    val data = current.dataOrNull
    val q = query.trim()
    val rows = data?.people.orEmpty().filter {
        q.isEmpty() || it.memberName.contains(q, ignoreCase = true) || it.username.contains(q, ignoreCase = true)
    }
    val staleBanner = online && current is UiState.Stale

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        PullToRefreshBox(
            isRefreshing = pulling,
            onRefresh = { pulling = true; scope.launch { reload(); pulling = false } },
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = if (staleBanner) 96.dp else 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item { DetailTopBar(onBack = onBack, centerTitle = "People") }
                item {
                    Text(
                        program?.name.orEmpty(),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (programContext.isProgramAdmin) {
                    item {
                        ProgramSettingsRow(Icons.Filled.PersonAdd, AppOrange, "Invite member", "Send an invite by username") {
                            onNavigate(Routes.MEMBER_INVITE)
                        }
                    }
                }
                item { SearchField(query) { query = it } }
                when {
                    data == null && !online -> item {
                        ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = { scope.launch { reload() } })
                    }
                    data == null && current is UiState.Failed -> item {
                        ErrorView(current.error, onRetry = { scope.launch { reload() } })
                    }
                    data == null -> item {
                        Box(Modifier.fillMaxWidth().padding(vertical = 40.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = AppOrange)
                        }
                    }
                    rows.isEmpty() -> item {
                        Text(
                            if (q.isEmpty()) "No one in this program yet." else "No one matches your search.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        )
                    }
                    else -> items(rows, key = { it.memberId }) { person ->
                        PersonRow(person) {
                            if (programId != null) {
                                people.focus(programId, person.memberId)
                                onNavigate(Routes.PERSON_PROFILE)
                            }
                        }
                    }
                }
            }
        }
        if (staleBanner) {
            FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = { scope.launch { reload() } })
        }
    }

    ActivityVisibilityNoticeHost(programContext, enabled = true)
}

@Composable
private fun SearchField(query: String, onChange: (String) -> Unit) {
    TextField(
        value = query,
        onValueChange = onChange,
        singleLine = true,
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
        placeholder = { Text("Search people") },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
        ),
    )
}

@Composable
private fun PersonRow(person: PersonRowDTO, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PersonInitials(person.initials, 44, accent = person.programRole == "admin")
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    person.memberName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                PeopleMarkers(person.isYou, person.programRole)
            }
            Text(
                lastActiveText(person.activityVisible, person.lastActive),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                maxLines = 1,
            )
        }
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f))
    }
}

/** The markers — "You", "Admin", "Logger" as small pills (plain members get none); the same on web and iOS. */
@Composable
internal fun PeopleMarkers(isYou: Boolean, role: String) {
    if (isYou) PeoplePill("You")
    roleLabel(role)?.let { PeoplePill(it) }
}

@Composable
private fun PeoplePill(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.SemiBold,
        color = AppOrange,
        maxLines = 1,
        modifier = Modifier
            .clip(CircleShape)
            .background(AppOrange.copy(alpha = 0.16f))
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

internal fun roleLabel(role: String): String? = when (role) {
    "admin" -> "Admin"
    "logger" -> "Logger"
    else -> null
}

/** Server-computed initials (the same letters on all three) in a circle; admins get the orange tint. */
@Composable
internal fun PersonInitials(initials: String, size: Int, accent: Boolean = false) {
    Box(
        modifier = Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(if (accent) AppOrange.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials.ifBlank { "?" },
            style = if (size >= 60) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = if (accent) AppOrange else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** "Today" · "Yesterday" · "Oct 12" · "Oct 12, 2025" for a "YYYY-MM-DD" (the device's today); null for none / bad. */
internal fun peopleDay(iso: String?, today: LocalDate = LocalDate.now()): String? {
    val day = iso?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return null
    return when {
        day == today -> "Today"
        day == today.minusDays(1) -> "Yesterday"
        day.year == today.year -> day.format(DAY_FMT)
        else -> day.format(DAY_YEAR_FMT)
    }
}

internal fun lastActiveText(visible: Boolean, lastActive: String?): String {
    if (!visible) return "Activity hidden"
    return when (val day = peopleDay(lastActive)) {
        null -> "No workouts yet"
        "Today" -> "Active today"
        "Yesterday" -> "Active yesterday"
        else -> "Last active $day"
    }
}
