import SwiftUI
import UserNotifications

/// "Who can see your activity" (people U-1 (b)): a one-time notice per member — when People first opens
/// (PeopleListView), and at the first signed-in start on a phone that syncs Apple Health workouts
/// (ProgramContext.preparePushOnSessionStart). Keep visible / Hide my activity (PUT /members/:id { hide_activity: true }).
/// The notice rule: skipped when the member already hides their activity; seen only once the choice really landed (a
/// failed Hide says so and asks again next time); never before the system notification prompt was answered; never
/// over the Apple Health review, a widget form or another presentation — it yields to them and comes back after.
enum ActivityVisibilityNotice {
    static let title = "Who can see your activity"
    static let message = "Members of your programs can see your workouts, streaks and kudos — including workouts synced from Apple Health or Health Connect. Sleep, diet and steps stay private to you and your program's staff."
    static let keepVisible = "Keep visible"
    static let hide = "Hide my activity"
    static let saveFailedTitle = "Couldn't hide your activity"
    static let saveFailedHint = "You can turn on Hide my activity in My Profile."
    private static let seenKeyPrefix = "people.activityVisibilityNoticeSeen."

    static func isSeen(memberId: String) -> Bool { UserDefaults.standard.bool(forKey: seenKeyPrefix + memberId) }
    static func markSeen(memberId: String) { UserDefaults.standard.set(true, forKey: seenKeyPrefix + memberId) }
}

extension ProgramContext {
    /// Owe the notice once its preconditions hold, then present it as soon as the root is free.
    func offerActivityVisibilityNotice() async {
        guard let memberId = loggedInUserId, !ActivityVisibilityNotice.isSeen(memberId: memberId),
              !showActivityVisibilityNotice else { return }
        if !activityNoticeDeferred {
            let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            guard status != .notDetermined else { return }
            // Unknown (a failed read, or a server without People) → ask another time.
            guard let hidden = try? await APIClient.shared.fetchHideActivity(memberId: memberId),
                  loggedInUserId == memberId else { return }
            if hidden {
                ActivityVisibilityNotice.markSeen(memberId: memberId)        // the choice is already made
                return
            }
            activityNoticeDeferred = true
        }
        recheckActivityVisibilityNotice()
    }

    /// AppRootView: the Apple Health review, the widget form or the update screen came or went. The notice yields at
    /// once; once a cover was cleared it comes back ~0.5 s later, after that cover finished dismissing (a root alert
    /// can't present while a dismissal is in flight).
    func rootCoverChanged() {
        recheckActivityVisibilityNotice()
        guard activityNoticeDeferred, pendingSyncConfirmation == nil, widgetRoute == nil, !isUpdateRequired else { return }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 500_000_000)
            self?.recheckActivityVisibilityNotice()
        }
    }

    /// The notice yields to the review / widget form / update screen (their covers wait while it is up) and comes back
    /// once they close.
    func recheckActivityVisibilityNotice() {
        let rootCoverWanted = pendingSyncConfirmation != nil || widgetRoute != nil || isUpdateRequired
        if showActivityVisibilityNotice {
            if rootCoverWanted { showActivityVisibilityNotice = false }
            return
        }
        guard activityNoticeDeferred, authToken != nil, !rootCoverWanted, !Self.isPresentingModal else { return }
        showActivityVisibilityNotice = true
    }

    /// The member answered: Keep visible, or a Hide that landed (seen) — or a Hide that failed (asked again next time).
    func finishActivityVisibilityNotice(seen: Bool) {
        activityNoticeDeferred = false
        if seen, let memberId = loggedInUserId { ActivityVisibilityNotice.markSeen(memberId: memberId) }
    }
}

private struct ActivityVisibilityNoticeModifier: ViewModifier {
    @Binding var isPresented: Bool
    let context: ProgramContext
    @State private var failureMessage: String?

    func body(content: Content) -> some View {
        content
            .alert(ActivityVisibilityNotice.title, isPresented: $isPresented) {
                Button(ActivityVisibilityNotice.keepVisible, role: .cancel) {
                    context.finishActivityVisibilityNotice(seen: true)
                }
                Button(ActivityVisibilityNotice.hide) { Task { await hideActivity() } }
            } message: {
                Text(ActivityVisibilityNotice.message)
            }
            .alert(ActivityVisibilityNotice.saveFailedTitle, isPresented: Binding(
                get: { failureMessage != nil },
                set: { if !$0 { failureMessage = nil } }
            )) {
                Button("OK") { failureMessage = nil }
            } message: {
                Text(failureMessage ?? "")
            }
    }

    private func hideActivity() async {
        guard let memberId = context.loggedInUserId else { return }
        do {
            _ = try await APIClient.shared.updateHideActivity(memberId: memberId, hide: true)
            context.finishActivityVisibilityNotice(seen: true)
        } catch {
            context.finishActivityVisibilityNotice(seen: false)
            failureMessage = "\(SessionCopy.kitMessage(for: error)) \(ActivityVisibilityNotice.saveFailedHint)"
        }
    }
}

extension View {
    /// AppRootView only — the one presenter of the notice (PeopleListView asks for it through the context).
    func activityVisibilityNotice(isPresented: Binding<Bool>, context: ProgramContext) -> some View {
        modifier(ActivityVisibilityNoticeModifier(isPresented: isPresented, context: context))
    }
}
