"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Pencil, Search, Trash2, MoreVertical } from "lucide-react";
import TopNav from "./TopNav";
import ArtifactChat from "./ArtifactChat";
import {
  createArtifact,
  createArtifactSession,
  createProject,
  deleteArtifact,
  listArtifacts,
  loadArtifactContext,
  loadArtifactSession,
  updateArtifact,
} from "../src/app/actions";
import type { Artifact, ArtifactUpdate, ArtifactVariable, HistoryItem } from "../lib/schemas";
import { parseTemplateVariables } from "../lib/template";

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

type ArtifactsClientProps = {
  initialProjectId?: string | null;
};

export default function ArtifactsClient({
  initialProjectId = null,
}: ArtifactsClientProps) {
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentArtifactId, setCurrentArtifactId] = useState<string | null>(null);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [viewMode, setViewMode] = useState<"chat" | "edit">("chat");
  const [form, setForm] = useState<ArtifactUpdate>(emptyForm);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<
    { id: string; created_at: string | Date; last_message?: string }[]
  >([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<HistoryItem[]>([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingArtifact, setIsCreatingArtifact] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingArtifactId, setDeletingArtifactId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const hasRequestedRef = useRef(false);

  const validProjectId = projectIdSchema.safeParse(initialProjectId).success
    ? initialProjectId
    : null;

  // Project Init
  const createAndRedirect = useCallback(async () => {
    if (isCreatingProject) return;
    setIsCreatingProject(true);
    try {
      const newProjectId = await createProject();
      setProjectId(newProjectId);
      router.replace(`/artifacts?projectId=${newProjectId}`);
    } finally {
      setIsCreatingProject(false);
    }
  }, [isCreatingProject, router]);

  useEffect(() => {
    if (validProjectId) {
      setProjectId(validProjectId);
      return;
    }
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;
    void createAndRedirect();
  }, [validProjectId, createAndRedirect]);

  // Artifact List
  const refreshArtifacts = useCallback(async (activeProjectId: string) => {
    try {
      let items = await listArtifacts(activeProjectId);
      if (items.length === 0) {
        await createArtifact(activeProjectId);
        items = await listArtifacts(activeProjectId);
      }
      setArtifacts(items);
      setCurrentArtifactId((prev) =>
        prev && items.some((item) => item.id === prev) ? prev : null
      );
    } catch {
      // Error handling
    }
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void refreshArtifacts(projectId);
  }, [projectId, refreshArtifacts]);

  // Context Loading
  const loadContext = useCallback(async (artifactId: string) => {
    if (!projectId) return;
    setIsLoadingContext(true);
    try {
      const context = await loadArtifactContext(projectId, artifactId);
      setArtifact(context.artifact);
      setSessions(context.sessions);
      setCurrentSessionId(context.currentSessionId);
      setInitialMessages(context.history);
    } finally {
      setIsLoadingContext(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !currentArtifactId) {
      setArtifact(null);
      setSessions([]);
      setCurrentSessionId(null);
      setInitialMessages([]);
      return;
    }
    void loadContext(currentArtifactId);
  }, [projectId, currentArtifactId, loadContext]);

  // Actions
  const handleSelectArtifact = (artifactItem: Artifact) => {
    setCurrentArtifactId(artifactItem.id);
    setViewMode("chat");
    setEditorError(null);
    setIsSidebarOpen(false);
  };

  const handleCreateArtifact = async () => {
    if (!projectId || isCreatingArtifact) return;
    setIsCreatingArtifact(true);
    setEditorError(null);
    try {
      const created = await createArtifact(projectId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      setCurrentArtifactId(created.id);
      setArtifact(created);
      setForm({
        title: created.title,
        problem: created.problem,
        prompt_content: created.prompt_content,
        variables: created.variables ?? [],
      });
      setViewMode("edit");
    } finally {
      setIsCreatingArtifact(false);
    }
  };

  const handleEditArtifact = (artifactItem: Artifact) => {
    if (!projectId) return;
    setCurrentArtifactId(artifactItem.id);
    setArtifact(artifactItem);
    setForm({
      title: artifactItem.title,
      problem: artifactItem.problem,
      prompt_content: artifactItem.prompt_content,
      variables: artifactItem.variables ?? [],
    });
    setEditorError(null);
    setViewMode("edit");
    setIsSidebarOpen(false);
  };

  const handleDeleteArtifact = (artifactItem: Artifact) => {
    if (!projectId || deletingArtifactId) return;
    setDeleteTarget({
      id: artifactItem.id,
      title: artifactItem.title || "未命名制品",
    });
  };

  const confirmDeleteArtifact = async () => {
    if (!projectId || !deleteTarget) return;
    const artifactId = deleteTarget.id;
    setDeletingArtifactId(artifactId);
    try {
      await deleteArtifact(projectId, artifactId);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      if (currentArtifactId === artifactId) {
        setCurrentArtifactId(items[0]?.id ?? null);
        setViewMode("chat");
        setForm(emptyForm);
      }
    } finally {
      setDeletingArtifactId(null);
      setDeleteTarget(null);
    }
  };

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      if (!projectId || !currentArtifactId || sessionId === currentSessionId) return;
      setIsLoadingContext(true);
      try {
        const context = await loadArtifactSession(projectId, currentArtifactId, sessionId);
        setInitialMessages(context.history);
        setCurrentSessionId(sessionId);
      } finally {
        setIsLoadingContext(false);
      }
    },
    [projectId, currentArtifactId, currentSessionId]
  );

  const handleCreateSession = useCallback(async () => {
    if (!projectId || !currentArtifactId || isCreatingSession) return;
    setIsCreatingSession(true);
    try {
      const sessionId = await createArtifactSession(projectId, currentArtifactId);
      setCurrentSessionId(sessionId);
      setInitialMessages([]);
      setSessions((prev) => [
        { id: sessionId, created_at: new Date(), last_message: "New Branch" },
        ...prev,
      ]);
    } finally {
      setIsCreatingSession(false);
    }
  }, [projectId, currentArtifactId, isCreatingSession]);

  const handleSessionIdChange = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId);
    setSessions((prev) => {
      if (prev.some((item) => item.id === sessionId)) return prev;
      return [{ id: sessionId, created_at: new Date(), last_message: "New Branch" }, ...prev];
    });
  }, []);

  const formatDate = (value: string | Date) => {
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

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

  const updateVariableAt = (index: number, patch: Partial<ArtifactVariable>) => {
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
    if (templateVariables.length === 0) {
      setEditorError("模板中未检测到变量占位符。");
      return;
    }
    setEditorError(null);
    setForm((prev) => {
      const existing = new Map((prev.variables ?? []).map((v) => [v.key, v]));
      const nextVariables = templateVariables.map((v) => {
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

  const handleSaveArtifact = async () => {
    if (!projectId || !currentArtifactId || isSaving) return;
    setIsSaving(true);
    setEditorError(null);
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
      const templateKeysLocal = parseTemplateVariables(trimmed.prompt_content).map(
        (item) => item.key
      );
      const variableKeys = trimmed.variables.map((variable) => variable.key);
      const uniqueKeys = new Set(variableKeys.filter(Boolean));
      if (uniqueKeys.size !== variableKeys.filter(Boolean).length) {
        setEditorError("变量名重复，请检查配置。");
        return;
      }
      if (templateKeysLocal.length > 0 && trimmed.variables.length === 0) {
        setEditorError("检测到模板变量，请先配置变量或清理占位符。");
        return;
      }
      const missingKeys = templateKeysLocal.filter((key) => !uniqueKeys.has(key));
      if (missingKeys.length > 0) {
        setEditorError(`缺少变量配置：${missingKeys.join(", ")}`);
        return;
      }
      const updated = await updateArtifact(projectId, currentArtifactId, trimmed);
      const items = await listArtifacts(projectId);
      setArtifacts(items);
      setArtifact(updated);
    } catch {
      setEditorError("保存失败，请检查内容后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExitEditor = () => {
    setViewMode("chat");
    setEditorError(null);
  };

  if (!projectId) {
    return (
      <div className="flex min-h-screen flex-col bg-background items-center justify-center">
        <div className="animate-pulse font-display text-2xl">Loading Artifacts...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-white">
      <TopNav />

      {/* Mobile Toggle */}
      <div className="lg:hidden border-b border-gray-200 p-4 flex justify-between items-center bg-white">
        <span className="font-heading font-bold text-lg">Artifacts</span>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          <MoreVertical />
        </button>
      </div>

      <main className="flex flex-1 min-h-0 w-full overflow-hidden relative">
         {/* Sidebar Overlay */}
         {isSidebarOpen && (
          <div 
            className="absolute inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* 1. Left Sidebar: Artifact List */}
        <aside 
          className={`
            absolute inset-y-0 left-0 z-50 w-80 transform border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <div className="flex h-full flex-col">
            <div className="p-6 border-b border-gray-100">
               <div className="relative mb-6">
                 <input
                   type="text"
                   id="artifact-search"
                   name="artifactSearch"
                   placeholder="Search artifacts..."
                   className="w-full border-b border-gray-300 py-2 text-sm font-body outline-none focus:border-black transition-colors bg-transparent"
                 />
                 <Search className="absolute right-0 top-2 h-4 w-4 text-gray-400" />
               </div>
               
               <div className="flex items-center justify-between">
                 <h2 className="font-heading font-bold text-lg text-black">Library</h2>
                 <button 
                   onClick={handleCreateArtifact}
                   disabled={isCreatingArtifact}
                   className="text-xs font-bold uppercase tracking-wider text-black hover:text-accent disabled:opacity-50"
                 >
                   + New Artifact
                 </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {artifacts.map((item) => {
                const isActive = item.id === currentArtifactId;
                return (
                  <div
                    key={item.id}
                    className={`
                      flex items-start gap-2 border-b border-gray-50 p-6 transition-all duration-200
                      ${isActive ? "bg-surface-muted" : "hover:bg-gray-50"}
                    `}
                  >
                    <button onClick={() => handleSelectArtifact(item)} className="flex-1 text-left">
                      <div className={`border-l-2 pl-4 ${isActive ? "border-accent" : "border-transparent"}`}>
                        <h3 className={`font-heading font-bold text-base mb-1 ${isActive ? "text-black" : "text-gray-700"}`}>
                          {item.title || "Untitled Artifact"}
                        </h3>
                        <p className="font-body text-xs text-gray-500 line-clamp-2">
                          {item.problem || "No description provided."}
                        </p>
                      </div>
                    </button>
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <button
                        type="button"
                        aria-label="编辑制品"
                        onClick={() => handleEditArtifact(item)}
                        className="text-gray-400 hover:text-black transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="删除制品"
                        onClick={() => handleDeleteArtifact(item)}
                        disabled={deletingArtifactId === item.id}
                        className="text-gray-400 hover:text-rose-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* 2. Center: Chat Area */}
        <section className="flex flex-1 flex-col overflow-hidden bg-white relative min-w-0">
          {!currentArtifactId ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              Select an artifact to view details
            </div>
          ) : viewMode === "edit" ? (
            <>
              <div className="border-b border-gray-100 px-8 py-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      id="artifact-editor-title"
                      name="artifactEditorTitle"
                      value={form.title}
                      onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                      className="w-full bg-transparent font-display text-3xl font-bold text-black outline-none placeholder:text-gray-300"
                      placeholder="输入制品标题"
                    />
                    <input
                      id="artifact-editor-problem"
                      name="artifactEditorProblem"
                      value={form.problem}
                      onChange={(event) => setForm((prev) => ({ ...prev, problem: event.target.value }))}
                      className="w-full bg-transparent text-sm text-gray-500 outline-none placeholder:text-gray-300"
                      placeholder="简要描述该制品解决的问题"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editorError && (
                      <span className="text-xs font-semibold text-rose-500">{editorError}</span>
                    )}
                    <button
                      type="button"
                      onClick={handleExitEditor}
                      className="border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-black"
                    >
                      返回对话
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveArtifact}
                      disabled={isSaving}
                      className="border border-black bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/90 disabled:opacity-60"
                    >
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Prompt 模板内容
                  </div>
                  <textarea
                    id="artifact-editor-prompt"
                    name="artifactEditorPrompt"
                    value={form.prompt_content}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, prompt_content: event.target.value }))
                    }
                    className="min-h-[520px] w-full resize-none bg-transparent font-mono text-sm text-gray-800 outline-none"
                    placeholder="在此输入 Prompt 模板，使用 {{variable}} 标记变量..."
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Artifact Header */}
              <div className="border-b border-gray-100 px-8 py-6">
                 <h1 className="font-display text-3xl font-bold text-black mb-2">
                   {artifact?.title || currentArtifact?.title || "Untitled"}
                 </h1>
                 <p className="font-body text-sm text-gray-500 italic">
                   {artifact?.problem || currentArtifact?.problem || "Prompt engineering workspace"}
                 </p>
              </div>

              {/* Chat Stream */}
              <div className="flex-1 min-h-0 relative">
                {isLoadingContext ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-10">
                    <div className="font-mono text-xs">Loading context...</div>
                  </div>
                ) : currentSessionId && currentArtifactId ? (
                   <ArtifactChat
                    key={`${currentArtifactId}-${currentSessionId}`}
                    projectId={projectId as string}
                    artifactId={currentArtifactId}
                    sessionId={currentSessionId}
                    initialMessages={initialMessages}
                    variables={artifact?.variables}
                    onSessionIdChange={handleSessionIdChange}
                  />
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* 3. Right Sidebar: Session History & Variables */}
        {currentArtifact && viewMode === "edit" && (
          <aside className="hidden w-[320px] shrink-0 border-l border-gray-200 bg-white flex-col lg:flex">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-heading font-bold text-sm text-black">变量配置</h3>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <button type="button" onClick={handleExtractVariables} className="hover:text-black">
                  自动提取
                </button>
                <button type="button" onClick={handleAddVariable} className="hover:text-black">
                  添加
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {templateKeys.length > 0 && (
                <div className="text-xs text-gray-500">
                  检测到模板变量：
                  <span className="ml-2 font-mono text-gray-700">
                    {templateKeys.join(", ")}
                  </span>
                </div>
              )}

              {form.variables && form.variables.length > 0 ? (
                form.variables.map((variable, index) => (
                  <div key={`${variable.key}-${index}`} className="border-b border-gray-100 pb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500">
                        变量 {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariable(index)}
                        className="text-xs text-gray-400 hover:text-rose-500"
                      >
                        移除
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            Key
                          </div>
                          <input
                            id={`variable-${index}-key`}
                            name={`variable-${index}-key`}
                            value={variable.key}
                            onChange={(event) => updateVariableAt(index, { key: event.target.value })}
                            className="w-full border-b border-gray-200 bg-transparent py-1 text-xs font-mono text-gray-700 outline-none focus:border-black"
                            placeholder="key_name"
                          />
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            Label
                          </div>
                          <input
                            id={`variable-${index}-label`}
                            name={`variable-${index}-label`}
                            value={variable.label}
                            onChange={(event) => updateVariableAt(index, { label: event.target.value })}
                            className="w-full border-b border-gray-200 bg-transparent py-1 text-xs text-gray-700 outline-none focus:border-black"
                            placeholder="显示标签"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            类型
                          </div>
                          <select
                            id={`variable-${index}-type`}
                            name={`variable-${index}-type`}
                            value={variable.type}
                            onChange={(event) =>
                              updateVariableAt(index, { type: event.target.value as ArtifactVariable["type"] })
                            }
                            className="w-full border-b border-gray-200 bg-transparent py-1 text-xs text-gray-700 outline-none focus:border-black"
                          >
                            <option value="string">单行文本</option>
                            <option value="text">多行文本</option>
                            <option value="number">数字</option>
                            <option value="boolean">布尔值</option>
                            <option value="enum">枚举</option>
                            <option value="list">列表</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              id={`variable-${index}-required`}
                              name={`variable-${index}-required`}
                              type="checkbox"
                              checked={variable.required ?? true}
                              onChange={(event) =>
                                updateVariableAt(index, { required: event.target.checked })
                              }
                              className="border-gray-300 text-black focus:ring-black"
                            />
                            必填
                          </label>
                        </div>
                      </div>

                      {variable.type === "enum" && (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                            选项
                          </div>
                          <input
                            id={`variable-${index}-options`}
                            name={`variable-${index}-options`}
                            value={(variable.options ?? []).join(", ")}
                            onChange={(event) =>
                              updateVariableAt(index, {
                                options: parseListValue(event.target.value),
                              })
                            }
                            className="w-full border-b border-gray-200 bg-transparent py-1 text-xs text-gray-700 outline-none focus:border-black"
                            placeholder="选项A, 选项B"
                          />
                        </div>
                      )}

                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Placeholder
                        </div>
                        <input
                          id={`variable-${index}-placeholder`}
                          name={`variable-${index}-placeholder`}
                          value={variable.placeholder ?? ""}
                          onChange={(event) =>
                            updateVariableAt(index, { placeholder: event.target.value })
                          }
                          className="w-full border-b border-gray-200 bg-transparent py-1 text-xs text-gray-700 outline-none focus:border-black"
                          placeholder="给用户的输入提示..."
                        />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400">暂无变量，请点击上方按钮添加。</p>
              )}
            </div>
          </aside>
        )}

        {currentArtifact && viewMode !== "edit" && (
          <aside className="hidden w-[280px] shrink-0 border-l border-gray-200 bg-white flex-col lg:flex">
            
            {/* Session History */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-b border-gray-200">
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-heading font-bold text-sm text-black">Sessions</h3>
                <button 
                  onClick={handleCreateSession}
                  className="text-xs text-gray-500 hover:text-black transition-colors"
                >
                  + New
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {sessions.map((session, index) => {
                  const isActive = session.id === currentSessionId;
                  return (
                    <button
                      key={session.id}
                      onClick={() => handleSelectSession(session.id)}
                      className={`
                        w-full text-left p-3 border transition-all duration-200
                        ${isActive 
                          ? "border-accent bg-accent-light" 
                          : "border-gray-100 hover:bg-gray-50"
                        }
                      `}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-xs font-bold text-black">
                          #{sessions.length - index}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatDate(session.created_at)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 truncate font-body">
                        {session.last_message || "Empty"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Variables Snapshot */}
            <div className="h-1/3 min-h-[200px] flex flex-col bg-surface-muted">
              <div className="p-6 border-b border-gray-200/50">
                <h3 className="font-heading font-bold text-sm text-black">Variables</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-6 pt-2">
                {artifact?.variables && artifact.variables.length > 0 ? (
                  <div className="space-y-4">
                    {artifact.variables.map((v) => (
                       <div key={v.key} className="border-l-2 border-gray-300 pl-3">
                         <div className="text-xs text-gray-500 mb-1">{v.label}</div>
                         <code className="text-xs font-mono text-black bg-white px-1 py-0.5">
                           {`{{${v.key}}}`}
                         </code>
                       </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No variables defined yet.</p>
                )}
              </div>
            </div>

          </aside>
        )}
      </main>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!deletingArtifactId) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            className="w-full max-w-md border border-gray-200 bg-white p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-base font-bold text-black">删除制品</h3>
            <p className="mt-2 text-sm text-gray-600">
              确定要删除“{deleteTarget.title}”及其会话记录吗？此操作无法撤销。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:text-black"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingArtifactId === deleteTarget.id}
              >
                取消
              </button>
              <button
                type="button"
                className="border border-rose-500 bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600 disabled:opacity-60"
                onClick={confirmDeleteArtifact}
                disabled={deletingArtifactId === deleteTarget.id}
              >
                {deletingArtifactId === deleteTarget.id ? "删除中..." : "删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
