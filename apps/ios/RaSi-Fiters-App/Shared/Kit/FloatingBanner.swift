import SwiftUI

/// Slim floating status banner (frontend-kit SPEC §6) — offline / stale data / error / update available.
/// Net-new; not placed on any screen until Phase 3 adoption. Place it with `.floatingBanner(bottomInset:) { … }`
/// (D-KIT-8). Min height 52, 44-pt tap targets. The message is never clamped: beside Retry + × the offline
/// error copy wraps to 3 lines at 375 / 393 pt, and the banner grows to fit.
struct FloatingBanner: View {
    enum Variant {
        case offline
        case stale
        case error(AppError)
        case updateAvailable
    }

    let variant: Variant
    var onRetry: (() -> Void)? = nil
    var onDismiss: (() -> Void)? = nil
    var onUpdate: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: AppSpacing.smd) {
            Circle()
                .fill(dotColor)
                .frame(width: 8, height: 8)
                .accessibilityHidden(true)
            Text(message)
                .font(AppTypography.footnote)
                .fontWeight(.semibold)
                .foregroundColor(Color(.label))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, AppSpacing.xs)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let action = primaryAction {
                Button(action: action.perform) {
                    Text(action.title)
                        .font(AppTypography.footnote)
                        .fontWeight(.semibold)
                        .fixedSize()
                        .foregroundColor(.rfAccent)
                        .padding(.horizontal, AppSpacing.sm)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            if let onDismiss {
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(KitCopy.dismiss)
            }
        }
        .padding(.leading, AppSpacing.lg)
        .padding(.trailing, AppSpacing.xxs)
        .padding(.vertical, AppSpacing.xxs)
        .frame(minHeight: 52)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .fill(Color(.systemBackground))
        )
        .overlay(
            RoundedRectangle(cornerRadius: AppCornerRadius.lg, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
        .onAppear { UIAccessibility.post(notification: .announcement, argument: message) }
    }

    private struct BannerAction {
        let title: String
        let perform: () -> Void
    }

    private var message: String {
        switch variant {
        case .offline: return KitCopy.bannerOffline
        case .stale: return KitCopy.bannerStale
        case .error(let error): return error.message
        case .updateAvailable: return KitCopy.bannerUpdate
        }
    }

    private var dotColor: Color {
        switch variant {
        case .offline, .stale: return .rfWarning
        case .error: return .rfDanger
        case .updateAvailable: return .rfAccent
        }
    }

    private var primaryAction: BannerAction? {
        switch variant {
        case .offline:
            return nil
        case .stale:
            guard let onRetry else { return nil }
            return BannerAction(title: KitCopy.retry, perform: onRetry)
        case .error(let error):
            guard let onRetry, error.isRetryable else { return nil }
            return BannerAction(title: KitCopy.retry, perform: onRetry)
        case .updateAvailable:
            guard let onUpdate else { return nil }
            return BannerAction(title: KitCopy.update, perform: onUpdate)
        }
    }
}

extension View {
    /// Floats a kit banner at the bottom of this view (above the tab bar), centered and capped at the 520-pt
    /// form column on iPad / Mac. Apply to a screen's root, not inside a ScrollView. `bottomInset` lifts it
    /// above bottom-anchored floating actions (program picker: 150 = 56 + 14 + 56 + 24) — D-KIT-8.
    func floatingBanner<Banner: View>(bottomInset: CGFloat = 0, @ViewBuilder _ banner: () -> Banner) -> some View {
        let content = banner()
        return overlay(alignment: .bottom) {
            content
                .adaptiveColumn(max: AdaptiveLayout.formMaxWidth)
                .padding(.horizontal, AppSpacing.lg)
                .padding(.bottom, AppSpacing.md + bottomInset)
        }
    }
}

#Preview("Banners · 375 pt") {
    FloatingBannerPreviewStack()
        .frame(width: 375)
}

#Preview("Banners · 393 pt · dark") {
    FloatingBannerPreviewStack()
        .frame(width: 393)
        .preferredColorScheme(.dark)
}

/// Every variant with its widest action set, inset 16 pt per side exactly as `.floatingBanner` places it on
/// an iPhone, so the previews show the real text slot (worst case: the offline error beside Retry + ×).
private struct FloatingBannerPreviewStack: View {
    var body: some View {
        VStack(spacing: AppSpacing.md) {
            FloatingBanner(variant: .offline, onDismiss: {})
            FloatingBanner(variant: .stale, onRetry: {}, onDismiss: {})
            FloatingBanner(variant: .error(AppError(kind: .offline)), onRetry: {}, onDismiss: {})
            FloatingBanner(variant: .error(AppError(kind: .forbidden)), onRetry: {}, onDismiss: {})
            FloatingBanner(variant: .updateAvailable, onDismiss: {}, onUpdate: {})
        }
        .padding(.horizontal, AppSpacing.lg)
        .padding(.vertical, AppSpacing.xxl)
        .adaptiveBackground()
    }
}
