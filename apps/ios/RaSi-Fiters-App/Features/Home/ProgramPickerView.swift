import SwiftUI

struct ProgramPickerView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL

    /// The programs on screen (frontend-kit §5); a failed action floats separately (`actionError`).
    @State private var loadState: LoadState<[APIClient.ProgramDTO]> = .idle
    @State private var actionError: AppError?
    @State private var showDeleteConfirmation = false
    @State private var programToDelete: APIClient.ProgramDTO?
    @State private var isDeleting = false
    @State private var showProgramActions = false
    @State private var programActionsTab: Int?
    @State private var programToEdit: APIClient.ProgramDTO?
    @State private var programToOpen: APIClient.ProgramDTO?
    @State private var showSignOutConfirmation = false
    @State private var showAccountMenu = false
    @State private var accountDestination: AccountDestination?
    @State private var searchText = ""
    @State private var isSearching = false
    @FocusState private var searchFieldFocused: Bool

    private var trimmedSearch: String {
        searchText.trimmingCharacters(in: .whitespaces)
    }

    // Client-side name filter over the server-ordered list. Reorder (.onMove) is
    // only enabled when this returns the unfiltered array, so move offsets always
    // map 1:1 onto programContext.programs.
    private var visiblePrograms: [APIClient.ProgramDTO] {
        guard !trimmedSearch.isEmpty else { return programContext.programs }
        return programContext.programs.filter { $0.name.localizedCaseInsensitiveContains(trimmedSearch) }
    }

    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            programList

            // Header at top (+ the floating search pill when active)
            VStack(spacing: 12) {
                pickerHeader
                    .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 8)
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                if isSearching {
                    searchPill
                        .frame(maxWidth: AdaptiveLayout.contentMaxWidth)
                        .padding(.horizontal, 20)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                Spacer()
            }

            // Floating actions at bottom right (search above the "+") — pinned to the trailing
            // edge of the content column, not the window, so they stay with the cards on iPad/Mac.
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    VStack(spacing: 14) {
                        floatingSearchButton
                        floatingProgramActionsButton
                    }
                    .padding(.trailing, 20)
                    .padding(.bottom, 24)
                }
                .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
            }

        }
        .navigationBarBackButtonHidden(true)
        .floatingBanner(bottomInset: 150) { ScreenBanner(banner: pickerBanner) }   // clears the FAB stack (56+14+56+24)
        .task { await load() }
        .onAppear {
            if let route = programContext.inboxRoute { openInboxRoute(route) }
        }
        .onChange(of: programContext.inboxRoute) { _, route in
            if let route { openInboxRoute(route) }
        }
        .onChange(of: programContext.isOnline) { _, online in
            if online, loadState.error != nil { Task { await load() } }       // D-IOS-KIT-3: refetch on reconnect
        }
        .onChange(of: programContext.returnToMyPrograms) { _, shouldReturn in
            guard shouldReturn else { return }
            programToOpen = nil
            programToEdit = nil
            accountDestination = nil
            showProgramActions = false
            showAccountMenu = false
            showDeleteConfirmation = false
            programToDelete = nil
            programContext.returnToMyPrograms = false
        }
        .sheet(isPresented: $showProgramActions) {
            ProgramActionsSheet(initialTab: programActionsTab, onDismiss: {
                Task { await load() }
            })
            .environmentObject(programContext)
        }
        .sheet(isPresented: $showAccountMenu) {
            AccountMenuSheet(
                onSelectDestination: handleAccountSelection(_:),
                onSignOut: handleAccountSignOut
            )
            .environmentObject(programContext)
        }
        .navigationDestination(item: $programToOpen) { _ in
            AdminHomeView()
                .environmentObject(programContext)
        }
        .navigationDestination(item: $programToEdit) { _ in
            EditProgramInfoView()
                .environmentObject(programContext)
        }
        .navigationDestination(item: $accountDestination) { destination in
            switch destination {
            case .profile:
                MyProfileView()
            case .password:
                ChangePasswordView()
            case .appearance:
                AppearanceSettingsView()
            case .notifications:
                NotificationsSettingsView()
            case .appleHealth:
                AppleHealthSettingsView()
            case .inbox:
                InboxView(onAcceptedInvite: { accountDestination = nil })
                    .navigationTitle(InboxCopy.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .adaptiveBackground(topLeading: true)
            }
        }
        .alert("Delete Program?", isPresented: $showDeleteConfirmation) {
            Button("Cancel", role: .cancel) {
                programToDelete = nil
            }
            Button("Delete", role: .destructive) {
                if let program = programToDelete {
                    Task {
                        await deleteProgram(program)
                    }
                }
            }
        } message: {
            if let program = programToDelete {
                Text("Are you sure you want to delete \"\(program.name)\"? This action cannot be undone.")
            }
        }
        .alert("Sign Out", isPresented: $showSignOutConfirmation) {
            Button("Cancel", role: .cancel) { }
            Button("Sign Out", role: .destructive) {
                programContext.signOut()
            }
        } message: {
            Text("Are you sure you want to sign out?")
        }
    }

    /// The card list. The header's height is a clear top safe-area inset, so the pull-to-refresh spinner (A13) sits
    /// below the header; the short spacer row keeps every card exactly where it was (inset + row = the former 90 / 148
    /// spacer row, hence the 0 minimum row height).
    private var programList: some View {
        List {
            Color.clear
                .frame(height: 6)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

            if case .failed(let error) = loadState, programContext.programs.isEmpty {
                ErrorStateView(error: error, onRetry: { Task { await load() } })
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else if case .loading = loadState {
                ProgressView()
                    .padding(.top, 12)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else if programContext.programs.isEmpty {
                emptyState
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else if visiblePrograms.isEmpty {
                noMatchesState
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            } else {
                ForEach(visiblePrograms, id: \.id) { program in
                    programRow(for: program)
                }
                // Press-and-hold lift-and-drag (no edit mode). nil while searching —
                // filtered offsets would corrupt the full order.
                .onMove(perform: moveHandler)
            }

            // Bottom padding for the floating buttons (+ this screen's own banner above them; the offline band is the
            // root's bottom safe-area inset — A6)
            Color.clear
                .frame(height: isBannerShowing ? 222 : 90)            // banner top = 150 + 12 + 52 = 214
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 0)
        .safeAreaInset(edge: .top, spacing: 0) {
            Color.clear.frame(height: isSearching ? 142 : 84)
        }
        .refreshable {
            HealthSyncEngine.shared.trigger(.pullToRefresh)        // health-sync rule 1, in the background
            await load()
        }
        // Cap the List itself — not the row content — so swipe reveals, slide animations, and
        // drag-reorder all stay inside the column on iPad/Mac (+40 covers the 20pt row insets).
        .frame(maxWidth: AdaptiveLayout.contentMaxWidth + 40)
    }

    private var pickerHeader: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("My Programs")
                    .font(.largeTitle.weight(.bold))
                    .foregroundColor(Color(.label))
                Text("Manage your fitness programs")
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
            Button {
                showAccountMenu = true
            } label: {
                ZStack {
                    Circle()
                        .fill(colorScheme == .dark ? Color(.white) : Color(.black))
                        .frame(width: 56, height: 56)
                    Image(systemName: "person.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(colorScheme == .dark ? .black : .white)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Account settings")
        }
        .padding(.horizontal, 4)
    }

    // Floating search — collapsed behind the header magnifier so the screen is
    // unchanged until search is active (user feedback 2026-07-05; replaced the
    // nav-drawer .searchable, which collided with the custom header).
    private var searchPill: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(Color(.secondaryLabel))
            TextField("Search programs", text: $searchText)
                .font(.subheadline.weight(.medium))
                .foregroundColor(Color(.label))
                .focused($searchFieldFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.subheadline)
                        .foregroundColor(Color(.tertiaryLabel))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Capsule().fill(.ultraThinMaterial))
        .overlay(Capsule().stroke(Color(.separator).opacity(0.4), lineWidth: 0.5))
    }

    private func toggleSearch() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            isSearching.toggle()
        }
        if isSearching {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                searchFieldFocused = true
            }
        } else {
            searchText = ""
        }
    }

    // Floats above the "+" (user feedback 2026-07-05: a header button squeezed the
    // title into wrapping — search lives with the other floating action instead).
    private var floatingSearchButton: some View {
        Button {
            toggleSearch()
        } label: {
            ZStack {
                Circle()
                    .fill(colorScheme == .dark ? Color(.white) : Color(.black))
                    .frame(width: 56, height: 56)
                Image(systemName: isSearching ? "xmark" : "magnifyingglass")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(colorScheme == .dark ? .black : .white)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isSearching ? "Close search" : "Search programs")
    }

    private var floatingProgramActionsButton: some View {
        Button {
            programActionsTab = nil
            showProgramActions = true
        } label: {
            ZStack {
                Circle()
                    .fill(colorScheme == .dark ? Color(.white) : Color(.black))
                    .frame(width: 56, height: 56)
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(colorScheme == .dark ? .black : .white)

                if programContext.inboxBadgeCount > 0 {
                    Text(programContext.inboxBadgeLabel)
                        .font(.caption2.weight(.bold))
                        .foregroundColor(.white)
                        .padding(5)
                        .background(Circle().fill(Color.appRed))
                        .offset(x: 18, y: -18)
                }
            }
        }
        .buttonStyle(.plain)
        // Polish #36: the spoken label reads the badge's own count (one source — the badge and the label move together).
        .accessibilityLabel(programContext.inboxBadgeCount > 0
                            ? "Program actions, \(programContext.inboxBadgeLabel) new" : "Program actions")
    }

    private func deleteProgram(_ program: APIClient.ProgramDTO) async {
        guard programContext.authToken != nil else { return }
        isDeleting = true
        do {
            try await programContext.deleteProgram(programId: program.id)
            programToDelete = nil
        } catch {
            actionError = AppError(error)
        }
        isDeleting = false
    }

    private var moveHandler: ((IndexSet, Int) -> Void)? {
        guard trimmedSearch.isEmpty else { return nil }
        return { source, destination in
            moveProgram(from: source, to: destination)
        }
    }

    // Extracted from body — the row expression pushed the List past the
    // type-checker's complexity limit once search/reorder branches were added.
    // Amendment A10: the card's *invited* Accept / Decline is retired (the Invites tab is the one inbox); a
    // *requested* membership keeps its Cancel request.
    @ViewBuilder
    private func programRow(for program: APIClient.ProgramDTO) -> some View {
        let membershipStatus = program.my_status?.lowercased()
        let canOpen = isOpenable(program)
        let canManage = programContext.isGlobalAdmin || (membershipStatus == "active" && program.my_role == "admin")

        ProgramCard(
            program: program,
            membershipStatus: membershipStatus,
            onCancelRequest: membershipStatus == "requested" ? {
                _ = Task<Void, Never> { await cancelRequest(program) }
            } : nil
        )
        .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
        .listRowSeparator(.hidden)
        .listRowBackground(Color.clear)
        .contentShape(Rectangle())
        .onTapGesture {
            guard canOpen else { return }
            applyProgram(program)
            programToOpen = program
        }
        .accessibilityAddTraits(canOpen ? .isButton : [])        // #36: VoiceOver opens the card like a button
        .swipeActions(edge: .leading, allowsFullSwipe: false) {
            if canManage {
                Button {
                    applyProgram(program)
                    programToEdit = program
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                .tint(.blue)
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if canManage {
                Button(role: .destructive) {
                    programToDelete = program
                    showDeleteConfirmation = true
                } label: {
                    Label("Delete", systemImage: "trash")
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Text("No programs yet")
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text("Create a program to get started.")
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(.systemGray6))
        )
    }

    private var noMatchesState: some View {
        VStack(spacing: 10) {
            Text("No programs match your search")
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text("Try a different name.")
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(.systemGray6))
        )
    }

    /// The screen's own banner (frontend-kit §6 — one at a time): a failed action (dismissable) beats "Couldn't
    /// refresh" over kept data, which beats "update available" (app-config soft nudge — the picker only, A7).
    private var pickerBanner: FloatingBanner? {
        if let actionError { return FloatingBanner(variant: .error(actionError), onDismiss: { self.actionError = nil }) }
        if case .stale = loadState { return FloatingBanner(variant: .stale, onRetry: { Task { await load() } }) }
        if programContext.updateAvailableVersion != nil {
            return FloatingBanner(variant: .updateAvailable,
                                  onDismiss: { programContext.dismissUpdateBanner() },
                                  onUpdate: { openURL(APIConfig.appStoreURL) })
        }
        return nil
    }

    /// This screen's own banner is up (`ScreenBanner` shows it only online; offline space is the root's inset).
    private var isBannerShowing: Bool { programContext.isOnline && pickerBanner != nil }

    private func applyProgram(_ program: APIClient.ProgramDTO) {
        // Polish #10 / #30: a different program never shows the previous one's numbers.
        if program.id != programContext.programId { programContext.resetProgramScopedData() }
        programContext.name = program.name
        programContext.status = (program.status ?? "Active")
        programContext.programId = program.id
        programContext.activeMembers = program.active_members ?? 0
        programContext.totalWorkouts = 0
        programContext.atRiskMembers = 0
        if let role = program.my_role {
            programContext.loggedInUserProgramRole = role
        }

        let formatterIn = DateFormatter()
        formatterIn.dateFormat = "yyyy-MM-dd"
        if let startString = program.start_date, let d = formatterIn.date(from: startString) {
            programContext.startDate = d
        }
        if let endString = program.end_date, let d = formatterIn.date(from: endString) {
            programContext.endDate = d
        }

        programContext.persistSession()

        Task {
            await programContext.loadMembershipDetails()
            await programContext.loadLookupData()
        }
    }

    private func cancelRequest(_ program: APIClient.ProgramDTO) async {
        do {
            try await programContext.updateMembershipStatus(programId: program.id, status: "removed")
            await load()
        } catch {
            actionError = AppError(error)
        }
    }

    // Net-new post-parity (2026-07-05): optimistic reorder — mutate the context array,
    // persist the full display order, revert + surface in the action banner on failure.
    // Only reachable with an empty search filter (onMove is nil otherwise), so offsets
    // map 1:1 onto programContext.programs.
    private func moveProgram(from source: IndexSet, to destination: Int) {
        let previousOrder = programContext.programs
        programContext.programs.move(fromOffsets: source, toOffset: destination)
        let ids = programContext.programs.map(\.id)

        guard let token = programContext.authToken, !token.isEmpty else { return }
        Task {
            do {
                try await APIClient.shared.saveProgramOrder(token: token, programIds: ids)
            } catch {
                await MainActor.run {
                    programContext.programs = previousOrder
                    if let appError = AppError(error) {
                        actionError = AppError(kind: appError.kind, message: "Couldn't save program order. \(appError.message)")
                    }
                }
            }
        }
    }

    /// Instant open (D-9): cached programs first, then the network; programs + invites load in parallel (board §6.5).
    private func load() async {
        if loadState.value == nil {
            if !programContext.programs.isEmpty {
                loadState = .loaded(programContext.programs, fetchedAt: Date(), refreshing: true)
            } else if let cached = try? await APIClient.shared.fetchPrograms(token: programContext.authToken ?? "", read: .cacheOnly) {
                programContext.programs = cached
                loadState = .loaded(cached, fetchedAt: Date(), refreshing: true)
            }
        }
        loadState = loadState.refreshing()
        let invites = Task<Void, Never> { _ = try? await programContext.loadPendingInvites() }   // the Inbox's invitations
        let counts = Task<Void, Never> { await programContext.refreshInboxCounts() }           // the "+" badge (D-N4)
        do {
            let programs = try await APIClient.shared.fetchPrograms(token: programContext.authToken ?? "")
            programContext.programs = programs
            loadState = .fresh(programs)
        } catch {
            if let appError = AppError(error) {
                loadState = loadState.failing(with: appError.labeled(online: programContext.isOnline))   // polish-1 rule 6
            }
        }
        await invites.value
        await counts.value
    }

    /// A target only the picker can open (notifications contract C2; the routing rule — supersedes U2's invite-only
    /// flag). The picker's sheets (incl. the root Inbox sheet) close at once; every pop waits for the delayed block and
    /// never happens under a full-screen cover or the visibility notice. `invites` / `inbox` arrive here only when
    /// something else was presented — the "+" sheet on its Inbox tab (an open program pops, U2's behavior). The program
    /// already open stays put and only refreshes; `log_workout` opens the form over the current screen (nothing pops,
    /// so closing it returns there).
    private func openInboxRoute(_ route: InboxTarget) {
        programContext.inboxRoute = nil
        if case .program(let id) = route, programToOpen?.id == id, programContext.programId == id {
            Task { await programContext.reloadSessionData() }
            return
        }
        programContext.showInboxSheet = false
        showAccountMenu = false
        showProgramActions = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            // ≥ a sheet's dismissal (the "+" / account / root Inbox sheet). A full-screen cover (widget quick-add, Apple
            // Health review, forced update) or the visibility notice would swallow what opens next — and nothing under it
            // is discarded. Skip it; the badge still shows what's new.
            guard !isFullScreenCoverUp else { return }
            switch route {
            case .logWorkout:
                // Something still presented (a sheet inside the program) would refuse the cover and leave `widgetRoute`
                // stuck: the item was marked read — that's all.
                guard !ProgramContext.isPresentingModal else { return }
                programContext.widgetRouteFromNotification = true                // closing it returns here
                programContext.widgetRoute = .quickAddWorkout
            case .invites, .inbox:
                popPickerScreens {
                    // A sheet / alert still up would refuse the "+" sheet and leave `showProgramActions` stuck (a dead "+").
                    guard !isFullScreenCoverUp, !ProgramContext.isPresentingModal else { return }
                    programActionsTab = 0
                    showProgramActions = true
                }
            case .program(let id):
                popPickerScreens {
                    Task {
                        if !programContext.programs.contains(where: { $0.id == id }) { await load() }   // a cold-launch tap
                        guard let program = programContext.programs.first(where: { $0.id == id }), isOpenable(program) else { return }
                        applyProgram(program)
                        programToOpen = program
                    }
                }
            case .programs:
                popPickerScreens {}
            }
        }
    }

    /// Pops the picker-pushed screens (an open program, an account page, the editor), then runs `next` once the pop
    /// finished — at once when nothing was pushed.
    private func popPickerScreens(then next: @escaping () -> Void) {
        let pushed = programToOpen != nil || programToEdit != nil || accountDestination != nil
        programToOpen = nil
        programToEdit = nil
        accountDestination = nil
        if pushed {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: next)
        } else {
            next()
        }
    }

    /// The card-tap rule: global admins open anything; members open active (or unknown-status) programs.
    private func isOpenable(_ program: APIClient.ProgramDTO) -> Bool {
        let status = program.my_status?.lowercased()
        return programContext.isGlobalAdmin || status == nil || status == "active"
    }

    /// AppRootView's full-screen covers + the visibility notice — a sheet can't present from under them.
    private var isFullScreenCoverUp: Bool {
        programContext.isUpdateRequired || programContext.widgetRoute != nil || programContext.pendingSyncConfirmation != nil
            || programContext.showActivityVisibilityNotice
    }

    private func handleAccountSelection(_ destination: AccountDestination) {
        showAccountMenu = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            accountDestination = destination
        }
    }

    private func handleAccountSignOut() {
        showAccountMenu = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            showSignOutConfirmation = true
        }
    }
}

