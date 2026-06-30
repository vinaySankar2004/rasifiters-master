import SwiftUI

// MARK: - Invite Card

struct InviteCard: View {
    let invite: APIClient.PendingInviteDTO
    let isAdmin: Bool
    let onAccept: () -> Void
    let onDecline: () -> Void
    let onRevoke: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme

    private var statusColor: Color {
        switch (invite.program_status ?? "").lowercased() {
        case "completed": return .appGreen
        case "planned": return .appBlue
        case "active": return .appOrange
        default: return .appOrange
        }
    }

    private var dateRangeText: String {
        let formatterIn = DateFormatter()
        formatterIn.dateFormat = "yyyy-MM-dd"
        let formatterOut = DateFormatter()
        formatterOut.dateFormat = "MMM d, yyyy"

        let start = invite.program_start_date.flatMap { formatterIn.date(from: $0) }.map { formatterOut.string(from: $0) } ?? "Start"
        let end = invite.program_end_date.flatMap { formatterIn.date(from: $0) }.map { formatterOut.string(from: $0) } ?? "End"
        return "\(start) – \(end)"
    }

    private var invitedAtText: String {
        guard let invitedAt = invite.invited_at else { return "" }

        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let displayFormatter = DateFormatter()
        displayFormatter.dateFormat = "MMM d, yyyy"

        if let date = isoFormatter.date(from: invitedAt) {
            return "Invited on \(displayFormatter.string(from: date))"
        }

        isoFormatter.formatOptions = [.withInternetDateTime]
        if let date = isoFormatter.date(from: invitedAt) {
            return "Invited on \(displayFormatter.string(from: date))"
        }

        return "Invited recently"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header row
            HStack {
                if !isAdmin {
                    Text(invite.program_name ?? "Unknown Program")
                        .font(.headline.weight(.semibold))
                        .foregroundColor(Color(.label))
                }
                Spacer()
                if let status = invite.program_status {
                    StatusPill(text: status, color: statusColor)
                }
            }

            // Admin view: Show who the invite is TO
            if isAdmin, let inviteeName = invite.invited_member_name ?? invite.invited_username {
                HStack(spacing: 4) {
                    Text("To:")
                        .foregroundColor(Color(.secondaryLabel))
                    Text(inviteeName)
                        .foregroundColor(Color(.label))
                    if let username = invite.invited_username, invite.invited_member_name != nil {
                        Text("@\(username)")
                            .foregroundColor(Color(.tertiaryLabel))
                    }
                }
                .font(.subheadline.weight(.medium))
            }

            // Date range
            Text(dateRangeText)
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))

            // Invited by and date
            HStack {
                if let invitedBy = invite.invited_by_name {
                    Text("Invited by \(invitedBy)")
                        .font(.footnote)
                        .foregroundColor(Color(.tertiaryLabel))
                }
                Spacer()
                Text(invitedAtText)
                    .font(.footnote)
                    .foregroundColor(Color(.tertiaryLabel))
            }

            // Action buttons
            HStack(spacing: 10) {
                Button(action: onAccept) {
                    Text("Accept")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(Color.appOrange))
                        .foregroundColor(.black)
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)

                Button(action: onDecline) {
                    Text("Decline")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(Color(.systemGray5)))
                        .foregroundColor(Color(.label))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)

                if isAdmin, let onRevoke {
                    Button(action: onRevoke) {
                        Text("Revoke")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 10)
                            .background(Capsule().stroke(Color.appRed, lineWidth: 1.5))
                            .foregroundColor(.appRed)
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }

                Spacer()
            }
            .padding(.top, 4)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.appBackgroundSecondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.appOrange.opacity(0.3), lineWidth: 1)
        )
    }
}
