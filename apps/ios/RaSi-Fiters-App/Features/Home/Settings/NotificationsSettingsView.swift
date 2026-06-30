import SwiftUI
import UserNotifications

struct NotificationsSettingsView: View {
    @State private var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Environment(\.openURL) private var openURL

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Notifications")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))
                    Text("Get notified when your program is updated, roles change, or members join or leave.")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                .padding(.top, 8)

                VStack(spacing: 12) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(statusColor.opacity(0.14))
                                .frame(width: 42, height: 42)
                            Image(systemName: statusIcon)
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(statusColor)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(statusTitle)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text(statusSubtitle)
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(.systemBackground))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
                    )

                    if authorizationStatus == .notDetermined {
                        Button {
                            requestPermission()
                        } label: {
                            Text("Enable Notifications")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color.appOrange)
                                .foregroundColor(.black)
                                .cornerRadius(12)
                        }
                        .buttonStyle(.plain)
                    }

                    if authorizationStatus == .denied {
                        Button {
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                openURL(url)
                            }
                        } label: {
                            Text("Open Settings")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(Color(.systemGray5))
                                .foregroundColor(Color(.label))
                                .cornerRadius(12)
                        }
                        .buttonStyle(.plain)
                        Text("Notifications are off. Open Settings to enable them for this app.")
                            .font(.caption)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                }
                .padding(.top, 8)

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await updateAuthorizationStatus()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task { await updateAuthorizationStatus() }
        }
    }

    private var statusTitle: String {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "Enabled"
        case .denied:
            return "Disabled"
        case .notDetermined:
            return "Not set"
        @unknown default:
            return "Unknown"
        }
    }

    private var statusSubtitle: String {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "You'll receive push notifications for program updates and more."
        case .denied:
            return "Open Settings to allow notifications."
        case .notDetermined:
            return "Tap below to enable push notifications."
        @unknown default:
            return ""
        }
    }

    private var statusIcon: String {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "bell.badge.fill"
        case .denied, .notDetermined:
            return "bell.slash.fill"
        @unknown default:
            return "bell.fill"
        }
    }

    private var statusColor: Color {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return .appOrange
        default:
            return Color(.secondaryLabel)
        }
    }

    private func updateAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        await MainActor.run {
            authorizationStatus = settings.authorizationStatus
        }
    }

    private func requestPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            if granted {
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            Task { @MainActor in
                await updateAuthorizationStatus()
            }
        }
    }
}
