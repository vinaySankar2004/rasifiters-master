import SwiftUI

// Native reset-request screen — the iOS equivalent of the web /forgot-password page. Reached from the
// login screen's "Forgot your password?" link (previously a Safari hand-off). It only handles the REQUEST
// step: enter email → POST /auth/forgot-password → Supabase emails a link. The link itself still opens
// rasifiters.com/reset-password in the browser to set the new password (that page is now client-neutral).
//
// Parity with web (apps/web/src/app/forgot-password/page.tsx): always-generic confirmation (no account
// enumeration) + an always-visible "Contact us" mailto fallback for migrated no-email accounts.
struct ForgotPasswordView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    @State private var email: String = ""
    @State private var isLoading: Bool = false
    @State private var submitted: Bool = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            AppGradient.background(for: colorScheme)
                .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    BrandMark(size: 90)
                        .padding(.top, 10)
                        .padding(.bottom, 6)

                    VStack(alignment: .center, spacing: 10) {
                        Text("Reset your password")
                            .font(.title.bold())
                            .foregroundColor(Color(.label))

                        Text("Enter your email and we'll send you a link to reset it.")
                            .font(.callout.weight(.semibold))
                            .foregroundColor(Color(.secondaryLabel))
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, alignment: .center)

                    if submitted {
                        // Always-generic confirmation, shown regardless of whether the email exists.
                        Text("If an account with that email exists, we've sent a password reset link. Check your inbox (and your spam folder).")
                            .font(.callout.weight(.semibold))
                            .foregroundColor(.appGreen)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(Color.appGreen.opacity(0.12))
                            )
                    } else {
                        VStack(spacing: 16) {
                            VStack(alignment: .leading, spacing: 6) {
                                AppInputField(
                                    title: "Email",
                                    text: $email,
                                    keyboardType: .emailAddress
                                )
                                // Inline email-format hint (matches CreateAccountView / web D-C1).
                                if !email.isEmpty && !isEmailValid {
                                    Text("Enter a valid email address.")
                                        .font(.footnote)
                                        .foregroundColor(Color(.secondaryLabel))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }

                            if let errorMessage {
                                Text(errorMessage)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundColor(.red)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }

                        Button(action: { Task { await handleSubmit() } }) {
                            Group {
                                if isLoading {
                                    ProgressView()
                                        .progressViewStyle(.circular)
                                        .tint(colorScheme == .dark ? .black : .white)
                                } else {
                                    Text("Send reset link")
                                        .font(.headline.weight(.semibold))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .frame(maxWidth: 240)
                            .foregroundColor(colorScheme == .dark ? .black : .white)
                            .background(
                                Capsule()
                                    .fill(Color(.label))
                            )
                            .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .adaptiveShadow(radius: 8, y: 4)
                        .disabled(isLoading || !isEmailValid)
                    }

                    // Always-visible contact fallback — for migrated placeholder (no-email) accounts that
                    // can't receive a reset email at all. Shown in both the form and the submitted state.
                    VStack(spacing: 4) {
                        Text("No email on your account?")
                            .font(.footnote)
                            .foregroundColor(Color(.secondaryLabel))
                        Link("Contact us and we'll help you get back in.", destination: APIConfig.supportMailtoURL)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appOrange)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 4)

                    Button(action: { dismiss() }) {
                        Text("Back to login")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.appOrange)
                    }
                    .buttonStyle(.plain)

                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 20)
                .padding(.top, 40)
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                EmptyView()
            }
        }
    }

    private var isEmailValid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil
    }

    private func handleSubmit() async {
        guard !isLoading, isEmailValid else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await APIClient.shared.requestPasswordReset(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            // Always show the same generic confirmation regardless of the result (no enumeration).
            submitted = true
        } catch {
            // A genuine failure (network / 500) isn't account-existence info — surface a neutral message
            // and keep the contact fallback prominent.
            errorMessage = "We couldn't send the reset email just now. Please try again, or contact us below."
        }
    }
}

#Preview {
    NavigationStack {
        ForgotPasswordView()
    }
}
