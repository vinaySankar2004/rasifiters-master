import SwiftUI

/// Swipe-to-remove for one inbox card (notifications §3.9 rule 11; iOS idiom — web shows a ×, Android swipes the card
/// away). The Inbox is a ScrollView of cards, not a List, so `.swipeActions` isn't available: each card sits in its own
/// horizontal ScrollView and a left swipe reveals a red Remove button, settling open or closed (InboxRevealBehavior).
/// UIKit's nested-scroll handling arbitrates the gestures — no DragGesture fights the vertical scroll, the "+" sheet's
/// paged TabView (a swipe that starts ON a card reveals Remove; elsewhere it still pages) or the root keyboard-dismiss
/// tap. Closed, the card looks exactly as before. VoiceOver: the card's "Remove" action.
/// Like native swipe actions: one card open at a time (`openId`), a tap on an open card closes it (never opens the
/// item), and a Remove tap closes the card first — so an offline / refused remove leaves it closed (Android springs back).
struct InboxSwipeToDelete<Content: View>: View {
    private let id: String
    @Binding private var openId: String?
    private let onRemove: () -> Void
    private let content: Content
    /// Scrolled off the closed stop (dragging or settled open).
    @State private var isOpen = false
    private static var contentAnchor: String { "inbox.card" }

    init(id: String, openId: Binding<String?>, onRemove: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.id = id
        self._openId = openId
        self.onRemove = onRemove
        self.content = content()
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: InboxRevealBehavior.gap) {
                    content
                        .containerRelativeFrame(.horizontal)
                        .overlay {
                            if isOpen {
                                Color.clear
                                    .contentShape(Rectangle())
                                    .onTapGesture { close(proxy) }
                                    .accessibilityHidden(true)
                            }
                        }
                        .id(Self.contentAnchor)
                        .accessibilityAction(named: Text(InboxCopy.remove), onRemove)
                    Button {
                        close(proxy)
                        onRemove()
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: "trash")
                                .font(.system(size: 17, weight: .semibold))
                            Text(InboxCopy.remove)
                                .font(.caption.weight(.semibold))
                        }
                        .foregroundColor(.white)
                        .frame(width: InboxRevealBehavior.buttonWidth)
                        .frame(maxHeight: .infinity)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color(.systemRed)))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .allowsHitTesting(isOpen)          // closed, it sits past the card's edge — never tappable there
                    .accessibilityHidden(true)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .scrollTargetBehavior(InboxRevealBehavior())
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.contentOffset.x + geometry.contentInsets.leading > 1
            } action: { _, open in
                isOpen = open
                if open { openId = id } else if openId == id { openId = nil }
            }
            .onChange(of: openId) { _, newId in
                if isOpen, newId != id { close(proxy) }
            }
        }
    }

    private func close(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(Self.contentAnchor, anchor: .leading) }
    }
}

/// Settles a card closed (0) or open (the Remove button showing) — whichever the swipe would end nearer.
/// `nonisolated`: default MainActor isolation would make the ScrollTargetBehavior conformance main-actor-isolated.
nonisolated struct InboxRevealBehavior: ScrollTargetBehavior {
    static let buttonWidth: CGFloat = 76
    static let gap: CGFloat = 8

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let open = Self.buttonWidth + Self.gap
        target.rect.origin.x = target.rect.minX > open / 2 ? open : 0
    }
}

/// The Notifications section heading (§3.9 rule 11): "Clear all" in the content (never a custom header), only while
/// notifications are listed, confirmed with a dialog (iOS idiom); the last remove / Clear all failure sits under it
/// (inline, like the notification settings' save error — never an alert racing the dialog's dismissal).
struct InboxNotificationsHeader: View {
    let canClear: Bool
    let failure: String?
    /// The Clear all tap: true → the confirm opens; false → offline (the failure line already says so).
    let shouldConfirm: () -> Bool
    let onClearAll: () -> Void
    @State private var isConfirming = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(InboxCopy.notificationsHeader)
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer(minLength: 8)
                if canClear {
                    Button { isConfirming = shouldConfirm() } label: {
                        Text(InboxCopy.clearAll)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.appOrange)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if let failure {
                Text(failure)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        // On the always-present heading (not the conditional button), and dropped once there's nothing to clear — a
        // confirm can never re-open by itself when Clear all comes back.
        .confirmationDialog(InboxCopy.clearConfirmTitle, isPresented: $isConfirming, titleVisibility: .visible) {
            Button(InboxCopy.clearAll, role: .destructive, action: onClearAll)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(InboxCopy.clearConfirmMessage)
        }
        .onChange(of: canClear) { _, can in
            if !can { isConfirming = false }
        }
    }
}
