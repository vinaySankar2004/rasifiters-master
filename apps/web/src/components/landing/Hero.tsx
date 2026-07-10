import { HERO } from "./content";
import { StoreBadges } from "./StoreBadges";
import { AuthCta } from "./AuthCta";
import { IPhoneFrame } from "./devices";
import { HeroDashboard } from "./panels";
import { Reveal } from "./Reveal";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* brand glow behind the device */}
      <div
        className="app-glow pointer-events-none"
        style={{ top: "-4%", right: "6%", width: 420, height: 420, opacity: 0.3, background: "radial-gradient(circle, rgba(255,139,31,0.65), transparent 70%)" }}
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-14 pt-12 md:grid-cols-2 md:pb-20 md:pt-16">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-rf-accent">{HERO.eyebrow}</p>
          <h1 className="text-balance mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-rf-text sm:text-5xl">
            {HERO.title}
          </h1>
          <p className="text-balance mt-5 max-w-md text-lg text-rf-text-muted">{HERO.subtitle}</p>

          <div className="mt-8 flex flex-col gap-4">
            <StoreBadges />
            <div className="flex items-center gap-4">
              <AuthCta variant="hero" />
              <span className="text-sm text-rf-text-muted">{HERO.trust}</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.1} className="relative">
          <IPhoneFrame width={288} label="RaSi Fiters summary dashboard">
            <HeroDashboard />
          </IPhoneFrame>
        </Reveal>
      </div>
    </section>
  );
}
