import SwiftUI

// MARK: - Member Management Section (AdminProgramTab, run 62)
// Faithful 1:1 port of ios-mobile Features/Home/Tabs/MemberManagementSection.swift.
// Web parity: /members/list (roster) + /members/detail (editor). The global-admin-only
// member-detail gate matches BOTH legacy iOS AND web (web members/detail F1 — client stricter
// than the backend, which also allows a program admin; kept faithful, the backend is the real
// boundary). Cleanups (run 62): clear-stale-error-on-edit + tokenize bare colors.
// people (the roster retires): the old roster list is gone — the row below, the Program tab's entry, opens
// PeopleListView; MemberDetailEditView stays (global admins reach it from a person's profile, D-P11).

struct ProgramMemberManagementSection: View {
    @EnvironmentObject var programContext: ProgramContext

    // Only global_admin and program_admin can invite members
    private var canInviteMember: Bool {
        programContext.canEditProgramData
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeader(title: "Members", icon: "person.2.fill", color: .appGreen)

            VStack(spacing: 12) {
                // People — every role's Program-tab entry (D-P2; replaces the roster list)
                NavigationLink {
                    PeopleListView()
                } label: {
                    settingsRow(
                        icon: "person.3.fill",
                        color: .appGreen,
                        title: PeopleCopy.title,
                        subtitle: PeopleCopy.enrolled(programContext.members.count)
                    )
                }
                .buttonStyle(.plain)

                // Invite Member - only global_admin and program_admin
                if canInviteMember {
                    NavigationLink {
                        InviteMemberView()
                    } label: {
                        settingsRow(
                            icon: "envelope.badge.person.crop",
                            color: .appBlue,
                            title: "Invite Member",
                            subtitle: "Send program invitation"
                        )
                    }
                    .buttonStyle(.plain)
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
    }
}

struct MemberDetailEditView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    let membership: APIClient.MembershipDetailDTO

    @State private var joinedAt: Date = Date()
    @State private var isActive: Bool = true
    @State private var isSaving = false
    @State private var showRemoveConfirm = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Member Info Header
                HStack(spacing: 14) {
                    ZStack {
                        Circle()
                            .fill(membership.program_role == "admin" ? Color.appOrangeLight : Color(.systemGray5))
                            .frame(width: 60, height: 60)
                        Text(initials)
                            .font(.title3.weight(.semibold))
                            .foregroundColor(membership.program_role == "admin" ? .appOrange : Color(.label))
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(membership.member_name)
                            .font(.title3.weight(.bold))
                        Text("@\(membership.username ?? "")")
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                        if membership.program_role == "admin" {
                            HStack(spacing: 4) {
                                Image(systemName: "star.fill")
                                    .font(.caption2)
                                Text("Program Admin")
                                    .font(.caption.weight(.semibold))
                            }
                            .foregroundColor(.appOrange)
                        }
                    }
                }

                Divider()

                // Member Details
                VStack(alignment: .leading, spacing: 14) {
                    if let gender = membership.gender, !gender.isEmpty {
                        detailRow(label: "Gender", value: gender)
                    }
                    if let dob = membership.date_of_birth {
                        detailRow(label: "Date of Birth", value: dob)
                    }
                    if let joined = membership.date_joined {
                        detailRow(label: "Account Created", value: joined)
                    }
                }

                Divider()

                // Editable Fields
                VStack(alignment: .leading, spacing: 14) {
                    Text("Membership Settings")
                        .font(.headline.weight(.semibold))

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Joined Program")
                            .font(.subheadline.weight(.semibold))
                        DatePicker("", selection: $joinedAt, displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                            .padding(.horizontal)
                            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                    }

                    Toggle(isOn: $isActive) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Active Membership")
                                .font(.subheadline.weight(.semibold))
                            Text(isActive ? "Member is active in this program" : "Member is inactive")
                                .font(.caption)
                                .foregroundColor(Color(.secondaryLabel))
                        }
                    }
                    .adaptiveTint()
                }

                if let errorMessage {
                    Text(errorMessage)
                        .foregroundColor(.appRed)
                        .font(.footnote.weight(.semibold))
                }

                // Save Button
                Button(action: { Task { await save() } }) {
                    Group {
                        if isSaving {
                            ProgressView().tint(.white)
                        } else {
                            Text("Save changes")
                                .font(.headline.weight(.semibold))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.appOrange)
                    .foregroundColor(.black)
                    .cornerRadius(14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(isSaving)

                // Remove Button
                Button(role: .destructive) {
                    showRemoveConfirm = true
                } label: {
                    Text("Remove from Program")
                        .font(.headline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.appRedLight)
                        .foregroundColor(.appRed)
                        .cornerRadius(14)
                }
            }
            .padding(20)
            .frame(maxWidth: AdaptiveLayout.formMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle("Member Details")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if let joined = membership.joined_at {
                let formatter = DateFormatter()
                formatter.dateFormat = "yyyy-MM-dd"
                if let date = formatter.date(from: joined) {
                    joinedAt = date
                }
            }
            isActive = membership.is_active
        }
        // Cleanup (run 62): clear a stale error when the user edits either field (web members/detail D-C3).
        .onChange(of: joinedAt) { errorMessage = nil }
        .onChange(of: isActive) { errorMessage = nil }
        .alert("Remove Member?", isPresented: $showRemoveConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Remove", role: .destructive) {
                Task { await removeMember() }
            }
        } message: {
            Text("This will remove \(membership.member_name) from the program.")
        }
    }

    private var initials: String {
        membership.member_name
            .split(separator: " ")
            .compactMap { $0.first }
            .prefix(2)
            .map { String($0).uppercased() }
            .joined()
    }

    private func detailRow(label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil

        do {
            try await programContext.updateMembership(
                memberId: membership.member_id,
                role: nil,
                isActive: isActive,
                joinedAt: joinedAt
            )
            dismiss()
        } catch {
            errorMessage = SessionCopy.kitMessage(for: error)
        }

        isSaving = false
    }

    private func removeMember() async {
        isSaving = true
        errorMessage = nil

        do {
            try await programContext.removeMember(memberId: membership.member_id)
            dismiss()
        } catch {
            errorMessage = SessionCopy.kitMessage(for: error)
        }

        isSaving = false
    }
}
