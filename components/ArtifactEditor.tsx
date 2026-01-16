"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Settings2,
  Save,
  ArrowLeft,
  Layers,
  Box,
  Plus,
  Trash2,
  Play,
} from "lucide-react";
import {
  updateArtifact,
} from "../src/app/actions";
import type {
  Artifact,
  ArtifactUpdate,
  ArtifactVariable,
} from "../lib/schemas";
import { parseTemplateVariables } from "../lib/template";

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

type ArtifactEditorProps = {
  projectId: string;
  artifact: Artifact;
  onSave?: (updatedArtifact: Artifact) => void;
  onCancel: () => void;
  onUseArtifact?: () => void; // Switch to chat mode
};

export default function ArtifactEditor({
  projectId,
  artifact,
  onSave,
  onCancel,
  onUseArtifact,
}: ArtifactEditorProps) {
  const [form, setForm] = useState<ArtifactUpdate>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when artifact changes
  useEffect(() => {
    if (artifact) {
      setForm({
        title: artifact.title || "",
        problem: artifact.problem || "",
        prompt_content: artifact.prompt_content || "",
        variables: artifact.variables ?? [],
      });
    }
  }, [artifact]);

  const templateVariables = useMemo(
    () => parseTemplateVariables(form.prompt_content),
    [form.prompt_content]
  );
  const templateKeys = useMemo(
    () => templateVariables.map((item) => item.key),
    [templateVariables]
  );

  const handleSave = async () => {
    if (!projectId || !artifact.id || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const trimmed: ArtifactUpdate = {
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
      const variableKeys = (trimmed.variables || []).map(v => v.key);
      const uniqueKeys = new Set(variableKeys.filter(Boolean));
      
      if (uniqueKeys.size !== variableKeys.filter(Boolean).length) {
        setError("变量名重复，请检查配置。");
        setIsSaving(false);
        return;
      }
      
      if (templateKeysLocal.length > 0 && (trimmed.variables || []).length === 0) {
        setError("检测到模板变量，请先配置变量或清理占位符。");
        setIsSaving(false);
        return;
      }
      
      const missingKeys = templateKeysLocal.filter(k => !uniqueKeys.has(k));
      if (missingKeys.length > 0) {
        setError(`缺少变量配置：${missingKeys.join(", ")}`);
        setIsSaving(false);
        return;
      }

      const updated = await updateArtifact(projectId, artifact.id, trimmed);
      if (onSave) {
        onSave(updated);
      }
    } catch {
      setError("保存失败，请检查内容后重试。");
    } finally {
      setIsSaving(false);
    }
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

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 z-10 shrink-0">
        <div className="flex items-center gap-4 flex-1 mr-4">
          <div className="h-10 w-10 border border-slate-200 bg-white flex items-center justify-center text-slate-700 shrink-0">
            <Box className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              id="artifact-title"
              name="artifactTitle"
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              className="text-lg font-bold text-slate-900 bg-transparent outline-none placeholder:text-slate-300 w-full"
              placeholder="输入制品标题"
            />
            <input
              id="artifact-problem"
              name="artifactProblem"
              value={form.problem}
              onChange={(e) => setForm(p => ({ ...p, problem: e.target.value }))}
              className="text-xs text-slate-500 bg-transparent outline-none placeholder:text-slate-300 w-full mt-0.5"
              placeholder="简要描述该制品解决的问题..."
            />
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {error && <span className="text-xs font-bold text-rose-500 animate-pulse">{error}</span>}
          <button 
            onClick={onCancel}
            className="p-2 border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
            title="返回"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "保存中..." : "保存"}
          </button>
          {onUseArtifact && (
            <button 
              onClick={onUseArtifact}
              className="flex items-center gap-2 border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
            >
              <Play className="h-4 w-4 fill-current" />
              使用
            </button>
          )}
        </div>
      </header>

      {/* Editor Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          {/* Left: Prompt Editor */}
          <div className="flex flex-col gap-4">
            <div className="border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <Layers className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prompt 模板内容</span>
              </div>
              <textarea
                id="artifact-prompt"
                name="artifactPrompt"
                value={form.prompt_content}
                onChange={(e) => setForm(p => ({ ...p, prompt_content: e.target.value }))}
                className="w-full min-h-[500px] p-4 text-sm font-mono text-slate-800 leading-relaxed outline-none resize-none bg-white"
                placeholder="在此输入 Prompt 模板，使用 {{variable}} 标记变量..."
              />
            </div>
          </div>

          {/* Right: Variable Configuration */}
          <div className="flex flex-col gap-4">
            <div className="border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-indigo-500" />
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">变量配置</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleExtractVariables}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    自动提取
                  </button>
                  <button 
                    onClick={handleAddVariable}
                    className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {templateKeys.length > 0 && (
                  <div className="p-3 border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                    <p className="font-bold mb-1">检测到模板变量：</p>
                    <div className="flex flex-wrap gap-1">
                      {templateKeys.map(k => (
                        <span key={k} className="px-1.5 py-0.5 bg-amber-100 text-[10px] font-mono">{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {form.variables && form.variables.length > 0 ? (
                  form.variables.map((variable, index) => (
                    <div key={index} className="border-b border-slate-200 pb-4 last:border-b-0">
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
                              id={`variable-${index}-key`}
                              name={`variable-${index}-key`}
                              value={variable.key}
                              onChange={(e) => updateVariableAt(index, { key: e.target.value })}
                              className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-600 font-mono"
                              placeholder="key_name"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">显示名称 (Label)</label>
                            <input
                              id={`variable-${index}-label`}
                              name={`variable-${index}-label`}
                              value={variable.label}
                              onChange={(e) => updateVariableAt(index, { label: e.target.value })}
                              className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-600"
                              placeholder="显示标签"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">类型</label>
                            <select
                              id={`variable-${index}-type`}
                              name={`variable-${index}-type`}
                              value={variable.type}
                              onChange={(e) => updateVariableAt(index, { type: e.target.value as any })}
                              className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-600"
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
                                id={`variable-${index}-required`}
                                name={`variable-${index}-required`}
                                type="checkbox"
                                checked={variable.required ?? true}
                                onChange={(e) => updateVariableAt(index, { required: e.target.checked })}
                                className="border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-xs font-medium text-slate-600">必填项</span>
                            </label>
                          </div>
                        </div>

                        {variable.type === "enum" && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 mb-1 block">选项 (逗号分隔)</label>
                            <input
                              id={`variable-${index}-options`}
                              name={`variable-${index}-options`}
                              value={(variable.options ?? []).join(", ")}
                              onChange={(e) => updateVariableAt(index, { options: parseListValue(e.target.value) })}
                              className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-600"
                              placeholder="选项A, 选项B"
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-[10px] font-bold text-slate-400 mb-1 block">输入提示 (Placeholder)</label>
                          <input
                            id={`variable-${index}-placeholder`}
                            name={`variable-${index}-placeholder`}
                            value={variable.placeholder ?? ""}
                            onChange={(e) => updateVariableAt(index, { placeholder: e.target.value })}
                            className="w-full border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-600"
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
    </div>
  );
}
