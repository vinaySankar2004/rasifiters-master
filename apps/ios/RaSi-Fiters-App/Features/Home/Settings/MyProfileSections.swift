import SwiftUI
import AuthenticationServices
import GoogleSignIn

// My Profile sections, moved out of MyProfileView (file size; People S3 also edits that view).

/// Sign-in methods (auth phase-2, D-C10). Polish #18: three states — while loading every row reads "—" with its
/// button disabled, a failed load shows "Couldn't load · Retry", then the real rows (never a false "Not linked" + Link).
struct SignInMethodsSection: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var state: LoadState<IdentitiesResponse> = .idle
    @State private var linkError: String?
    @State private var isLinking = false
    @State private var showPasswordForm = false
    @State private var newAccountPassword = ""
    @State private var isSettingPassword = false
    @State private var hadUnconfirmedSetPassword = false
    @State private var showPasswordSetNotice = false

    private var identities: [IdentitiesResponse.Identity] { state.value?.identities ?? [] }
    private var isLoaded: Bool { state.value != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
            Text("Sign-in methods").font(.subheadline.weight(.semibold))

            if case .failed(let error) = state {
                ErrorStateView(error: error.labeled(online: programContext.isOnline), onRetry: { Task { await load() } })
            } else {
                providerRow(provider: "google", label: "Google")
                providerRow(provider: "apple", label: "Apple")
                passwordRow
            }

            if showPasswordSetNotice {
                Text(SessionCopy.passwordSet)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appGreen)
            }

            if showPasswordForm && state.value?.hasPassword == false {
                AppInputField(title: "New password", text: $newAccountPassword, isSecure: true, contentType: .newPassword)
                Text("At least 8 characters with an uppercase, a lowercase, and a number.")
                    .font(.caption).foregroundColor(Color(.tertiaryLabel))
                AppPrimaryButton(title: "Save password", isLoading: isSettingPassword) {
                    Task { await addPassword() }
                }.frame(maxWidth: .infinity).disabled(!isNewPasswordValid || isSettingPassword)
            }

            if let linkError {
                Text(linkError).font(.footnote.weight(.semibold)).foregroundColor(.appRed)
            }
        }
        .task { await load() }
        .onChange(of: programContext.isOnline) { _, online in
            if online, state.error != nil { Task { await load() } }          // D-IOS-KIT-3: refetch on reconnect
        }
    }

    private var passwordRow: some View {
        let hasPassword = state.value?.hasPassword
        return HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Password").font(.subheadline.weight(.semibold))
                Text(hasPassword.map { $0 ? "Enabled" : "Not set" } ?? "—")
                    .font(.subheadline).foregroundColor(Color(.secondaryLabel))
            }
            Spacer()
            if hasPassword == false {
                Button(showPasswordForm ? "Cancel" : "Add password") {
                    showPasswordForm.toggle(); linkError = nil; newAccountPassword = ""
                }.font(.footnote.weight(.semibold)).foregroundColor(.appOrange)
            }
        }
    }

    @ViewBuilder
    private func providerRow(provider: String, label: String) -> some View {
        let identity = identities.first { $0.provider == provider }
        let linked = identity != nil
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.subheadline.weight(.semibold))
                Text(isLoaded ? (linked ? (identity?.email ?? "Linked") : "Not linked") : "—")
                    .font(.subheadline).foregroundColor(Color(.secondaryLabel)).lineLimit(1).truncationMode(.middle)
            }
            Spacer()
            Button(linked ? "Unlink" : "Link") {
                Task { await toggleProvider(provider, linked: linked) }
            }
            .font(.footnote.weight(.semibold))
            .foregroundColor(.appOrange)
            .disabled(!isLoaded || isLinking || (linked && identities.count <= 1))
        }
    }

    private var isNewPasswordValid: Bool {
        newAccountPassword.range(of: "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,}$", options: .regularExpression) != nil
    }

    /// The kit load step (polish #29's helper rule) — a Retry keeps the rows (stale); a cancelled load changes nothing.
    private func load() async {
        state = state.refreshing()
        guard let outcome = await loadOutcome({ try await programContext.fetchIdentities() }) else { return }
        state = state.applying(outcome)
    }

    private func toggleProvider(_ provider: String, linked: Bool) async {
        isLinking = true; linkError = nil
        defer { isLinking = false }
        do {
            if linked {
                state = .fresh(try await programContext.unlink(provider: provider))
            } else {
                state = .fresh(try await (provider == "apple" ? programContext.linkApple() : programContext.linkGoogle()))
            }
        } catch {
            if !isCancellation(error) { linkError = SessionCopy.credentialMessage(for: error) }   // A8
        }
    }

    /// auth §3.1 rule 6 for set-password: never auto-retried; "couldn't confirm" after a 503 / 5xx / timeout; a
    /// same-password 400 on the manual retry means the earlier attempt landed. Other errors → kit copy (A8).
    private func addPassword() async {
        isSettingPassword = true; linkError = nil; showPasswordSetNotice = false
        defer { isSettingPassword = false }
        do {
            state = .fresh(try await programContext.setPassword(newPassword: newAccountPassword))
            passwordSetDone()
        } catch {
            if hadUnconfirmedSetPassword, let http = error as? APIHTTPError, http.statusCode == 400,
               http.message == SessionCopy.samePassword {
                await load()                                             // rule 6: the earlier attempt landed
                passwordSetDone()
            } else if SessionCopy.isUnconfirmedWrite(error) {
                hadUnconfirmedSetPassword = true
                linkError = SessionCopy.passwordUnconfirmed
            } else {
                linkError = SessionCopy.kitMessage(for: error)
            }
        }
    }

    private func passwordSetDone() {
        showPasswordForm = false
        newAccountPassword = ""
        hadUnconfirmedSetPassword = false
        showPasswordSetNotice = true
    }

    private func isCancellation(_ error: Error) -> Bool {
        (error as? ASAuthorizationError)?.code == .canceled || (error as? GIDSignInError)?.code == .canceled
    }
}

/// Delete Account (store reviewers try it — polish #15): a spinner on the button while it runs, and any failure in plain
/// words right under it, above the caption — its own slot, never the profile form's error line far up the page.
struct DeleteAccountSection: View {
    @EnvironmentObject var programContext: ProgramContext
    @State private var showConfirmation = false
    @State private var isDeleting = false
    @State private var deleteError: String?

    var body: some View {
        VStack(spacing: 8) {
            Divider()
                .padding(.bottom, 8)

            AppDestructiveButton(title: "Delete Account", isLoading: isDeleting) {
                deleteError = nil
                showConfirmation = true
            }
            .disabled(isDeleting)

            if let deleteError {
                Text(deleteError)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.appRed)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }

            Text("This will permanently delete your account and all associated data.")
                .font(.caption)
                .foregroundColor(Color(.tertiaryLabel))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
        .padding(.top, 20)
        .alert("Delete Account?", isPresented: $showConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                Task { await deleteAccount() }
            }
        } message: {
            Text("This action cannot be undone. All your data, including workout logs, health logs, and program memberships will be permanently deleted.")
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        deleteError = nil
        do {
            try await programContext.deleteAccount()   // success → the teardown → the sign-in screen
        } catch {
            deleteError = SessionCopy.kitMessage(for: error)
            isDeleting = false
        }
    }
}
