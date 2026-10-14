import SwiftUI

/// Polish #36 (the frontend-kit tap-target rule): every tappable control is at least 44 × 44 pt (Apple HIG; web 44 px,
/// Android 48 dp). Apply to a Button's LABEL after its visual chrome: the drawn shape keeps its size, only the hit area /
/// layout box grows. A FIXED-size control in a tight row (a text field's eye, a card header's ✕, the widget back
/// circle) gives the growth back with negative padding so the row's height doesn't change.
extension View {
    func minTapTarget(alignment: Alignment = .center) -> some View {
        frame(minWidth: 44, minHeight: 44, alignment: alignment)
            .contentShape(Rectangle())
    }
}
