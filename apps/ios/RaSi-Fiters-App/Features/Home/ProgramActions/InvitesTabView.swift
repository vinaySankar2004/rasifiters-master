import SwiftUI

// MARK: - Invites Tab View

struct InvitesTabView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.colorScheme) private var colorScheme

    let onAccepted: () -> Void

    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var loadError: AppError?
    @State private var inviteToDecline: APIClient.PendingInviteDTO?
    @State private var showDeclineConfirmation = false
    @State private var blockFutureInvites = false

    private var isGlobalAdmin: Bool {
        programContext.isGlobalAdmin
    }

    private var headerTitle: String {
        isGlobalAdmin ? "All Program Invitations" : "Program Invitations"
    }

    private var headerSubtitle: String {
        isGlobalAdmin ? "Manage invites across all programs" : "Accept invitations to join programs"
    }

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 4) {
                        Text(headerTitle)
                            .font(.title2.weight(.bold))
                            .foregroundColor(Color(.label))
                        Text(headerSubtitle)
                            .font(.subheadline)
                            .foregroundColor(Color(.secondaryLabel))
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)

                    // Content
                    if isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                        .padding(.top, 40)
                    } else if let loadError, programContext.pendingInvites.isEmpty {
                        // W7 i10: a failed inbox load is never "No pending invitations".
                        ErrorStateView(error: loadError, onRetry: { Task { await refreshInvites() } })
                            .padding(.horizontal, 20)
                            .padding(.top, 20)
                    } else if programContext.pendingInvites.isEmpty {
                        emptyState
                            .padding(.horizontal, 20)
                            .padding(.top, 20)
                    } else {
                        // Invites list
                        if isGlobalAdmin {
                            adminInvitesList
                        } else {
                            standardInvitesList
                        }
                    }

                    Spacer(minLength: staleBanner == nil ? 40 : 104)      // A6: the banner never covers the last card
                }
            }

            if showDeclineConfirmation, let invite = inviteToDecline {
                DeclineInviteDialog(
                    programName: invite.program_name ?? "this program",
                    blockFutureInvites: $blockFutureInvites,
                    onDecline: {
                        Task {
                            await respondToInvite(invite, action: "decline", blockFuture: blockFutureInvites)
                        }
                    },
                    onCancel: {
                        inviteToDecline = nil
                        blockFutureInvites = false
                        showDeclineConfirmation = false
                    }
                )
                .transition(.opacity)
            }
        }
        .task {
            await refreshInvites()
        }
        .alert("Unable to update invitation", isPresented: Binding(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
        // A sheet covers the root offline banner, so this screen's banner shows on its own here.
        .floatingBanner {
            if let staleBanner { staleBanner }
        }
    }

    /// A failed refresh over a list we still show → "Couldn't refresh" + Retry (frontend-kit §6).
    private var staleBanner: FloatingBanner? {
        guard loadError != nil, !programContext.pendingInvites.isEmpty else { return nil }
        return FloatingBanner(variant: .stale, onRetry: { Task { await refreshInvites() } })
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "envelope.open")
                .font(.system(size: 40))
                .foregroundColor(Color(.tertiaryLabel))
            Text("No pending invitations")
                .font(.headline.weight(.semibold))
                .foregroundColor(Color(.label))
            Text(isGlobalAdmin ? "There are no pending invites in the system." : "You don't have any program invitations right now.")
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 20)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(.systemGray6))
        )
    }

    private var standardInvitesList: some View {
        VStack(spacing: 12) {
            ForEach(programContext.pendingInvites) { invite in
                InviteCard(
                    invite: invite,
                    isAdmin: false,
                    onAccept: {
                        Task { await respondToInvite(invite, action: "accept") }
                    },
                    onDecline: {
                        inviteToDecline = invite
                        showDeclineConfirmation = true
                    },
                    onRevoke: nil
                )
            }
        }
        .padding(.horizontal, 20)
    }

    private var adminInvitesList: some View {
        VStack(spacing: 16) {
            // Group invites by program
            let groupedInvites = Dictionary(grouping: programContext.pendingInvites) { $0.program_name ?? "Unknown Program" }
            let sortedKeys = groupedInvites.keys.sorted()

            ForEach(sortedKeys, id: \.self) { programName in
                if let invites = groupedInvites[programName] {
                    VStack(alignment: .leading, spacing: 10) {
                        // Program header
                        Text(programName)
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                            .padding(.horizontal, 20)

                        // Invites for this program
                        ForEach(invites) { invite in
                            InviteCard(
                                invite: invite,
                                isAdmin: true,
                                onAccept: {
                                    Task { await respondToInvite(invite, action: "accept") }
                                },
                                onDecline: {
                                    inviteToDecline = invite
                                    showDeclineConfirmation = true
                                },
                                onRevoke: {
                                    Task { await respondToInvite(invite, action: "revoke") }
                                }
                            )
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
        }
    }

    /// Spinner only with nothing to show; a failure keeps any list (stale banner) or shows the kit error view.
    private func refreshInvites() async {
        isLoading = programContext.pendingInvites.isEmpty
        defer { isLoading = false }
        do {
            try await programContext.loadPendingInvites()
            loadError = nil
        } catch {
            loadError = AppError(error)
        }
    }

    private func respondToInvite(_ invite: APIClient.PendingInviteDTO, action: String, blockFuture: Bool = false) async {
        isLoading = true
        errorMessage = nil

        do {
            _ = try await programContext.respondToInvite(
                inviteId: invite.invite_id,
                action: action,
                blockFuture: blockFuture
            )

            if action == "accept" {
                onAccepted()
            }
        } catch {
            errorMessage = AppError(error)?.message           // kit copy (a 400 keeps the server's text)
        }

        inviteToDecline = nil
        blockFutureInvites = false
        showDeclineConfirmation = false
        isLoading = false
    }
}

struct DeclineInviteDialog: View {
    let programName: String
    @Binding var blockFutureInvites: Bool
    let onDecline: () -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.45)
                .ignoresSafeArea()
                .onTapGesture {
                    onCancel()
                }

            VStack(spacing: 18) {
                VStack(spacing: 6) {
                    Text("Decline invitation?")
                        .font(.title3.weight(.bold))
                        .foregroundColor(Color(.label))
                    Text(programName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(.secondaryLabel))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 8)
                }

                Button {
                    blockFutureInvites.toggle()
                } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .strokeBorder(blockFutureInvites ? Color.appOrange : Color(.tertiaryLabel), lineWidth: 1.5)
                                .background(
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(blockFutureInvites ? Color.appOrange.opacity(0.15) : Color.clear)
                                )
                                .frame(width: 22, height: 22)
                            if blockFutureInvites {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(.appOrange)
                            }
                        }
                        Text("Block future invites")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(Color(.label))
                            .lineLimit(1)
                            .minimumScaleFactor(0.9)
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 12)
                    .padding(.horizontal, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color(.systemGray6))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(blockFutureInvites ? Color.appOrange.opacity(0.6) : Color.clear, lineWidth: 1)
                    )
                }
                .contentShape(Rectangle())
                .buttonStyle(.plain)

                VStack(spacing: 10) {
                    Button(role: .destructive) {
                        onDecline()
                    } label: {
                        Text("Decline")
                            .font(.headline.weight(.semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color.appRed)
                            )
                    }

                    Button {
                        onCancel()
                    } label: {
                        Text("Cancel")
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color(.systemGray5))
                            )
                    }
                }
            }
            .padding(.horizontal, 22)
            .padding(.vertical, 20)
            .background(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(Color(.systemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(Color(.separator).opacity(0.25), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.18), radius: 24, x: 0, y: 12)
            .padding(.horizontal, 28)
        }
        .accessibilityElement(children: .contain)
    }
}
