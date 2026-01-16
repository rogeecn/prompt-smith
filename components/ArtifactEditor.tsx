"use client";

import { useMemo, useState, useEffect } from "react";
import {
  Save,
  Plus,
} from "lucide-react";
import { updateArtifact } from "../src/app/actions";
import type { Artifact, ArtifactUpdate, ArtifactVariable } from "../lib/schemas";
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
};

export default function ArtifactEditor({
  projectId,
  artifact,
  onSave,
  onCancel,
}: ArtifactEditorProps) {
  const [form, setForm] = useState<ArtifactUpdate>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when artifact changes
  useEffect(() => {
    setForm({
      title: artifact.title || "",
      problem: artifact.problem || "",
      prompt_content: artifact.prompt_content || "",
      variables: artifact.variables ?? [],
    });
  }, [artifact.id]);

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
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <header className="border-b border-gray-100 px-8 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 min-w-0 space-y-2">
            <input
              id="artifact-title"
              name="artifactTitle"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full bg-transparent font-display text-3xl font-bold text-black outline-none placeholder:text-gray-300"
              placeholder="输入制品标题"
            />
            <input
              id="artifact-problem"
              name="artifactProblem"
              value={form.problem}
              onChange={(e) => setForm((prev) => ({ ...prev, problem: e.target.value }))}
              className="w-full bg-transparent text-sm text-gray-500 outline-none placeholder:text-gray-300"
              placeholder="简要描述该制品解决的问题"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {error && <span className="text-xs font-semibold text-rose-500">{error}</span>}
            <button
              type="button"
              onClick={onCancel}
              className="border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-black"
            >
              返回对话
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 border border-black bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-black/90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Prompt 模板内容
            </div>
            <textarea
              id="artifact-prompt"
              name="artifactPrompt"
              value={form.prompt_content}
              onChange={(e) => setForm((prev) => ({ ...prev, prompt_content: e.target.value }))}
              className="min-h-[520px] w-full resize-none bg-transparent font-mono text-sm text-gray-800 outline-none"
              placeholder="在此输入 Prompt 模板，使用 {{variable}} 标记变量..."
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                变量配置
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <button type="button" onClick={handleExtractVariables} className="hover:text-black">
                  自动提取
                </button>
                <button type="button" onClick={handleAddVariable} className="hover:text-black">
                  添加
                </button>
              </div>
            </div>

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
                          onChange={(e) => updateVariableAt(index, { key: e.target.value })}
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
                          onChange={(e) => updateVariableAt(index, { label: e.target.value })}
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
                          onChange={(e) => updateVariableAt(index, { type: e.target.value as ArtifactVariable["type"] })}
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
                            onChange={(e) => updateVariableAt(index, { required: e.target.checked })}
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
                          onChange={(e) => updateVariableAt(index, { options: parseListValue(e.target.value) })}
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
                        onChange={(e) => updateVariableAt(index, { placeholder: e.target.value })}
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
        </div>
      </div>
    </div>
  );
}
