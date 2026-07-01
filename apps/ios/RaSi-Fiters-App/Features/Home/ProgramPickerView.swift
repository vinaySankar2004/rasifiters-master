import SwiftUI

struct ProgramPickerView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme

    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showDeleteConfirmation = false
    @State private var programToDelete: APIClient.ProgramDTO?
    @State private var isDeleting = false
    @State private var showProgramActions = false
    @State private var programToEdit: APIClient.ProgramDTO?
    @State private var programToOpen: APIClient.ProgramDTO?
    @State private var showSignOutConfirmation = false
    @State private var showAccountMenu = false
    @State private var accountDestination: AccountDestination?

    private var pendingInvitesCount: Int {
        programContext.pendingInvites.count
    }

    var body: some View {
        ZStack {
            Color.appBackground
                .ignoresSafeArea()

            List {
                Color.clear
                    .frame(height: 90)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                // D-C1 (web parity): surface load/delete/invite failures instead of
                // silently swallowing them. Additive banner — does not hide the list,
                // covering both the load path and mutation errors.
                if let errorMessage {
                    errorBanner(errorMessage)
                        .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                if isLoading {
                    ProgressView()
                        .padding(.top, 12)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                } else if programContext.programs.isEmpty {
                    emptyState
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                } else {
                    ForEach(programContext.programs, id: \.id) { program in
                        let membershipStatus = program.my_status?.lowercased()
                        let canOpen = programContext.isGlobalAdmin || membershipStatus == nil || membershipStatus == "active"
                        let canManage = programContext.isGlobalAdmin || (membershipStatus == "active" && program.my_role == "admin")
                        let card = ProgramCard(
                            program: program,
                            membershipStatus: membershipStatus,
                            onAccept: membershipStatus == "invited" ? {
                                _ = Task<Void, Never> { await respondToInvite(program: program, accept: true) }
                            } : nil,
                            onDecline: (membershipStatus == "invited" || membershipStatus == "requested") ? {
                                _ = Task<Void, Never> { await respondToInvite(program: program, accept: false) }
                            } : nil
                        )

                        card
                        .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            guard canOpen else { return }
                            applyProgram(program)
                            programToOpen = program
                        }
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
                }

                // Bottom padding for floating button
                Color.clear
                    .frame(height: 90)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)

            // Header at top
            VStack {
                pickerHeader
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                Spacer()
            }

            // Floating action at bottom right
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    floatingProgramActionsButton
                        .padding(.trailing, 20)
                        .padding(.bottom, 24)
                }
            }

        }
        .navigationBarBackButtonHidden(true)
        .task {
            await loadPrograms()
            await programContext.loadPendingInvites()
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
            ProgramActionsSheet(onDismiss: {
                Task {
                    await loadPrograms()
                    await programContext.loadPendingInvites()
                }
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

    private var floatingProgramActionsButton: some View {
        Button {
            showProgramActions = true
        } label: {
            ZStack {
                Circle()
                    .fill(colorScheme == .dark ? Color(.white) : Color(.black))
                    .frame(width: 56, height: 56)
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(colorScheme == .dark ? .black : .white)

                if pendingInvitesCount > 0 {
                    Text("\(pendingInvitesCount)")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(.white)
                        .padding(5)
                        .background(Circle().fill(Color.appRed))
                        .offset(x: 18, y: -18)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Program actions")
    }

    private func deleteProgram(_ program: APIClient.ProgramDTO) async {
        guard let token = programContext.authToken else { return }
        isDeleting = true
        do {
            try await programContext.deleteProgram(programId: program.id)
            programToDelete = nil
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
            }
        }
        isDeleting = false
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

    // D-C1 (web parity): the error display the legacy iOS picker lacked — the
    // legacy set `errorMessage` but never rendered it, so load/delete/invite
    // failures were silently swallowed. The web /programs hub surfaces query
    // errors; this banner restores parity.
    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.footnote.weight(.semibold))
                .foregroundColor(.appRed)
            Text(message)
                .font(.footnote.weight(.semibold))
                .foregroundColor(.appRed)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.appRedLight)
        )
    }

    private func applyProgram(_ program: APIClient.ProgramDTO) {
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

    private func respondToInvite(program: APIClient.ProgramDTO, accept: Bool) async {
        do {
            let status = accept ? "active" : "removed"
            try await programContext.updateMembershipStatus(programId: program.id, status: status)
            await loadPrograms()
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func loadPrograms() async {
        guard let token = programContext.authToken, !token.isEmpty else {
            errorMessage = "Please log in to load programs."
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let programs = try await APIClient.shared.fetchPrograms(token: token)
            await MainActor.run {
                programContext.programs = programs
            }
        } catch {
            await MainActor.run {
                errorMessage = error.localizedDescription
            }
        }
        isLoading = false
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
                                    subtitle: "Sync workouts automatically"
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
    let onAccept: (() -> Void)?
    let onDecline: (() -> Void)?

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

            if isInvited || isRequested {
                HStack(spacing: 10) {
                    if let onAccept, isInvited {
                        Button(action: onAccept) {
                            Text("Accept")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(Color.appOrange))
                                .foregroundColor(.black)
                        }
                    }
                    if let onDecline {
                        Button(action: onDecline) {
                            Text(isRequested ? "Cancel request" : "Decline")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(Color(.systemGray5)))
                                .foregroundColor(Color(.label))
                        }
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

    private func membersSummary(_ program: APIClient.ProgramDTO) -> String {
        let active = program.active_members ?? 0
        let total = program.total_members ?? 0
        return "\(active) active / \(total) total members"
    }

    private func progressValue(_ program: APIClient.ProgramDTO) -> Double {
        let total = program.total_members ?? 0
        guard total > 0 else { return 0 }
        let active = program.active_members ?? 0
        return min(max(Double(active) / Double(total), 0), 1)
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
