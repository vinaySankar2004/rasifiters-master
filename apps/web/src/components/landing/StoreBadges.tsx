import { IconApple, IconGooglePlay } from "./icons";
import { APP_STORE_URL } from "./content";

// Store badges rebuilt as in-theme pills (not raster badge art) so they stay crisp
// and adapt to light/dark. The App Store pill uses the app's dark↔white inversion
// (`button-primary--dark-white`) and links live. Google Play is a non-interactive
// "Coming soon" pill; Android is not released; kept out of the tab order.

const shell =
  "inline-flex h-[54px] items-center gap-3 rounded-2xl px-4 text-left";

function BadgeText({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="flex flex-col leading-none">
      <span className="text-[11px] font-medium opacity-80">{top}</span>
      <span className="text-[17px] font-semibold tracking-tight">{bottom}</span>
    </span>
  );
}

export function StoreBadges({ className }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download RaSi Fiters on the App Store"
        className={`button-primary button-primary--dark-white ${shell} transition-transform hover:-translate-y-0.5`}
      >
        <IconApple className="h-7 w-7 shrink-0" />
        <BadgeText top="Download on the" bottom="App Store" />
      </a>

      <span
        role="img"
        aria-label="Coming soon on Google Play"
        className={`${shell} cursor-default select-none border border-rf-border bg-rf-surface-muted text-rf-text-muted`}
      >
        <IconGooglePlay className="h-6 w-6 shrink-0 opacity-70" />
        <BadgeText top="Coming soon on" bottom="Google Play" />
      </span>
    </div>
  );
}
