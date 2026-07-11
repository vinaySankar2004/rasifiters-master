"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";

export default function PublicDeleteAccountPage() {
  return (
    <PageShell maxWidth="3xl">
      <PageHeader
        title="Delete Your Account"
        subtitle="How to request deletion of your RaSi Fiters account and data"
        actions={
          <Link
            href="/support"
            className="text-sm font-semibold text-rf-accent transition hover:text-rf-accent-strong"
          >
            Support
          </Link>
        }
      />

      <GlassCard padding="lg" className="space-y-6 text-sm text-rf-text-muted">
        <p>
          This page explains how to request deletion of your RaSi Fiters account and the data
          associated with it. It applies to the RaSi Fiters iOS app, Android app, and web app, which
          all share the same account.
        </p>

        <div>
          <p className="text-base font-semibold text-rf-text">Delete your account from the app</p>
          <p className="mt-2">
            The fastest way to delete your account is from within RaSi Fiters:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Sign in to the RaSi Fiters app (iOS, Android, or web).</li>
            <li>Go to <span className="font-semibold text-rf-text">My Account</span> (your profile).</li>
            <li>Select <span className="font-semibold text-rf-text">Delete Account</span>.</li>
            <li>Confirm when prompted. Your account and associated data are removed.</li>
          </ol>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Request deletion by email</p>
          <p className="mt-2">
            If you can no longer sign in, email us from the address on your account and we will delete
            it for you:
          </p>
          <p className="mt-1 font-semibold text-rf-text">geethasankar78@gmail.com</p>
          <p className="mt-2">
            Please use the subject line &ldquo;Delete my account&rdquo; so we can action it quickly.
          </p>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">What data is deleted</p>
          <p className="mt-2">Deleting your account permanently removes:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your account information: name, email address, and password.</li>
            <li>Your profile information, including the optional gender field.</li>
            <li>
              All fitness and activity data you logged: workouts, sleep, steps, and diet-quality
              entries.
            </li>
            <li>
              Any workout, sleep, and step logs created automatically from Apple Health (iOS) or
              Health Connect (Android). RaSi Fiters only ever reads this data; deleting your account
              removes the copies stored in RaSi Fiters. It does not affect the original data in Apple
              Health or Health Connect.
            </li>
            <li>Your device push-notification tokens.</li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">What is retained, and for how long</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Deletion is permanent. Your data is removed from our live systems immediately, and any
              residual copies in encrypted backups are purged within 30 days.
            </li>
            <li>
              We retain only the minimal records we are legally required to keep (for example, to meet
              tax, accounting, or fraud-prevention obligations), for no longer than the law requires.
              These records are not used to identify or contact you.
            </li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Contact us</p>
          <p className="mt-2">
            If you have questions about deleting your account, contact us at:
          </p>
          <p className="mt-1 font-semibold text-rf-text">geethasankar78@gmail.com</p>
        </div>
      </GlassCard>
    </PageShell>
  );
}
