export const VARIABLE_KEY_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;
const TEMPLATE_VARIABLE_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g;
const ESCAPED_LEFT_BRACE = "__ESCAPED_LEFT_BRACE__";

type TemplateVariableMeta = {
  key: string;
  label?: string;
  type?: "string" | "text" | "number" | "boolean" | "enum" | "list";
  required?: boolean;
  placeholder?: string;
  default?: string | number | boolean | string[];
  options?: string[];
  joiner?: string;
  true_label?: string;
  false_label?: string;
};

const parseBoolean = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const splitValueList = (value: string) =>
  value
    .split(/[;,，]/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseTemplateVariable = (raw: string): TemplateVariableMeta | null => {
  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const key = parts[0];
  if (!VARIABLE_KEY_REGEX.test(key)) {
    return null;
  }

  const meta: TemplateVariableMeta = { key };

  parts.slice(1).forEach((part) => {
    const colonIndex = part.indexOf(":");
    const equalIndex = part.indexOf("=");
    const splitIndex =
      colonIndex === -1
        ? equalIndex
        : equalIndex === -1
          ? colonIndex
          : Math.min(colonIndex, equalIndex);
    if (splitIndex <= 0) {
      return;
    }
    const rawKey = part.slice(0, splitIndex).trim().toLowerCase();
    const rawValue = part.slice(splitIndex + 1).trim();
    if (!rawKey || !rawValue) {
      return;
    }

    if (rawKey === "label") {
      meta.label = rawValue;
      return;
    }

    if (rawKey === "type") {
      if (
        rawValue === "string" ||
        rawValue === "text" ||
        rawValue === "number" ||
        rawValue === "boolean" ||
        rawValue === "enum" ||
        rawValue === "list"
      ) {
        meta.type = rawValue;
      }
      return;
    }

    if (rawKey === "required") {
      const parsed = parseBoolean(rawValue);
      if (parsed !== undefined) {
        meta.required = parsed;
      }
      return;
    }

    if (rawKey === "default") {
      if (meta.type === "number") {
        const numericValue = Number(rawValue);
        meta.default = Number.isNaN(numericValue) ? rawValue : numericValue;
      } else if (meta.type === "boolean") {
        const parsed = parseBoolean(rawValue);
        meta.default = parsed ?? rawValue;
      } else if (meta.type === "list") {
        meta.default = splitValueList(rawValue);
      } else {
        meta.default = rawValue;
      }
      return;
    }

    if (rawKey === "options") {
      meta.options = splitValueList(rawValue);
      return;
    }

    if (rawKey === "placeholder") {
      meta.placeholder = rawValue;
      return;
    }

    if (rawKey === "joiner") {
      meta.joiner = rawValue;
      return;
    }

    if (rawKey === "true_label") {
      meta.true_label = rawValue;
      return;
    }

    if (rawKey === "false_label") {
      meta.false_label = rawValue;
    }
  });

  return meta;
};

export const parseTemplateVariables = (template: string) => {
  if (!template) {
    return [] as TemplateVariableMeta[];
  }

  const result = new Map<string, TemplateVariableMeta>();

  for (const match of template.matchAll(TEMPLATE_VARIABLE_REGEX)) {
    const index = match.index ?? 0;
    if (index > 0 && template[index - 1] === "\\") {
      continue;
    }
    const parsed = parseTemplateVariable(match[1]);
    if (!parsed) {
      continue;
    }
    const existing = result.get(parsed.key);
    if (!existing) {
      result.set(parsed.key, parsed);
      continue;
    }
    result.set(parsed.key, {
      ...existing,
      label: existing.label ?? parsed.label,
      type: existing.type ?? parsed.type,
      required: existing.required ?? parsed.required,
      placeholder: existing.placeholder ?? parsed.placeholder,
      default: existing.default ?? parsed.default,
      options:
        existing.options && existing.options.length > 0
          ? existing.options
          : parsed.options,
      joiner: existing.joiner ?? parsed.joiner,
      true_label: existing.true_label ?? parsed.true_label,
      false_label: existing.false_label ?? parsed.false_label,
    });
  }

  return Array.from(result.values());
};

export const extractTemplateVariables = (template: string) => {
  return parseTemplateVariables(template).map((item) => item.key);
};

export const renderTemplate = (
  template: string,
  values: Record<string, string>
) => {
  if (!template) {
    return "";
  }

  const escaped = template.replace(/\\\{\{/g, ESCAPED_LEFT_BRACE);
  const replaced = escaped.replace(
    TEMPLATE_VARIABLE_REGEX,
    (fullMatch, raw: string) => {
      const parsed = parseTemplateVariable(raw);
      if (!parsed) {
        return fullMatch;
      }
      return values[parsed.key] ?? "";
    }
  );

  return replaced.replaceAll(ESCAPED_LEFT_BRACE, "{{");
};

const TITLE_LABEL_REGEX =
  /^(role|角色|title|标题|system prompt|prompt|任务|目标)[:：]\s*/i;

export const deriveTitleFromPrompt = (prompt: string) => {
  const lines = prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return "新对话";
  }

  const cleaned = lines.map((line) =>
    line
      .replace(/^#+\s*/, "")
      .replace(/^[-*]\s*/, "")
      .replace(TITLE_LABEL_REGEX, "")
      .trim()
  );

  const candidate = cleaned.find((line) => line.length > 1) ?? cleaned[0] ?? "";
  if (!candidate) {
    return "新对话";
  }

  return candidate.length > 24 ? `${candidate.slice(0, 24)}…` : candidate;
};
