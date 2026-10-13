import SwiftUI

// MARK: - Inbox · invitations section (D-N4)

/// The Inbox's first section: pending invitations with their actions — Accept / Decline (+ Block future invites) for the
/// invitee, every pending invite + Revoke for global admins (amendment A10). Presentational: InboxView loads the
/// invites (GET /my-invites | /all-invites) and runs the actions. Hidden while there's nothing to show.
struct InboxInvitesSection: View {
    let invites: [APIClient.PendingInviteDTO]
    let isGlobalAdmin: Bool
    /// The last invites load failed (labeled) — the kit error view, only when there's no list to show. InboxView passes
    /// nil while the notification list itself has failed (one error view per screen).
    let loadError: AppError?
    /// An accept / decline / revoke is in flight.
    let isBusy: Bool
    let onRetry: () -> Void
    let onAccept: (APIClient.PendingInviteDTO) -> Void
    let onDecline: (APIClient.PendingInviteDTO) -> Void
    let onRevoke: (APIClient.PendingInviteDTO) -> Void

    var body: some View {
        if !invites.isEmpty || loadError != nil {
            VStack(alignment: .leading, spacing: 12) {
                Text(isGlobalAdmin ? InboxCopy.allInvitationsHeader : InboxCopy.invitationsHeader)
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.label))
                    .padding(.horizontal, 20)
                if invites.isEmpty, let loadError {
                    // W7 i10: a failed load is never "no invitations".
                    ErrorStateView(error: loadError, onRetry: onRetry)
                        .padding(.horizontal, 20)
                } else if isGlobalAdmin {
                    adminInvitesList
                } else {
                    standardInvitesList
                }
            }
            .disabled(isBusy)
            .opacity(isBusy ? 0.6 : 1)
        }
    }

    private var standardInvitesList: some View {
        VStack(spacing: 12) {
            ForEach(invites) { invite in
                InviteCard(
                    invite: invite,
                    isAdmin: false,
                    onAccept: { onAccept(invite) },
                    onDecline: { onDecline(invite) },
                    onRevoke: nil
                )
            }
        }
        .padding(.horizontal, 20)
    }

    private var adminInvitesList: some View {
        VStack(spacing: 16) {
            // Grouped by program
            let groupedInvites = Dictionary(grouping: invites) { $0.program_name ?? "Unknown Program" }
            ForEach(groupedInvites.keys.sorted(), id: \.self) { programName in
                if let programInvites = groupedInvites[programName] {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(programName)
                            .font(.headline.weight(.semibold))
                            .foregroundColor(Color(.label))
                            .padding(.horizontal, 20)
                        ForEach(programInvites) { invite in
                            InviteCard(
                                invite: invite,
                                isAdmin: true,
                                onAccept: { onAccept(invite) },
                                onDecline: { onDecline(invite) },
                                onRevoke: { onRevoke(invite) }
                            )
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
        }
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
