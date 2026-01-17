"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "../src/app/actions";

type ProjectSummary = {
  id: string;
  name: string;
  description?: string | null;
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
  const [projectList, setProjectList] = useState<ProjectSummary[]>(projects);
  const [isCreating, setIsCreating] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const projectId = await createProject(userId, {
        name,
        description: description.trim() ? description : undefined,
      });
      setProjectList((prev) => [
        {
          id: projectId,
          name: name.trim(),
          description: description.trim() ? description.trim() : null,
          created_at: new Date(),
        },
        ...prev,
      ]);
      setIsModalOpen(false);
      setName("");
      setDescription("");
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
            onClick={() => {
              setError(null);
              setIsModalOpen(true);
            }}
            disabled={isCreating}
            className="border border-black bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {isCreating ? "创建中..." : "新建项目"}
          </button>
        </div>

        {error && <div className="mt-4 text-xs text-rose-500">{error}</div>}

        <div className="mt-10">
          {projectList.length === 0 ? (
            <div className="border border-gray-200 p-6 text-sm text-gray-500">
              暂无项目，请先创建一个新的项目。
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projectList.map((project) => (
                <div
                  key={project.id}
                  className="flex h-full flex-col justify-between border border-gray-200 p-5"
                >
                  <div>
                    <div className="text-base font-semibold text-black">
                      {project.name}
                    </div>
                    {project.description ? (
                      <div
                        className="mt-2 text-sm text-gray-500 break-words"
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {project.description}
                      </div>
                    ) : null}
                    <div className="mt-3 text-xs text-gray-400">
                      {formatDate(project.created_at)}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
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
              ))}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="relative w-full max-w-md border border-gray-200 bg-white p-6">
            <h2 className="font-display text-xl font-semibold text-black">
              新建项目
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              请输入项目名称和说明，便于后续管理与区分。
            </p>
            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="project-name" className="text-xs font-semibold text-gray-500">
                  项目名称
                </label>
                <input
                  id="project-name"
                  name="projectName"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 w-full border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
                  placeholder="请输入项目名称"
                  required
                />
              </div>
              <div>
                <label htmlFor="project-description" className="text-xs font-semibold text-gray-500">
                  项目说明
                </label>
                <textarea
                  id="project-description"
                  name="projectDescription"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-2 w-full resize-none border-b border-gray-300 bg-transparent py-2 text-sm outline-none focus:border-black"
                  placeholder="简要描述项目用途（可选）"
                  rows={3}
                />
              </div>
              {error && <div className="text-xs text-rose-500">{error}</div>}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:text-black"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating || !name.trim()}
                  className="border border-black bg-black px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {isCreating ? "创建中..." : "确认创建"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
