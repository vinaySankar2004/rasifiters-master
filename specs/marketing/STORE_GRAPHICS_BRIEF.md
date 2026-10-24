# Store graphics brief — captioned App Store + Google Play sets (for the vuhri agent)

> **What this is:** the exact spec for RaSi Fiters' store marketing images — one captioned frame per real app
> screenshot, in every size both stores show. vuhri generates the files into the folders below; uploading them to
> App Store Connect / Play Console happens with the release, on the user's go-ahead. Written 2026-10-24.

## 1. How the app should be seen

- **One line:** *Fitness programs, tracked together.* (the `rasifiters.com` hero — keep the stores and the site saying
  the same thing; source: `apps/web/src/components/landing/content.ts`).
- **Audience:** everyone who trains with a group — friends, families, clubs, coaches. Never "members only".
- **Voice:** plain, confident, short. Sentence case. US English. No exclamation marks.
- **Proof points, in priority order:** your group's progress at a glance → logging is fast → see each member's
  progress → trends → automatic Apple Health / Health Connect sync → roles for running a program → free, no ads.

## 2. Brand

| Item | Value |
|---|---|
| Name | **RaSi Fiters** (capital R, capital S, one "t") |
| Accent | `#ff8b1f` (strong `#ff7a00`) — use for one highlight per frame, never for body text |
| Text | headline `#111111`, subline `#646a76` |
| Background | vertical gradient `#fff4e8` (top) → `#ffffff` (bottom), plus one soft accent glow `#ff8b1f` at 10% opacity behind the screenshot |
| Icon | `apps/ios/store-assets/icon/icon.png` (orange circle, black bar-chart glyph) — use as-is, never redraw |
| Type | **SF Pro Display Bold** headlines, **SF Pro Text Regular** sublines (Inter Bold / Regular if SF isn't available — one family across every set) |

## 3. Hard rules (store compliance)

1. **Real screens only.** Place the raw capture unmodified inside the frame: no redrawn UI, edited numbers, invented
   features or mock data (App Store Review Guideline 2.3.3; Google Play metadata policy).
2. **No device bezels** — the screenshot as a rounded rectangle (corner radius = 5% of its width) with a soft shadow
   (y 24 px, blur 48 px, black 12%). This avoids showing one device's frame in another device's slot.
3. **Exact pixel sizes** from §5, **PNG, RGB, no alpha channel** (App Store Connect rejects transparency).
4. No rankings, awards, "best", "#1", prices other than "Free", or other brands' logos. "Apple Health" and
   "Health Connect" appear as text only.
5. Headline ≤ 6 words, subline ≤ 9 words; both readable at thumbnail size (headline cap height ≥ 4.5% of canvas
   height on portrait frames).

## 4. The 8 frames (store order = this order)

| # | Raw file (same name in every raw folder) | Headline | Subline |
|---|---|---|---|
| 1 | `03-summary.png` | Fitness programs, tracked together | See where your whole group stands. |
| 2 | `04-log-workout.png` | Log workouts in seconds | One session or many at once. |
| 3 | `05-member.png` | Follow member progress | Active days, workouts and favorite types. |
| 4 | `06-lifestyle.png` | Watch your trends build | Top workouts, longest sessions, participation. |
| 5 | `08-health-sync.png` | iOS: **Syncs with Apple Health** · Android: **Syncs with Health Connect** | Workouts, sleep and steps log themselves. |
| 6 | `02-programs.png` | Run or join programs | Every program you're in, one tap away. |
| 7 | `07-program.png` | You decide who does what | Admin, logger and member roles. |
| 8 | `01-splash.png` | Free. No ads. | Your data stays yours. |

**Portrait layout:** headline + subline centered in the top 22% (subline 16 px-per-1000 below the headline);
screenshot centered below, 80% of canvas width, bottom edge 4% above the canvas bottom.
**Landscape layout:** text left-aligned in the left 36% (vertically centered); screenshot in the right 60%, 4%
margin on the right.

## 5. Sets to produce

Raw input → output folder (output file names = `NN-<raw name>`, e.g. `01-03-summary.png`).

| Store | Slot (as named in the console) | Canvas (px) | Layout | Raw input | Output folder |
|---|---|---|---|---|---|
| App Store | iPhone with Dynamic Island, large display | **1320 × 2868** | portrait | `apps/ios/store-assets/iphone/` | `apps/ios/store-assets/marketing/iphone/` |
| App Store | iPad 13" display | **2752 × 2064** | landscape | `apps/ios/store-assets/ipad/` | `apps/ios/store-assets/marketing/ipad/` |
| App Store | iPhone Duo, inner display | **2853 × 2007** | landscape | `apps/ios/store-assets/duo-inner/` | `apps/ios/store-assets/marketing/duo-inner/` |
| App Store | iPhone Duo, outer display | **1398 × 2034** | portrait | `apps/ios/store-assets/duo-outer/` | `apps/ios/store-assets/marketing/duo-outer/` |
| Google Play | Phone | **1080 × 1920** | portrait | `apps/android/store-assets/phone/` | `apps/android/store-assets/marketing/phone/` |
| Google Play | 7-inch tablet | **1200 × 1920** | portrait | `apps/android/store-assets/tablet-7/` | `apps/android/store-assets/marketing/tablet-7/` |
| Google Play | 10-inch tablet | **1600 × 2560** | portrait | `apps/android/store-assets/tablet-10/` | `apps/android/store-assets/marketing/tablet-10/` |
| Google Play | Feature graphic | **1024 × 500** | — (below) | icon + copy | `apps/android/store-assets/marketing/feature-graphic.png` |

**Feature graphic (1024 × 500, no transparency, nothing important in the outer 10%):** the §2 background; the app
icon at 300 px high, vertically centered, left edge at x 96; to its right "RaSi Fiters" (SF Pro Display Bold 84 px,
`#111111`), a 64 × 6 px `#ff8b1f` rule, then "Fitness programs, tracked together." (SF Pro Text Regular 34 px,
`#646a76`). No screenshots, no other text.

## 6. Inputs that need fresh captures first

The Duo sets are current (2026-10-24). The **`iphone/`, `ipad/` and Android `phone/` / `tablet-7/` / `tablet-10/`
raw sets predate the People release** (2026-10-13): their Members header shows the old invite icon and the Program tab
reads "View Members". Recapture those five raw sets on the current builds (testbed login `ava.rivera`, program
"RaSi Winter Reset", 9:41 status bar) before generating frames from them, so the marketing shows today's app.

## 7. Done when

- Every folder in §5 holds 8 frames (feature graphic: 1 file) at the exact size, RGB PNG.
- A contact sheet of each set reads as one gallery: same background, type, screenshot scale and shadow.
- The raw captures are untouched; marketing files live only under `.../store-assets/marketing/`.
