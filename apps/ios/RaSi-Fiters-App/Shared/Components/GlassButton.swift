import SwiftUI

/// Circular gradient icon button used by the Members tab header actions
/// (Invite / View Members). Ported verbatim from legacy
/// `Features/Home/Detail/ActivityTimelineViews.swift:153`.
struct GlassButton: View {
    let icon: String
    /// Polish #36: what the button does, for VoiceOver (the icon has no text of its own). nil keeps the system's
    /// symbol description (a caller that labels its NavigationLink instead).
    var label: String? = nil

    var body: some View {
        if let label {
            glyph.accessibilityLabel(label)
        } else {
            glyph
        }
    }

    private var glyph: some View {
        Image(systemName: icon)
            .font(.title2.weight(.semibold))
            .foregroundColor(Color(.black))
            .frame(width: 52, height: 52)
            .background(
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.appOrange, Color.appOrangeGradientEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
            .overlay(
                Circle()
                    .stroke(Color.black.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: Color(.black).opacity(0.16), radius: 10, x: 0, y: 6)
    }
}
