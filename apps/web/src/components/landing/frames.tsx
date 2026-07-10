// Presentational chrome that wraps the generated in-theme app UI. No screenshots , 
// the children are real markup, so everything stays sharp and theme-aware.

export function PhoneFrame({
  children,
  className,
  label,
  width = 260
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
  width?: number;
}) {
  return (
    <div
      className={`relative mx-auto rounded-[2.6rem] border border-rf-border bg-rf-surface p-2.5 shadow-rf-soft ${className ?? ""}`}
      style={{ width, maxWidth: "100%" }}
      role="img"
      aria-label={label ?? "RaSi Fiters app screen"}
    >
      {/* notch */}
      <div className="absolute left-1/2 top-2.5 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-rf-bg" />
      <div className="relative overflow-hidden rounded-[2rem] bg-rf-bg pt-7">{children}</div>
    </div>
  );
}

export function BrowserFrame({
  children,
  className,
  url = "rasifiters.com",
  label
}: {
  children: React.ReactNode;
  className?: string;
  url?: string;
  label?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-rf-border bg-rf-surface shadow-rf-soft ${className ?? ""}`}
      role="img"
      aria-label={label ?? "RaSi Fiters web app"}
    >
      <div className="flex items-center gap-2 border-b border-rf-border bg-rf-surface-muted px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rf-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-rf-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-rf-border" />
        </span>
        <span className="mx-auto flex items-center rounded-full bg-rf-bg px-4 py-1 text-xs text-rf-text-muted">
          {url}
        </span>
      </div>
      <div className="bg-rf-bg">{children}</div>
    </div>
  );
}
