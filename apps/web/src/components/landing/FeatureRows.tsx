import type { ReactElement } from "react";
import { FEATURE_ROWS, type FeatureRow } from "./content";
import { IPhoneFrame } from "./devices";
import { ProgramsScreen, LogScreen, SyncScreen } from "./screens";
import { IconCheck } from "./icons";
import { Reveal } from "./Reveal";

const SCREENS: Record<FeatureRow["key"], () => ReactElement> = {
  programs: ProgramsScreen,
  logging: LogScreen,
  sync: SyncScreen
};

function Row({ row, reverse }: { row: FeatureRow; reverse: boolean }) {
  const Screen = SCREENS[row.key];
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <Reveal className={reverse ? "md:order-2" : ""}>
        <p className="text-sm font-semibold uppercase tracking-wide text-rf-accent">{row.eyebrow}</p>
        <h3 className="text-balance mt-3 text-2xl font-bold tracking-tight text-rf-text sm:text-3xl">{row.title}</h3>
        <p className="mt-4 max-w-md text-rf-text-muted">{row.body}</p>
        <ul className="mt-6 space-y-3">
          {row.bullets.map((b) => (
            <li key={b} className="flex items-center gap-3 text-rf-text">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,139,31,0.14)", color: "var(--rf-accent)" }}>
                <IconCheck className="h-4 w-4" />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal delay={0.08} className={reverse ? "md:order-1" : ""}>
        <IPhoneFrame width={272} label={`${row.title} screen`}>
          <Screen />
        </IPhoneFrame>
      </Reveal>
    </div>
  );
}

export function FeatureRows() {
  return (
    <section id="features" className="mx-auto w-full max-w-6xl space-y-16 px-5 py-14 md:space-y-24 md:py-20">
      {FEATURE_ROWS.map((row, i) => (
        <Row key={row.key} row={row} reverse={i % 2 === 1} />
      ))}
    </section>
  );
}
