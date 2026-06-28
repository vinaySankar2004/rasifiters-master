---
name: audit
description: Audit — full cross-product diff of one feature across all products that implement it, classifying every difference and proposing a canonical version. STUB — not yet implemented.
---

# Audit (STUB — not yet implemented)

> Placeholder for the ICM cross-product audit loop. **Untested — not yet built.** RaSi Fiters ships
> the same features across multiple clients — `web` (Next.js) and `ios` (SwiftUI) — on a shared
> Node/Express + Supabase backend. This is the tool to cross-diff a feature across those products and
> reconcile drift.

Planned behavior:

1. For a given feature, compare ALL products that implement it (web · ios) against the shared backend
   contract.
2. Classify each difference as one of: `intentional-product-difference` | `drift` |
   `accidental-rewrite` | `dedup-opportunity` | `one-side-more-optimized`.
3. Produce a report the user signs off on.
4. Write the canonical `SPEC.md` and record decisions in `CHANGELOG.md`.

This catches what a manifest sync cannot: things that *should* match across web and ios (same backend
endpoints, same business rules) but silently diverged.
