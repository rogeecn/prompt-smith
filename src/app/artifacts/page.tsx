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
import type {
  Artifact,
  ArtifactUpdate,
  ArtifactVariable,
} from "../../../lib/schemas";
import { extractTemplateVariables } from "../../../lib/template";

const projectIdSchema = z.string().uuid();

const emptyForm: ArtifactUpdate = {
  title: "",
  problem: "",
  prompt_content: "",
  variables: [],
};

const parseListValue = (value: string) =>
  value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatVariableDefault = (variable: ArtifactVariable) => {
  const fallback = variable.default;
  if (fallback === undefined || fallback === null) {
    return "";
  }
  if (variable.type === "boolean") {
    return fallback === true ? "true" : fallback === false ? "false" : "";
  }
  if (variable.type === "list") {
    return Array.isArray(fallback) ? fallback.join(", ") : String(fallback);
  }
  return String(fallback);
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
            variables: first.variables ?? [],
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
      variables: artifact.variables ?? [],
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
        variables: artifact.variables ?? [],
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
        variables: (form.variables ?? []).map((variable) => ({
          ...variable,
          key: variable.key.trim(),
          label: variable.label.trim() || variable.key.trim(),
        })),
      };
      const templateKeys = extractTemplateVariables(trimmed.prompt_content);
      const variableKeys = trimmed.variables.map((variable) => variable.key);
      const uniqueKeys = new Set(variableKeys.filter(Boolean));
      if (uniqueKeys.size !== variableKeys.filter(Boolean).length) {
        setError("变量名重复，请检查配置。");
        return;
      }
      if (templateKeys.length > 0 && trimmed.variables.length === 0) {
        setError("检测到模板变量，请先配置变量或清理占位符。");
        return;
      }
      const missingKeys = templateKeys.filter((key) => !uniqueKeys.has(key));
      if (missingKeys.length > 0) {
        setError(`缺少变量配置：${missingKeys.join(", ")}`);
        return;
      }

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

  const updateVariableAt = (
    index: number,
    patch: Partial<ArtifactVariable>
  ) => {
    setForm((prev) => {
      const nextVariables = [...(prev.variables ?? [])];
      const current = nextVariables[index] ?? {
        key: "",
        label: "",
        type: "string",
        required: true,
      };
      nextVariables[index] = { ...current, ...patch };
      return { ...prev, variables: nextVariables };
    });
  };

  const handleAddVariable = () => {
    setForm((prev) => ({
      ...prev,
      variables: [
        ...(prev.variables ?? []),
        { key: "", label: "", type: "string", required: true },
      ],
    }));
  };

  const handleRemoveVariable = (index: number) => {
    setForm((prev) => {
      const nextVariables = [...(prev.variables ?? [])];
      nextVariables.splice(index, 1);
      return { ...prev, variables: nextVariables };
    });
  };

  const handleExtractVariables = () => {
    const keys = extractTemplateVariables(form.prompt_content);
    if (keys.length === 0) {
      setError("模板中未检测到变量占位符。");
      return;
    }

    setError(null);
    setForm((prev) => {
      const existing = new Map(
        (prev.variables ?? []).map((variable) => [variable.key, variable])
      );
      const nextVariables = keys.map((key) => {
        const existingVariable = existing.get(key);
        if (existingVariable) {
          return existingVariable;
        }
        return {
          key,
          label: key,
          type: "string" as const,
          required: true,
        };
      });
      return { ...prev, variables: nextVariables };
    });
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
            <p className="mt-1 text-xs text-slate-500">
              新建空白制品后可在右侧直接编辑并保存，也可粘贴已有 Prompt
              作为制品内容。
            </p>
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
              新建空白制品
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
                <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-6 text-center text-sm text-slate-500">
                  <p>暂无制品。</p>
                  <button
                    type="button"
                    onClick={handleCreateArtifact}
                    disabled={isCreating}
                    className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    立即新建
                  </button>
                </div>
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

          <section className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-4">
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
                    <p className="mt-1 text-xs text-slate-500">
                      在此编辑标题、解决问题与 Prompt 内容，保存后即可用于对话。
                    </p>
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
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                          变量配置
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          模板占位符格式：{"{{variable_key}}"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExtractVariables}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-100"
                        >
                          从模板提取
                        </button>
                        <button
                          type="button"
                          onClick={handleAddVariable}
                          className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
                        >
                          添加变量
                        </button>
                      </div>
                    </div>

                    {form.variables && form.variables.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {form.variables.map((variable, index) => (
                          <div
                            key={`${variable.key}-${index}`}
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700">
                                变量 {index + 1}
                              </p>
                              <button
                                type="button"
                                onClick={() => handleRemoveVariable(index)}
                                className="text-xs text-rose-500 hover:text-rose-600"
                              >
                                删除
                              </button>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div>
                                <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                  变量名
                                </label>
                                <input
                                  value={variable.key}
                                  onChange={(event) =>
                                    updateVariableAt(index, {
                                      key: event.target.value,
                                    })
                                  }
                                  placeholder="例如 target_audience"
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                  显示名称
                                </label>
                                <input
                                  value={variable.label}
                                  onChange={(event) =>
                                    updateVariableAt(index, {
                                      label: event.target.value,
                                    })
                                  }
                                  placeholder="如：受众"
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                  类型
                                </label>
                                <select
                                  value={variable.type}
                                  onChange={(event) =>
                                    updateVariableAt(index, {
                                      type: event.target.value as ArtifactVariable["type"],
                                    })
                                  }
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                >
                                  <option value="string">string</option>
                                  <option value="text">text</option>
                                  <option value="number">number</option>
                                  <option value="boolean">boolean</option>
                                  <option value="enum">enum</option>
                                  <option value="list">list</option>
                                </select>
                              </div>
                              <div className="flex items-end gap-2">
                                <label className="flex items-center gap-2 text-xs text-slate-500">
                                  <input
                                    type="checkbox"
                                    checked={variable.required ?? true}
                                    onChange={(event) =>
                                      updateVariableAt(index, {
                                        required: event.target.checked,
                                      })
                                    }
                                  />
                                  必填
                                </label>
                              </div>
                              {variable.type === "enum" ? (
                                <div className="md:col-span-2">
                                  <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                    选项（逗号分隔）
                                  </label>
                                  <input
                                    value={(variable.options ?? []).join(", ")}
                                    onChange={(event) =>
                                      updateVariableAt(index, {
                                        options: parseListValue(event.target.value),
                                      })
                                    }
                                    placeholder="例如：严肃, 活泼"
                                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </div>
                              ) : null}
                              {variable.type === "boolean" ? (
                                <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                                  <div>
                                    <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                      True 文案
                                    </label>
                                    <input
                                      value={variable.true_label ?? ""}
                                      onChange={(event) =>
                                        updateVariableAt(index, {
                                          true_label: event.target.value,
                                        })
                                      }
                                      placeholder="例如：需要"
                                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                      False 文案
                                    </label>
                                    <input
                                      value={variable.false_label ?? ""}
                                      onChange={(event) =>
                                        updateVariableAt(index, {
                                          false_label: event.target.value,
                                        })
                                      }
                                      placeholder="例如：不需要"
                                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                    />
                                  </div>
                                </div>
                              ) : null}
                              {variable.type === "list" ? (
                                <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                                  <div>
                                    <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                      分隔符
                                    </label>
                                    <input
                                      value={variable.joiner ?? ""}
                                      onChange={(event) =>
                                        updateVariableAt(index, {
                                          joiner: event.target.value,
                                        })
                                      }
                                      placeholder="默认：、"
                                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                      默认值（逗号分隔）
                                    </label>
                                    <input
                                      value={formatVariableDefault(variable)}
                                      onChange={(event) =>
                                        updateVariableAt(index, {
                                          default: parseListValue(event.target.value),
                                        })
                                      }
                                      placeholder="例如：要点1, 要点2"
                                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                    />
                                  </div>
                                </div>
                              ) : null}
                              {variable.type !== "list" ? (
                                <div className="md:col-span-2 grid gap-3 md:grid-cols-2">
                                  <div>
                                    <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                      默认值
                                    </label>
                                    {variable.type === "boolean" ? (
                                      <select
                                        value={formatVariableDefault(variable)}
                                        onChange={(event) =>
                                          updateVariableAt(index, {
                                            default:
                                              event.target.value === ""
                                                ? undefined
                                                : event.target.value === "true",
                                          })
                                        }
                                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                      >
                                        <option value="">无</option>
                                        <option value="true">true</option>
                                        <option value="false">false</option>
                                      </select>
                                    ) : (
                                      <input
                                        value={formatVariableDefault(variable)}
                                        onChange={(event) => {
                                          const value = event.target.value;
                                          const nextValue =
                                            variable.type === "number"
                                              ? value === ""
                                                ? undefined
                                                : Number(value)
                                              : value;
                                          if (
                                            variable.type === "number" &&
                                            typeof nextValue === "number" &&
                                            Number.isNaN(nextValue)
                                          ) {
                                            return;
                                          }
                                          updateVariableAt(index, {
                                            default: nextValue,
                                          });
                                        }}
                                        placeholder="可选"
                                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <label className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                                      提示文案
                                    </label>
                                    <input
                                      value={variable.placeholder ?? ""}
                                      onChange={(event) =>
                                        updateVariableAt(index, {
                                          placeholder: event.target.value,
                                        })
                                      }
                                      placeholder="输入提示"
                                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-slate-400"
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-slate-400">
                        暂无变量配置，可从模板提取或手动添加。
                      </p>
                    )}
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
