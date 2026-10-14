import SwiftUI

// MARK: - Admin Workout Types Tab (program / global admin)
//
// Tab 3 "Lifestyle", program-admin variant — adds the role-gated "view as" picker above the
// cards. Ported verbatim from the legacy `Features/Home/Tabs/StandardWorkoutTypesTab.swift`
// (which co-located both tab structs) on the Lifestyle-tab port (run 56).
// Polish #31: the Summary recipe (see StandardWorkoutTypesTab), keyed on (program, View-as member); every visit
// reloads (admin re-entry included), and "View as" resets on a program switch for every role (#10).

struct AdminWorkoutTypesTab: View {
    @EnvironmentObject var programContext: ProgramContext
    /// This tab's own data for (program, View-as member) — frontend-kit §5.
    @State private var loadState: LoadState<LifestyleSnapshot> = .idle
    @State private var isLoading = false
    @State private var showMemberPicker = false
    @State private var selectedMember: APIClient.MemberDTO?
    @State private var hasUserChosenViewAs = false
    @State private var reloadQueued = false
    private var canViewAs: Bool { programContext.isProgramAdmin }

    private var viewAsLabel: String {
        if let selectedMember {
            return selectedMember.member_name
        }
        if programContext.isGlobalAdmin {
            return "Admin"
        }
        if hasUserChosenViewAs {
            return "Admin"
        }
        return programContext.loggedInUserName ?? "Member"
    }

    /// Whose numbers the cards show (polish #10, keyed state): the picked member; until the user picks, a program
    /// admin's own (no roster needed — the label already reads their name); a global admin / "Admin" = program-wide.
    private var scopeMemberId: String? {
        selectedMember?.id ?? (!hasUserChosenViewAs && !programContext.isGlobalAdmin ? programContext.loggedInUserId : nil)
    }

    private var currentKey: LifestyleKey? {
        programContext.programId.map { LifestyleKey(programId: $0, memberId: scopeMemberId) }
    }

    var body: some View {
        ZStack(alignment: .top) {
            Color.appBackground
                .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    WorkoutTypesHeader(
                        title: "Lifestyle",
                        subtitle: programContext.name
                    )

                    if canViewAs {
                        viewAsSelector
                    }

                    LoadStateContent(state: loadState, onRetry: { Task { await load() } }) { snapshot in
                        LifestyleCardsSection(snapshot: snapshot)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 24)
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await load() }
        }
        .loadStateChrome(loadState, onRetry: { Task { await load() } })
        .task {
            // QA5: every visit refreshes the roster, program and role — alongside the load (the default scope needs no
            // roster); #31: every visit reloads (admin re-entry included).
            let lookup = Task<Void, Never> { await programContext.loadLookupData() }
            await load()
            await lookup.value
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.programId) { _, _ in
            // #10: "View as" belongs to one program — reset it for every role (global admins too).
            selectedMember = nil
            hasUserChosenViewAs = false
            Task {
                await programContext.loadLookupData()
                applyDefaultSelectionIfNeeded()
            }
        }
        .onChange(of: currentKey) { _, key in
            // Polish #10 (keyed state): a new program / View-as member shows the spinner in the same event as the pick
            // — never the previous member's numbers under the new label; the load follows (queued if one is running).
            if loadState.value?.key != key { loadState = .loading }
            Task { await load() }
        }
        .onChange(of: programContext.members.count) { _, _ in
            applyDefaultSelectionIfNeeded()
        }
        .onChange(of: programContext.loggedInUserId) { _, _ in
            if !programContext.isGlobalAdmin {
                selectedMember = nil
                hasUserChosenViewAs = false
            }
            applyDefaultSelectionIfNeeded()
        }
    }

    private func load() async {
        // Polish #5: a View-as change (or a Retry / reconnect / pull) during a load is queued, not dropped — the loop
        // re-reads the key until it settles, so the cards always end on the member the label shows.
        guard !isLoading else {
            reloadQueued = true
            return
        }
        isLoading = true
        repeat {
            reloadQueued = false
            guard let key = currentKey else { break }
            // #10: another program's / member's numbers never sit under the new label.
            if loadState.value?.key != key { loadState = .idle }
            loadState = loadState.refreshing()
            if let result = await programContext.loadLifestyle(memberId: key.memberId), !reloadQueued, key == currentKey {
                loadState = loadState.merging(result)
            }
        } while reloadQueued && !Task.isCancelled
        isLoading = false
        // This load's task was cancelled (the tab's .task on disappear) with a View-as change still queued: run it on
        // its own, so the change isn't lost.
        if Task.isCancelled && reloadQueued {
            Task { await load() }
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
                showNoneOption: true,
                noneLabel: programContext.isGlobalAdmin ? "None" : "Admin",
                onSelect: { member in
                    hasUserChosenViewAs = true
                    selectedMember = member
                    showMemberPicker = false
                }
            )
        }
    }

    private func applyDefaultSelectionIfNeeded() {
        guard !programContext.isGlobalAdmin else { return }
        guard !hasUserChosenViewAs else { return }
        guard selectedMember == nil else { return }
        guard let userId = programContext.loggedInUserId else { return }
        guard programContext.membersProgramId == programContext.programId else { return }
        guard let member = programContext.members.first(where: { $0.id == userId }) else { return }
        selectedMember = member
    }
}
