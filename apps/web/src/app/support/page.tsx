"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";

export default function SupportPage() {
  return (
    <PageShell maxWidth="3xl">
      <PageHeader
        title="Support"
        actions={
          <Link
            href="/privacy-policy"
            className="text-sm font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            Privacy Policy
          </Link>
        }
      />

      <GlassCard padding="lg" className="space-y-6 text-sm text-rf-text-muted">
        <p>
          If you need help with RaSi Fiters, contact us at:
        </p>
        <p className="font-semibold text-rf-text">vinay.sankara@gmail.com</p>
        <p className="mt-4">
          To help us resolve your issue quickly, let us know whether you&rsquo;re using the iOS app
          or the web app, and include the details for your platform:
        </p>

        <div>
          <p className="font-semibold text-rf-text">iOS app</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>App version</li>
            <li>iOS version</li>
            <li>Device model</li>
          </ul>
        </div>

        <div>
          <p className="font-semibold text-rf-text">Web</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Browser and version</li>
            <li>Operating system</li>
          </ul>
        </div>

        <p>And, for either platform, a short description of the issue.</p>
      </GlassCard>
    </PageShell>
  );
}
