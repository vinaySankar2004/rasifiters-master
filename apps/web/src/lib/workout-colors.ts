// Color-codes each workout type by name, matching the iOS app so the web "Workout Types"
// card + detail page read identically to the iOS screenshots.
//
// Ported 1:1 from iOS:
//   - palette: apps/ios/RaSi-Fiters-App/Shared/Theme/AppTheme.swift (chartPalette)
//   - rule:    apps/ios/RaSi-Fiters-App/Shared/Components/WorkoutPopularityLogic.swift
//              -> abs(djb2(name)) % 12, computed in 64-bit Int math
//   - "Others": special-cased to grey (iOS Color(.systemGray3)), never hashed.
//
// NOTE: iOS hashes in 64-bit and Android in 32-bit, so they disagree on most colors. Web matches
// iOS (the reference screenshots), which requires reproducing 64-bit wraparound arithmetic via BigInt.

const WORKOUT_TYPE_PALETTE = [
  "#F29900", // 0  orange
  "#0099E6", // 1  blue
  "#33B34D", // 2  green
  "#9959CC", // 3  purple
  "#F24D59", // 4  red
  "#0DBFB3", // 5  teal
  "#F273B3", // 6  pink
  "#5973E6", // 7  indigo
  "#D98C26", // 8  amber
  "#8CCC33", // 9  lime
  "#1A8C80", // 10 dark-teal
  "#CC3380"  // 11 magenta
] as const;

// iOS: "Others" rolls up as Color(.systemGray3); use a neutral grey readable on the dark surface.
const OTHERS_COLOR = "#C7C7CC";

const MASK_64 = (1n << 64n) - 1n;

export function workoutTypeColor(name: string): string {
  if (name === "Others") return OTHERS_COLOR;

  // djb2 with 64-bit wraparound, iterating Unicode scalars (codePointAt) to match iOS.
  let hash = 5381n;
  for (const ch of name) {
    hash = ((hash << 5n) + hash + BigInt(ch.codePointAt(0)!)) & MASK_64;
  }
  if (hash >> 63n) hash -= 1n << 64n; // interpret the low 64 bits as a signed 64-bit Int (Swift Int)

  const idx = Number((hash < 0n ? -hash : hash) % BigInt(WORKOUT_TYPE_PALETTE.length));
  return WORKOUT_TYPE_PALETTE[idx];
}
