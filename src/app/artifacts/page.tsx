"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import {
  Plus,
  Search,
  Layers,
  Box,
  Settings2,
  Play,
  Save,
  Trash2,
  ArrowLeft,
  Menu,
  X,
} from "lucide-react";
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
import { parseTemplateVariables } from "../../../lib/template";

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
  if (fallback === undefined || fallback === null) return "";
  if (variable.type === "boolean") return fallback === true ? "true" : fallback === false ? "false" : "";
  if (variable.type === "list") return Array.isArray(fallback) ? fallback.join(", ") : String(fallback);
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const hasRequestedRef = useRef(false);

  const rawProjectId = searchParams.get("projectId");
  const validProjectId = projectIdSchema.safeParse(rawProjectId).success ? rawProjectId : null;

  const createAndRedirect = useCallback(async () => {
    if (isCreating) return;
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
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    void createAndRedirect();
  }, [validProjectId, createAndRedirect]);

  const refreshArtifacts = useCallback(async (activeProjectId: string) => {
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
  }, [listArtifacts, createArtifact]);

  useEffect(() => {
    if (!projectId) return;
    void refreshArtifacts(projectId);
  }, [projectId, refreshArtifacts]);

  const currentArtifact = useMemo(
    () => artifacts.find((item) => item.id === currentArtifactId) ?? null,
    [artifacts, currentArtifactId]
  );
  const templateVariables = useMemo(
    () => parseTemplateVariables(form.prompt_content),
    [form.prompt_content]
  );
  const templateKeys = useMemo(
    () => templateVariables.map((item) => item.key),
    [templateVariables]
  );
  const hasTemplateMarkers = form.prompt_content.includes("{{");

  const handleSelectArtifact = (artifact: Artifact) => {
    setCurrentArtifactId(artifact.id);
    setForm({
      title: artifact.title,
      problem: artifact.problem,
      prompt_content: artifact.prompt_content,
      variables: artifact.variables ?? [],
    });
    setIsSidebarOpen(false);
  };

  const handleCreateArtifact = async () => {
    if (!projectId || isCreating) return;
    setIsCreating(true);
    setError(null);
    setIsSidebarOpen(false);
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
    if (!projectId || !currentArtifactId || isSaving) return;
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
      const templateKeysLocal = parseTemplateVariables(trimmed.prompt_content).map(i => i.key);
      const variableKeys = trimmed.variables.map(v => v.key);
      const uniqueKeys = new Set(variableKeys.filter(Boolean));
      if (uniqueKeys.size !== variableKeys.filter(Boolean).length) {
        setError("变量名重复，请检查配置。");
        return;
      }
      if (templateKeys.length > 0 && trimmed.variables.length === 0) {
        setError("检测到模板变量，请先配置变量或清理占位符。");
        return;
      }
      const missingKeys = templateKeysLocal.filter(k => !uniqueKeys.has(k));
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
    if (!projectId || !currentArtifactId) return;
    router.push(`/artifacts/${currentArtifactId}?projectId=${projectId}`);
  };

  const updateVariableAt = (index: number, patch: Partial<ArtifactVariable>) => {
    setForm((prev) => {
      const nextVariables = [...(prev.variables ?? [])];
      const current = nextVariables[index] ?? { key: "", label: "", type: "string", required: true };
      nextVariables[index] = { ...current, ...patch };
      return { ...prev, variables: nextVariables };
    });
  };

  const handleAddVariable = () => {
    setForm(prev => ({ ...prev, variables: [...(prev.variables ?? []), { key: "", label: "", type: "string", required: true }] }));
  };

  const handleRemoveVariable = (index: number) => {
    setForm(prev => {
      const nextVariables = [...(prev.variables ?? [])];
      nextVariables.splice(index, 1);
      return { ...prev, variables: nextVariables };
    });
  };

  const handleExtractVariables = () => {
    if (templateVariables.length === 0) {
      setError("模板中未检测到变量占位符。");
      return;
    }
    setError(null);
    setForm(prev => {
      const existing = new Map((prev.variables ?? []).map(v => [v.key, v]));
      const nextVariables = templateVariables.map(v => {
        const exist = existing.get(v.key);
        if (exist) {
          return {
            ...exist,
            label: exist.label || v.label || v.key,
            type: exist.type || v.type || "string",
            required: exist.required ?? v.required ?? true,
            placeholder: exist.placeholder ?? v.placeholder,
            default: exist.default ?? v.default,
            options: exist.options ?? v.options,
            joiner: exist.joiner ?? v.joiner,
            true_label: exist.true_label ?? v.true_label,
            false_label: exist.false_label ?? v.false_label,
          };
        }
        return {
          key: v.key,
          label: v.label ?? v.key,
          type: v.type ?? "string",
          required: v.required ?? true,
          placeholder: v.placeholder,
          default: v.default,
          options: v.options,
          joiner: v.joiner,
          true_label: v.true_label,
          false_label: v.false_label,
        };
      });
      return { ...prev, variables: nextVariables };
    });
  };

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <TopNav />
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-white bg-white/60 p-8 text-center shadow-xl backdrop-blur-xl">
            <p className="text-sm text-slate-500">
              {isCreating ? "正在创建新项目..." : "准备创建你的新项目。"}
            </p>
            <button disabled className="mt-6 w-full rounded-2xl bg-indigo-600 px-5 py-4 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-70">
              加载中...
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-50">
      <TopNav />
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-slate-900">制品库</span>
        <div className="w-9" />
      </div>
      <main className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Sidebar: Artifact List */}
        <>
          {isSidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
          <aside
            className={[
              "fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:z-0 lg:w-80 lg:translate-x-0 lg:bg-white lg:shadow-none lg:border-r lg:border-slate-100",
              isSidebarOpen ? "translate-x-0" : "-translate-x-full",
            ].join(" ")}
          >
          <div className="flex flex-col h-full">
            <div className="p-5 border-b border-slate-100 bg-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <Layers className="h-5 w-5 text-indigo-600" />
                  <span>制品库</span>
                </div>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  onClick={handleCreateArtifact}
                  disabled={isCreating}
                  className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  placeholder="搜索制品..." 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {artifacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Box className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-xs text-slate-400">暂无制品</p>
                  <button onClick={handleCreateArtifact} className="mt-3 text-xs font-bold text-indigo-600 hover:text-indigo-700">立即新建</button>
                </div>
              ) : (
                artifacts.map((item) => {
                  const isActive = item.id === currentArtifactId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectArtifact(item)}
                      className={`
                        w-full text-left p-3 rounded-xl transition-all group border border-transparent
                        ${isActive 
                          ? "bg-indigo-50 border-indigo-100 shadow-sm" 
                          : "hover:bg-slate-50 hover:border-slate-100"
                        }
                      `}
                    >
                      <h4 className={`text-sm font-bold ${isActive ? "text-indigo-900" : "text-slate-700"}`}>
                        {item.title || "未命名制品"}
                      </h4>
                      <p className={`text-xs mt-1 line-clamp-2 ${isActive ? "text-indigo-600/80" : "text-slate-400"}`}>
                        {item.problem || "暂无描述"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>
        </>

        {/* Main Content: Artifact Editor */}
        <section className="flex-1 flex flex-col min-w-0 bg-slate-50/50 overflow-hidden relative">
          {currentArtifact ? (
            <>
              {/* Header */}
              <header className="flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 shadow-sm z-10">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                    <Box className="h-5 w-5" />
                  </div>
                  <div>
                    <input 
                      value={form.title}
                      onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                      className="text-lg font-bold text-slate-900 bg-transparent outline-none placeholder:text-slate-300 w-full"
                      placeholder="输入制品标题"
                    />
                    <input 
                      value={form.problem}
                      onChange={(e) => setForm(p => ({ ...p, problem: e.target.value }))}
                      className="text-xs text-slate-500 bg-transparent outline-none placeholder:text-slate-300 w-full mt-0.5"
                      placeholder="简要描述该制品解决的问题..."
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {error && <span className="text-xs font-bold text-rose-500 animate-pulse">{error}</span>}
                  <button 
                    onClick={() => router.push(`/?projectId=${projectId}`)}
                    className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                    title="返回生成向导"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "保存中..." : "保存草稿"}
                  </button>
                  <button 
                    onClick={handleUseArtifact}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-xs font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:translate-y-[-1px] transition-all"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    立即使用
                  </button>
                </div>
              </header>

              {/* Editor Area */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-5xl mx-auto grid gap-8 lg:grid-cols-[1.5fr_1fr]">
                  {/* Left: Prompt Editor */}
                  <div className="flex flex-col gap-4">
                    <div className="bg-white rounded-3xl p-1 shadow-sm ring-1 ring-slate-100">
                      <div className="px-5 py-3 border-b border-slate-50 flex items-center gap-2">
                        <Layers className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prompt 模板内容</span>
                      </div>
                      <textarea 
                        value={form.prompt_content}
                        onChange={(e) => setForm(p => ({ ...p, prompt_content: e.target.value }))}
                        className="w-full min-h-[500px] p-5 text-sm font-mono text-slate-800 leading-relaxed outline-none resize-none bg-transparent"
                        placeholder="在此输入 Prompt 模板，使用 {{variable}} 标记变量..."
                      />
                    </div>
                  </div>

                  {/* Right: Variable Configuration */}
                  <div className="flex flex-col gap-4">
                    <div className="bg-white rounded-3xl shadow-sm ring-1 ring-slate-100 overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-4 w-4 text-indigo-500" />
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">变量配置</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={handleExtractVariables}
                            className="text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded transition-colors"
                          >
                            自动提取
                          </button>
                          <button 
                            onClick={handleAddVariable}
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 space-y-4 max-h-[calc(100vh-240px)] overflow-y-auto">
                        {templateKeys.length > 0 && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs">
                            <p className="font-bold mb-1">检测到模板变量：</p>
                            <div className="flex flex-wrap gap-1">
                              {templateKeys.map(k => (
                                <span key={k} className="px-1.5 py-0.5 bg-amber-100 rounded text-[10px] font-mono">{k}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {form.variables && form.variables.length > 0 ? (
                          form.variables.map((variable, index) => (
                            <div key={index} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-indigo-200 hover:shadow-sm transition-all">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-400">Variable {index + 1}</span>
                                <button onClick={() => handleRemoveVariable(index)} className="text-slate-300 hover:text-rose-500 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              
                              <div className="grid gap-3">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">变量名 (Key)</label>
                                    <input 
                                      value={variable.key}
                                      onChange={(e) => updateVariableAt(index, { key: e.target.value })}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500 font-mono"
                                      placeholder="key_name"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">显示名称 (Label)</label>
                                    <input 
                                      value={variable.label}
                                      onChange={(e) => updateVariableAt(index, { label: e.target.value })}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                                      placeholder="显示标签"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">类型</label>
                                    <select 
                                      value={variable.type}
                                      onChange={(e) => updateVariableAt(index, { type: e.target.value as any })}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                                    >
                                      <option value="string">单行文本</option>
                                      <option value="text">多行文本</option>
                                      <option value="number">数字</option>
                                      <option value="boolean">布尔值</option>
                                      <option value="enum">枚举 (Enum)</option>
                                      <option value="list">列表 (List)</option>
                                    </select>
                                  </div>
                                  <div className="flex items-end pb-2">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input 
                                        type="checkbox"
                                        checked={variable.required ?? true}
                                        onChange={(e) => updateVariableAt(index, { required: e.target.checked })}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                      <span className="text-xs font-medium text-slate-600">必填项</span>
                                    </label>
                                  </div>
                                </div>

                                {variable.type === "enum" && (
                                  <div>
                                    <label className="text-[10px] font-bold text-slate-400 mb-1 block">选项 (逗号分隔)</label>
                                    <input 
                                      value={(variable.options ?? []).join(", ")}
                                      onChange={(e) => updateVariableAt(index, { options: parseListValue(e.target.value) })}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                                      placeholder="选项A, 选项B"
                                    />
                                  </div>
                                )}

                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 mb-1 block">输入提示 (Placeholder)</label>
                                  <input 
                                    value={variable.placeholder ?? ""}
                                    onChange={(e) => updateVariableAt(index, { placeholder: e.target.value })}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                                    placeholder="给用户的输入提示..."
                                  />
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="py-8 text-center">
                            <p className="text-xs text-slate-400">暂无变量，请点击上方“自动提取”或手动添加。</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
              <Box className="h-12 w-12 mb-4 text-slate-200" />
              <p>请选择左侧制品或新建一个开始编辑</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
