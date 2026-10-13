import SwiftUI

/// Kudos on a profile (D-P4 · D-P5): one per person per their local day, a count only (no text). One toggle: Give kudos
/// ↔ Kudos given (tapping again undoes today's). POST answers the count; DELETE answers only `removed` (People §E — no
/// count), so an undo decrements locally.
struct KudosButton: View {
    let memberId: String
    let programId: String
    /// 403 activity_hidden: the member hid their activity meanwhile — the profile re-fetches.
    let onHidden: () -> Void
    @State private var kudos: APIClient.KudosSummaryDTO
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(memberId: String, programId: String, kudos: APIClient.KudosSummaryDTO, onHidden: @escaping () -> Void) {
        self.memberId = memberId
        self.programId = programId
        self.onHidden = onHidden
        _kudos = State(initialValue: kudos)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Image(systemName: "hands.clap.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(.appOrange)
                    .accessibilityHidden(true)
                Text(PeopleCopy.kudosCount(kudos.count))
                    .font(.headline.weight(.semibold))
                    .foregroundColor(Color(.label))
                Spacer(minLength: 8)
                if kudos.canGive { toggleButton }
            }
            if kudos.canGive, kudos.givenToday {
                Text(PeopleCopy.kudosGivenHint)
                    .font(.caption)
                    .foregroundColor(Color(.secondaryLabel))
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PeopleCardBackground())
    }

    private var toggleButton: some View {
        Button {
            Task { await toggle() }
        } label: {
            HStack(spacing: 6) {
                if isSaving {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: kudos.givenToday ? "hands.clap.fill" : "hands.clap")
                }
                Text(kudos.givenToday ? PeopleCopy.kudosGiven : PeopleCopy.giveKudos)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundColor(kudos.givenToday ? .appOrange : Color(.systemBackground))
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .background(Capsule().fill(kudos.givenToday ? Color.appOrangeLight : Color(.label)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isSaving)
        .accessibilityHint(kudos.givenToday ? PeopleCopy.kudosGivenHint : "")
    }

    private func toggle() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            if kudos.givenToday {
                let result = try await APIClient.shared.undoKudos(memberId: memberId)
                if result.removed { kudos.count = max(kudos.count - 1, 0) }
                kudos.givenToday = result.givenToday
            } else {
                let result = try await APIClient.shared.giveKudos(memberId: memberId, programId: programId)
                kudos.count = result.count
                kudos.givenToday = result.givenToday
            }
        } catch let error as APIHTTPError where error.code == "activity_hidden" {
            onHidden()
        } catch let error as APIHTTPError where error.statusCode == 429 {
            errorMessage = PeopleCopy.kudosLimit                          // the kudos 429 rule
        } catch {
            errorMessage = SessionCopy.kitMessage(for: error)
        }
    }
}
