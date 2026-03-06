export function formatConditionLabel(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/_/g, " ");
}

export const CONDITION_DEFINITIONS: Record<string, string> = {
  MINT: "Parfait état, aucune usure visible. Carte non jouée ou sortie de son emballage d’origine.",
  NEAR_MINT: "État quasi neuf. Très légères traces de manipulation possibles, pas d’usure de jeu.",
  EXCELLENT: "Très bon état. Légères traces d’utilisation, pas de pli ni de défaut notable.",
  GOOD: "Bon état. Traces d’utilisation visibles, peut présenter de légers plis ou frottements.",
  LIGHT_PLAYED: "État correct. Usure modérée, petits défauts possibles (bords, coins).",
  PLAYED: "État joué. Usure visible, peut avoir des plis, frottements ou marques d’usage.",
  POOR: "Mauvais état. Forte usure, dommages visibles (déchirures, taches, plis prononcés).",
};

