import SwiftUI

/// Large-screen (iPad / Mac "Designed for iPad") layout caps. Views ported from the iPhone
/// layout use `maxWidth: .infinity` freely, which stretches fields and cards edge-to-edge on
/// regular-width windows. Capping a content column at these widths and re-centering fixes that;
/// both caps are wider than any iPhone, so compact rendering is pixel-identical.
enum AdaptiveLayout {
    /// Form column — auth screens and other single-field-stack forms.
    static let formMaxWidth: CGFloat = 520
    /// Content column — card lists, timelines, detail stacks.
    static let contentMaxWidth: CGFloat = 700
}

extension View {
    /// Caps the view at `max` and re-centers it in the available width.
    func adaptiveColumn(max: CGFloat) -> some View {
        self
            .frame(maxWidth: max)
            .frame(maxWidth: .infinity)
    }
}
