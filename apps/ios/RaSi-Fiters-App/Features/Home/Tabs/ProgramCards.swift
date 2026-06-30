import SwiftUI

// MARK: - Program tab shared building blocks
// Faithful 1:1 port of the legacy iOS Program-tab sections + helpers
// (ios-mobile Features/Home/Tabs/{ProgramInfoSection,MyAccountSection}.swift +
// Features/Home/Helpers/AdminHomeHelpers.swift). Used by AdminProgramTab + StandardProgramTab.

// MARK: - Section helpers (legacy AdminHomeHelpers.swift:6-49 — never pulled into the foundation)

func sectionHeader(title: String, icon: String, color: Color) -> some View {
    HStack(spacing: 10) {
        Image(systemName: icon)
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(color)
        Text(title)
            .font(.headline.weight(.semibold))
            .foregroundColor(Color(.label))
    }
}

func settingsRow(icon: String, color: Color, title: String, subtitle: String) -> some View {
    HStack(spacing: 14) {
        ZStack {
            Circle()
                .fill(color.opacity(0.14))
                .frame(width: 42, height: 42)
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(color)
        }
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text(subtitle)
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
        }
        Spacer()
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(Color(.tertiaryLabel))
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
}

// MARK: - Leave-Program confirmation (D-C1 — de-dup the verbatim-triplicated leave logic)
// The leave state machine + leaveProgram() async + the confirm/error alerts were byte-identical across
// ProgramInfoSection and StandardProgramTab. Extracted here as a reusable modifier (mirrors web's
// extracted LeaveProgramButton). Each call site keeps its own button styling + isLeaving/isPresented
// @State (the visual part); only the identical, non-visual logic + alerts are shared.

private struct LeaveProgramConfirmation: ViewModifier {
    @EnvironmentObject var programContext: ProgramContext
    @Binding var isPresented: Bool
    @Binding var isLeaving: Bool
    let onLeft: () -> Void
    @State private var leaveError: String?

    func body(content: Content) -> some View {
        content
            .alert("Leave Program?", isPresented: $isPresented) {
                Button("Cancel", role: .cancel) {}
                Button("Leave", role: .destructive) {
                    Task { await leave() }
                }
            } message: {
                Text("You will no longer have access to \(programContext.name). Your workout history and data will be preserved. If you're invited back and accept, your data will be restored. If you're the last member, the program will be deleted automatically.")
            }
            .alert("Error", isPresented: .constant(leaveError != nil)) {
                Button("OK") { leaveError = nil }
            } message: {
                Text(leaveError ?? "")
            }
    }

    private func leave() async {
        isLeaving = true
        leaveError = nil
        do {
            _ = try await programContext.leaveProgram()
            onLeft()
        } catch {
            leaveError = error.localizedDescription
        }
        isLeaving = false
    }
}

extension View {
    /// Attaches the shared "Leave Program?" confirm + error alerts and the leaveProgram() async flow.
    /// The caller owns the trigger button + the `isLeaving` spinner; this owns the alerts + the mutation.
    func leaveProgramConfirmation(
        isPresented: Binding<Bool>,
        isLeaving: Binding<Bool>,
        onLeft: @escaping () -> Void
    ) -> some View {
        modifier(LeaveProgramConfirmation(isPresented: isPresented, isLeaving: isLeaving, onLeft: onLeft))
    }
}

// MARK: - Program Info Section (legacy Tabs/ProgramInfoSection.swift) — used by AdminProgramTab

struct ProgramInfoSection: View {
    @EnvironmentObject var programContext: ProgramContext
    @Binding var showSelectProgram: Bool
    @State private var showLeaveProgramConfirm = false
    @State private var isLeavingProgram = false

