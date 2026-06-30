import SwiftUI
import Combine

// MARK: - Appearance Mode Enum

enum AppearanceMode: String, CaseIterable, Identifiable {
    case system = "system"
    case light = "light"
    case dark = "dark"
    
    var id: String { rawValue }
    
    var displayName: String {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }
    
    var icon: String {
        switch self {
        case .system: return "gear"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }
    
    /// Returns the ColorScheme to apply, or nil for system default
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

// MARK: - Theme Manager

final class ThemeManager: ObservableObject {
    
    /// Published property for SwiftUI binding, persisted via UserDefaults
    @Published var appearance: AppearanceMode {
        didSet {
            UserDefaults.standard.set(appearance.rawValue, forKey: "appearanceMode")
        }
    }
    
    init() {
        // Load saved appearance on init
        let savedRaw = UserDefaults.standard.string(forKey: "appearanceMode") ?? AppearanceMode.system.rawValue
        self.appearance = AppearanceMode(rawValue: savedRaw) ?? .system
    }
    
    /// The ColorScheme to apply via .preferredColorScheme()
    var preferredColorScheme: ColorScheme? {
        appearance.colorScheme
    }
    
    /// Cycle through appearance modes
    func cycleAppearance() {
        switch appearance {
        case .system: appearance = .light
        case .light: appearance = .dark
        case .dark: appearance = .system
        }
    }
    
    /// Set appearance directly
    func setAppearance(_ mode: AppearanceMode) {
        appearance = mode
    }
}

// MARK: - Environment Key

private struct ThemeManagerKey: EnvironmentKey {
    static let defaultValue: ThemeManager = ThemeManager()
}

extension EnvironmentValues {
    var themeManager: ThemeManager {
        get { self[ThemeManagerKey.self] }
        set { self[ThemeManagerKey.self] = newValue }
    }
}

// MARK: - View Extension for Easy Access

extension View {
    /// Apply the theme manager's preferred color scheme
    func applyTheme(from themeManager: ThemeManager) -> some View {
        self.preferredColorScheme(themeManager.preferredColorScheme)
    }
}
