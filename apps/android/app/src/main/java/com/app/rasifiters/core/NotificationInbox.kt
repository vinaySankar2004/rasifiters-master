package com.app.rasifiters.core

import com.app.rasifiters.core.kit.UiState
import com.app.rasifiters.core.kit.dataOrNull
import com.app.rasifiters.core.kit.failing
import com.app.rasifiters.core.kit.refreshing
import com.app.rasifiters.core.kit.toAppError
import com.app.rasifiters.net.ApiService
import com.app.rasifiters.net.InboxItemDTO
import com.app.rasifiters.net.InboxReadRequest
import com.app.rasifiters.net.NotificationPreferencesDTO
import com.app.rasifiters.net.NotificationPreferencesUpdate
import com.app.rasifiters.net.UnreadCountsDTO
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant
import kotlin.coroutines.cancellation.CancellationException

private const val INVITE_TYPE = "program.invite_received"
/** `POST /inbox/read` takes at most 100 ids. */
private const val MAX_READ_IDS = 100

/** Where a notification opens (the inbox contract's targets). An unknown value opens the inbox. */
enum class InboxTarget(val wire: String) {
    INVITES("invites"), PROGRAM("program"), PROGRAMS("programs"), LOG_WORKOUT("log_workout"), INBOX("inbox");

    companion object {
        fun parse(raw: String?): InboxTarget = entries.firstOrNull { it.wire == raw } ?: INBOX
    }
}

/** A push tap / toast View / inbox row waiting for the signed-in graph to open it (RootScreen consumes it once). */
data class PendingOpen(val target: InboxTarget, val programId: String?)

/**
 * The notification inbox hub. ProgramContext owns one and feeds it the `?inbox=1` stream, foreground pushes and push
 * taps. Holds the unread counts (the "+" badge), the paged list, the preference cache that gates the toast, the toast and
 * the pending "open this". The reading rule: a visit whose newest page loaded marks everything read (one `{all:true}`),
 * an item arriving while the inbox is on screen is marked read on arrival, an inbox off screen marks nothing; the dots
 * of what was new stay for the whole visit ([visitNewIds]). Every apply checks [owner], so a late answer after a
 * sign-out is dropped.
 */