    private var canLeaveProgram: Bool {
        !programContext.isGlobalAdmin
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Program Info", icon: "info.circle.fill", color: .appBlue)

            VStack(spacing: 12) {
                // Select Program Button
                Button {
                    showSelectProgram = true
                } label: {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.appOrangeVeryLight)
                                .frame(width: 42, height: 42)
                            Image(systemName: "arrow.left.arrow.right")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.appOrange)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Select Program")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text("Switch to a different program")
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(.tertiaryLabel))
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
                }
                .buttonStyle(.plain)

                // Edit Program Info (only if admin)
                if programContext.canEditProgramData {
                    NavigationLink {
                        EditProgramInfoView()
                    } label: {
                        HStack(spacing: 14) {
                            ZStack {
                                Circle()
                                    .fill(Color.appBlueLight)
                                    .frame(width: 42, height: 42)
                                Image(systemName: "pencil.circle.fill")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(.appBlue)
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Edit Program Details")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(Color(.label))
                                Text("\(programContext.status) • \(programContext.dateRangeLabel)")
                                    .font(.caption)
                                    .foregroundColor(Color(.secondaryLabel))
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Color(.tertiaryLabel))
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
                    }
                    .buttonStyle(.plain)
                }

                if canLeaveProgram {
                    // Leave Program
                    Button {
                        showLeaveProgramConfirm = true
                    } label: {
                        HStack(spacing: 14) {
                            ZStack {
                                Circle()
                                    .fill(Color(.systemGray5))
                                    .frame(width: 42, height: 42)
                                Image(systemName: "arrow.left.circle")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(Color(.secondaryLabel))
                            }
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Leave Program")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(Color(.label))
                                Text("Your data will be preserved")
                                    .font(.caption)
                                    .foregroundColor(Color(.secondaryLabel))
                            }
                            Spacer()
                            if isLeavingProgram {
                                ProgressView()
                                    .scaleEffect(0.8)
                            }
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
                    }
                    .buttonStyle(.plain)
                    .disabled(isLeavingProgram)
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
        .leaveProgramConfirmation(
            isPresented: $showLeaveProgramConfirm,
            isLeaving: $isLeavingProgram
        ) {
            showSelectProgram = true
        }
    }
}

// MARK: - My Account Section (legacy Tabs/MyAccountSection.swift) — used by both tabs

struct ProgramMyAccountSection: View {
    @EnvironmentObject var programContext: ProgramContext
    @EnvironmentObject var themeManager: ThemeManager
    @State private var showSignOutConfirm = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "My Account", icon: "person.circle.fill", color: .gray)

            VStack(spacing: 12) {
                // My Profile
                NavigationLink {
                    MyProfileView()
                } label: {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.appOrangeLight)
                                .frame(width: 42, height: 42)
                            Text(programContext.loggedInUserInitials)
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(.appOrange)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(programContext.loggedInUserName ?? "My Profile")
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(Color(.label))
                            Text("@\(programContext.loggedInUsername ?? "")")
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(.tertiaryLabel))
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
                }
                .buttonStyle(.plain)

                // Change Password
                NavigationLink {
                    ChangePasswordView()
                } label: {
                    settingsRow(
                        icon: "lock.fill",
                        color: .appOrange,
                        title: "Change Password",
                        subtitle: "Update your account password"
                    )
                }
                .buttonStyle(.plain)

                // Appearance
                NavigationLink {
                    AppearanceSettingsView()
                        .environmentObject(themeManager)
                } label: {
                    settingsRow(
                        icon: themeManager.appearance.icon,
                        color: .appPurple,
                        title: "Appearance",
                        subtitle: themeManager.appearance.displayName
                    )
                }
                .buttonStyle(.plain)

                // Notifications
                NavigationLink {
                    NotificationsSettingsView()
                } label: {
                    settingsRow(
                        icon: "bell.badge",
                        color: .appOrange,
                        title: "Notifications",
                        subtitle: "Manage push notifications"
                    )
                }
                .buttonStyle(.plain)

                Link(destination: APIConfig.privacyPolicyURL) {
                    settingsRow(
                        icon: "doc.text",
                        color: .appOrange,
                        title: "Privacy Policy",
                        subtitle: "Learn how we handle your data"
                    )
                }
                .buttonStyle(.plain)

                Link(destination: APIConfig.supportURL) {
                    settingsRow(
                        icon: "questionmark.circle",
                        color: .appOrange,
                        title: "Support",
                        subtitle: "Get help or contact us"
                    )
                }
                .buttonStyle(.plain)

                // Sign Out
                Button {
                    showSignOutConfirm = true
                } label: {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(Color.appRedLight)
                                .frame(width: 42, height: 42)
                            Image(systemName: "rectangle.portrait.and.arrow.right")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.appRed)
                        }
                        Text("Sign Out")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.appRed)
                        Spacer()
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(.systemBackground))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.appRed.opacity(0.3), lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.9))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 1)
        )
        .adaptiveShadow(radius: 8, y: 4)
        .alert("Sign Out?", isPresented: $showSignOutConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Sign Out", role: .destructive) {
                programContext.signOut()
            }
        } message: {
            Text("Are you sure you want to sign out?")
        }
    }
}
