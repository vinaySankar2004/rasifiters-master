// Single source of truth for the gender options, shared by the create-account and profile pages so the
// two never drift. Values are stored verbatim in members.gender (varchar(32) — wide enough for the
// longest option). Faithful to the legacy option set.
export const GENDER_OPTIONS = [
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
  { value: "Non-binary", label: "Non-binary" },
  { value: "Prefer not to say", label: "Prefer not to say" }
] as const;
