import { LandingHeader } from "./LandingHeader";
import { LandingFooter } from "./LandingFooter";

// The public text pages (privacy-policy, support, delete-account) wear the landing site's chrome — sticky header,
// footer, full-bleed background — around one readable column. Like the landing page, they opt out of the app shell
// (app/shell.tsx, PUBLIC_PAGE_PATHS).
export function PublicPage({
  eyebrow,
  title,
  subtitle,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-rf-bg text-rf-text">
      <LandingHeader />
      <main className="flex-1 px-5 pb-20 pt-12 md:pt-16">
        <article className="mx-auto w-full max-w-3xl">
          <header className="border-b border-rf-border/60 pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rf-accent">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
            {subtitle && <p className="mt-3 text-sm text-rf-text-muted">{subtitle}</p>}
          </header>
          <div className="space-y-8 pt-8 text-[15px] leading-7 text-rf-text-muted">{children}</div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
