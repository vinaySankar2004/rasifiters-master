# iOS store assets (App Store Connect)

Drop your exported images into the folders below using the **exact filenames**. The 8 screenshots are
the same set of screens as Android, so the story stays consistent across both stores.

## Folders and required sizes

| Folder | File(s) | Size / format |
|--------|---------|---------------|
| `icon/` | `icon.png` | 1024 x 1024 px, PNG, **no transparency**, no rounded corners (Apple adds them). |
| `iphone/` | the 8 screenshots below | Portrait **1290 x 2796 px** (6.7" / 6.9" iPhone), PNG or JPEG. |
| `ipad/` | the 8 screenshots below | Portrait **2048 x 2732 px** (12.9" / 13" iPad), PNG or JPEG. |

Tip: you can export the 1024 icon straight from `Assets.xcassets` (AppIcon).

## The 8 screenshots (same filenames in `iphone/` and `ipad/`)

| File | Screen to capture | Suggested caption (optional overlay) |
|------|-------------------|--------------------------------------|
| `01-programs.png` | Your training programs list | Run or join training programs |
| `02-summary.png` | Progress dashboard (charts + month stats) | See your progress at a glance |
| `03-log-workout.png` | Logging a workout | Log workouts in seconds |
| `04-log-health.png` | Logging daily lifestyle data (steps, sleep, diet) | Track steps, sleep and diet |
| `05-members.png` | Members / group progress | Follow your whole group |
| `06-lifestyle.png` | Lifestyle trends and charts | Watch your trends build |
| `07-program.png` | Program management (admin view) | Manage members and roles |
| `08-health-sync.png` | **Apple Health** sync screen | Sync from Apple Health |

## Notes

- **Screenshot #1 is the most important** (it shows first in the listing). Order is controlled by how you
  arrange them in App Store Connect.
- App Store requires at least one screenshot per device size you support; supplying all 8 is recommended.
- Keep the same visual frame/style across all 8 so the set looks like one gallery.
