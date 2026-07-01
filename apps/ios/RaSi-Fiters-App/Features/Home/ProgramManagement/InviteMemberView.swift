import SwiftUI

// MARK: - Invite Member (run 62)
// Faithful 1:1 port of ios-mobile Features/Home/Helpers/AdminHomeHelpers.swift `InviteMemberView`.
// SHARED: also the "Invite" nav target of the ported AdminMembersTab (run 55) — this port removes the
// shared deferred stub and lights up both entry points.
//
// LOAD-BEARING (kept faithful, matches web /members/invite F1): the send is PRIVACY-PRESERVING — on any
// non-network failure (username not found / already invited / blocked / 403) it shows SUCCESS with the
// field cleared, so the screen never confirms whether a username exists. NEVER surface the real error here.
// Cleanup (run 62): clear-stale-error-on-edit (web members/invite D-C2) + tokenize the info-note blue.

struct InviteMemberView: View {
    @EnvironmentObject var programContext: ProgramContext
    @Environment(\.dismiss) private var dismiss

    @State private var username: String = ""
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var showSuccessToast = false

    private var isFormValid: Bool {
        !username.trimmingCharacters(in: .whitespaces).isEmpty &&
        programContext.programId != nil
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    usernameField
                    infoNote

                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundColor(.appRed)
                            .font(.footnote.weight(.semibold))
                    }

                    sendButton
                }
                .padding(20)
            }

            if showSuccessToast {
                successToast
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 16)
            }
        }
        .adaptiveBackground(topLeading: true)
        .navigationTitle("Invite Member")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Invite member")
                .font(.title2.weight(.bold))
                .foregroundColor(Color(.label))
            Text("Enter the exact username of the person you want to invite to this program.")
                .font(.subheadline)
                .foregroundColor(Color(.secondaryLabel))
        }
    }

    private var usernameField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Username")
                .font(.subheadline.weight(.semibold))
            HStack {
                Text("@")
                    .foregroundColor(Color(.tertiaryLabel))
                    .font(.body.weight(.medium))
                TextField("username", text: $username)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .keyboardType(.asciiCapable)
                if !username.isEmpty {
                    Button {
                        username = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Color(.tertiaryLabel))
                    }
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        // Cleanup (run 62): clear a stale error when the user edits the username (web members/invite D-C2).
        .onChange(of: username) { errorMessage = nil }
    }

    private var infoNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "info.circle.fill")
                .foregroundColor(.appBlue)
                .font(.subheadline)
            Text("The user must have an account to receive the invitation. They will see your invite in their pending invitations.")
                .font(.caption)
                .foregroundColor(Color(.secondaryLabel))
        }
        .padding(12)
        .background(Color.appBlue.opacity(0.08))
        .cornerRadius(10)
    }

    private var sendButton: some View {
        Button(action: { Task { await sendInvite() } }) {
            if isSending {
                ProgressView()
                    .tint(.black)
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "paperplane.fill")
                    Text("Send Invitation")
                        .font(.headline.weight(.semibold))
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(isFormValid ? Color.appOrange : Color(.systemGray3))
        .foregroundColor(.black)
        .cornerRadius(14)
        .disabled(!isFormValid || isSending)
    }

    private func sendInvite() async {
        guard let token = programContext.authToken,
              let programId = programContext.programId else { return }

        isSending = true
        errorMessage = nil
        showSuccessToast = false

        do {
            let trimmedUsername = username.trimmingCharacters(in: .whitespacesAndNewlines)
            _ = try await APIClient.shared.sendProgramInvite(
                token: token,
                programId: programId,
                username: trimmedUsername
            )

            // Always show success (privacy-preserving)
            showSuccessToast = true
            username = ""
            scheduleToastDismiss()

        } catch {
            // Even on error, show success for privacy
            // But if it's a network error, show that
            if error.localizedDescription.contains("network") ||
               error.localizedDescription.contains("connection") {
                errorMessage = "Network error. Please try again."
            } else {
                showSuccessToast = true
                username = ""
                scheduleToastDismiss()
            }
        }

        isSending = false
    }

    private var successToast: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.appGreen)
            Text("Invite sent")
                .foregroundColor(Color(.label))
                .font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(.systemGray6))
        .cornerRadius(999)
        .shadow(color: Color.black.opacity(0.15), radius: 6, x: 0, y: 3)
    }

    private func scheduleToastDismiss() {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            withAnimation {
                showSuccessToast = false
            }
        }
    }
}