private enum AccountDestination: String, Identifiable {
    case profile
    case password
    case appearance
    case notifications
    case appleHealth
    case inbox

    var id: String { rawValue }
}

private struct AccountMenuSheet: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    let onSelectDestination: (AccountDestination) -> Void
    let onSignOut: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        header

                        VStack(spacing: 12) {
                            Button {
                                onSelectDestination(.profile)
                            } label: {
                                ProfileRow(
                                    initials: programContext.loggedInUserInitials,
                                    name: programContext.loggedInUserName ?? "My Profile",
                                    username: programContext.loggedInUsername ?? ""
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                onSelectDestination(.inbox)
                            } label: {
                                AccountRow(
                                    icon: "tray.fill",
                                    color: .appOrange,
                                    title: InboxCopy.title,
                                    subtitle: InboxCopy.rowSubtitle(badge: programContext.inboxBadgeCount)
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                onSelectDestination(.password)
                            } label: {
                                AccountRow(
                                    icon: "lock.fill",
                                    color: .appOrange,
                                    title: "Change Password",
                                    subtitle: "Update your account password"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                onSelectDestination(.appearance)
                            } label: {
                                AccountRow(
                                    icon: "paintpalette.fill",
                                    color: .appPurple,
                                    title: "Appearance",
                                    subtitle: "Choose light or dark mode"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                onSelectDestination(.notifications)
                            } label: {
                                AccountRow(
                                    icon: "bell.badge",
                                    color: .appOrange,
                                    title: "Notifications",
                                    subtitle: "Manage push notifications"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                onSelectDestination(.appleHealth)
                            } label: {
                                AccountRow(
                                    icon: "heart.fill",
                                    color: .appRed,
                                    title: "Apple Health",
                                    subtitle: "Sync workouts, sleep, and steps"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                dismiss()
                                openURL(APIConfig.privacyPolicyURL)
                            } label: {
                                AccountRow(
                                    icon: "doc.text",
                                    color: .appOrange,
                                    title: "Privacy Policy",
                                    subtitle: "Learn how we handle your data"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                dismiss()
                                openURL(APIConfig.supportURL)
                            } label: {
                                AccountRow(
                                    icon: "questionmark.circle",
                                    color: .appOrange,
                                    title: "Support",
                                    subtitle: "Get help or contact us"
                                )
                            }
                            .buttonStyle(.plain)

                            Button {
                                onSignOut()
                            } label: {
                                SignOutRow()
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(20)
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var header: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color(.systemGray5))
                    .frame(width: 48, height: 48)
                Image(systemName: "person.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("My Account")
                    .font(.title3.weight(.bold))
                    .foregroundColor(Color(.label))
                Text("Manage your profile and preferences.")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
        }
    }
}

private struct ProfileRow: View {
    let initials: String
    let name: String
    let username: String

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.appOrangeLight)
                    .frame(width: 42, height: 42)
                Text(initials)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.appOrange)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Text(username.isEmpty ? "Update your personal info" : "@\(username)")
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
}

private struct AccountRow: View {
    let icon: String
    let color: Color
    let title: String
    let subtitle: String

    var body: some View {
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
}

private struct SignOutRow: View {
    var body: some View {
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
}

private struct ProgramCard: View {
    let program: APIClient.ProgramDTO
    let membershipStatus: String?
    let onCancelRequest: (() -> Void)?

    private var normalizedStatus: String? {
        membershipStatus?.lowercased()
    }

    private var isInvited: Bool {
        normalizedStatus == "invited"
    }

    private var isRequested: Bool {
        normalizedStatus == "requested"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(program.name)
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer()
                StatusPill(text: program.status ?? "Active", color: statusColor(program.status))
            }

            Text(dateRange(program))
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))

            if isInvited || isRequested {
                Text(isInvited ? "Invitation pending" : "Request pending approval")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.secondaryLabel))
            } else {
                Text(membersSummary(program))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(.tertiaryLabel))
            }

            ProgressView(value: progressValue(program))
                .accentColor(statusColor(program.status))
                .scaleEffect(x: 1, y: 1.1, anchor: .center)

            if isRequested, let onCancelRequest {
                HStack(spacing: 10) {
                    Button(action: onCancelRequest) {
                        Text("Cancel request")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color(.systemGray5)))
                            .foregroundColor(Color(.label))
                            .minTapTarget(alignment: .leading)
                    }
                    Spacer()
                }
            }

        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color.appBackgroundSecondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(borderColor, lineWidth: 1)
        )
        .adaptiveShadow(radius: 12, y: 6)
    }

    private var borderColor: Color {
        if isInvited || isRequested {
            return Color.appOrange.opacity(0.35)
        }
        return Color(.systemGray4).opacity(0.5)
    }

    private func dateRange(_ program: APIClient.ProgramDTO) -> String {
        let formatterIn = DateFormatter()
        formatterIn.dateFormat = "yyyy-MM-dd"
        let formatterOut = DateFormatter()
        formatterOut.dateFormat = "MMM d, yyyy"
        let start = program.start_date.flatMap { formatterIn.date(from: $0) }.map { formatterOut.string(from: $0) } ?? "Start"
        let end = program.end_date.flatMap { formatterIn.date(from: $0) }.map { formatterOut.string(from: $0) } ?? "End"
        return "\(start) – \(end)"
    }

    // D3 (programs SPEC §9): one number — the backend counts active and total members the same way (F2).
    private func membersSummary(_ program: APIClient.ProgramDTO) -> String {
        let count = program.total_members ?? 0
        return count == 1 ? "1 member" : "\(count) members"
    }

    // The bar is time elapsed (days in / total days), the server's progress_percent — Android parity. Not active/total
    // members: the backend counts both the same way, so that ratio was always a full bar.
    private func progressValue(_ program: APIClient.ProgramDTO) -> Double {
        min(max(Double(program.progress_percent ?? 0) / 100, 0), 1)
    }

    private func statusColor(_ status: String?) -> Color {
        switch (status ?? "").lowercased() {
        case "completed": return .appGreen
        case "planned": return .appBlue
        case "active": return .appOrange
        default: return .appOrange
        }
    }
}

struct StatusPill: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(color.opacity(0.18))
            )
            .foregroundColor(color)
    }
}

#Preview {
    NavigationStack {
        ProgramPickerView()
            .environmentObject(ProgramContext())
    }
}
