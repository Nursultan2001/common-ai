// Custom line icons (no emojis). Stroke uses currentColor.
import type { JSX } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<string, JSX.Element> = {
  // smart intake — clipboard with lines
  intake: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9z" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
      <line x1="8.5" y1="16" x2="13" y2="16" />
    </>
  ),
  // polish — sparkle / star
  polish: (
    <>
      <path d="M12 3.5c.6 4 1.2 5.6 5.5 6.5-4.3.9-4.9 2.5-5.5 6.5-.6-4-1.2-5.6-5.5-6.5 4.3-.9 4.9-2.5 5.5-6.5Z" />
      <path d="M18 14.5c.25 1.6.5 2.2 2 2.5-1.5.3-1.75.9-2 2.5-.25-1.6-.5-2.2-2-2.5 1.5-.3 1.75-.9 2-2.5Z" />
    </>
  ),
  // essay — document with pen
  essay: (
    <>
      <path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      <line x1="8.5" y1="12" x2="13" y2="12" />
      <line x1="8.5" y1="16" x2="14" y2="16" />
      <path d="M16.6 4.4 19.6 7.4l-6 6L9.8 14l.6-3.8 6.2-5.8Z" />
    </>
  ),
  // extension — puzzle piece
  extension: (
    <path d="M10 4.5a2 2 0 0 1 4 0c0 .7-.3 1 .2 1.2.4.2 1-.2 1.8-.2h1a1 1 0 0 1 1 1v1c0 .8-.4 1.4-.2 1.8.2.5.5.2 1.2.2a2 2 0 0 1 0 4c-.7 0-1-.3-1.2.2-.2.4.2 1 .2 1.8v1a1 1 0 0 1-1 1h-1c-.8 0-1.4-.4-1.8-.2-.5.2-.2.5-.2 1.2a2 2 0 0 1-4 0c0-.7.3-1-.2-1.2-.4-.2-1 .2-1.8.2H7a1 1 0 0 1-1-1v-1c0-.8.4-1.4.2-1.8-.2-.5-.5-.2-1.2-.2a2 2 0 0 1 0-4c.7 0 1 .3 1.2-.2.2-.4-.2-1-.2-1.8v-1a1 1 0 0 1 1-1h1c.8 0 1.4.4 1.8.2.5-.2.2-.5.2-1.2Z" />
  ),
  // vault — shield with check
  vault: (
    <>
      <path d="M12 3 5 6v5c0 4 3 6.6 7 8 4-1.4 7-4 7-8V6l-7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  // agency — mortarboard
  agency: (
    <>
      <path d="M3 9l9-4 9 4-9 4-9-4Z" />
      <path d="M7 11.2V15c0 1.1 2.2 2 5 2s5-.9 5-2v-3.8" />
      <line x1="21" y1="9" x2="21" y2="13" />
    </>
  ),
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={className} width="24" height="24" {...base} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