class NotificationInbox(
    private val api: ApiService,
    private val scope: CoroutineScope,
    /** The signed-in member a load started for (null = signed out) — ProgramContext.sessionOwner. */
    private val owner: () -> String?,
    /** An invite arrived / the pending-invite count moved → reload the invite list. */
    private val onInviteActivity: suspend () -> Unit,
    /** Any other item → refresh what its type touches (programs, roster). */
    private val onItemActivity: suspend (type: String) -> Unit,
    /** Everything is read → clear the pushes still in the tray (Android's launcher dots follow them). */
    private val onAllRead: () -> Unit,
) {
    private val _counts = MutableStateFlow<UnreadCountsDTO?>(null)
    /** The unread counts (null = not loaded yet); `badge` drives the "+" badge and the account Inbox row. */
    val counts: StateFlow<UnreadCountsDTO?> = _counts.asStateFlow()

    private val _items = MutableStateFlow<UiState<List<InboxItemDTO>>>(UiState.Idle)
    val items: StateFlow<UiState<List<InboxItemDTO>>> = _items.asStateFlow()
    private var nextCursor: String? = null
    private val _canLoadMore = MutableStateFlow(false)
    val canLoadMore: StateFlow<Boolean> = _canLoadMore.asStateFlow()
    private val _loadingMore = MutableStateFlow(false)
    val loadingMore: StateFlow<Boolean> = _loadingMore.asStateFlow()

    private var visibleCount = 0
    private val _inboxVisible = MutableStateFlow(false)
    /** An inbox list is on screen (InboxList registers itself) — reads happen only then; the toast stays away. */
    val inboxVisible: StateFlow<Boolean> = _inboxVisible.asStateFlow()
    private val _visitNewIds = MutableStateFlow<Set<String>>(emptySet())
    /** The items that were unread during this visit — their dots stay until the inbox is left. */
    val visitNewIds: StateFlow<Set<String>> = _visitNewIds.asStateFlow()

    private val _preferences = MutableStateFlow<UiState<NotificationPreferencesDTO>>(UiState.Idle)
    val preferences: StateFlow<UiState<NotificationPreferencesDTO>> = _preferences.asStateFlow()
    private val saveLock = Mutex()

    private val _toast = MutableStateFlow<InboxItemDTO?>(null)
    val toast: StateFlow<InboxItemDTO?> = _toast.asStateFlow()

    private val _pendingOpen = MutableStateFlow<PendingOpen?>(null)
    val pendingOpen: StateFlow<PendingOpen?> = _pendingOpen.asStateFlow()
    fun consumePendingOpen() { _pendingOpen.value = null }
    /** Route somewhere without an item (the catch-up's "your program is gone" → `programs`); the form guard applies. */
    fun requestOpen(open: PendingOpen) { _pendingOpen.value = open }

    /** The shell's inner route (AppScaffold publishes it; null outside the shell) — read by the routing rule's form guard. */
    val shellRoute = MutableStateFlow<String?>(null)
    /** A form outside the nav routes holds typed input (the "+" sheet's Create tab) — it counts as an open form. */
    val draftOpen = MutableStateFlow(false)
    private val _formOpen = MutableStateFlow(false)
    /** A form is on screen (RootScreen decides): a notification only marks read, and no toast shows over it. */
    val formOpen: StateFlow<Boolean> = _formOpen.asStateFlow()
    fun setFormOpen(open: Boolean) {
        _formOpen.value = open
        if (open) _toast.value = null
    }

    private var coverCount = 0
    /** A sheet or cover is up (its own window, above the toast): the toast is cleared and withheld until it closes. */
    fun coverShown() { coverCount++; _toast.value = null }
    fun coverHidden() { coverCount = (coverCount - 1).coerceAtLeast(0) }
    private fun toastAllowed(): Boolean = !_inboxVisible.value && !_formOpen.value && coverCount == 0

    private val _invitesSheetRequest = MutableStateFlow(false)
    /** An `invites` target asks the program picker to open the "+" sheet on its Inbox tab. */
    val invitesSheetRequest: StateFlow<Boolean> = _invitesSheetRequest.asStateFlow()
    fun requestInvitesSheet() { _invitesSheetRequest.value = true }
    fun consumeInvitesSheetRequest() { _invitesSheetRequest.value = false }

    // ---- visibility (one visit = the time an inbox list is on screen) ----

    fun inboxShown() {
        if (visibleCount++ > 0) return
        _visitNewIds.value = emptySet()
        _inboxVisible.value = true
        _toast.value = null
    }

    fun inboxHidden() {
        visibleCount = (visibleCount - 1).coerceAtLeast(0)
        if (visibleCount == 0) _inboxVisible.value = false
    }

    private fun noteNew(items: List<InboxItemDTO>) {
        val ids = items.filter { it.readAt == null }.map { it.id }
        if (ids.isNotEmpty()) _visitNewIds.value = _visitNewIds.value + ids
    }

    // ---- counts ----

    /** GET /inbox/unread-count — the catch-up, every item / push. Keeps the last value on failure. */
    suspend fun refreshCounts() {
        val o = owner() ?: return
        runCatching { api.getUnreadCounts() }.onSuccess { applyCounts(o, it) }
    }

    private suspend fun applyCounts(o: String, next: UnreadCountsDTO) {
        if (o != owner()) return
        val prev = _counts.value
        _counts.value = next
        if (prev != null && prev.pendingInvites != next.pendingInvites) runCatching { onInviteActivity() }
    }

    // ---- the list ----

    /** The newest page (30). */
    suspend fun loadFirstPage(): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        _items.value = _items.value.refreshing()
        return runCatching { api.getInbox() }
            .onSuccess { page ->
                if (o != owner()) return@onSuccess
                nextCursor = page.nextCursor
                _canLoadMore.value = page.nextCursor != null
                if (_inboxVisible.value) noteNew(page.items)
                _items.value = UiState.fresh(page.items)
            }
            .onFailure { if (it !is CancellationException && o == owner()) _items.value = _items.value.failing(it.toAppError()) }
            .map { }
    }

    /** The inbox is on screen: load the newest page, then mark everything read (the reading rule). */
    suspend fun loadAndMarkRead(): Result<Unit> = loadFirstPage().onSuccess { markAllRead() }

    /** "Load more" — the next page (`before = next_cursor`); a failure keeps what is shown (the button stays). */
    suspend fun loadMore() {
        val o = owner() ?: return
        val cursor = nextCursor ?: return
        if (_loadingMore.value) return
        _loadingMore.value = true
        runCatching { api.getInbox(before = cursor) }.onSuccess { page ->
            if (o != owner()) return@onSuccess
            nextCursor = page.nextCursor
            _canLoadMore.value = page.nextCursor != null
            if (_inboxVisible.value) noteNew(page.items)
            updateItems { list -> list + page.items.filter { item -> list.none { it.id == item.id } } }
        }
        _loadingMore.value = false
    }

    /** Decided from the loaded page (any unread) or a non-zero / unknown cached count — never the cached count alone. */
    private suspend fun markAllRead() {
        val o = owner() ?: return
        if (!_inboxVisible.value) return
        val pageUnread = _items.value.dataOrNull.orEmpty().any { it.readAt == null }
        if (!pageUnread && _counts.value?.unread == 0) { onAllRead(); return }
        runCatching { api.markInboxRead(InboxReadRequest(all = true)) }.onSuccess { counts ->
            if (o != owner()) return@onSuccess
            applyCounts(o, counts)
            val now = Instant.now().toString()
            updateItems { list -> list.map { if (it.readAt == null) it.copy(readAt = now) else it } }
            onAllRead()
        }
    }

    /** These items are read (a push tap, a toast View, an arrival on screen, an answered invite). */
    suspend fun markRead(ids: List<String>) {
        val o = owner() ?: return
        val unique = ids.distinct().take(MAX_READ_IDS)
        if (unique.isEmpty()) return
        val changed = _items.value.dataOrNull.orEmpty().filter { it.id in unique && it.readAt == null }.map { it.id }.toSet()
        val now = Instant.now().toString()
        updateItems { list -> list.map { if (it.id in changed) it.copy(readAt = now) else it } }
        runCatching { api.markInboxRead(InboxReadRequest(ids = unique)) }
            .onSuccess { applyCounts(o, it) }
            .onFailure { e ->
                // Not read on the server → the dots come back (it stays unread everywhere).
                if (e !is CancellationException && o == owner()) {
                    updateItems { list -> list.map { if (it.id in changed) it.copy(readAt = null) else it } }
                }
            }
    }

    /** After an invite is accepted / declined, its program's unread invite items are read (else just recount). */
    suspend fun markInviteItemsRead(programId: String) {
        val ids = _items.value.dataOrNull.orEmpty()
            .filter { it.type == INVITE_TYPE && it.programId == programId && it.readAt == null }
            .map { it.id }
        if (ids.isEmpty()) refreshCounts() else markRead(ids)
    }

    // ---- live items, pushes, opening ----

    /** A `?inbox=1` stream frame: on top of a loaded list; read at once while the inbox is on screen (its dot stays for
     *  the visit), else a toast when its category is on; counts + what it touches refreshed. */
    fun onStreamItem(item: InboxItemDTO) {
        if (owner() == null) return
        updateItems { list -> if (list.any { it.id == item.id }) list else listOf(item) + list }
        val onScreen = _inboxVisible.value
        if (toastAllowed() && categoryOn(item.category)) _toast.value = item
        scope.launch {
            if (onScreen && item.readAt == null) {
                noteNew(listOf(item))
                markRead(listOf(item.id))
            } else {
                refreshCounts()
            }
            runCatching { if (item.type == INVITE_TYPE) onInviteActivity() else onItemActivity(item.type) }
        }
    }

    /** A foreground push the tray showed (the stream was down): the badge and an invite's list stay fresh. Any thread. */
    fun onPushReceived(type: String?) {
        if (owner() == null) return
        scope.launch {
            // On screen, the inbox reloads (and reads) the new item; otherwise just the badge.
            if (_inboxVisible.value) loadAndMarkRead() else refreshCounts()
            if (type == INVITE_TYPE) runCatching { onInviteActivity() }
        }
    }

    /** A push tap, the toast's View or an inbox row: mark it read, then open its target (the routing rule). A push sent
     *  before the inbox existed has no `target`: an invite opens the invites, anything else the inbox. */
    fun open(notificationId: String, type: String?, target: String?, programId: String?) {
        if (owner() == null) return
        val resolved = when {
            target != null -> InboxTarget.parse(target)
            type == INVITE_TYPE -> InboxTarget.INVITES
            else -> InboxTarget.INBOX
        }
        if (_toast.value?.id == notificationId) _toast.value = null
        _pendingOpen.value = PendingOpen(resolved, programId)
        scope.launch {
            markRead(listOf(notificationId))
            if (type != null) runCatching { if (type == INVITE_TYPE) onInviteActivity() else onItemActivity(type) }
        }
    }

    fun openItem(item: InboxItemDTO) = open(item.id, item.type, item.target, item.programId)

    fun dismissToast(id: String) { if (_toast.value?.id == id) _toast.value = null }

    /** The toast's category gate — unknown preferences or keys fail open (the toast shows). */
    private fun categoryOn(category: String): Boolean = _preferences.value.dataOrNull?.categories?.get(category) ?: true

    // ---- preferences ----

    /** GET /preferences — every foreground (it gates the toast) and when the settings screen opens. */
    suspend fun loadPreferences(): Result<Unit> {
        val o = owner() ?: return Result.success(Unit)
        _preferences.value = _preferences.value.refreshing()
        // A save in flight wins: its answer is newer than this read, so the read is not applied.
        return runCatching { api.getNotificationPreferences() }
            .onSuccess { if (o == owner() && !saveLock.isLocked) _preferences.value = UiState.fresh(it) }
            .onFailure {
                if (it !is CancellationException && o == owner() && !saveLock.isLocked) {
                    _preferences.value = _preferences.value.failing(it.toAppError())
                }
            }
            .map { }
    }

    /** PUT /preferences (partial), one at a time. Optimistic: the switch moves at once; a failure puts it back. */
    suspend fun savePreferences(update: NotificationPreferencesUpdate): Result<Unit> = saveLock.withLock {
        val o = owner() ?: return@withLock Result.success(Unit)
        val before = _preferences.value.dataOrNull
            ?: return@withLock Result.failure(IllegalStateException("Notification settings aren't loaded."))
        _preferences.value = UiState.fresh(
            before.copy(
                categories = before.categories + update.categories.orEmpty(),
                reminderTime = update.reminderTime ?: before.reminderTime,
            ),
        )
        runCatching { api.putNotificationPreferences(update) }
            .onSuccess { if (o == owner()) _preferences.value = UiState.fresh(it) }
            .onFailure { if (it !is CancellationException && o == owner()) _preferences.value = UiState.fresh(before) }
            .map { }
    }

    private fun updateItems(transform: (List<InboxItemDTO>) -> List<InboxItemDTO>) {
        _items.value = when (val st = _items.value) {
            is UiState.Loaded -> st.copy(data = transform(st.data))
            is UiState.Stale -> st.copy(data = transform(st.data))
            else -> st
        }
    }

    /** Sign-out teardown (visibility follows the composition, so it isn't reset here). */
    fun reset() {
        _counts.value = null
        _items.value = UiState.Idle
        nextCursor = null
        _canLoadMore.value = false
        _loadingMore.value = false
        _visitNewIds.value = emptySet()
        _preferences.value = UiState.Idle
        _toast.value = null
        _pendingOpen.value = null
        _invitesSheetRequest.value = false
    }
}
