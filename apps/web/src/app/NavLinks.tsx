"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Client nav links with active-route highlighting.
export default function NavLinks({
  links,
}: {
  links: { href: string; label: string }[];
}) {
  const path = usePathname();
  return (
    <>
      {links.map((l) => {
        const active =
          l.href === "/dashboard" || l.href === "/admin"
            ? path === l.href
            : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? "active" : ""}>
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
