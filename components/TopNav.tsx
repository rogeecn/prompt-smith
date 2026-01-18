"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProjectSummary } from "../lib/local-store";

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const projectIdMatch = pathname.match(/\/projects\/([^/]+)/);
  const projectId = projectIdMatch ? projectIdMatch[1] : null;
  const wizardHref = projectId ? `/projects/${projectId}/wizard` : "/";
  const artifactsHref = projectId ? `/projects/${projectId}/artifacts` : "/";
  const [projectTitle, setProjectTitle] = useState("");

  useEffect(() => {
    let isActive = true;
    const loadProject = async () => {
      if (!projectId) {
        setProjectTitle("");
        return;
      }
      try {
        const project = await getProjectSummary(projectId);
        if (isActive) {
          setProjectTitle(project?.name ?? "");
        }
      } catch {
        if (isActive) {
          setProjectTitle("");
        }
      }
    };
    void loadProject();
    return () => {
      isActive = false;
    };
  }, [projectId]);

  const isWizardActive = pathname.includes("/wizard");
  const isArtifactsActive = pathname.includes("/artifacts");

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      <div className="flex h-14 w-full items-center justify-between px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="flex h-9 w-9 items-center justify-center border border-gray-200 text-gray-600 hover:text-black"
            aria-label="返回项目列表"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Link
              href={wizardHref}
              className={`border px-3 py-2 text-sm font-semibold transition ${
                isWizardActive
                  ? "border-black bg-black text-white"
                  : "border-gray-200 text-gray-600 hover:text-black"
              }`}
            >
              向导
            </Link>
            <Link
              href={artifactsHref}
              className={`border px-3 py-2 text-sm font-semibold transition ${
                isArtifactsActive
                  ? "border-black bg-black text-white"
                  : "border-gray-200 text-gray-600 hover:text-black"
              }`}
            >
              制品
            </Link>
          </div>
        </div>
        <div className="text-sm font-semibold text-gray-700 truncate max-w-[220px] text-right">
          {projectTitle || "当前项目"}
        </div>
      </div>
    </header>
  );
}
