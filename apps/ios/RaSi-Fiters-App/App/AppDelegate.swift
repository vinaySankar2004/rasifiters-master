import UIKit
import UserNotifications

/// Keys for device push token storage and notification name when token is updated.
enum PushTokenNotification {
    static let userDefaultsKey = "rf_push_device_token"
    static let didUpdate = Notification.Name("RaSiFitersDeviceTokenDidUpdate")
}

/// Posted when user taps a push notification; userInfo["notification_id"] contains the notification UUID.
enum PushNotificationTapped {
    static let notificationName = Notification.Name("RaSiFitersPushNotificationTapped")
    static let notificationIdKey = "notification_id"
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        UserDefaults.standard.set(tokenString, forKey: PushTokenNotification.userDefaultsKey)
        NotificationCenter.default.post(
            name: PushTokenNotification.didUpdate,
            object: nil,
            userInfo: ["token": tokenString]
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Simulator or misconfiguration; token will not be available.
    }

    // MARK: - UNUserNotificationCenterDelegate

    /// Foreground: show banner so user sees the notification; in-app modal may also show via SSE.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    /// User tapped notification; app opens. Acknowledge that notification so the in-app modal does not show.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let notificationId = userInfo[PushNotificationTapped.notificationIdKey] as? String, !notificationId.isEmpty {
            NotificationCenter.default.post(
                name: PushNotificationTapped.notificationName,
                object: nil,
                userInfo: [PushNotificationTapped.notificationIdKey: notificationId]
            )
        }
        completionHandler()
    }
}
