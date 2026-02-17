export type ParsedCardParameters = {
  name?: string;
  cardNumber?: string;
  set?: string;
  language?: string;
};

export type CardRefCandidate = {
  cardRefId: string;
  name: string;
  set: string;
  tcgId?: string | null;
  score: number;
};

export type CardRefLookupRow = {
  id: string;
  name: string;
  set_id: string;
  tcg_id: string | null;
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s/.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .filter((part) => part.length >= 2);
}

function languageFromText(text: string) {
  const raw = normalize(text);
  if (/(japan|japanese|jp\b)/.test(raw)) return "jp";
  if (/(french|francais|\bfr\b)/.test(raw)) return "fr";
  if (/(english|\ben\b)/.test(raw)) return "en";
  return undefined;
}

function extractCardNumber(text: string) {
  const match = text.match(/\b(\d{1,3}\s*\/\s*\d{2,3})\b/);
  if (!match?.[1]) return undefined;
  return match[1].replace(/\s+/g, "");
}

function extractSet(text: string) {
  const exp = text.match(/\bEXP-\d{2,6}\b/i)?.[0];
  if (exp) return exp.toUpperCase();
  const setLike = text.match(/\b(?:base set|scarlet|violet|fusion strike|evolving skies|silver tempest)\b/i)?.[0];
  return setLike ? titleCase(setLike) : undefined;
}

function extractName(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 3);
  if (lines.length === 0) return undefined;

  const blacklist = [/^\d+\/\d+$/, /^hp\s?\d+/i, /^pokemon$/i, /^trainer$/i, /^energy$/i];
  for (const line of lines) {
    if (blacklist.some((rule) => rule.test(line))) continue;
    const safe = line.replace(/\[[^\]]*]/g, "").trim();
    if (!safe) continue;
    return safe;
  }
  return undefined;
}

function overlapScore(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const token of setA) {
    if (setB.has(token)) common += 1;
  }
  return common / Math.max(setA.size, setB.size);
}

export function parseCardParameters(rawText: string): ParsedCardParameters {
  return {
    name: extractName(rawText),
    cardNumber: extractCardNumber(rawText),
    set: extractSet(rawText),
    language: languageFromText(rawText),
  };
}

export function buildLookupTerms(parsed: ParsedCardParameters, rawText: string) {
  const terms = new Set<string>();
  if (parsed.name) {
    tokenize(parsed.name)
      .slice(0, 4)
      .forEach((token) => terms.add(token));
  }

  const cardNumber = parsed.cardNumber?.split("/")[0];
  if (cardNumber) terms.add(cardNumber);

  if (parsed.set) {
    tokenize(parsed.set).forEach((token) => terms.add(token));
  }

  if (terms.size < 2) {
    tokenize(rawText)
      .slice(0, 8)
      .forEach((token) => terms.add(token));
  }

  return Array.from(terms).slice(0, 8);
}

export function rankCardRefCandidates(params: {
  parsed: ParsedCardParameters;
  rawText: string;
  rows: CardRefLookupRow[];
  limit?: number;
}) {
  const { parsed, rawText, rows, limit = 3 } = params;
  const normalizedRaw = normalize(rawText);
  const parsedNameTokens = tokenize(parsed.name ?? "");
  const parsedSetTokens = tokenize(parsed.set ?? "");
  const normalizedCardNumber = parsed.cardNumber ? normalize(parsed.cardNumber) : "";

  const ranked = rows
    .map((row) => {
      let score = 0;
      const rowName = normalize(row.name);
      const rowSet = normalize(row.set_id);
      const rowTcg = normalize(row.tcg_id ?? "");

      if (parsed.name) {
        if (rowName === normalize(parsed.name)) score += 0.55;
        score += overlapScore(parsedNameTokens, tokenize(row.name)) * 0.35;
      } else {
        score += overlapScore(tokenize(rawText), tokenize(row.name)) * 0.35;
      }

      if (parsed.set) {
        if (rowSet.includes(normalize(parsed.set))) score += 0.18;
        score += overlapScore(parsedSetTokens, tokenize(row.set_id)) * 0.1;
      }

      if (normalizedCardNumber) {
        if (rowTcg.includes(normalizedCardNumber)) score += 0.2;
      }

      if (normalizedRaw.includes(rowName) && rowName.length >= 4) {
        score += 0.12;
      }

      return {
        cardRefId: row.id,
        name: row.name,
        set: row.set_id,
        tcgId: row.tcg_id,
        score: Math.min(0.99, Math.max(0, Number(score.toFixed(4)))),
      } satisfies CardRefCandidate;
    })
    .filter((row) => row.score > 0.15)
    .sort((a, b) => b.score - a.score);

  const deduped: CardRefCandidate[] = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const key = `${normalize(row.name)}::${normalize(row.set)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
    if (deduped.length >= limit) break;
  }

  const confidence = deduped.length > 0 ? deduped[0].score : 0;
  return { candidates: deduped, confidence };
}

