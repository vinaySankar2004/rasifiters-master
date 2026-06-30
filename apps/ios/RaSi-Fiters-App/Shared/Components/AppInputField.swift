import SwiftUI

struct AppInputField: View {
    let title: String
    @Binding var text: String
    var isSecure: Bool = false
    var accessory: AnyView? = nil

    var body: some View {
        HStack {
            if isSecure {
                SecureField(title, text: $text)
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
            } else {
                TextField(title, text: $text)
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
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
        }
    }
}
