import SwiftUI

struct SearchablePickerSheet: View {
    let title: String
    let options: [PickerOption]
    let selectedId: String?
    /// Polish #16: what an EMPTY list says — never a blank sheet. nil = no hint (still loading, or a filter sheet).
    var emptyHint: String? = nil
    let onSelect: (PickerOption) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    struct PickerOption: Identifiable {
        let id: String
        let label: String
    }

    var body: some View {
        NavigationStack {
            List {
                // Polish #16: an empty list says why (once known); a search with no match says so.
                if options.isEmpty {
                    if let emptyHint { hintRow(emptyHint) }
                } else if filtered.isEmpty {
                    hintRow("No results")
                }

                ForEach(filtered) { option in
                    Button {
                        onSelect(option)
                        dismiss()
                    } label: {
                        HStack {
                            Text(option.label)
                                .foregroundColor(Color(.label))
                            Spacer()
                            if option.id == selectedId {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.appOrange)
                            }
                        }
                    }
                }
            }
            .searchable(text: $search, prompt: "Search")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func hintRow(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundColor(Color(.secondaryLabel))
    }

    private var filtered: [PickerOption] {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return options }
        return options.filter { $0.label.lowercased().contains(q) }
    }
}
