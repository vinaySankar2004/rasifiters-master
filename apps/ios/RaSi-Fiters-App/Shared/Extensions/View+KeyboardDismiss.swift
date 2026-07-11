import SwiftUI
import UIKit

extension View {
    /// Dismisses the soft keyboard when the user taps outside the focused input.
    /// `.simultaneousGesture` never swallows taps meant for buttons / list rows /
    /// other controls — they still receive the tap.
    func dismissKeyboardOnTap() -> some View {
        simultaneousGesture(
            TapGesture().onEnded { hideKeyboard() }
        )
    }

    /// Adds a single keyboard-toolbar "Done" button that resigns first responder.
    /// Declare ONCE per NavigationStack root (not per-field) to avoid SwiftUI
    /// duplicating/dropping multiple `.keyboard`-placement toolbars.
    func keyboardDoneToolbar() -> some View {
        toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { hideKeyboard() }
            }
        }
    }
}

/// Resigns first responder app-wide (dismisses the keyboard for any TextField/SecureField).
func hideKeyboard() {
    UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder),
        to: nil, from: nil, for: nil
    )
}
