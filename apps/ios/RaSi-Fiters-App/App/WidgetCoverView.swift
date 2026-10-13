import SwiftUI

/// The widget quick-add form (polish #7): opens at once while the version check runs alongside; if the check finds this
/// build unsupported, the blocking update modal covers the form in place (its dimmed backdrop takes every tap).
struct WidgetCoverView: View {
    @EnvironmentObject private var programContext: ProgramContext
    let route: WidgetRoute
    /// AppRootView's flag: true only while this cover is really on screen (the forced-update cover waits on it).
    @Binding var isVisible: Bool

    var body: some View {
        Group {
            switch route {
            case .quickAddWorkout: QuickAddWorkoutWidgetEntryView()
            case .quickAddHealth: QuickAddHealthWidgetEntryView()
            }
        }
        .offlineBanner()
        // Under the update modal the form is inert for touch and VoiceOver alike.
        .accessibilityHidden(programContext.isUpdateRequired)
        .allowsHitTesting(!programContext.isUpdateRequired)
        .overlay {
            if programContext.isUpdateRequired {
                ForcedUpdateModalView(minimumVersion: programContext.minimumSupportedVersion)
                    .accessibilityAddTraits(.isModal)
            }
        }
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false }
    }
}
