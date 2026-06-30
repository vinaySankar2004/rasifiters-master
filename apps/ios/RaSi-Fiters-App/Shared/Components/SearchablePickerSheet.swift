import SwiftUI

struct SearchablePickerSheet: View {
    let title: String
    let options: [PickerOption]
    let selectedId: String?
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

    private var filtered: [PickerOption] {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return options }
        return options.filter { $0.label.lowercased().contains(q) }
    }
}
