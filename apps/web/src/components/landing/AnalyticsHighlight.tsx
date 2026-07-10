import { ANALYTICS } from "./content";
import { BrowserFrame } from "./frames";
import { DashboardPreview } from "./panels";
import { Reveal } from "./Reveal";

export function AnalyticsHighlight() {
  return (
    <section id="analytics" className="relative overflow-hidden border-y border-rf-border/60 bg-rf-surface-muted/40 py-14 md:py-20">
      <div
        className="app-glow pointer-events-none"
        style={{ bottom: "0%", left: "8%", width: 380, height: 380, opacity: 0.22, background: "radial-gradient(circle, rgba(96,165,250,0.5), transparent 70%)" }}
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 md:grid-cols-5">
        <Reveal className="md:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-rf-accent">{ANALYTICS.eyebrow}</p>
          <h2 className="text-balance mt-3 text-3xl font-bold tracking-tight text-rf-text sm:text-4xl">{ANALYTICS.title}</h2>
          <p className="mt-4 max-w-md text-rf-text-muted">{ANALYTICS.body}</p>
          <div className="mt-8 inline-flex flex-col rounded-2xl border border-rf-border bg-rf-surface px-5 py-4 shadow-rf-soft">
            <span className="text-3xl font-bold text-rf-accent">{ANALYTICS.stat.value}</span>
            <span className="text-sm text-rf-text-muted">{ANALYTICS.stat.label}</span>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="md:col-span-3">
          <BrowserFrame label="RaSi Fiters analytics dashboard">
            <DashboardPreview />
          </BrowserFrame>
        </Reveal>
      </div>
    </section>
  );
}
