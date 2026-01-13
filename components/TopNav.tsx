"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { z } from "zod";

const projectIdSchema = z.string().uuid();

const navItems = [
  { label: "生成", href: "/" },
  { label: "制品", href: "/artifacts" },
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
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-slate-400">
            Prompt Smith
          </p>
          <h1 className="text-sm font-semibold text-slate-900">智能提示词构建</h1>
        </div>
        <nav className="flex items-center gap-2">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={buildHref(item.href, projectId)}
                className={[
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
