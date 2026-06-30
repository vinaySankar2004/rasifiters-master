import SwiftUI
import UserNotifications

struct AppRootView: View {
    @StateObject private var programContext = ProgramContext()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Group {
                if programContext.authToken != nil {
                    // Authenticated: show program picker flow
                    NavigationStack {
                        ProgramPickerView()
                    }
                } else {
                    // Unauthenticated: show splash/login flow
                    NavigationStack {
                        SplashView()
                    }
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
        .task {
            await programContext.checkMinimumSupportedVersion()
            await programContext.refreshSessionIfNeeded()
            if programContext.authToken != nil {
                await MainActor.run {
                    programContext.startNotificationStreamIfNeeded()
                }
            }
        }
        .onChange(of: programContext.authToken) { _, _ in
            Task { @MainActor in
                if programContext.authToken != nil {
                    programContext.startNotificationStreamIfNeeded()
                } else {
                    programContext.stopNotificationStream()
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: PushTokenNotification.didUpdate)) { notification in
            guard let token = notification.userInfo?["token"] as? String else { return }
            programContext.registerPushTokenIfNeeded(token)
        }
        .onReceive(NotificationCenter.default.publisher(for: PushNotificationTapped.notificationName)) { notification in
            guard let notificationId = notification.userInfo?[PushNotificationTapped.notificationIdKey] as? String else { return }
            programContext.acknowledgeNotificationById(notificationId)
        }
        .onChange(of: programContext.isUpdateRequired) { _, isRequired in
            if isRequired {
                programContext.widgetRoute = nil
            }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { @MainActor in
                await programContext.checkMinimumSupportedVersion()
                await programContext.refreshSessionIfNeeded()
                if programContext.authToken != nil {
                    programContext.startNotificationStreamIfNeeded()
                    let settings = await UNUserNotificationCenter.current().notificationSettings()
                    if settings.authorizationStatus == .denied {
                        let storedToken = UserDefaults.standard.string(forKey: PushTokenNotification.userDefaultsKey)
                        await programContext.deregisterPushTokenIfDenied(deviceToken: storedToken)
                    }
                }
            }
        }
        .onOpenURL { url in
            if let route = WidgetRoute(url: url) {
                Task { @MainActor in
                    await programContext.checkMinimumSupportedVersion()
                    if programContext.isUpdateRequired {
                        programContext.widgetRoute = nil
                    } else {
                        programContext.widgetRoute = route
                    }
                }
            }
        }
        .fullScreenCover(
            item: Binding(
                get: { programContext.authToken != nil ? programContext.widgetRoute : nil },
                set: { programContext.widgetRoute = $0 }
            )
        ) { route in
            switch route {
            case .quickAddWorkout:
                QuickAddWorkoutWidgetEntryView()
                    .environmentObject(programContext)
            case .quickAddHealth:
                QuickAddHealthWidgetEntryView()
                    .environmentObject(programContext)
            }
        }
        .fullScreenCover(
            isPresented: Binding(
                get: { programContext.isUpdateRequired },
                set: { programContext.isUpdateRequired = $0 }
            )
        ) {
            ForcedUpdateModalView(minimumVersion: programContext.minimumSupportedVersion)
                .interactiveDismissDisabled(true)
        }
        .alert(
            "You're offline",
            isPresented: Binding(
                get: { programContext.offlineNotice != nil },
                set: { isPresented in
                    if !isPresented {
                        programContext.offlineNotice = nil
                    }
                }
            )
        ) {
            Button("OK") { programContext.offlineNotice = nil }
        } message: {
            Text(programContext.offlineNotice ?? "You're offline. We'll reconnect when internet is back.")
        }
    }
}

#Preview {
    AppRootView()
}
