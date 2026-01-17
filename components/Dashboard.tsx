"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "../src/app/actions";

type ProjectSummary = {
  id: string;
  name: string;
  created_at: string | Date;
};

type DashboardProps = {
  userId: string;
  projects: ProjectSummary[];
};

const formatDate = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

export default function Dashboard({ userId, projects }: DashboardProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const projectId = await createProject(userId);
      router.push(`/project/${projectId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-display text-3xl font-bold text-black">
              项目列表
            </div>
            <p className="mt-2 text-sm text-gray-500">
              选择一个项目进入向导或制品库。
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="border border-black bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {isCreating ? "创建中..." : "新建项目"}
          </button>
        </div>

        {error && <div className="mt-4 text-xs text-rose-500">{error}</div>}

        <div className="mt-10 space-y-3">
          {projects.length === 0 ? (
            <div className="border border-gray-200 p-6 text-sm text-gray-500">
              暂无项目，请先创建一个新的项目。
            </div>
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className="flex flex-col gap-4 border border-gray-200 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-base font-semibold text-black">
                    {project.name}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {formatDate(project.created_at)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => router.push(`/project/${project.id}`)}
                    className="border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:text-black"
                  >
                    进入向导
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/artifacts?projectId=${project.id}`)}
                    className="border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:text-black"
                  >
                    打开制品库
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
