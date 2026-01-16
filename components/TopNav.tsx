"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { z } from "zod";

const projectIdSchema = z.string().uuid();

const navItems = [
  { label: "Wizard", href: "/" },
  { label: "Artifacts", href: "/artifacts" },
];

const buildHref = (href: string, projectId: string | null) => {
  if (!projectId) {
    return href;
  }
  return `${href}?projectId=${projectId}`;
};

export default function TopNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawProjectId = searchParams.get("projectId");
  const projectId = projectIdSchema.safeParse(rawProjectId).success
    ? rawProjectId
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="flex h-14 w-full items-center justify-between px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center">
          <span className="font-display text-xl font-bold tracking-tight text-black">
            PROMPT SMITH
          </span>
        </div>
        
        {/* Navigation - Minimal Text Links */}
        <nav className="flex items-center gap-8">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            
            return (
              <Link
                key={item.href}
                href={buildHref(item.href, projectId)}
                className={`
                  relative text-sm font-medium transition-colors duration-200
                  ${isActive ? "text-black" : "text-gray-400 hover:text-black"}
                `}
              >
                {item.label}
                {isActive && (
                  <span className="absolute -bottom-[19px] left-0 h-[1px] w-full bg-black" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
