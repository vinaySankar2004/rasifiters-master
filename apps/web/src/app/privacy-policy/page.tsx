"use client";

import Link from "next/link";
import { PageShell } from "@/components/ui/PageShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";

export default function PublicPrivacyPolicyPage() {
  return (
    <PageShell maxWidth="3xl">
      <PageHeader
        title="Privacy Policy"
        subtitle="Effective date: 2026-07-01"
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
          RaSi Fiters (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) respects your privacy. This policy explains what
          information we collect, how we use it, and the choices you have. It applies to the RaSi
          Fiters iOS app, web app, and related services. Some features are available on only one
          platform &mdash; for example, Apple Health and push notifications apply to the iOS app
          only &mdash; and we note that in the relevant section below.
        </p>

        <div>
          <p className="text-base font-semibold text-rf-text">Information we collect</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Account information: name, email address, and password (stored securely).</li>
            <li>Profile information: optional gender field.</li>
            <li>Fitness and activity data: workouts, sleep, and diet quality that you log in the app.</li>
            <li>Apple Health data (iOS app only): if you connect Apple Health, the iOS app also reads workout and sleep data from Apple Health to log it automatically on your behalf.</li>
            <li>Usage data: app interactions, feature usage, and diagnostic logs.</li>
            <li>Device and network data: device type, OS version, and IP address.</li>
            <li>Push notification data (iOS): if you enable push notifications, we collect and store a device token (and optionally a device identifier) so we can send you notifications. This is linked to your account.</li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">How we use information</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Provide and operate the app, including authentication and core features.</li>
            <li>Personalize and improve the app experience.</li>
            <li>Automatically log workouts and sleep from Apple Health when you enable that feature in the iOS app.</li>
            <li>Monitor performance, fix bugs, and maintain security.</li>
            <li>Communicate with you about your account or support requests.</li>
            <li>Deliver push and in-app notifications (e.g. program updates, membership or role changes) and use Apple&apos;s Push Notification service (APNs) to send notifications to your device when the app is not in the foreground.</li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Apple Health (iOS app only)</p>
          <p className="mt-2">This section applies only to the RaSi Fiters iOS app. The web app does not connect to or read from Apple Health.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>With your permission, the iOS app reads workout and sleep data from Apple Health (HealthKit) to automatically create workout and sleep logs in your RaSi Fiters program.</li>
            <li>Access is read-only. The iOS app does not write any data to Apple Health.</li>
            <li>We use data read from Apple Health only to provide the automatic workout and sleep logging described above. We never use it for advertising or marketing, and we never sell it or share it with third parties for their own purposes.</li>
            <li>You can turn Apple Health sync on or off in the iOS app (My Account → Apple Health), and you can revoke access at any time in iOS Settings → Privacy &amp; Security → Health. Turning it off stops any further reading of your Health data.</li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Sharing of information</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Service providers: we may share data with vendors who help us operate the app
              (for example, hosting and analytics). They are required to protect your information.
            </li>
            <li>
              Push delivery: we share your device token with Apple so they can deliver push
              notifications to your device. Apple&apos;s handling of that data is governed by their
              privacy policy.
            </li>
            <li>
              Legal requirements: we may disclose information if required by law or to protect
              our rights and users.
            </li>
          </ul>
          <p className="mt-2">We do not sell your personal information, and we do not share data we read from Apple Health with third parties for their own use.</p>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Data retention</p>
          <p className="mt-2">
            We keep information only as long as needed to provide the service and comply with legal
            obligations. We remove device tokens when you turn off notifications (or unregister your
            device) or when Apple tells us a token is no longer valid. You can request deletion at
            any time.
          </p>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Security</p>
          <p className="mt-2">
            We use reasonable safeguards to protect your data, but no method of transmission or
            storage is 100% secure.
          </p>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Your choices</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Access or update your information in the app.</li>
            <li>
              Enable or disable push notifications in the app (My Account → Notifications) or in
              your device Settings; disabling or unregistering stops us from sending push and we
              remove your token.
            </li>
            <li>
              Delete your account from within the app (or contact us); that permanently removes
              your data, including any stored device tokens.
            </li>
            <li>Request deletion by contacting us.</li>
          </ul>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Children&apos;s privacy</p>
          <p className="mt-2">RaSi Fiters is not intended for children under 4.</p>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Changes to this policy</p>
          <p className="mt-2">
            We may update this policy from time to time. If we make changes, we will update the
            effective date above.
          </p>
        </div>

        <div>
          <p className="text-base font-semibold text-rf-text">Contact us</p>
          <p className="mt-2">If you have questions or requests, contact us at:</p>
          <p className="mt-1 font-semibold text-rf-text">geethasankar78@gmail.com</p>
        </div>
      </GlassCard>
    </PageShell>
  );
}
