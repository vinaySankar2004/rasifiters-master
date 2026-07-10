import { GRID_ITEMS } from "./content";
import { GRID_ICONS } from "./icons";
import { Reveal } from "./Reveal";

export function FeatureGrid() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14 md:py-20">
      <Reveal>
        <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-rf-text sm:text-4xl">
          Everything a program needs.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-rf-text-muted">
          Beyond logging, RaSi Fiters tracks the numbers that keep a group engaged.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GRID_ITEMS.map((item, i) => {
          const Icon = GRID_ICONS[item.icon];
          return (
            <Reveal key={item.title} delay={(i % 3) * 0.06}>
              <div className="glass-card h-full rounded-2xl p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgba(255,139,31,0.14)", color: "var(--rf-accent)" }}>
                  {Icon ? <Icon className="h-6 w-6" /> : null}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-rf-text">{item.title}</h3>
                <p className="mt-2 text-sm text-rf-text-muted">{item.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
