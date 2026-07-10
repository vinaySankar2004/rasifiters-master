import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { AuthCta } from "./AuthCta";

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rf-border/60 bg-rf-bg/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <span className="text-base font-semibold tracking-tight text-rf-text">RaSi Fiters</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-rf-text-muted md:flex">
          <a href="#features" className="transition-colors hover:text-rf-text">Features</a>
          <a href="#analytics" className="transition-colors hover:text-rf-text">Analytics</a>
        </nav>

        <div className="flex items-center gap-3">
          <a href="#download" className="hidden text-sm font-medium text-rf-text-muted transition-colors hover:text-rf-text sm:block">
            Get the app
          </a>
          <AuthCta variant="nav" />
        </div>
      </div>
    </header>
  );
}
