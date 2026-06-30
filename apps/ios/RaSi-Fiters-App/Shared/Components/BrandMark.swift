import SwiftUI

/// The RaSi Fiters brand logo — the real `app-icon` asset in a rounded circle.
///
/// iOS analogue of the web `BrandMark` component (`apps/web/src/components/BrandMark.tsx`):
/// a `BrandIcon` image clipped to a circle with a soft adaptive shadow. Adopted on the auth
/// screens to match the web app and close the legacy placeholder-icon gap (web splash F3).
struct BrandMark: View {
    var size: CGFloat = 132

    var body: some View {
        Image("BrandIcon")
            .resizable()
            .scaledToFill()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .adaptiveShadow(radius: 12, y: 6)
            .accessibilityLabel("RaSi Fiters logo")
    }
}

#Preview {
    BrandMark(size: 150)
        .padding()
}
