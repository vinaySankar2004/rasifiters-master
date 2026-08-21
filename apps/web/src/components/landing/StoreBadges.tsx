import { IconApple, IconGooglePlay } from "./icons";
import { APP_STORE_URL, PLAY_STORE_URL } from "./content";

// Store badges rebuilt as in-theme pills (not raster badge art) so they stay crisp
// and adapt to light/dark. Both platforms are public, so both pills are live links
// with identical dark<->white inversion styling (`button-primary--dark-white`) and
// equal prominence.

const shell =
  "inline-flex h-[54px] items-center gap-3 rounded-2xl px-4 text-left";

const pill = `button-primary button-primary--dark-white ${shell} transition-transform hover:-translate-y-0.5`;

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
        className={pill}
      >
        <IconApple className="h-7 w-7 shrink-0" />
        <BadgeText top="Download on the" bottom="App Store" />
      </a>

      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Get RaSi Fiters on Google Play"
        className={pill}
      >
        <IconGooglePlay className="h-6 w-6 shrink-0" />
        <BadgeText top="Get it on" bottom="Google Play" />
      </a>
    </div>
  );
}
