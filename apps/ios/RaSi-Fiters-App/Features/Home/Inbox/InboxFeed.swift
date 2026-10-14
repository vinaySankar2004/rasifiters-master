import Combine
import Foundation

/// The inbox list's paging state (GET /notifications/inbox — C4): the first page on open / refresh, then older pages by
/// `next_cursor` as the list's end comes on screen. A reload supersedes a page still in flight (generation).
final class InboxFeed: ObservableObject {
    @Published private(set) var state: LoadState<[APIClient.NotificationDTO]> = .idle
    @Published private(set) var isLoadingMore = false
    private var nextCursor: String?
    private var generation = 0
    /// The newest reload / refreshHead — a dropped one settles the state only when no newer one owns it.
    private var headLoad = 0
    /// The stale error ("Couldn't refresh") a reload's `refreshing()` hid — put back if that reload is dropped.
    private var hiddenStaleError: AppError?
    /// Removed here (§3.9 rule 11): kept out of every first page that lands later — a load in flight, or one started
    /// before the DELETE landed, can't bring a removed row back. A refused remove / Clear all takes its ids out again.
    private var removedIds: Set<String> = []

    /// An older page exists — the list's load-on-scroll trigger shows (InboxLoadMoreTrigger).
    var canLoadMore: Bool { nextCursor != nil }

    /// true when THIS call loaded the first page (InboxView marks read only then).
    @discardableResult
    func reload(online: Bool) async -> Bool {
        generation += 1
        let current = generation
        headLoad = current
        switch state {
        case .stale(_, _, let error): hiddenStaleError = error
        case .loaded(_, _, true): break                                 // an earlier reload already hid it
        default: hiddenStaleError = nil
        }
        state = state.refreshing()
        do {
            let page = try await APIClient.shared.fetchInbox()
            guard current == generation else { settleDropped(current); return false }
            nextCursor = page.nextCursor
            state = .fresh(kept(page.items))
            return true
        } catch {
            guard current == generation, let appError = AppError(error) else { settleDropped(current); return false }
            state = state.failing(with: appError.labeled(online: online))
            return false
        }
    }

    /// A live reload (an item arrived / the catch-up): page 1 merged into the loaded pages — the rows paged in and their
    /// cursor stay; a row inside page 1's span that's gone was removed server-side (e.g. an undone kudos).
    @discardableResult
    func refreshHead(online: Bool) async -> Bool {
        guard state.value != nil else { return await reload(online: online) }
        generation += 1
        let current = generation
        headLoad = current
        do {
            let page = try await APIClient.shared.fetchInbox()
            guard current == generation else { settleDropped(current); return false }
            let loaded = state.value ?? []                                  // the rows now, not before the fetch
            let pageIds = Set(page.items.map(\.id))
            let oldest = page.items.last?.createdDate
            let older = page.nextCursor == nil ? [] : loaded.filter { item in
                guard !pageIds.contains(item.id), let date = item.createdDate, let oldest else { return false }
                return date <= oldest
            }
            if older.isEmpty { nextCursor = page.nextCursor }
            state = .fresh(kept(page.items) + older)
            return true
        } catch {
            guard current == generation, let appError = AppError(error) else { settleDropped(current); return false }
            state = state.failing(with: appError.labeled(online: online))
            return false
        }
    }

    func loadMore() async {
        guard !isLoadingMore, let cursor = nextCursor, state.value != nil else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        let current = generation
        guard let page = try? await APIClient.shared.fetchInbox(before: cursor), current == generation,
              let items = state.value else { return }                       // the rows now, not before the fetch
        nextCursor = page.nextCursor
        let known = Set(items.map(\.id))
        state = .fresh(items + page.items.filter { !known.contains($0.id) && !removedIds.contains($0.id) })
    }

    /// C7.7: the loaded invite notifications of one program (an accept / decline marks them read).
    func inviteItemIds(programId: String) -> [String] {
        (state.value ?? []).filter { $0.type == "program.invite_received" && $0.programId == programId }.map(\.id)
    }

    // MARK: Remove + Clear all (§3.9 rule 11, D-C32) — optimistic.

    /// Remove one: the row leaves at once and stays out of later first pages; if `send` throws it comes back where it
    /// was (unless a load already brought it back) and the error is rethrown. Loads in flight keep going — a removed
    /// row is never in an older page, so paging (loadMore) is never cancelled by a remove.
    func remove(id: String, send: () async throws -> Void) async throws {
        guard let items = state.value, let index = items.firstIndex(where: { $0.id == id }) else { return }
        let item = items[index]
        removedIds.insert(id)
        replaceItems { $0.filter { $0.id != id } }
        do {
            try await send()
        } catch {
            removedIds.remove(id)
            replaceItems { current in
                guard !current.contains(where: { $0.id == item.id }) else { return current }
                var restored = current
                restored.insert(item, at: min(index, restored.count))
                return restored
            }
            throw error
        }
    }

    /// Clear all: every loaded row leaves at once and loads in flight are dropped (the generation); nothing older pages
    /// in while it runs. If `send` throws the rows come back under anything that arrived meanwhile and the error is
    /// rethrown; success re-reads the newest page (what arrived meanwhile + a fresh cursor).
    func clearAll(online: Bool, send: () async throws -> Void) async throws {
        guard let items = state.value, !items.isEmpty else { return }
        let ids = Set(items.map(\.id))
        let cursor = nextCursor
        generation += 1
        removedIds.formUnion(ids)
        nextCursor = nil
        replaceItems { _ in [] }
        do {
            try await send()
        } catch {
            removedIds.subtract(ids)
            if nextCursor == nil { nextCursor = cursor }                    // unless a reload meanwhile set a fresh one
            replaceItems { current in
                let shown = Set(current.map(\.id))
                return current + items.filter { !shown.contains($0.id) }
            }
            throw error
        }
        await refreshHead(online: online)
    }

    /// A landing first page without the rows removed here.
    private func kept(_ items: [APIClient.NotificationDTO]) -> [APIClient.NotificationDTO] {
        removedIds.isEmpty ? items : items.filter { !removedIds.contains($0.id) }
    }

    /// A reload / refreshHead that won't write its answer (Clear all dropped it, or it was cancelled): unless a newer one
    /// owns the state, undo the reload's `refreshing()` — rows that were stale get their "Couldn't refresh" back.
    private func settleDropped(_ load: Int) {
        guard load == headLoad, case .loaded(let items, let fetchedAt, true) = state else { return }
        if let error = hiddenStaleError {
            state = .stale(items, fetchedAt: fetchedAt, error: error)
        } else {
            state = .loaded(items, fetchedAt: fetchedAt, refreshing: false)
        }
        hiddenStaleError = nil
    }

    /// Keeps the load state (fresh / stale + its banner) and swaps only the rows.
    private func replaceItems(_ transform: ([APIClient.NotificationDTO]) -> [APIClient.NotificationDTO]) {
        switch state {
        case .loaded(let items, let fetchedAt, let refreshing):
            state = .loaded(transform(items), fetchedAt: fetchedAt, refreshing: refreshing)
        case .stale(let items, let fetchedAt, let error):
            state = .stale(transform(items), fetchedAt: fetchedAt, error: error)
        case .idle, .loading, .failed:
            break
        }
    }
}
