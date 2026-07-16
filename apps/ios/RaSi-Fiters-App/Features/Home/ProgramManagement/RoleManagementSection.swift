import SwiftUI

// MARK: - Role Management Section (AdminProgramTab, run 62)
// Faithful 1:1 port of ios-mobile Features/Home/Tabs/RoleManagementSection.swift.
// Web parity: /program/roles. D-REF (run 62) — KEEP iOS-NATIVE: the per-member spinner lock
// (`isUpdating` gates only the member being changed) + refresh-after-mutation is kept over web's
// optimistic-write + rollback + cross-row disable-all (web program/roles D-C2/D-C3). The per-member
// lock is arguably finer-grained than web's disable-all; optimistic+rollback re-implements web's
// specific UX rather than closing a genuine parity gap (run-61 "iOS richer → keep native").
// Cleanup (run 62): tokenize bare `.blue`/`.orange` → app tokens (light-mode-safe).

struct ProgramRoleManagementSection: View {
    @EnvironmentObject var programContext: ProgramContext

    private var admins: [APIClient.MembershipDetailDTO] {
        programContext.membershipDetails.filter { $0.program_role == "admin" }
    }

    private var loggers: [APIClient.MembershipDetailDTO] {
        programContext.membershipDetails.filter { $0.program_role == "logger" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Role Management", icon: "person.badge.key.fill", color: .appPurple)

            VStack(spacing: 12) {
                // Admins subsection
                if !admins.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "star.fill")
                                .font(.caption)
                                .foregroundColor(.appOrange)
                            Text("Admins")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }

                        ForEach(admins) { admin in
                            roleRow(member: admin, color: .appOrange)
                        }
                    }
                }

                // Loggers subsection
                if !loggers.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "pencil.circle.fill")
                                .font(.caption)
                                .foregroundColor(.appBlue)
                            Text("Loggers")
                                .font(.caption.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }

                        ForEach(loggers) { logger in
                            roleRow(member: logger, color: .appBlue)
                        }
                    }
                }

                if admins.isEmpty && loggers.isEmpty {
                    Text("No admins or loggers assigned")
                        .font(.subheadline)
                        .foregroundColor(Color(.secondaryLabel))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding()
                }

                // Manage Roles
                NavigationLink {
                    ManageRolesView()
                } label: {
                    settingsRow(
                        icon: "person.badge.key.fill",
                        color: .appPurple,
                        title: "Manage Roles",
                        subtitle: "Set admin, logger, or member roles"
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
    }

    private func roleRow(member: APIClient.MembershipDetailDTO, color: Color) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.2))
                    .frame(width: 40, height: 40)
                Text(initials(for: member.member_name))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(color)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(member.member_name)
                    .font(.subheadline.weight(.semibold))
                if member.global_role == "global_admin" {
                    Text("Global Admin")
                        .font(.caption)
                        .foregroundColor(Color(.secondaryLabel))
                }
            }
            Spacer()
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(.systemGray6))
        )
    }

    private func initials(for name: String) -> String {
        name.split(separator: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0).uppercased() }
            .joined()
    }
}

struct ManageRolesView: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var isUpdating: String?
    @State private var errorMessage: String?

    private var activeAdminCount: Int {
        programContext.membershipDetails.filter { $0.program_role == "admin" && $0.status == "active" }.count
    }

    var body: some View {
        List {
            ForEach(programContext.membershipDetails) { member in
                let isLastActiveAdmin = member.program_role == "admin"
                    && member.status == "active"
                    && activeAdminCount <= 1

                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(roleColor(for: member.program_role).opacity(0.2))
                                .frame(width: 44, height: 44)
                            Text(initials(for: member.member_name))
                                .font(.subheadline.weight(.semibold))
                                .foregroundColor(roleColor(for: member.program_role))
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(member.member_name)
                                .font(.subheadline.weight(.semibold))
                            Text(roleDisplayName(for: member.program_role))
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }

                        Spacer()
                    }

                    if isUpdating == member.member_id {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    } else {
                        // Role selection buttons
                        HStack(spacing: 8) {
                            roleButton(
                                title: "Admin",
                                isSelected: member.program_role == "admin",
                                color: .appOrange,
                                isDisabled: isLastActiveAdmin
                            ) {
                                Task { await updateRole(for: member, to: "admin") }
                            }

                            roleButton(
                                title: "Logger",
                                isSelected: member.program_role == "logger",
                                color: .appBlue,
                                isDisabled: isLastActiveAdmin
                            ) {
                                Task { await updateRole(for: member, to: "logger") }
                            }

                            roleButton(
                                title: "Member",
                                isSelected: member.program_role == "member",
                                color: Color(.systemGray),
                                isDisabled: isLastActiveAdmin
                            ) {
                                Task { await updateRole(for: member, to: "member") }
                            }
                        }
                    }
                }
                .padding(.vertical, 8)
            }
        }
        // Container cap (large-screen column rules) + matching backdrop for the grouped-List gutters.
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
        .frame(maxWidth: .infinity)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle("Manage Roles")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await programContext.loadMembershipDetails()
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    @ViewBuilder
    private func roleButton(title: String, isSelected: Bool, color: Color, isDisabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.caption2.weight(.bold))
                }
                Text(title)
                    .font(.caption.weight(isSelected ? .bold : .semibold))
            }
            .foregroundColor(isSelected ? .white : color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(
                Capsule()
                    .fill(isSelected ? color : color.opacity(0.15))
            )
            .overlay(
                Capsule()
                    .strokeBorder(isSelected ? color.opacity(0.8) : color.opacity(0.3), lineWidth: isSelected ? 2 : 1)
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isSelected || isDisabled)
        .opacity(isSelected || !isDisabled ? 1.0 : 0.55)
    }

    private func roleColor(for role: String) -> Color {
        switch role {
        case "admin": return .appOrange
        case "logger": return .appBlue
        default: return Color(.systemGray)
        }
    }

    private func roleDisplayName(for role: String) -> String {
        switch role {
        case "admin": return "Program Admin"
        case "logger": return "Logger"
        default: return "Member"
        }
    }

    private func initials(for name: String) -> String {
        name.split(separator: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0).uppercased() }
            .joined()
    }

    private func updateRole(for member: APIClient.MembershipDetailDTO, to newRole: String) async {
        guard member.program_role != newRole else { return }

        isUpdating = member.member_id

        do {
            try await programContext.updateMembership(
                memberId: member.member_id,
                role: newRole,
                isActive: nil,
                joinedAt: nil
            )
        } catch {
            errorMessage = error.localizedDescription
        }

        isUpdating = nil
    }
}
