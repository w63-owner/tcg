export function formatConditionLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/_/g, " ");
}

