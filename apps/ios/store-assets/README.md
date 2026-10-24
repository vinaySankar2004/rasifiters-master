# iOS store assets (App Store Connect)

Drop your exported images into the folders below using the **exact filenames**. The 8 screenshots are
the same set of screens as Android, so the story stays consistent across both stores.

## Folders and required sizes

| Folder | File(s) | Size / format |
|--------|---------|---------------|
| `icon/` | `icon.png` | 1024 x 1024 px, PNG, **no transparency**, no rounded corners (Apple adds them). |
| `iphone/` | the 8 screenshots below | Portrait **1284 x 2778 px** ("iPhone with Face ID, large display"; Apple scales it to the required medium size), PNG or JPEG. |
| `ipad/` | the 8 screenshots below | Landscape **2732 x 2048 px** (12.9" / 13" iPad), PNG or JPEG. |
| `duo-inner/` | the 8 screenshots below | Landscape **2853 x 2007 px** (iPhone Duo inner display, open), PNG. |
| `duo-outer/` | the 8 screenshots below | Portrait **1398 x 2034 px** (iPhone Duo outer display, closed), PNG. |

Tip: you can export the 1024 icon straight from `Assets.xcassets` (AppIcon).

iPhone Duo sets are optional today (they add the "optimized for iPhone Duo" badge) and required from April 2027
for apps built with the iOS 27.1 SDK or later. They are raw Xcode 27.1 iPhone Duo simulator captures (testbed login
`ava.rivera`, program "RaSi Winter Reset", 2026-10-24). To recapture: create + boot an `iPhone Duo` simulator on the
iOS 27.1 runtime, pin the status bar (`xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged
--batteryLevel 100`), fold / unfold it in **DeviceHub**, and save each display with `xcrun simctl io <udid>
screenshot --display=<uuid>` (`xcrun simctl io <udid> enumerate` lists the 1398-wide outer and 2007-wide inner
display UUIDs). App Store Connect rejects alpha channels: save as RGB.

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
