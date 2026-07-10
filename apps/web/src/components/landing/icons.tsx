// Landing-only icon set. 24px stroke icons drawn with currentColor so they inherit
// rf-* text colors in both themes. Kept separate from the app's nav icons (which
// carry an `active` prop and bespoke fills).

import type { ReactElement, ReactNode } from "react";

type Props = { className?: string };

const base = "h-6 w-6";

function svg(children: ReactNode, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconTrophy({ className }: Props) {
  return svg(
    <>
      <path d="M6 4h12v3a6 6 0 0 1-12 0V4Z" />
      <path d="M6 5H4a2 2 0 0 0 0 4h2M18 5h2a2 2 0 0 1 0 4h-2" />
      <path d="M9 20h6M12 13v3M9 20v-1a3 3 0 0 1 6 0v1" />
    </>,
    className
  );
}

export function IconFlame({ className }: Props) {
  return svg(
    <path d="M12 3s5 3.5 5 8.5a5 5 0 0 1-10 0c0-1.6.7-2.8 1.4-3.6.3 1 1 1.8 1.9 2.1C10.6 8.4 12 6.2 12 3Z" />,
    className
  );
}

export function IconUsers({ className }: Props) {
  return svg(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20a5 5 0 0 1 10 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5M17 20a5 5 0 0 0-2-4" />
    </>,
    className
  );
}

export function IconLayers({ className }: Props) {
  return svg(
    <>
      <path d="m12 3 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4M4 17l8 4 8-4" />
    </>,
    className
  );
}

export function IconTicket({ className }: Props) {
  return svg(
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" />
      <path d="M14 6v12" strokeDasharray="1.5 2.5" />
    </>,
    className
  );
}

export function IconTimeline({ className }: Props) {
  return svg(
    <>
      <path d="M6 4v16" />
      <circle cx="6" cy="8" r="1.6" />
      <circle cx="6" cy="16" r="1.6" />
      <path d="M10 8h9M10 16h6" />
    </>,
    className
  );
}

export function IconCheck({ className }: Props) {
  return svg(<path d="m5 12.5 4.5 4.5L19 7" />, className);
}

export function IconArrowRight({ className }: Props) {
  return svg(
    <>
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </>,
    className
  );
}

export function IconApple({ className }: Props) {
  // Solid glyph (filled), for the App Store badge.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base} aria-hidden="true">
      <path d="M16.365 12.66c.02 2.19 1.92 2.92 1.94 2.93-.016.05-.303 1.04-1 2.06-.603.88-1.23 1.76-2.216 1.78-.97.02-1.28-.575-2.39-.575-1.11 0-1.455.556-2.373.594-.953.036-1.68-.953-2.287-1.83-1.243-1.8-2.193-5.08-.918-7.3.634-1.1 1.766-1.797 2.995-1.815.937-.018 1.822.63 2.394.63.572 0 1.648-.78 2.778-.665.473.02 1.8.19 2.653 1.44-.07.043-1.583.924-1.566 2.756M14.79 6.13c.507-.614.85-1.47.756-2.32-.73.03-1.615.487-2.14 1.1-.47.543-.882 1.414-.772 2.248.814.063 1.646-.414 2.156-1.028" />
    </svg>
  );
}

export function IconGooglePlay({ className }: Props) {
  // Simple play-triangle mark for the grayscale "coming soon" Google Play badge.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? base} aria-hidden="true">
      <path d="M4 3.2a1 1 0 0 1 1.51-.86l13.2 7.8a1 1 0 0 1 0 1.72l-13.2 7.8A1 1 0 0 1 4 18.8V3.2Z" />
    </svg>
  );
}

export function IconAndroid({ className }: Props) {
  // Android robot head. Eyes are punched with the page background colour.
  return (
    <svg viewBox="0 0 24 24" className={className ?? base} aria-hidden="true">
      <path d="M7.8 5.6 6.6 3.9M16.2 5.6 17.4 3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M4.5 13a7.5 7.5 0 0 1 15 0Z" fill="currentColor" />
      <circle cx="9.2" cy="10" r="0.95" fill="var(--rf-bg)" />
      <circle cx="14.8" cy="10" r="0.95" fill="var(--rf-bg)" />
    </svg>
  );
}

export const GRID_ICONS: Record<string, (p: Props) => ReactElement> = {
  trophy: IconTrophy,
  flame: IconFlame,
  users: IconUsers,
  layers: IconLayers,
  ticket: IconTicket,
  timeline: IconTimeline
};
