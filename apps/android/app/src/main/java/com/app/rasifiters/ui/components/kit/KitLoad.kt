package com.app.rasifiters.ui.components.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.app.rasifiters.core.kit.AppError
import com.app.rasifiters.core.kit.AppErrorKind
import com.app.rasifiters.core.kit.KitCopy
import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.failing
import com.app.rasifiters.core.kit.refreshing
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.core.theme.AppOrange
import com.app.rasifiters.core.theme.rfPalette
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch

// Polish #29 (Phase 4 Track P): the ONE Android helper that puts a screen, section or detail on the kit's five states —
// the Summary recipe (SummaryScreen) packaged once. Reused by #16 #18 #27 #31 #33 #34.

/** Bottom room a list keeps while its own "Couldn't refresh" banner shows (12 + 52 + 12 banner block + 8 gap). */
val STALE_BANNER_CLEARANCE: Dp = 84.dp

/** True when the state carries data (Loaded or Stale): a section shows its value, otherwise "—". */
val UiState<*>.hasData: Boolean get() = this is UiState.Loaded || this is UiState.Stale

/** The screen's own stale banner shows (the app-wide offline banner wins — A6). */
fun UiState<*>.showsStaleBanner(online: Boolean): Boolean = online && this is UiState.Stale

/** First state of a load whose data lives in a ProgramContext flow: data already on screen → Loaded (it refreshes
 *  underneath, no flash); otherwise Loading. */
fun initialLoadState(hasData: Boolean): UiState<Unit> = if (hasData) UiState.fresh(Unit) else UiState.Loading

/** A screen-local load on the kit states (frontend-kit §5). A reload keeps its data (W7-D2: a failed reload → Stale);
 *  [reload] cancels a load in flight. Create it with [rememberLoad]. */
@Stable
class LoadHandle<T> internal constructor(
    initial: UiState<T>,
    private val scope: CoroutineScope,
    private val load: suspend () -> Result<T>,
) {
    var state: UiState<T> by mutableStateOf(initial)
        private set
    private var job: Job? = null

    /** Start (or restart) the load now. A cancelled load stays silent (toAppError rethrows cancellation). */
    fun reload() {
        job?.cancel()
        job = scope.launch {
            state = state.refreshing()
            load().onSuccess { state = UiState.fresh(it) }.onFailure { state = state.failing(it.toAppError()) }
        }
    }

    /** Pull-to-refresh: reload and wait for it. */
    suspend fun refresh() {
        reload()
        job?.join()
    }

    internal fun cancel() { job?.cancel() }
}

/**
 * One keyed screen-local load. A new [key] (put EVERY input of [load] in it) starts a fresh handle from [initial] —
 * never the previous key's data (#34: no old period's bars under the new label) — and loads at once. Back online, a
 * Failed / Stale load retries by itself (D-KIT-13). [enabled] = false never loads (state Idle).
 */
@Composable
fun <T> rememberLoad(
    key: Any?,
    isOnline: StateFlow<Boolean>,
    enabled: Boolean = true,
    initial: () -> UiState<T> = { UiState.Loading },
    load: suspend () -> Result<T>,
): LoadHandle<T> {
    val scope = rememberCoroutineScope()
    val latestLoad by rememberUpdatedState(load)
    val handle = remember(key, enabled) {
        LoadHandle(if (enabled) initial() else UiState.Idle, scope) { latestLoad() }
    }
    DisposableEffect(handle) {
        if (enabled) handle.reload()
        onDispose { handle.cancel() }
    }
    RefetchOnReconnect(
        isOnline,
        needsReload = { enabled && (handle.state is UiState.Failed || handle.state is UiState.Stale) },
    ) { handle.reload() }
    return handle
}

/** D-KIT-13: back online → [reload] when [needsReload] (a Failed / Stale state). */
@Composable
fun RefetchOnReconnect(isOnline: StateFlow<Boolean>, needsReload: () -> Boolean, reload: () -> Unit) {
    val latestNeeds by rememberUpdatedState(needsReload)
    val latestReload by rememberUpdatedState(reload)
    LaunchedEffect(isOnline) {
        isOnline.drop(1).filter { it }.collect { if (latestNeeds()) latestReload() }
    }
}

/**
 * Renders one kit state (the Summary recipe). Data → [content] (emitted into the caller's layout). No data while offline
 * → the offline ErrorView (polish-1 rule 6, never a spinner). Failed → ErrorView + Retry. Otherwise a spinner, or
 * [loading] when given (e.g. skeleton rows). [boxModifier] sizes the spinner / error box (e.g. a chart's height).
 * Loaded and Stale share ONE branch, so a failed or recovered refresh keeps the content's state (scroll position,
 * an open menu, a chart selection) instead of rebuilding it.
 */
@Suppress("UNCHECKED_CAST")
@Composable
fun <T> KitLoad(
    state: UiState<T>,
    online: Boolean,
    onRetry: () -> Unit,
    boxModifier: Modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
    spinnerColor: Color = AppOrange,
    loading: (@Composable () -> Unit)? = null,
    content: @Composable (T) -> Unit,
) {
    when (state) {
        is UiState.Loaded, is UiState.Stale -> content(state.dataOrNull as T)
        is UiState.Failed -> Box(boxModifier, contentAlignment = Alignment.Center) {
            ErrorView(if (online) state.error else AppError(AppErrorKind.OFFLINE), onRetry = onRetry)
        }
        else -> if (!online) {
            Box(boxModifier, contentAlignment = Alignment.Center) { ErrorView(AppError(AppErrorKind.OFFLINE), onRetry = onRetry) }
        } else if (loading != null) {
            loading()
        } else {
            Box(boxModifier, contentAlignment = Alignment.Center) { CircularProgressIndicator(color = spinnerColor) }
        }
    }
}

/** The compact "Couldn't load this · Retry" row for a section or a form lookup: the ErrorView copy on one line, with
 *  Retry when retryable. Shows the offline copy while offline (polish-1 rule 6). */
@Composable
fun InlineLoadError(error: AppError, online: Boolean, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val shown = if (online) error else AppError(AppErrorKind.OFFLINE)
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(KitCopy.ERROR_VIEW_TITLE, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(shown.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (shown.retryable) {
            TextButton(onClick = onRetry) { Text(KitCopy.RETRY, color = rfPalette().accent, fontWeight = FontWeight.SemiBold) }
        }
    }
}

/** The screen's own "Couldn't refresh · Retry" (frontend-kit §6) for a Stale load — hidden while offline (A6). Place
 *  inside the screen's root Box. */
@Composable
fun BoxScope.KitStaleBanner(state: UiState<*>, online: Boolean, onRetry: () -> Unit) {
    if (state.showsStaleBanner(online)) {
        FloatingBanner(FloatingBannerVariant.Stale, Modifier.align(Alignment.BottomCenter), onRetry = onRetry)
    }
}
