import SwiftUI

/// One placement rule for every iOS chart callout (polish #46; reference = Android `drawTooltip`, ChartPrimitives.kt):
/// centred on the touched point and clamped inside the chart overlay; above the point when the whole (measured) bubble
/// fits under the overlay's top edge, else flipped below it — never cut off by the chart's top edge or its scroll view.
struct ChartCalloutPlacement: ViewModifier {
    /// The touched point, in the chart overlay's (GeometryReader's) coordinate space.
    let anchor: CGPoint
    /// The chart overlay's size (`geo.size`).
    let bounds: CGSize

    @State private var size: CGSize = .zero

    private let gap: CGFloat = 8
    private let margin: CGFloat = 4

    func body(content: Content) -> some View {
        content
            .fixedSize()
            .onGeometryChange(for: CGSize.self) { proxy in proxy.size } action: { size = $0 }
            .opacity(size == .zero ? 0 : 1)     // the first pass measures; nothing flashes at a wrong spot
            .position(center)
    }

    private var center: CGPoint {
        let halfWidth = size.width / 2
        let halfHeight = size.height / 2
        let x = clamp(anchor.x, min: halfWidth + margin, max: max(halfWidth + margin, bounds.width - halfWidth - margin))
        let fitsAbove = anchor.y - gap - size.height >= margin
        let y = fitsAbove
            ? anchor.y - gap - halfHeight
            : min(anchor.y + gap + halfHeight, max(halfHeight + margin, bounds.height - halfHeight - margin))
        return CGPoint(x: x, y: y)
    }
}

extension View {
    /// Places a chart callout bubble (CalloutView / HealthCalloutView / StepsCalloutView) by the shared rule above.
    func chartCalloutPlacement(anchor: CGPoint, in bounds: CGSize) -> some View {
        modifier(ChartCalloutPlacement(anchor: anchor, bounds: bounds))
    }
}
