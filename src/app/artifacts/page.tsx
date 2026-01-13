"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import TopNav from "../../../components/TopNav";
import {
  createArtifact,
  createProject,
  listArtifacts,
  updateArtifact,
} from "../actions";
import type { Artifact, ArtifactUpdate } from "../../../lib/schemas";

const projectIdSchema = z.string().uuid();

const emptyForm: ArtifactUpdate = {
  title: "",
  problem: "",
  prompt_content: "",
};

export default function ArtifactsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [form, setForm] = useState<ArtifactUpdate>(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRequestedRef = useRef(false);

  const rawProjectId = searchParams.get("projectId");
  const validProjectId = projectIdSchema.safeParse(rawProjectId).success
    ? rawProjectId
    : null;

  const createAndRedirect = useCallback(async () => {
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const newProjectId = await createProject();
      setProjectId(newProjectId);
      router.replace(`/artifacts?projectId=${newProjectId}`);
    } catch {
      setError("创建项目失败，请重试。");
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, router]);

  useEffect(() => {
    if (validProjectId) {
      setProjectId(validProjectId);
      setError(null);
      return;
    }

    if (hasRequestedRef.current) {
      return;
    }

    hasRequestedRef.current = true;
    void createAndRedirect();
  }, [validProjectId, createAndRedirect]);

  const refreshArtifacts = useCallback(
    async (activeProjectId: string) => {
      setError(null);
      try {
        let items = await listArtifacts(activeProjectId);
        if (items.length === 0) {
          await createArtifact(activeProjectId);
          items = await listArtifacts(activeProjectId);
        }
        setArtifacts(items);
        const first = items[0];
        if (first) {
          setCurrentArtifactId(first.id);
          setForm({
            title: first.title,
            problem: first.problem,
            prompt_content: first.prompt_content,
          });
        }
      } catch {
        setError("加载制品失败，请重试。");
      }
    },
    [listArtifacts, createArtifact]
  );

  useEffect(() => {
    if (!projectId) {
      return;
    }

    void refreshArtifacts(projectId);
  }, [projectId, refreshArtifacts]);

  const currentArtifact = useMemo(
    () => artifacts.find((item) => item.id === currentArtifactId) ?? null,
    [artifacts, currentArtifactId]
  );

  const handleSelectArtifact = (artifact: Artifact) => {
    setCurrentArtifactId(artifact.id);
    setForm({
      title: artifact.title,
      problem: artifact.problem,
      prompt_content: artifact.prompt_content,
    });
  };

  const handleCreateArtifact = async () => {
    if (!projectId || isCreating) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const artifact = await createArtifact(projectId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      setCurrentArtifactId(artifact.id);
      setForm({
        title: artifact.title,
        problem: artifact.problem,
        prompt_content: artifact.prompt_content,
      });
    } catch {
      setError("新建制品失败，请重试。");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSave = async () => {
    if (!projectId || !currentArtifactId || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const trimmed = {
        title: form.title.trim(),
        problem: form.problem.trim(),
        prompt_content: form.prompt_content.trim(),
      };
      await updateArtifact(projectId, currentArtifactId, trimmed);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
    } catch {
      setError("保存失败，请检查内容后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseArtifact = () => {
    if (!projectId || !currentArtifactId) {
      return;
    }
    router.push(`/artifacts/${currentArtifactId}?projectId=${projectId}`);
  };

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_45%,#e2e8f0_100%)]">
        <TopNav />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/90 p-6 text-center shadow-[0_20px_50px_-35px_rgba(15,23,42,0.5)]">
            <p className="text-sm text-slate-500">
              {isCreating ? "正在创建新项目..." : "准备创建你的新项目。"}
            </p>
            <button
              type="button"
              onClick={createAndRedirect}
              disabled={isCreating}
              className="mt-5 w-full rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isCreating ? "正在创建..." : "开始新项目"}
            </button>
            {error ? (
              <p className="mt-3 text-xs text-rose-500">{error}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_45%,#e2e8f0_100%)]">
      <TopNav />
      <main className="flex flex-1 min-h-0 w-full flex-col gap-6 overflow-hidden px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
              制品列表
            </p>
            <h1 className="text-lg font-semibold text-slate-900">Prompt 制品库</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/?projectId=${projectId}`)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              返回向导
            </button>
            <button
              type="button"
              onClick={handleCreateArtifact}
              disabled={isCreating}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              新建制品
            </button>
          </div>
        </div>

        <div className="grid h-full min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_2fr]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/70">
            <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
              制品
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {artifacts.length === 0 ? (
                <p className="text-sm text-slate-400">暂无制品</p>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((item) => {
                    const isActive = item.id === currentArtifactId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectArtifact(item)}
                        className={[
                          "w-full rounded-xl border px-3 py-3 text-left transition",
                          isActive
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <p className="text-sm font-semibold">{item.title}</p>
                        <p
                          className={
                            isActive
                              ? "mt-1 text-xs text-slate-200"
                              : "mt-1 text-xs text-slate-500"
                          }
                        >
                          {item.problem}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white/70 p-4">
            {currentArtifact ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      制品详情
                    </p>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {currentArtifact.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={handleUseArtifact}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
                  >
                    使用制品
                  </button>
                </div>

                <div className="grid gap-4">
                  <div>
                    <label className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      标题
                    </label>
                    <input
                      value={form.title}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      解决问题
                    </label>
                    <input
                      value={form.problem}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, problem: event.target.value }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col">
                    <label className="text-xs uppercase tracking-[0.28em] text-slate-400">
                      制品 Prompt
                    </label>
                    <textarea
                      value={form.prompt_content}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          prompt_content: event.target.value,
                        }))
                      }
                      className="mt-2 min-h-[220px] flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {error ? <p className="text-xs text-rose-500">{error}</p> : null}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSaving ? "保存中..." : "保存修改"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                请选择或新建一个制品。
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
