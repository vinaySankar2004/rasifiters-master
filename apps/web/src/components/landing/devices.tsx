// Realistic device shells for the cross-platform section: an iPhone (Dynamic Island +
// side buttons) and a Pixel-style Android (center punch-hole + right-side buttons).
// The bezel is a fixed dark metal that reads on both themes; the SCREEN inside is
// rf-bg so the app UI stays theme-aware. Buttons are positioned by % of height so they
// track any content height. Both frames fill their flex parent's height (flex-1 chain),
// so placing them in an items-stretch row makes the two phones exactly equal height.

const bezel = "#0b0c0e";
const button = "bg-[#26282d]";

function StatusBar() {
  return (
    <div className="relative z-10 flex items-center justify-between px-5 pt-2 text-[10px] font-semibold text-rf-text">
      <span>9:41</span>
      <span className="flex items-center gap-[3px]">
        {/* signal */}
        <svg width="15" height="9" viewBox="0 0 15 9" fill="currentColor" aria-hidden="true">
          <rect x="0" y="6" width="2.5" height="3" rx="0.5" />
          <rect x="4" y="4" width="2.5" height="5" rx="0.5" />
          <rect x="8" y="2" width="2.5" height="7" rx="0.5" />
          <rect x="12" y="0" width="2.5" height="9" rx="0.5" />
        </svg>
        {/* wifi */}
        <svg width="12" height="9" viewBox="0 0 12 9" fill="currentColor" aria-hidden="true">
          <path d="M6 8.4 4.3 6.7a2.4 2.4 0 0 1 3.4 0L6 8.4Zm0-4.2a5 5 0 0 0-3.5 1.4L1 4.1a7 7 0 0 1 10 0L9.5 5.6A5 5 0 0 0 6 4.2Z" />
        </svg>
        {/* battery */}
        <span className="ml-[1px] flex h-[9px] w-[16px] items-center rounded-[2px] border border-current px-[1px]">
          <span className="h-[5px] w-[11px] rounded-[1px] bg-current" />
        </span>
      </span>
    </div>
  );
}

export function IPhoneFrame({
  children,
  width = 250,
  label
}: {
  children: React.ReactNode;
  width?: number;
  label?: string;
}) {
  return (
    <div className="relative mx-auto flex h-full flex-col" style={{ width, maxWidth: "100%" }} role="img" aria-label={label ?? "RaSi Fiters on iPhone"}>
      {/* side buttons */}
      <span className={`absolute -left-[2px] top-[14%] h-7 w-[3px] rounded-l ${button}`} />
      <span className={`absolute -left-[2px] top-[23%] h-11 w-[3px] rounded-l ${button}`} />
      <span className={`absolute -left-[2px] top-[35%] h-11 w-[3px] rounded-l ${button}`} />
      <span className={`absolute -right-[2px] top-[26%] h-14 w-[3px] rounded-r ${button}`} />
      <div className="relative flex flex-1 flex-col rounded-[2.7rem] p-[9px] shadow-rf-soft ring-1 ring-white/10" style={{ background: bezel }}>
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[2.2rem] bg-rf-bg pb-3">
          {/* Dynamic Island */}
          <div className="absolute left-1/2 top-[10px] z-20 h-[22px] w-[78px] -translate-x-1/2 rounded-full bg-black" />
          <StatusBar />
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AndroidFrame({
  children,
  width = 250,
  label
}: {
  children: React.ReactNode;
  width?: number;
  label?: string;
}) {
  return (
    <div className="relative mx-auto flex h-full flex-col" style={{ width, maxWidth: "100%" }} role="img" aria-label={label ?? "RaSi Fiters on Android"}>
      {/* right-side buttons (Pixel) */}
      <span className={`absolute -right-[2px] top-[20%] h-9 w-[3px] rounded-r ${button}`} />
      <span className={`absolute -right-[2px] top-[31%] h-14 w-[3px] rounded-r ${button}`} />
      <div className="relative flex flex-1 flex-col rounded-[2.1rem] p-[9px] shadow-rf-soft ring-1 ring-white/10" style={{ background: bezel }}>
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[1.7rem] bg-rf-bg pb-3">
          {/* center punch-hole camera */}
          <div className="absolute left-1/2 top-[9px] z-20 h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/10" />
          <StatusBar />
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
