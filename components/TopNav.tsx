"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Wizard", key: "wizard" },
  { label: "Artifacts", key: "artifacts" },
];

export default function TopNav() {
  const pathname = usePathname();
  const projectIdMatch = pathname.match(/\/projects\/([^/]+)/);
  const projectId = projectIdMatch ? projectIdMatch[1] : null;
  const wizardHref = projectId ? `/projects/${projectId}/wizard` : "/";
  const artifactsHref = projectId ? `/projects/${projectId}/artifacts` : "/";

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
              item.key === "wizard"
                ? pathname.includes("/wizard")
                : pathname.includes("/artifacts");
            const href = item.key === "wizard" ? wizardHref : artifactsHref;
            
            return (
              <Link
                key={item.key}
                href={href}
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
