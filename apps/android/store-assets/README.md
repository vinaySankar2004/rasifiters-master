# Android store assets (Google Play Console)

Drop your exported images into the folders below using the **exact filenames**. The 8 screenshots are the
same set of screens as iOS, so the story stays consistent across both stores.

## Folders and required sizes

| Folder | File(s) | Size / format |
|--------|---------|---------------|
| `icon/` | `icon.png` | **512 x 512 px**, 32-bit PNG, up to 1 MB. |
| `phone/` | the 8 screenshots below | Portrait, **1080 x 1920 px** (9:16), PNG or JPEG, up to 8 MB each. |
| `tablet-7/` | the 8 screenshots below | Portrait, **1200 x 1920 px** (7" tablet), PNG or JPEG. |
| `tablet-10/` | the 8 screenshots below | Portrait, **1600 x 2560 px** (10" tablet), PNG or JPEG. |
| `marketing/` | `phone/`, `tablet-7/`, `tablet-10/` — 8 captioned frames each (`NN-<raw name>.png`) + `feature-graphic.png` | Frames: same size as the matching raw folder, RGB PNG. Feature graphic: **1024 x 500 px**, no transparency, up to 15 MB. **These are what get uploaded**, in file order. Generated — see the brief below. |

Notes on Play requirements:
- Phone screenshots are **required**; tablet screenshots are optional but recommended (they make the
  listing eligible for tablet promotion). Minimum 2 phone screenshots; 4+ at 1080 px+ unlocks promotion.
- Screenshot side length must be between 320 px and 3840 px.
- You can export the 512 icon from the launcher icon (`res/mipmap-*` / the adaptive icon foreground).

## The 8 screenshots (same filenames in `phone/`, `tablet-7/`, `tablet-10/`)

| File | Screen to capture |
|------|-------------------|
| `01-splash.png` | Splash / brand screen |
| `02-programs.png` | Your training programs list |
| `03-summary.png` | Progress dashboard (charts + month stats) |
| `04-log-workout.png` | Logging a workout |
| `05-member.png` | Member / group progress |
| `06-lifestyle.png` | Lifestyle trends and charts |
| `07-program.png` | Program management (admin view) |
| `08-health-sync.png` | **Health Connect** sync screen |

## Notes

- Captions, store order and the captioned marketing frames built from these raw captures:
  [`specs/marketing/STORE_GRAPHICS_BRIEF.md`](../../../specs/marketing/STORE_GRAPHICS_BRIEF.md).
- **Screenshot #1 is the most important** (it shows first). Order is set by upload order in Play Console.
- **Publishing a listing change:** each slot holds 8, so delete the old set before uploading. "Save as draft" keeps
  edits inside the listing editor; to queue them press **Next** → answer the AI-asset declaration (these frames:
  "Don't label" — real screens composed by script) → **Save**, then send from **Publishing overview** together with
  the release.
- **How these were captured (2026-10-24):** one temporary emulator (`system-images;android-36;google_apis;arm64-v8a`)
  restarted at each size by editing its `config.ini` `hw.lcd.width/height/density` — 1080x1920 @ 420, 1200x1920 @ 320,
  1600x2560 @ 320 — so it stays signed in (testbed `ava.rivera`, "RaSi Winter Reset", the debug build). Status bar via
  SystemUI demo mode (`adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941`, full
  battery, Wi-Fi only, no notifications); `adb exec-out screencap -p`; save as RGB. The Mac keeps no emulator: download
  the image + `cmdline-tools` for the session (Pixel phones cover day-to-day testing) and delete them after.
- Keep the same visual frame/style across all 8 so the set reads as one gallery.
