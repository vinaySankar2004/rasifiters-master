type IconProps = { className?: string };
type NavIconProps = { active: boolean };

export function SummaryIcon({ active }: NavIconProps) {
  const c = active ? "#ff8b1f" : "#9aa0aa";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="9" width="3" height="7" rx="1.2" fill={c} />
      <rect x="8.5" y="6" width="3" height="10" rx="1.2" fill={c} />
      <rect x="15" y="3" width="3" height="13" rx="1.2" fill={c} />
    </svg>
  );
}

export function MembersIcon({ active }: NavIconProps) {
  const c = active ? "#ff8b1f" : "#9aa0aa";
  return (
    <svg width="22" height="20" viewBox="0 0 22 20" fill="none" aria-hidden="true">
      <circle cx="7" cy="6" r="3" fill={c} />
      <circle cx="15.5" cy="7" r="2.6" fill={c} opacity="0.8" />
      <path d="M2 18c0-2.8 2.6-5 5.8-5s5.8 2.2 5.8 5" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17c.4-1.8 2-3.2 4.1-3.2 2.2 0 3.9 1.4 4 3.2" stroke={c} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LifestyleIcon({ active }: NavIconProps) {
  const c = active ? "#ff8b1f" : "#9aa0aa";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M15.5 4.5c-4.7.4-8.8 3.2-10.5 8.1 3.3-.2 6-1.1 8-2.8 2.4-2 3.2-4.4 2.5-5.3z" fill={c} />
      <path d="M6.2 15.5c2.3.6 4.6-.2 6.2-1.8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ProgramIcon({ active }: NavIconProps) {
  const c = active ? "#ff8b1f" : "#9aa0aa";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="7" height="7" rx="2" fill={c} />
      <rect x="11" y="2" width="7" height="7" rx="2" fill={c} opacity="0.85" />
      <rect x="2" y="11" width="7" height="7" rx="2" fill={c} opacity="0.85" />
      <rect x="11" y="11" width="7" height="7" rx="2" fill={c} />
    </svg>
  );
}

export function IconInfo({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="8" />
      <line x1="10" y1="9" x2="10" y2="14" strokeLinecap="round" />
      <circle cx="10" cy="6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="6.5" cy="7" r="3" />
      <circle cx="14.5" cy="8" r="2.5" />
      <path d="M2.5 17c0-2.6 2.3-4.6 5.1-4.6S12.7 14.4 12.7 17" strokeLinecap="round" />
      <path d="M11.8 16.5c.3-1.8 1.9-3.1 3.8-3.1 1.8 0 3.4 1.3 3.7 3.1" strokeLinecap="round" />
    </svg>
  );
}

export function IconKey({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="9" r="3.5" />
      <path d="M10 9h7M14 9v3M16 9v2" strokeLinecap="round" />
    </svg>
  );
}

export function IconDumbbell({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="7" width="3" height="6" rx="1" />
      <rect x="15" y="7" width="3" height="6" rx="1" />
      <rect x="5.5" y="8" width="3" height="4" rx="1" />
      <rect x="11.5" y="8" width="3" height="4" rx="1" />
      <path d="M8.5 10h3" strokeLinecap="round" />
    </svg>
  );
}

export function IconUser({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="7" r="3.2" />
      <path d="M4 17c0-3 2.7-5.2 6-5.2s6 2.2 6 5.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconMail({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="5" width="14" height="10" rx="2" />
      <path d="M4 6l6 4 6-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        d="M10 3.5l1 1.7 2-.2.9 1.8-1.4 1.3.4 2-1.8 1-1 1.7-2-.3-1.7 1-1.6-1.3.3-2-1.3-1.5 1-1.8 2 .2 1-1.7z"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V7a3 3 0 0 1 6 0v2" strokeLinecap="round" />
    </svg>
  );
}

export function IconPalette({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3.5a6.5 6.5 0 1 0 0 13h1.2c1 0 1.8-.8 1.8-1.8v-.5c0-.7.6-1.3 1.3-1.3h1.3A3.4 3.4 0 0 0 18 9.6 6.5 6.5 0 0 0 10 3.5z" />
      <circle cx="7" cy="8" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="11" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconDocument({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 3h6l4 4v10a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 17V4.5A1.5 1.5 0 0 1 6 3z" />
      <path d="M12 3v4h4" />
      <path d="M7 11h6M7 14h6" strokeLinecap="round" />
    </svg>
  );
}

export function IconLogout({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4h6a2 2 0 0 1 2 2v2" strokeLinecap="round" />
      <path d="M10 16H6a2 2 0 0 1-2-2V6" strokeLinecap="round" />
      <path d="M11 10h7" strokeLinecap="round" />
      <path d="M15 7l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlameIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path
        d="M10 2.8c1.6 2 1.2 3.6.2 4.8-1.1 1.4-2.7 2.1-2.7 4a2.9 2.9 0 0 0 5.8 0c0-1.8-.8-3.1-1.6-4.2-.5-.7-1-1.4-1.7-2.6z"
        strokeLinejoin="round"
      />
      <path d="M6.5 12.6c-.1 2.8 2 4.6 3.5 4.6 1.6 0 3.7-1.8 3.6-4.6" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="9" cy="9" r="5" />
      <path d="M13 13l4 4" strokeLinecap="round" />
    </svg>
  );
}

export function IconMonitor({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="4" width="14" height="9" rx="2" />
      <path d="M7 16h6M9 13v3" strokeLinecap="round" />
    </svg>
  );
}

export function IconSun({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 3v2.2M10 14.8V17M3 10h2.2M14.8 10H17M5 5l1.6 1.6M13.4 13.4L15 15M15 5l-1.6 1.6M5 15l1.6-1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconMoon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12.5 3.5a6.5 6.5 0 1 0 4 11.5 6 6 0 0 1-4-11.5z" strokeLinejoin="round" />
    </svg>
  );
}
