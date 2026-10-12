import SwiftUI

/// The shared brand palette = web's rf-* tokens, light / dark (frontend-kit SPEC §7, DESIGN_BOARD W7-D1).
/// NEW tokens only — `appOrange` / `appRed` stay as-is until Phase 3 adoption (repointing them restyles
/// every screen, D-KIT-1 / D-KIT-10).
extension Color {
    static let rfAccent = Color(light: Color(hex: "FF8B1F"), dark: Color(hex: "FF9C3A"))
    static let rfAccentStrong = Color(light: Color(hex: "FF7A00"), dark: Color(hex: "FF8B1F"))
    static let rfDanger = Color(light: Color(hex: "EF4444"), dark: Color(hex: "F87171"))
    static let rfSuccess = Color(light: Color(hex: "2FB861"), dark: Color(hex: "36C56F"))
    static let rfWarning = Color(light: Color(hex: "F59E0B"), dark: Color(hex: "FBBF24"))
    static let rfInfo = Color(light: Color(hex: "2563EB"), dark: Color(hex: "60A5FA"))
}
