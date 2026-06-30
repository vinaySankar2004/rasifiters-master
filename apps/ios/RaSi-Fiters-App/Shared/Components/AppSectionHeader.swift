import SwiftUI

struct AppSectionHeader: View {
    let title: String
    let icon: String
    var color: Color = Color.appOrange

    var body: some View {
        HStack(spacing: AppSpacing.smd) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(color)
            Text(title)
                .font(AppTypography.headline)
                .foregroundColor(Color(.label))
        }
    }
}

struct AppSettingsRow: View {
    let icon: String
    let color: Color
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: AppSpacing.mdl) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.14))
                    .frame(width: AppIconSize.md, height: AppIconSize.md)
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(color)
            }
            VStack(alignment: .leading, spacing: AppSpacing.xxs) {
                Text(title)
                    .font(AppTypography.subheadline)
                    .foregroundColor(Color(.label))
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color(.tertiaryLabel))
        }
        .padding(AppSpacing.mdl)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.mdl, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.mdl, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
    }
}
