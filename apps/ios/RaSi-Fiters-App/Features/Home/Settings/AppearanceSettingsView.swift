import SwiftUI

// MARK: - Appearance Settings

struct AppearanceSettingsView: View {
    @EnvironmentObject var themeManager: ThemeManager
    @Environment(\.colorScheme) private var colorScheme
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    Text("Appearance")
                        .font(.title2.weight(.bold))
                        .foregroundColor(Color(.label))
                    Text("Choose how RaSi Fit'ers looks to you")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                }
                .padding(.top, 8)
                
                // Appearance Options
                VStack(spacing: 12) {
                    ForEach(AppearanceMode.allCases) { mode in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                themeManager.setAppearance(mode)
                            }
                        } label: {
                            HStack(spacing: 14) {
                                ZStack {
                                    Circle()
                                        .fill(themeManager.appearance == mode ? Color.appOrangeLight : Color(.systemGray5))
                                        .frame(width: 42, height: 42)
                                    Image(systemName: mode.icon)
                                        .font(.system(size: 18, weight: .semibold))
                                        .foregroundColor(themeManager.appearance == mode ? .appOrange : Color(.secondaryLabel))
                                }
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(mode.displayName)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundColor(Color(.label))
                                    Text(modeDescription(mode))
                                        .font(.caption)
                                        .foregroundColor(Color(.secondaryLabel))
                                }
                                
                                Spacer()
                                
                                if themeManager.appearance == mode {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 22))
                                        .foregroundColor(.appOrange)
                                }
                            }
                            .padding(14)
                            .background(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(Color(.systemBackground))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .stroke(themeManager.appearance == mode ? Color.appOrange.opacity(0.5) : Color(.systemGray4).opacity(0.6), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                
                // Preview Card
                VStack(alignment: .leading, spacing: 10) {
                    Text("Preview")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                    
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.appOrangeLight)
                                .frame(width: 48, height: 48)
                            Image(systemName: "chart.bar.fill")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.appOrange)
                        }
                        
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Sample Card")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text("This is how cards will appear")
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        
                        Spacer()
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(.systemBackground))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color(.systemGray4).opacity(0.6), lineWidth: 1)
                    )
                    .adaptiveShadow(radius: 8, y: 4)
                }
                .padding(.top, 8)
                
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }
    
    private func modeDescription(_ mode: AppearanceMode) -> String {
        switch mode {
        case .system: return "Follows your device settings"
        case .light: return "Always use light appearance"
        case .dark: return "Always use dark appearance"
        }
    }
}
