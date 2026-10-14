# Phase 4: SEO pass (last step, after both apps are submitted)

> Audit date: 2026-10-13, read-only. Most SEO work already shipped on 2026-08-20 (landing SPEC 0.1.4,
> D-LAND-10/11). The domain is verified in Search Console by a DNS TXT record.
> **Status:** changes A–D shipped `cc46131` (landing 0.1.5, D-LAND-12). Owner steps 1–3 done 2026-10-13 (indexing also
> requested for the 5 "Discovered – not indexed" pages); step 4 and the Play title options not done (the user's call).

## Problem
Google shows the site as "rasifiters" instead of "RaSi Fiters". Searching "rasi fiters" (with the space) is weak.

## Current gaps
1. **The WebSite JSON-LD `alternateName` offers the wrong names** (`apps/web/src/app/layout.tsx:80`).
   - It uses `BRAND_ALIASES`, which includes "rasifiters" and the misspellings "RaSi Fitters" / "Rasi Fitters".
   - Google uses `alternateName`, in preference order, as acceptable *display* names.
   - This is the likely cause of the "rasifiters" title.
2. **The description doesn't start with the brand** (`layout.tsx:37`).
3. **Every public page shows the home title**: the pages are `"use client"`, so they can't export metadata.
4. *(Optional, visible change)* The brand isn't in the hero H1.

## Changes
- **A.** In `layout.tsx`, add the line below and use it at `:80`. Organization and SoftwareApplication keep
  `BRAND_ALIASES`, since they don't set the displayed site name.
  ```ts
  const SITE_ALIASES = ["Rasi Fiters", "RaSiFiters"];
  ```
- **B.** Set the description:
  ```ts
  const DESCRIPTION = "RaSi Fiters is a free group fitness app: join a program, log workouts and daily health, and track your group with leaderboards, streaks and analytics.";
  ```
- **C.** Add a pass-through `layout.tsx` that exports only `metadata.title` in each of these routes. The existing
  `%s · RaSi Fiters` template does the rest.

  | Route | Title |
  |---|---|
  | `login/` | Log in |
  | `create-account/` | Create account |
  | `forgot-password/` | Forgot password |
  | `privacy-policy/` | Privacy Policy |
  | `support/` | Support |
  | `delete-account/` | Delete your account |
- **D.** *(Optional; the user decides.)* Set `content.ts:15` `eyebrow` to `"RaSi Fiters · For your whole group"`.

## Docs to update
- `specs/pages/web/landing/SPEC.md`:
  - §6: fix where the JSON-LD lives — it's in `<body>`, not `<head>`.
  - D-LAND-11.
  - §11.
- The page SPECs for the six routes in **C**.

## The user's steps after the deploy
1. In Search Console, resubmit the sitemap.
2. Run the Rich Results Test on `https://rasifiters.com/`.
3. In URL Inspection, run a live test, then **Request indexing**.
4. In Play Console → Store settings → Contact details, set Website to `https://rasifiters.com`.
5. Wait days to weeks.

## Play Store search
Not pursued. The listing title is already "RaSi Fiters", and the package id covers "rasifiters". Ranking comes from
installs, ratings and time. Two cheap options, both the user's call:
- Title "RaSi Fiters: Group Fitness".
- Short description starting "Group fitness tracker:".
