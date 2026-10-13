import Combine
import SwiftUI

/// One inbox item (notifications contract C3): category glyph, title, body (never clamped), relative time, an unread
/// dot. A row whose target is elsewhere (a program, the programs list, the workout log) is a button with a chevron;
/// `inbox` / `invites` rows are plain (they're already on screen).
struct InboxRow: View {
    let item: APIClient.NotificationDTO
    /// Unread when this visit began (the dot stays for the whole visit).
    let showsUnread: Bool
    /// nil = not tappable.
    let onOpen: (() -> Void)?

    var body: some View {
        if let onOpen {
            Button(action: onOpen) { content(showsChevron: true) }
                .buttonStyle(.plain)
        } else {
            content(showsChevron: false)
        }
    }

    private func content(showsChevron: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle()
                    .fill(NotificationCategoryStyle.color(item.resolvedCategory).opacity(0.14))
                    .frame(width: 40, height: 40)
                Image(systemName: NotificationCategoryStyle.icon(item.resolvedCategory))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(NotificationCategoryStyle.color(item.resolvedCategory))
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.title)
                        .font(.subheadline.weight(showsUnread ? .bold : .semibold))
                        .foregroundColor(Color(.label))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(InboxCopy.timeLabel(for: item.createdDate))
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                        .fixedSize()
                }
                Text(item.body)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            VStack(spacing: 8) {
                if showsUnread {
                    Circle().fill(Color.appOrange).frame(width: 8, height: 8)
                }
                if showsChevron {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(.tertiaryLabel))
                }
            }
            .padding(.top, 4)
            .accessibilityHidden(true)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.systemBackground)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityValue(showsUnread ? "Unread" : "")
    }
}

/// The inbox's empty notifications state (only on loaded data — never on a failure; shown even when invitations are).
struct InboxEmptyState: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.system(size: 36))
                .foregroundColor(Color(.tertiaryLabel))
            Text(InboxCopy.emptyTitle)
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text(InboxCopy.emptyDetail)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 20)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.systemGray6)))
    }
}

/// The inbox list's paging state (GET /notifications/inbox — C4): the first page on open / refresh, then older pages by
/// `next_cursor` as the last row appears. A reload supersedes a page still in flight (generation).
final class InboxFeed: ObservableObject {
    @Published private(set) var state: LoadState<[APIClient.NotificationDTO]> = .idle
    @Published private(set) var isLoadingMore = false
    private var nextCursor: String?
    private var generation = 0

    /// true when THIS call loaded the first page (InboxView marks read only then).
    @discardableResult
    func reload(online: Bool) async -> Bool {
        generation += 1
        let current = generation
        state = state.refreshing()
        do {
            let page = try await APIClient.shared.fetchInbox()
            guard current == generation else { return false }
            nextCursor = page.nextCursor
            state = .fresh(page.items)
            return true
        } catch {
            guard current == generation, let appError = AppError(error) else { return false }
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
        do {
            let page = try await APIClient.shared.fetchInbox()
            guard current == generation else { return false }
            let loaded = state.value ?? []                                  // the rows now, not before the fetch
            let pageIds = Set(page.items.map(\.id))
            let oldest = page.items.last?.createdDate
            let older = page.nextCursor == nil ? [] : loaded.filter { item in
                guard !pageIds.contains(item.id), let date = item.createdDate, let oldest else { return false }
                return date <= oldest
            }
            if older.isEmpty { nextCursor = page.nextCursor }
            state = .fresh(page.items + older)
            return true
        } catch {
            guard current == generation, let appError = AppError(error) else { return false }
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
        state = .fresh(items + page.items.filter { !known.contains($0.id) })
    }

    /// C7.7: the loaded invite notifications of one program (an accept / decline marks them read).
    func inviteItemIds(programId: String) -> [String] {
        (state.value ?? []).filter { $0.type == "program.invite_received" && $0.programId == programId }.map(\.id)
    }
}

/// Inbox copy — the shared notification copy table (identical on web / iOS / Android).
enum InboxCopy {
    static let title = "Inbox"
    static let subtitle = "Invites and notifications"
    static let notificationsHeader = "Notifications"
    static let invitationsHeader = "Invitations"
    static let allInvitationsHeader = "All invitations"
    static let emptyTitle = "No notifications yet"
    static let emptyDetail = "Program updates, kudos, reminders and announcements show up here."
    static let respondFailedTitle = "Unable to update invitation"
    static let toastAction = "View"
    static let toastFallbackTitle = "New notification"

    /// The account-menu Inbox rows' subtitle.
    static func rowSubtitle(badge: Int) -> String {
        guard badge > 0 else { return subtitle }
        return badge > 99 ? "99+ new" : "\(badge) new"
    }

    /// Just now · 5m ago · 3h ago · Yesterday · Oct 12 · Oct 12, 2025.
    static func timeLabel(for date: Date?, now: Date = Date()) -> String {
        guard let date else { return "" }
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 { return "Just now" }
        if seconds < 3600 { return "\(Int(seconds / 60))m ago" }
        let calendar = Calendar.current
        if calendar.isDateInToday(date) { return "\(Int(seconds / 3600))h ago" }
        if calendar.isDateInYesterday(date) { return "Yesterday" }
        return calendar.isDate(date, equalTo: now, toGranularity: .year)
            ? date.formatted(.dateTime.month(.abbreviated).day())
            : date.formatted(.dateTime.month(.abbreviated).day().year())
    }
}
