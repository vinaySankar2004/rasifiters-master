import SwiftUI

struct AppInputField: View {
    let title: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .never
    /// Polish #35: the autofill hint (password managers / iCloud Keychain). The "@" keyboard is `keyboardType`.
    var contentType: UITextContentType? = nil
    var accessory: AnyView? = nil

    var body: some View {
        HStack {
            if isSecure {
                SecureField(title, text: $text)
                    .textContentType(contentType)
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
                    .submitLabel(.done)
            } else {
                TextField(title, text: $text)
                    .keyboardType(keyboardType)
                    .textContentType(contentType)
                    .textInputAutocapitalization(autocapitalization)
                    .disableAutocorrection(true)
                    .submitLabel(.done)
            }

            if let accessory {
                accessory
            }
        }
        .padding(.horizontal, AppSpacing.mdl)
        .padding(.vertical, AppSpacing.md)
        .background(
            RoundedRectangle(cornerRadius: AppCornerRadius.md, style: .continuous)
                .stroke(Color(.systemGray3), lineWidth: 1)
        )
    }
}

struct AppPasswordToggleButton: View {
    @Binding var isVisible: Bool

    var body: some View {
        Button(action: { isVisible.toggle() }) {
            Image(systemName: isVisible ? "eye.slash" : "eye")
                .foregroundColor(Color(.secondaryLabel))
                .minTapTarget()
        }
        // Polish #36: the 44-pt hit area sits inside the field's own padding — the field's height and the eye's
        // position don't change.
        .padding(.vertical, -AppSpacing.md)
        .padding(.trailing, -AppSpacing.md)
        .accessibilityLabel(isVisible ? "Hide password" : "Show password")
    }
}
