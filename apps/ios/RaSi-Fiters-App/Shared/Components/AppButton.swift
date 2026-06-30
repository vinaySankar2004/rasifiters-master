import SwiftUI

struct AppPrimaryButton: View {
    let title: String
    var isLoading: Bool = false
    var maxWidth: CGFloat = 240
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(colorScheme == .dark ? .black : .white)
                } else {
                    Text(title)
                        .font(AppTypography.headline)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppSpacing.mdl)
            .frame(maxWidth: maxWidth)
            .foregroundColor(colorScheme == .dark ? .black : .white)
            .background(
                Capsule()
                    .fill(Color(.label))
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .adaptiveShadow(radius: 8, y: 4)
    }
}

struct AppDestructiveButton: View {
    let title: String
    var isLoading: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else {
                    Text(title)
                        .font(AppTypography.headline)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppSpacing.mdl)
            .foregroundColor(.white)
            .background(
                Capsule()
                    .fill(Color.appRed)
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
