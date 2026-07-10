import { CROSS_PLATFORM } from "./content";
import { IPhoneFrame, AndroidFrame } from "./devices";
import { HealthRingsScreen, StreakScreen } from "./screens";
import { StoreBadges } from "./StoreBadges";
import { IconApple, IconAndroid } from "./icons";
import { Reveal } from "./Reveal";

const label = "flex items-center gap-1.5 text-xs font-semibold text-rf-text-muted";

export function CrossPlatform() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14 md:py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-rf-accent">{CROSS_PLATFORM.eyebrow}</p>
        <h2 className="text-balance mt-3 text-3xl font-bold tracking-tight text-rf-text sm:text-4xl">{CROSS_PLATFORM.title}</h2>
        <p className="mx-auto mt-4 max-w-md text-rf-text-muted">{CROSS_PLATFORM.body}</p>
        <StoreBadges className="mt-7 justify-center" />
      </Reveal>

      <Reveal delay={0.1} className="mt-12 flex flex-col items-center justify-center gap-10 sm:flex-row sm:items-stretch sm:gap-12">
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full flex-1 justify-center">
            <IPhoneFrame width={250} label="RaSi Fiters health screen on iPhone">
              <HealthRingsScreen />
            </IPhoneFrame>
          </div>
          <span className={label}><IconApple className="h-[15px] w-[15px]" /> iPhone</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full flex-1 justify-center">
            <AndroidFrame width={250} label="RaSi Fiters members screen on Android">
              <StreakScreen />
            </AndroidFrame>
          </div>
          <span className={label}><IconAndroid className="h-[17px] w-[17px]" /> Android</span>
        </div>
      </Reveal>
    </section>
  );
}
