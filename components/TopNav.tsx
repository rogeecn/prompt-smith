"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Sparkles, Layers } from "lucide-react";

const projectIdSchema = z.string().uuid();

const navItems = [
  { label: "生成向导", href: "/", icon: Sparkles },
  { label: "制品库", href: "/artifacts", icon: Layers },
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
    <header className="sticky top-0 z-40 border-b border-slate-200/50 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight">Prompt Smith</h1>
            <p className="hidden text-[10px] font-medium text-slate-500 sm:block">智能提示词构建工具</p>
          </div>
        </div>
        
        <nav className="flex items-center gap-1 rounded-full bg-slate-100/50 p-1 shadow-inner">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={buildHref(item.href, projectId)}
                className={[
                  "flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200",
                  isActive
                    ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:bg-white/50 hover:text-slate-700",
                ].join(" ")}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-indigo-500" : "text-slate-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
