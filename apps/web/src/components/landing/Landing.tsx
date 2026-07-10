import { LandingHeader } from "./LandingHeader";
import { Hero } from "./Hero";
import { FeatureRows } from "./FeatureRows";
import { AnalyticsHighlight } from "./AnalyticsHighlight";
import { FeatureGrid } from "./FeatureGrid";
import { CrossPlatform } from "./CrossPlatform";
import { FinalCta } from "./FinalCta";
import { LandingFooter } from "./LandingFooter";

// Public marketing landing page rendered at `/`. Server component; two client islands
// live inside it (AuthCta, Reveal). It owns its full-bleed background because it opts
// out of the app shell (see app/shell.tsx pathname guard).
export function Landing() {
  return (
    <div className="relative min-h-screen bg-rf-bg text-rf-text">
      <LandingHeader />
      <main>
        <Hero />
        <FeatureRows />
        <AnalyticsHighlight />
        <FeatureGrid />
        <CrossPlatform />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
