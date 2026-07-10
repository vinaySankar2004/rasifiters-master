import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { PRIVACY_PATH, SUPPORT_PATH } from "./content";

export function LandingFooter() {
  return (
    <footer className="border-t border-rf-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-5 py-5 text-xs text-rf-text-muted">
        <span className="flex items-center gap-2 font-medium text-rf-text">
          <BrandMark size={18} />
          RaSi Fiters
        </span>
        <span aria-hidden="true" className="opacity-50">·</span>
        <Link href={PRIVACY_PATH} className="transition-colors hover:text-rf-text">Privacy</Link>
        <span aria-hidden="true" className="opacity-50">·</span>
        <Link href={SUPPORT_PATH} className="transition-colors hover:text-rf-text">Support</Link>
        <span aria-hidden="true" className="opacity-50">·</span>
        <span>© 2026</span>
      </div>
    </footer>
  );
}
