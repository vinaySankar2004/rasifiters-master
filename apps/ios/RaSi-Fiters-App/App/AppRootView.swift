import SwiftUI
import UserNotifications

struct AppRootView: View {
    @StateObject private var programContext = ProgramContext()
    @Environment(\.scenePhase) private var scenePhase
    /// The widget form is really on screen (its onAppear / onDisappear) — not merely requested, since iOS refuses the
    /// cover while another sheet is up. Only then does the update modal move into the form (polish #7).
    @State private var widgetCoverVisible = false

    var body: some View {
        ZStack {
            Group {
                if programContext.authToken != nil {
                    // Authenticated: show program picker flow
                    NavigationStack {
                        ProgramPickerView()
                            .keyboardDoneToolbar()
                    }
                    .dismissKeyboardOnTap()
                    .scrollDismissesKeyboard(.interactively)
                    .safeAreaInset(edge: .bottom, spacing: 0) { offlineBannerSpace }
                } else {
                    // Unauthenticated: show splash/login flow
                    NavigationStack {
                        SplashView()
                            .keyboardDoneToolbar()
                    }
                    .dismissKeyboardOnTap()
                    .scrollDismissesKeyboard(.interactively)
                    .safeAreaInset(edge: .bottom, spacing: 0) { offlineBannerSpace }
                }
            }

            if let notification = programContext.notificationQueue.first {
                NotificationModalView(
                    title: notification.title,
                    message: notification.body
                ) {
                    Task { @MainActor in
                        await programContext.acknowledgeNotification(notification)
                    }
                }
            }
        }
        .environmentObject(programContext)
        // Amendment A6: ONE offline banner for the whole app (one monitor). Both stacks reserve its band as a bottom
        // safe-area inset (`offlineBannerSpace`), so every screen's content, tab bar and floating buttons sit above it;
        // a screen's own stale / error / update banner hides while it shows (`ScreenBanner`).
        .floatingBanner {
            if !programContext.isOnline {
                FloatingBanner(variant: .offline)
            }
        }
        .task {
            if programContext.authToken != nil { programContext.sessionDidBecomeActive(.launch) }
            handlePendingPushTap()
            await programContext.checkMinimumSupportedVersion()
        }
        .onChange(of: programContext.authToken) { oldToken, newToken in
            // Sign-in / restore (nil → token) only. A refresh (token → token) and the teardown (token → nil) need nothing:
            // sync state survives sign-out (rule 7) and the teardown already stopped the stream.
            if oldToken == nil, newToken != nil { programContext.sessionDidBecomeActive(.launch) }
        }
        .onChange(of: programContext.isOnline) { _, online in
            // A4: stream reconnects pause while offline; coming back online (NetworkMonitor) resumes them (foreground only).
            if online, scenePhase == .active { programContext.startNotificationStreamIfNeeded() }
        }
        .onReceive(NotificationCenter.default.publisher(for: PushNotificationTapped.notificationName)) { _ in
            handlePendingPushTap()
        }
        .onReceive(NotificationCenter.default.publisher(for: PushNotificationTapped.inviteReceived)) { _ in
            Task { try? await programContext.loadPendingInvites() }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                // Polish #7 (app-config D-C8): the version check runs alongside — restore + session work never wait on it.
                Task { @MainActor in await programContext.checkMinimumSupportedVersion() }
                Task { @MainActor in
                    if programContext.authToken == nil {
                        programContext.restorePersistedSession()      // D-IOS-AUTH-3; a restored token → onChange(authToken)
                        return
                    }
                    programContext.sessionDidBecomeActive(.foreground)
                    let settings = await UNUserNotificationCenter.current().notificationSettings()
                    switch settings.authorizationStatus {
                    case .authorized, .provisional, .ephemeral:
                        DeviceRegistry.shared.notificationPermission(granted: true)
                        // Self-healing registration: re-request a fresh APNs token on every
                        // foreground while authorized. iOS does NOT re-register when the user flips
                        // the OS-level toggle — the app must call this itself — so a token that was
                        // pruned server-side (e.g. after an APNs sandbox→production env change) is
                        // otherwise never resent. The call is cheap + idempotent; the resulting
                        // didRegister callback re-sends the token through DeviceRegistry (≤ once per 12 h).
                        UIApplication.shared.registerForRemoteNotifications()
                    case .denied:
                        DeviceRegistry.shared.notificationPermission(granted: false)   // §3.1: unregister, once per denial
                    default:
                        break
                    }
                }
            case .background:
                programContext.suspendNotificationStream()     // §3.3: the stream lives in the foreground only
            default:
                break
            }
        }
        .onOpenURL { url in
            if let route = WidgetRoute(url: url) {
                // Polish #7 (app-config D-C8): open the form at once; the check runs alongside. An unsupported build gets
                // the update modal over the form (WidgetCoverView) — never a second cover while this one is up.
                if !programContext.isUpdateRequired { programContext.widgetRoute = route }
                Task { @MainActor in await programContext.checkMinimumSupportedVersion() }
            }
        }
        .fullScreenCover(
            item: Binding(
                get: { programContext.authToken != nil ? programContext.widgetRoute : nil },
                set: { programContext.widgetRoute = $0 }
            )
        ) { route in
            WidgetCoverView(route: route, isVisible: $widgetCoverVisible).environmentObject(programContext)
        }
        .fullScreenCover(
            isPresented: Binding(
                // While a widget form is up, WidgetCoverView shows the update modal in place (polish #7).
                get: { programContext.isUpdateRequired && !widgetCoverVisible },
                set: { _ in }      // blocking: only checkMinimumSupportedVersion changes isUpdateRequired
            )
        ) {
            ForcedUpdateModalView(minimumVersion: programContext.minimumSupportedVersion)
                .interactiveDismissDisabled(true)
        }
        .fullScreenCover(
            item: Binding(
                get: { programContext.authToken != nil ? programContext.pendingSyncConfirmation : nil },
                set: { programContext.pendingSyncConfirmation = $0 }
            )
        ) { confirmation in
            HealthSyncConfirmationView(confirmation: confirmation).offlineBanner().environmentObject(programContext)
        }
    }

    /// The offline banner's band (52 pt min height + 12 pt margin + 12 pt clearance), reserved only while offline.
    @ViewBuilder
    private var offlineBannerSpace: some View {
        if !programContext.isOnline {
            Color.clear.frame(height: 76)
        }
    }

    /// A tapped push (AppDelegate) — handled once, whether the tap arrived before or after this view was listening.
    private func handlePendingPushTap() {
        guard let tap = PushNotificationTapped.pendingTap else { return }
        PushNotificationTapped.pendingTap = nil
        programContext.handlePushTap(notificationId: tap.id, type: tap.type)
    }
}

/// A screen's own floating banner (frontend-kit §6, D-KIT-8): stale / error / update. Hidden while offline — the
/// root's offline banner wins (A6), so two banners never show at once.
struct ScreenBanner: View {
    @EnvironmentObject private var programContext: ProgramContext
    var banner: FloatingBanner? = nil

    var body: some View {
        if programContext.isOnline, let banner {
            banner
        }
    }
}

#Preview {
    AppRootView()
}
