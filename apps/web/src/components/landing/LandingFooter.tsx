import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { PRIVACY_PATH, SUPPORT_PATH } from "./content";

export function LandingFooter() {
  return (
    <footer className="border-t border-rf-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <BrandMark size={28} />
          <span className="font-semibold tracking-tight text-rf-text">RaSi Fiters</span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-rf-text-muted">
          <Link href={PRIVACY_PATH} className="transition-colors hover:text-rf-text">Privacy</Link>
          <Link href={SUPPORT_PATH} className="transition-colors hover:text-rf-text">Support</Link>
        </nav>

        <p className="text-sm text-rf-text-muted">© 2026 RaSi Fiters</p>
      </div>
    </footer>
  );
}
