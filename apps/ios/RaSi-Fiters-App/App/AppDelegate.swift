import UIKit
import UserNotifications

/// The stored APNs device token (DeviceRegistry re-sends it with every sign-in's registration ride-along).
enum PushTokenNotification {
    static let userDefaultsKey = "rf_push_device_token"
}

/// Push hand-offs to AppRootView: a tap (notification_id + type) and a foreground `program.invite_received`.
enum PushNotificationTapped {
    static let notificationName = Notification.Name("RaSiFitersPushNotificationTapped")
    static let inviteReceived = Notification.Name("RaSiFitersInviteReceived")
    static let notificationIdKey = "notification_id"
    static let typeKey = "type"
    /// The last tap not yet handled — on a cold launch AppRootView may not be listening yet, so it also drains this
    /// at launch (U2: an invite tap must still open the inbox).
    static var pendingTap: (id: String, type: String?)?
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // health-sync §8 rule 1 (W3 F1): observers + background delivery register at launch, every launch — a HealthKit
        // background launch has no scene. Before the first unlock nothing is readable: both retry once data is available.
        HealthSyncPrefs.migrateLegacyIfNeeded()
        HealthSyncEngine.shared.registerObservers()
        NotificationCenter.default.addObserver(forName: UIApplication.protectedDataDidBecomeAvailableNotification,
                                               object: nil, queue: .main) { _ in
            MainActor.assumeIsolated {
                HealthSyncPrefs.migrateLegacyIfNeeded()
                HealthSyncEngine.shared.registerObservers()
            }
        }
        Task { await ClientEventQueue.shared.flush() }
        NetworkMonitor.shared.start()   // frontend-kit §5: started once, at launch
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        DeviceRegistry.shared.register(pushToken: tokenString)       // notifications §3.1: rotation → the registry queue
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Simulator or misconfiguration; token will not be available.
    }

    /// Foreground: a remote push shows only its badge while the SSE stream is open — the in-app modal already shows it
    /// (amendment A5); local notifications (Apple Health sync results) keep their banner. An invite push also refreshes
    /// the inbox (invites §3.1).
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let isRemote = notification.request.trigger is UNPushNotificationTrigger
        if isRemote, notification.request.content.userInfo[PushNotificationTapped.typeKey] as? String == "program.invite_received" {
            NotificationCenter.default.post(name: PushNotificationTapped.inviteReceived, object: nil)
        }
        if isRemote, NotificationStreamClient.isConnected {
            completionHandler([.badge])
        } else {
            completionHandler([.banner, .sound, .badge])
        }
    }

    /// Tap → acknowledge; an invite opens the inbox, anything else re-fetches (AppRootView → ProgramContext.handlePushTap).
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        if let notificationId = userInfo[PushNotificationTapped.notificationIdKey] as? String, !notificationId.isEmpty {
            PushNotificationTapped.pendingTap = (notificationId, userInfo[PushNotificationTapped.typeKey] as? String)
            NotificationCenter.default.post(name: PushNotificationTapped.notificationName, object: nil)
        }
        completionHandler()
    }
}
