import SwiftUI

// MARK: - Hex Color Initializer (must come first)

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Light/Dark Adaptive Initializer

extension Color {
    /// Creates a color that automatically adapts between light and dark mode
    init(light: Color, dark: Color) {
        self.init(UIColor { traitCollection in
            switch traitCollection.userInterfaceStyle {
            case .dark:
                return UIColor(dark)
            default:
                return UIColor(light)
            }
        })
    }
}

// MARK: - Auto-Adaptive Colors (Use these throughout the app!)
// These colors automatically adapt to light/dark mode without needing @Environment

extension Color {
    
    // MARK: - Primary Accent (Orange)
    
    /// Primary accent color - orange in light, softer peach-orange in dark
    static let appOrange = Color(light: .orange, dark: Color(hex: "FFB347"))
    
    /// Orange with low opacity for backgrounds/highlights
    static let appOrangeLight = Color(light: Color.orange.opacity(0.2), dark: Color(hex: "FFB347").opacity(0.25))
    
    /// Orange with very low opacity for subtle highlights
    static let appOrangeVeryLight = Color(light: Color.orange.opacity(0.14), dark: Color(hex: "FFB347").opacity(0.18))
    
    /// Orange with higher opacity for emphasis
    static let appOrangeStrong = Color(light: Color.orange.opacity(0.9), dark: Color(hex: "FFB347").opacity(0.95))
    
    // MARK: - Error/Destructive (Red → Coral)
    
    /// Error/destructive color - red in light, coral in dark (readable!)
    static let appRed = Color(light: .red, dark: Color(hex: "FF6B6B"))
    
    /// Error color with opacity for backgrounds
    static let appRedLight = Color(light: Color.red.opacity(0.1), dark: Color(hex: "FF6B6B").opacity(0.15))
    
    /// Soft red for text on cards
    static let appRedSoft = Color(light: Color.red.opacity(0.8), dark: Color(hex: "FF6B6B").opacity(0.9))
    
    // MARK: - Secondary Accents
    
    /// Purple accent - adapts to lavender in dark mode
    static let appPurple = Color(light: .purple, dark: Color(hex: "B19CD9"))
    
    /// Purple with low opacity
    static let appPurpleLight = Color(light: Color.purple.opacity(0.14), dark: Color(hex: "B19CD9").opacity(0.2))
    
    /// Blue accent - adapts to lighter blue in dark mode
    static let appBlue = Color(light: .blue, dark: Color(hex: "64B5F6"))
    
    /// Blue with low opacity
    static let appBlueLight = Color(light: Color.blue.opacity(0.14), dark: Color(hex: "64B5F6").opacity(0.2))
    
    /// Yellow/gold for trophies, highlights
    static let appYellow = Color(light: .yellow, dark: Color(hex: "FFD54F"))
    
    /// Green for success states
    static let appGreen = Color(light: .green, dark: Color(hex: "4CAF50"))
    
    /// Green with low opacity
    static let appGreenLight = Color(light: Color.green.opacity(0.14), dark: Color(hex: "4CAF50").opacity(0.2))
    
    // MARK: - Backgrounds
    
    /// Primary page background - white in light, pure black in dark
    static let appBackground = Color(light: .white, dark: .black)
    
    /// Secondary background - systemGray6 equivalent
    static let appBackgroundSecondary = Color(light: Color(.systemGray6), dark: Color(hex: "1E1E1E"))
    
    // MARK: - Icon on Accent
    
    /// Icon color on accent (orange) backgrounds - stays black for contrast
    static let appIconOnAccent = Color.black
    
    // MARK: - Gradient Colors (Secondary)
    
    /// Gradient end color for orange gradients
    static let appOrangeGradientEnd = Color(light: Color(red: 1.0, green: 0.75, blue: 0.2), dark: Color(hex: "FFCC70"))

    // MARK: - Chart Palette

    static let chartPalette: [Color] = [
        Color(red: 0.95, green: 0.60, blue: 0.00),
        Color(red: 0.00, green: 0.60, blue: 0.90),
        Color(red: 0.20, green: 0.70, blue: 0.30),
        Color(red: 0.60, green: 0.35, blue: 0.80),
        Color(red: 0.95, green: 0.30, blue: 0.35),
        Color(red: 0.05, green: 0.75, blue: 0.70),
        Color(red: 0.95, green: 0.45, blue: 0.70),
        Color(red: 0.35, green: 0.45, blue: 0.90),
        Color(red: 0.85, green: 0.55, blue: 0.15),
        Color(red: 0.55, green: 0.80, blue: 0.20),
        Color(red: 0.10, green: 0.55, blue: 0.50),
        Color(red: 0.80, green: 0.20, blue: 0.50),
    ]
}

// MARK: - Theme-Aware Gradients

struct AppGradient {
    /// Standard page background gradient that adapts to color scheme
    static func background(for colorScheme: ColorScheme) -> LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.black, Color.black]
                : [Color(.systemGray6), Color.white],
            startPoint: .top,
            endPoint: .bottom
        )
    }
    
    /// Background gradient for sheets/modals (topLeading → bottomTrailing)
    static func sheetBackground(for colorScheme: ColorScheme) -> LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.black, Color.black]
                : [Color(.systemGray6), Color.white],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
    
    /// Accent gradient (orange tones)
    static func accent(for colorScheme: ColorScheme) -> LinearGradient {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color(hex: "FFB347"), Color(hex: "FFCC70")]
                : [Color.orange, Color(red: 1.0, green: 0.75, blue: 0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - Adaptive Shadow Modifier

struct AdaptiveShadow: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let radius: CGFloat
    let y: CGFloat
    
    func body(content: Content) -> some View {
        content.shadow(
            color: Color.black.opacity(colorScheme == .dark ? 0.4 : 0.08),
            radius: radius,
            y: y
        )
    }
}

extension View {
    /// Applies an adaptive shadow that adjusts opacity for dark mode
    func adaptiveShadow(radius: CGFloat = 8, y: CGFloat = 4) -> some View {
        modifier(AdaptiveShadow(radius: radius, y: y))
    }
}

// MARK: - Adaptive Tint Modifier

struct AdaptiveTint: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    
    func body(content: Content) -> some View {
        content.tint(colorScheme == .dark ? Color(hex: "FFB347") : .orange)
    }
}

extension View {
    /// Applies an adaptive orange tint
    func adaptiveTint() -> some View {
        modifier(AdaptiveTint())
    }
}

// MARK: - Background Gradient Modifier

struct AdaptiveBackgroundGradient: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    let topLeading: Bool
    
    func body(content: Content) -> some View {
        content.background(
            topLeading
                ? AppGradient.sheetBackground(for: colorScheme).ignoresSafeArea()
                : AppGradient.background(for: colorScheme).ignoresSafeArea()
        )
    }
}

extension View {
    /// Applies the standard adaptive background gradient
    func adaptiveBackground(topLeading: Bool = false) -> some View {
        modifier(AdaptiveBackgroundGradient(topLeading: topLeading))
    }
}

// MARK: - Button Foreground for Dark Backgrounds

extension View {
    /// Foreground color for buttons on label-colored backgrounds
    func buttonForegroundOnLabel(_ colorScheme: ColorScheme) -> some View {
        self.foregroundColor(colorScheme == .dark ? .black : .white)
    }
}
