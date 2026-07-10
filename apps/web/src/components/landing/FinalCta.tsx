import { FINAL_CTA } from "./content";
import { StoreBadges } from "./StoreBadges";
import { AuthCta } from "./AuthCta";
import { Reveal } from "./Reveal";

export function FinalCta() {
  return (
    <section id="download" className="relative overflow-hidden py-16 md:py-24">
      <div
        className="app-glow pointer-events-none"
        style={{ top: "10%", left: "50%", width: 520, height: 360, transform: "translateX(-50%)", opacity: 0.28, background: "radial-gradient(circle, rgba(255,139,31,0.55), transparent 70%)" }}
      />
      <Reveal className="relative mx-auto w-full max-w-2xl px-5 text-center">
        <h2 className="text-balance text-4xl font-bold tracking-tight text-rf-text sm:text-5xl">{FINAL_CTA.title}</h2>
        <p className="mx-auto mt-4 max-w-md text-lg text-rf-text-muted">{FINAL_CTA.body}</p>
        <div className="mt-8 flex flex-col items-center gap-5">
          <StoreBadges className="justify-center" />
          <AuthCta variant="final" />
        </div>
      </Reveal>
    </section>
  );
}
