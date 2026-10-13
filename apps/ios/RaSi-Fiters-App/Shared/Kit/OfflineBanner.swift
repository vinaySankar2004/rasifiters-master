import SwiftUI

/// The app-wide offline banner on a presented sheet / full-screen cover (polish #2, frontend-kit D-KIT-17). A
/// presentation sits above `AppRootView`, so the root banner (A6) can't show over it: apply `.offlineBanner()` ONCE at
/// the presented view's root, INSIDE any `.environmentObject(programContext)`. While offline it reserves the root's
/// 76-pt band (52 min height + 12 margin + 12 clearance) so a Save / Create at the end of a scroll view is never under
/// it (D-KIT-8); a screen's own banner already hides while offline (`ScreenBanner`).
struct OfflineBannerModifier: ViewModifier {
    @EnvironmentObject private var programContext: ProgramContext

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !programContext.isOnline {
                    Color.clear.frame(height: 76)
                }
            }
            .floatingBanner {
                if !programContext.isOnline {
                    FloatingBanner(variant: .offline)
                }
            }
    }
}

extension View {
    func offlineBanner() -> some View {
        modifier(OfflineBannerModifier())
    }
}
