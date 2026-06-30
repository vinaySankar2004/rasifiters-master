import SwiftUI

struct NotificationModalView: View {
    let title: String
    let message: String
    let onAcknowledge: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Text(title)
                    .font(.headline)
                    .foregroundColor(Color(.label))
                    .multilineTextAlignment(.center)

                Text(message)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                    .multilineTextAlignment(.center)

                Button(action: onAcknowledge) {
                    Text("OK")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.appOrange)
                        .foregroundColor(.black)
                        .cornerRadius(12)
                }
            }
            .padding(24)
            .frame(maxWidth: 360)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .padding(.horizontal, 24)
        }
        .transition(.opacity)
    }
}

struct ForcedUpdateModalView: View {
    let minimumVersion: String?
    @Environment(\.openURL) private var openURL

    var body: some View {
        ZStack {
            Color.black.opacity(0.55)
                .ignoresSafeArea()

            VStack(spacing: 16) {
                Text("Update Required")
                    .font(.headline)
                    .foregroundColor(Color(.label))
                    .multilineTextAlignment(.center)

                Text(messageText)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                    .multilineTextAlignment(.center)

                Button(action: { openURL(APIConfig.appStoreURL) }) {
                    Text("Update Now")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.appOrange)
                        .foregroundColor(.black)
                        .cornerRadius(12)
                }
            }
            .padding(24)
            .frame(maxWidth: 360)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .padding(.horizontal, 24)
        }
        .transition(.opacity)
    }

    private var messageText: String {
        if let minimumVersion, !minimumVersion.isEmpty {
            return "Please update to continue. Minimum supported version: \(minimumVersion)."
        }
        return "Please update to continue using RaSi Fiters."
    }
}

#Preview {
    NotificationModalView(
        title: "Program updated",
        message: "RaSi Winter Reset details were updated.",
        onAcknowledge: {}
    )
}
