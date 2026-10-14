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
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(.systemGray4).opacity(0.6), lineWidth: 1))
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

/// Load-on-scroll (D-NP2) at the end of the rows, while an older page exists: it loads when it comes on screen, and
/// again when the rows above change while it stays there (removes shrank the list, even to none) — older pages stay
/// reachable. The spinner shows only while a page loads.
struct InboxLoadMoreTrigger: View {
    @ObservedObject var feed: InboxFeed
    /// The rows above (count + last id).
    let rowsKey: String
    @State private var isOnScreen = false

    var body: some View {
        Color.clear
            .frame(height: feed.isLoadingMore ? 36 : 1)
            .overlay {
                if feed.isLoadingMore { ProgressView() }
            }
            .onAppear {
                isOnScreen = true
                Task { await feed.loadMore() }
            }
            .onDisappear { isOnScreen = false }
            .onChange(of: rowsKey) { _, _ in
                if isOnScreen { Task { await feed.loadMore() } }
            }
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
    static let clearAll = "Clear all"
    static let clearConfirmTitle = "Clear all notifications?"
    static let clearConfirmMessage = "They're removed from your Inbox on all your devices. Invitations stay until you answer them."
    static let remove = "Remove"
    static let removeFailed = "Couldn't remove the notification."
    static let clearFailed = "Couldn't clear your notifications."

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
