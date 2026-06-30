import SwiftUI

/// Circular gradient icon button used by the Members tab header actions
/// (Invite / View Members). Ported verbatim from legacy
/// `Features/Home/Detail/ActivityTimelineViews.swift:153`.
struct GlassButton: View {
    let icon: String

    var body: some View {
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
