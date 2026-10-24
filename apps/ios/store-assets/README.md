# iOS store assets (App Store Connect)

Drop your exported images into the folders below using the **exact filenames**. The 8 screenshots are
the same set of screens as Android, so the story stays consistent across both stores.

## Folders and required sizes

| Folder | File(s) | Size / format |
|--------|---------|---------------|
| `icon/` | `icon.png` | 1024 x 1024 px, PNG, **no transparency**, no rounded corners (Apple adds them). |
| `iphone/` | the 8 screenshots below | Portrait **1320 x 2868 px** ("iPhone with Dynamic Island, large display"; Apple scales it to the required medium size), PNG. |
| `ipad/` | the 8 screenshots below | Landscape **2752 x 2064 px** (13" iPad), PNG. |
| `duo-inner/` | the 8 screenshots below | Landscape **2853 x 2007 px** (iPhone Duo inner display, open), PNG. |
| `duo-outer/` | the 8 screenshots below | Portrait **1398 x 2034 px** (iPhone Duo outer display, closed), PNG. |
| `marketing/` | `iphone/`, `ipad/`, `duo-inner/`, `duo-outer/` — 8 captioned frames each (`NN-<raw name>.png`) | Same size as the matching raw folder, RGB PNG. **These are what get uploaded**, in file order. Generated from the raw sets — see the brief below. |

Tip: you can export the 1024 icon straight from `Assets.xcassets` (AppIcon).

iPhone Duo sets are optional today (they add the "optimized for iPhone Duo" badge) and required from April 2027
for apps built with the iOS 27.1 SDK or later. App Store Connect has **one** iPhone Duo slot (up to 10 screenshots,
either display's size), so the listing uses the 8 `duo-inner` frames; `duo-outer` is kept for reference.

Uploading (App Store Connect → the version → Media Manager): `marketing/iphone/` → *iPhone with Dynamic Island (large
display)* (the required medium size scales from it); `marketing/duo-inner/` → *iPhone Duo*; `marketing/ipad/` →
*iPad 13" display*. Upload → select all 8 — the `NN-` prefixes keep the order. `marketing/header.png` and
`marketing/search-results.png` go on the version page → *Header and Search Results* (one per tab; check **Preview**).

**How these were captured (all four sets, 2026-10-24):** raw simulator screenshots of the current build, testbed
login `ava.rivera`, program "RaSi Winter Reset", light mode, status bar pinned with `xcrun simctl status_bar <udid>
override --time 9:41 --batteryState discharging --batteryLevel 100`. iPhone 17 Pro Max + iPad Pro 13-inch (M5, turned
to landscape) run on the **iOS 27.0** runtime — Xcode 27.1's iOS 27.1 runtime supports only the iPhone Duo — so
download it for the session (`xcodebuild -downloadPlatform iOS -buildVersion 24A434`, ~8 GB) and delete it after. The
Duo is folded / unfolded in **DeviceHub**; save each Duo display with `xcrun simctl io <udid> screenshot
--display=<uuid>` (`xcrun simctl io <udid> enumerate` lists the 1398-wide outer and 2007-wide inner UUIDs). Save as
RGB — App Store Connect rejects alpha channels. Delete the simulators afterwards.

## The 8 screenshots (same filenames in every screenshot folder)

| File | Screen to capture |
|------|-------------------|
| `01-splash.png` | Splash / brand screen |
| `02-programs.png` | Your training programs list |
| `03-summary.png` | Progress dashboard (charts + month stats) |
| `04-log-workout.png` | Logging a workout |
| `05-member.png` | Member / group progress |
| `06-lifestyle.png` | Lifestyle trends and charts |
| `07-program.png` | Program management (admin view) |
| `08-health-sync.png` | **Apple Health** sync screen |

## Notes

- Captions, store order and the captioned marketing frames built from these raw captures:
  [`specs/marketing/STORE_GRAPHICS_BRIEF.md`](../../../specs/marketing/STORE_GRAPHICS_BRIEF.md).
- **Screenshot #1 is the most important** (it shows first in the listing). Order is controlled by how you
  arrange them in App Store Connect.
- App Store requires at least one screenshot per device size you support; supplying all 8 is recommended.
- Keep the same visual frame/style across all 8 so the set looks like one gallery.
