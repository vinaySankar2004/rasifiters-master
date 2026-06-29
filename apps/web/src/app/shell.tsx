"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { NotificationsGate } from "@/components/NotificationsGate";
import { SummaryIcon, MembersIcon, LifestyleIcon, ProgramIcon } from "@/components/icons";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = ["/summary", "/members", "/lifestyle", "/program"].includes(pathname);

  useEffect(() => {
    const body = document.body;
    body.classList.remove("modal-open");
    body.style.overflow = "";
  }, [pathname]);

  return (
    <div className="app-bg">
      <div
        className="app-glow"
        style={{
          top: "18%",
          left: "12%",
          width: 260,
          height: 260,
          opacity: 0.22,
          background: "radial-gradient(circle, rgba(255, 182, 120, 0.7), transparent 70%)"
        }}
      />
      <div
        className="app-glow"
        style={{
          bottom: "20%",
          right: "16%",
          width: 300,
          height: 300,
          opacity: 0.18,
          background: "radial-gradient(circle, rgba(156, 190, 255, 0.6), transparent 70%)"
        }}
      />
      <main className={`relative z-10 min-h-screen ${showNav ? "pb-28" : ""}`}>
        {children}
      </main>

      <NotificationsGate />

      {showNav && (
        <nav className="bottom-nav fixed left-1/2 z-20 w-[min(92vw,520px)] -translate-x-1/2 rounded-3xl bg-white/90 px-4 py-3 shadow-2xl backdrop-blur bottom-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            {[
              { href: "/summary", label: "Summary", icon: SummaryIcon },
              { href: "/members", label: "Members", icon: MembersIcon },
              { href: "/lifestyle", label: "Lifestyle", icon: LifestyleIcon },
              { href: "/program", label: "Program", icon: ProgramIcon }
            ].map((tab) => {
              const active = pathname.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex w-20 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                    active ? "bg-rf-surface-muted text-rf-accent" : "text-rf-text-muted hover:text-rf-text"
                  }`}
                >
                  <Icon active={active} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
