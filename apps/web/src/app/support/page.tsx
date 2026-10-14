import { PublicPage } from "@/components/landing/PublicPage";
import { SUPPORT_EMAIL } from "@/components/landing/content";

const PLATFORM_DETAILS = [
  { name: "iOS app", items: ["App version", "iOS version", "Device model"] },
  { name: "Android app", items: ["App version", "Android version", "Device model"] },
  { name: "Web", items: ["Browser and version", "Operating system"] }
] as const;

export default function SupportPage() {
  return (
    <PublicPage eyebrow="Help" title="Support">
      <div className="glass-card flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p>If you need help with RaSi Fiters, contact us at:</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="mt-1 block break-words text-lg font-semibold text-rf-text transition-colors hover:text-rf-accent"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="button-primary button-primary--dark-white inline-flex shrink-0 items-center justify-center self-start rounded-full px-5 py-2.5 text-sm font-semibold sm:self-auto"
        >
          Email support
        </a>
      </div>

      <div className="space-y-4">
        <p>
          To help us resolve your issue quickly, let us know whether you&rsquo;re using the iOS app,
          the Android app, or the web app, and include the details for your platform:
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLATFORM_DETAILS.map((platform) => (
            <div key={platform.name} className="glass-card rounded-2xl p-5">
              <p className="font-semibold text-rf-text">{platform.name}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {platform.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p>And, whichever platform you&rsquo;re on, a short description of the issue.</p>
      </div>
    </PublicPage>
  );
}
