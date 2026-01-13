export const VARIABLE_KEY_REGEX = /^[A-Za-z][A-Za-z0-9_]*$/;
const TEMPLATE_VARIABLE_REGEX = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const ESCAPED_LEFT_BRACE = "__ESCAPED_LEFT_BRACE__";

export const extractTemplateVariables = (template: string) => {
  if (!template) {
    return [] as string[];
  }

  const keys = new Set<string>();

  for (const match of template.matchAll(TEMPLATE_VARIABLE_REGEX)) {
    const index = match.index ?? 0;
    if (index > 0 && template[index - 1] === "\\") {
      continue;
    }
    keys.add(match[1]);
  }

  return Array.from(keys);
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
    (_, key: string) => values[key] ?? ""
  );

  return replaced.replaceAll(ESCAPED_LEFT_BRACE, "{{");
};
