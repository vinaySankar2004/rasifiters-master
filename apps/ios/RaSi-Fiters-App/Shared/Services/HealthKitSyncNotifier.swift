import Foundation
import UserNotifications

/// Local notifications for Apple Health auto-sync results (D7). Most auto-syncs happen while the app is
/// backgrounded, so a device-level banner is how the user learns the outcome; the in-app settings screen
/// mirrors it via Last Synced / Workouts Synced.
///
/// Fires ONLY on a sync that added ≥1 workout, or on a genuine failure — never when nothing was new.
/// If notification permission is denied, every call is a silent no-op (graceful in-app-only fallback).
enum HealthKitSyncNotifier {

    /// Ask for notification permission if it hasn't been decided yet. Called when the user connects
    /// Apple Health. If push was already authorized this is a no-op (no second prompt).
    static func requestAuthorizationIfNeeded() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        }
    }

    static func notifySuccess(count: Int) {
        guard count > 0 else { return }
        let noun = count == 1 ? "workout" : "workouts"
        post(title: "Apple Health", body: "Synced \(count) \(noun) from Apple Health.")
    }

    static func notifyFailure() {
        post(title: "Apple Health", body: "Apple Health sync failed — we'll retry automatically.")
    }

    private static func post(title: String, body: String) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                let request = UNNotificationRequest(
                    identifier: UUID().uuidString,
                    content: content,
                    trigger: nil            // deliver immediately
                )
                center.add(request)
            default:
                break                       // denied / notDetermined → in-app status only
            }
        }
    }
}
