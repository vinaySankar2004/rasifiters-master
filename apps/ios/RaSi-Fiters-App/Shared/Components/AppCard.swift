import SwiftUI

struct AppCard<Content: View>: View {
    var cornerRadius: CGFloat = AppCornerRadius.lg
    var background: Color = Color(.systemBackground)
    var backgroundOpacity: Double = 1.0
    var strokeColor: Color = Color(.systemGray4).opacity(0.6)
    var strokeWidth: CGFloat = 1
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(AppSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(background.opacity(backgroundOpacity))
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(strokeColor, lineWidth: strokeWidth)
            )
    }
}

struct AppGlassCard<Content: View>: View {
    var cornerRadius: CGFloat = AppCornerRadius.xl
    var strokeColor: Color = Color.white.opacity(0.35)
    var strokeWidth: CGFloat = 0.6
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(AppSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(strokeColor, lineWidth: strokeWidth)
            )
    }
}
