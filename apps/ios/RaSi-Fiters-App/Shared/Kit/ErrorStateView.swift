import SwiftUI

/// Error-with-no-data view (frontend-kit SPEC §6): never an endless spinner, never fake zeros. Retry shows
/// only when a handler is given AND the error is retryable (D-KIT-8). Uses the app's primary pill
/// (`AppPrimaryButton`, the majority CTA idiom).
struct ErrorStateView: View {
    let error: AppError
    var onRetry: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: AppSpacing.md) {
            Text(KitCopy.errorViewTitle)
                .font(AppTypography.headline)
                .foregroundColor(Color(.label))
                .multilineTextAlignment(.center)
            Text(error.message)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .multilineTextAlignment(.center)
            if let onRetry, error.isRetryable {
                AppPrimaryButton(title: KitCopy.retry, maxWidth: 160, action: onRetry)
                    .padding(.top, AppSpacing.xxs)
            }
        }
        .padding(AppSpacing.xxl)
        .adaptiveColumn(max: AdaptiveLayout.contentMaxWidth)
    }
}

#Preview("Error view · 375 pt") {
    ErrorStateViewPreviewStack()
        .frame(width: 375)
}

#Preview("Error view · 393 pt · dark") {
    ErrorStateViewPreviewStack()
        .frame(width: 393)
        .preferredColorScheme(.dark)
}

/// Both layouts adoption can produce: retryable (Retry pill) and non-retryable (no pill, even with a handler).
private struct ErrorStateViewPreviewStack: View {
    var body: some View {
        VStack(spacing: AppSpacing.xxl) {
            ErrorStateView(error: AppError(kind: .offline), onRetry: {})
            ErrorStateView(error: AppError(kind: .forbidden), onRetry: {})
        }
        .adaptiveBackground()
    }
}
