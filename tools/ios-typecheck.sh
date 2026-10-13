#!/bin/bash
# ios-typecheck.sh — scratch `swiftc -typecheck` of the iOS app target (no xcodebuild, no Xcode MCP; writes nothing
# to the repo). A cheap pre-⌘B gate: it predicts compile errors, but it does not link, compile assets, check
# Info.plist / entitlements or the widget target — the user's ⌘B stays the compile gate (ios-build skill).
# Needs a DerivedData folder from an earlier ⌘B (module maps, package checkouts, GeneratedAssetSymbols.swift).
# Usage: tools/ios-typecheck.sh [scratch-dir]   (default: a temp dir, deleted afterwards)
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
S="${1:-$(mktemp -d)}"; mkdir -p "$S"
D=$(ls -d ~/Library/Developer/Xcode/DerivedData/RaSi-Fiters-App-* 2>/dev/null | head -1)
[ -n "$D" ] || { echo "no DerivedData for RaSi-Fiters-App — press ⌘B once first"; exit 2; }
cd "$ROOT/apps/ios"

# 1. Every Swift file in the app target folder (widget target excluded) + Xcode's generated asset symbols
files=(); while IFS= read -r f; do files+=("$f"); done < <(find RaSi-Fiters-App -name '*.swift')
files+=("$D/Build/Intermediates.noindex/RaSi-Fiters-App.build/Debug-iphonesimulator/RaSi-Fiters-App.build/DerivedSources/GeneratedAssetSymbols.swift")

# 2. Clang module maps for the SPM packages + 3. their header search paths (include/ and any Public/ dir)
args=()
for m in "$D"/Build/Intermediates.noindex/GeneratedModuleMaps-iphonesimulator/*.modulemap; do args+=(-Xcc "-fmodule-map-file=$m"); done
while IFS= read -r d; do args+=(-Xcc "-I$d"); done < <(find "$D/SourcePackages/checkouts" \( -type d -name include -o -type d -name Public \) 2>/dev/null)

# 4. The target's Swift settings: Swift 5 mode, default isolation MainActor, approachable concurrency (its 5 upcoming
#    features), MemberImportVisibility. Keep in sync with the project's build settings.
xcrun --sdk iphonesimulator swiftc -typecheck \
  -target arm64-apple-ios18.6-simulator -swift-version 5 \
  -default-isolation MainActor \
  -enable-upcoming-feature DisableOutwardActorInference \
  -enable-upcoming-feature GlobalActorIsolatedTypesUsability \
  -enable-upcoming-feature InferIsolatedConformances \
  -enable-upcoming-feature InferSendableFromCaptures \
  -enable-upcoming-feature NonisolatedNonsendingByDefault \
  -enable-upcoming-feature MemberImportVisibility \
  "${args[@]}" -module-name RaSi_Fiters_App -module-cache-path "$S/mcache" \
  "${files[@]}" > "$S/tc.log" 2>&1
rc=$?
echo "exit=$rc  errors=$(grep -c 'error:' "$S/tc.log")  warnings=$(grep -c 'warning:' "$S/tc.log")"
grep 'error:' "$S/tc.log" | head -30

# 5. Keep disk lean: the module cache is ~50 MB
rm -rf "$S/mcache"; [ $# -eq 0 ] && rm -rf "$S"
exit $rc
