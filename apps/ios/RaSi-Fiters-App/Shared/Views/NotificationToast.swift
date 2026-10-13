import SwiftUI

/// The in-app notification toast (D-N3, the toast rule; replaces the blocking NotificationModalView queue): the newest
/// live item as "<title> · View" at the top, under the status bar, for 5 s. View → mark read + open its target (the
/// routing rule); × or a swipe up only hides it (the item stays unread). Notifications-local, not a frontend-kit
/// primitive; the chrome is FloatingBanner's. A root overlay sits under sheets — the toast is never shown while one is
/// up (ProgramContext.showToast).
struct NotificationToast: View {
    let item: APIClient.NotificationDTO
    let onView: () -> Void
    let onDismiss: () -> Void

    private var title: String {
        item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? InboxCopy.toastFallbackTitle : item.title
    }

    var body: some View {
        HStack(spacing: AppSpacing.smd) {
            Image(systemName: NotificationCategoryStyle.icon(item.resolvedCategory))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(NotificationCategoryStyle.color(item.resolvedCategory))
                .frame(width: 24)
                .accessibilityHidden(true)
            Text(title)
                .font(AppTypography.footnote)
                .foregroundColor(Color(.label))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, AppSpacing.xs)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onView) {
                Text(InboxCopy.toastAction)
                    .font(AppTypography.footnote)
                    .fixedSize()
                    .foregroundColor(.rfAccent)
                    .padding(.horizontal, AppSpacing.sm)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(KitCopy.dismiss)
        }
        .padding(.leading, AppSpacing.lg)
        .padding(.trailing, AppSpacing.xxs)
        .padding(.vertical, AppSpacing.xxs)
        .frame(minHeight: 52)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
        .gesture(DragGesture(minimumDistance: 12).onEnded { value in
            if value.translation.height < -20 { onDismiss() }
        })
        .onAppear { UIAccessibility.post(notification: .announcement, argument: title) }
    }
}

/// The category's glyph + tint (notifications contract C2) — the toast and the inbox rows.
enum NotificationCategoryStyle {
    static func icon(_ category: String) -> String {
        switch category {
        case "program": return "person.2.fill"
        case "activity": return "hands.clap.fill"
        case "reminders": return "alarm.fill"
        case "digest": return "chart.bar.fill"
        case "announcements": return "megaphone.fill"
        default: return "bell.fill"
        }
    }

    static func color(_ category: String) -> Color {
        switch category {
        case "program": return .appBlue
        case "reminders": return .appPurple
        case "digest": return .appGreen
        default: return .appOrange
        }
    }
}

private struct NotificationToastOverlay: ViewModifier {
    @ObservedObject var context: ProgramContext

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                // The spring animates the toast only — never the rest of the app (e.g. the sign-out swap).
                ZStack(alignment: .top) {
                    if context.authToken != nil, let item = context.toastItem {
                        NotificationToast(
                            item: item,
                            onView: { context.openInboxItem(item, fromInbox: false) },
                            onDismiss: { context.dismissToast() }
                        )
                        .adaptiveColumn(max: AdaptiveLayout.formMaxWidth)
                        .padding(.horizontal, AppSpacing.lg)
                        .padding(.top, AppSpacing.sm)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .id(item.id)
                    }
                }
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: context.toastItem?.id)
            }
            // The Inbox over whatever is on screen — an open program stays open (ProgramContext.openTarget presents it
            // only when nothing else is up). It carries the offline banner like every presentation (D-KIT-17).
            .sheet(isPresented: $context.showInboxSheet) {
                InboxSheet(onClose: { context.showInboxSheet = false })
                    .offlineBanner()
                    .environmentObject(context)
            }
    }
}

/// The root Inbox sheet's chrome — the "+" sheet's background + Done (ProgramActionsSheet parity).
private struct InboxSheet: View {
    @Environment(\.colorScheme) private var colorScheme
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            InboxView(onAcceptedInvite: onClose)
                .background(AppGradient.sheetBackground(for: colorScheme).ignoresSafeArea())
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Done", action: onClose)
                            .foregroundColor(Color(.label))
                    }
                }
        }
    }
}

extension View {
    /// AppRootView: the app-wide notification toast + the root Inbox sheet (one per app, like the offline banner).
    func notificationToast(_ context: ProgramContext) -> some View {
        modifier(NotificationToastOverlay(context: context))
    }
}
