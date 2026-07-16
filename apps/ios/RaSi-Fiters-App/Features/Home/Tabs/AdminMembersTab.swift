import SwiftUI

// MARK: - Members Tab (program-admin + global-admin variant)
// Ported faithfully from legacy Features/Home/Tabs/AdminOtherTabs.swift (the AdminMembersTab struct).

struct AdminMembersTab: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var showMemberPicker = false
    @State private var selectedMember: APIClient.MemberDTO?
    private var canViewAs: Bool { programContext.isProgramAdmin }

    private var viewAsLabel: String {
        if let selectedMember {
            return selectedMember.member_name
        }
        if programContext.isGlobalAdmin {
            return "None"
        }
        return programContext.loggedInUserName ?? "Member"
    }

    var body: some View {
        NavigationStack {
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Members")
                                .font(.largeTitle.weight(.bold))
                                .foregroundColor(Color(.label))
                            Text(programContext.name)
                                .font(.headline.weight(.semibold))
                                .foregroundColor(Color(.secondaryLabel))
                        }
                        Spacer()
                        NavigationLink {
                            InviteMemberView()
                        } label: {
                            GlassButton(icon: "envelope.badge.person.crop")
                        }
                    }
                    .padding(.top, 24)

                    NavigationLink {
                        MemberMetricsDetailView()
                    } label: {
                        MemberMetricsPreviewCard()
                    }
                    .buttonStyle(.plain)

                    if canViewAs {
                        viewAsSelector
                        if selectedMember != nil {
                            MemberOverviewCard(member: selectedMember)
                            MemberHistoryCard(selectedMember: selectedMember)
                            MemberStreakCard(selectedMember: selectedMember)
                            MemberRecentCard(selectedMember: selectedMember)
                            MemberHealthCard(selectedMember: selectedMember)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .adaptiveBackground(topLeading: true)
            .navigationBarBackButtonHidden(true)
        }
        .task {
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.programId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
            }
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.members.count) { _, _ in
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
            }
            applyDefaultSelectionIfNeeded()
        }
    }

    private var viewAsSelector: some View {
        Button {
            showMemberPicker = true
        } label: {
            HStack {
                Text("View as")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                Text(viewAsLabel)
                    .font(.subheadline)
                    .foregroundColor(Color(.secondaryLabel))
                Image(systemName: "chevron.up.chevron.down")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(Color(.tertiaryLabel))
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showMemberPicker) {
            MemberPickerView(
                members: programContext.members,
                selected: selectedMember,
                showNoneOption: programContext.isGlobalAdmin,
                onSelect: { member in
                    applySelection(member)
                }
            )
        }
    }

    private func applySelection(_ member: APIClient.MemberDTO?) {
        selectedMember = member
        showMemberPicker = false
        Task {
            await loadMemberData(for: member)
        }
    }

    @MainActor
    private func loadMemberData(for member: APIClient.MemberDTO?) async {
        if let m = member {
            await programContext.loadMemberOverview(memberId: m.id)
            await programContext.loadMemberHistory(memberId: m.id, period: "week")
            await programContext.loadMemberStreaks(memberId: m.id)
            await programContext.loadMemberRecent(memberId: m.id, limit: 10)
            await programContext.loadMemberHealthLogs(memberId: m.id, limit: 10)
        } else {
            programContext.selectedMemberOverview = nil
            programContext.memberHistory = []
            programContext.memberStreaks = nil
            programContext.memberRecent = []
            programContext.memberHealthLogs = []
        }
    }

    private func applyDefaultSelectionIfNeeded() {
        guard !programContext.isGlobalAdmin else { return }
        guard selectedMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        applySelection(member)
    }
}
