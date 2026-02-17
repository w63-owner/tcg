export type ParsedCardParameters = {
  name?: string;
  cardNumber?: string;
  set?: string;
  language?: string;
  hp?: number;
  rarity?: string;
  finish?: "NON_HOLO" | "HOLO" | "REVERSE_HOLO" | "FULL_ART" | "TEXTURED" | "COSMOS" | "CRACKED_ICE";
  isSecret?: boolean;
  isPromo?: boolean;
  vintageHint?: "1ST_EDITION" | "SHADOWLESS" | "UNLIMITED";
  regulationMark?: string;
  illustrator?: string;
  estimatedCondition?: "MINT" | "NEAR_MINT" | "EXCELLENT" | "GOOD" | "LIGHT_PLAYED" | "PLAYED" | "POOR";
};

export type CardRefCandidate = {
  cardRefId: string;
  name: string;
  set: string;
  tcgId?: string | null;
  cardNumber?: string | null;
  language?: string | null;
  score: number;
};

export type CardRefLookupRow = {
  id: string;
  name: string;
  set_id: string;
  tcg_id: string | null;
  card_number?: string | null;
  language?: string | null;
  rarity?: string | null;
  finish?: string | null;
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
  if (/(japan|japanese|jp\b|ポケモン|ポケットモンスター|トレーナー)/.test(raw)) return "jp";
  if (/(french|francais|franc a is|\bfr\b|pokemon france|carte pokemon)/.test(raw)) return "fr";
  if (/(english|\ben\b)/.test(raw)) return "en";
  return undefined;
}

function extractCardNumber(text: string) {
  const match = text.match(/\b(\d{1,3}\s*\/\s*\d{2,3})\b/);
  if (!match?.[1]) return undefined;
  return match[1].replace(/\s+/g, "");
}

function extractHp(text: string) {
  const hp = text.match(/\b(?:hp|pv)\s*[:.]?\s*(\d{2,4})\b/i)?.[1];
  if (!hp) return undefined;
  const value = Number(hp);
  return Number.isFinite(value) ? value : undefined;
}

function extractSet(text: string) {
  const exp = text.match(/\bEXP-\d{2,6}\b/i)?.[0];
  if (exp) return exp.toUpperCase();
  const jpSv = text.match(/\b(?:SV|S)\d{1,2}[a-z]?\b/i)?.[0];
  if (jpSv) return jpSv.toUpperCase();
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

function extractRarity(text: string) {
  const raw = normalize(text);
  if (/\b★★★\b|special illustration rare|\bsir\b/.test(raw)) return "SIR";
  if (/\b★★\b|illustration rare|\bir\b/.test(raw)) return "IR";
  if (/\bultra rare\b|\bur\b|vmax|gx|ex\b/.test(raw)) return "ULTRA_RARE";
  if (/\bpromo\b|black star/.test(raw)) return "PROMO";
  if (/\bradiant\b|\bradieux\b|\bk\b/.test(raw)) return "RADIANT";
  if (/\bamazing rare\b|\ba\b/.test(raw)) return "AMAZING_RARE";
  if (/\bholo\b|\bholograph/i.test(raw)) return "HOLO_RARE";
  if (/\brare\b/.test(raw)) return "RARE";
  if (/\buncommon\b|peu commune|losange/.test(raw)) return "UNCOMMON";
  if (/\bcommon\b|commune|cercle/.test(raw)) return "COMMON";
  return undefined;
}

function extractFinish(text: string): ParsedCardParameters["finish"] {
  const raw = normalize(text);
  if (/\bfull art\b|pleine illustration/.test(raw)) return "FULL_ART";
  if (/\btextur|etched|rainure/.test(raw)) return "TEXTURED";
  if (/\breverse\b|inverse/.test(raw)) return "REVERSE_HOLO";
  if (/\bcosmos\b|swirl/.test(raw)) return "COSMOS";
  if (/\bcracked ice\b|glace brisee/.test(raw)) return "CRACKED_ICE";
  if (/\bholo\b|holograph/.test(raw)) return "HOLO";
  if (/\bnon holo\b|matte|sans holographie/.test(raw)) return "NON_HOLO";
  return undefined;
}

function extractVintageHint(text: string): ParsedCardParameters["vintageHint"] {
  const raw = normalize(text);
  if (/\b1st edition\b|edition 1/.test(raw)) return "1ST_EDITION";
  if (/\bshadowless\b|sans ombre/.test(raw)) return "SHADOWLESS";
  if (/\bunlimited\b|illimitee/.test(raw)) return "UNLIMITED";
  return undefined;
}

function extractRegulationMark(text: string) {
  return text.match(/\breg(?:ulation)?\s*[:.]?\s*([efgh])\b/i)?.[1]?.toUpperCase();
}

function extractIllustrator(text: string) {
  const match = text.match(/\b(?:illus\.?|illustrator)\s*[:.]?\s*([^\n,]{2,60})/i)?.[1]?.trim();
  return match || undefined;
}

function estimateCondition(text: string): ParsedCardParameters["estimatedCondition"] {
  const raw = normalize(text);
  if (/\bmint\b|gem mint/.test(raw)) return "MINT";
  if (/\bnear mint\b|\bnm\b/.test(raw)) return "NEAR_MINT";
  if (/\bexcellent\b|\bex\b/.test(raw)) return "EXCELLENT";
  if (/\bgood\b/.test(raw)) return "GOOD";
  if (/\blight played\b|\blp\b/.test(raw)) return "LIGHT_PLAYED";
  if (/\bplayed\b|\bmp\b/.test(raw)) return "PLAYED";
  if (/\bpoor\b|damaged/.test(raw)) return "POOR";
  return undefined;
}

export function parseCardParameters(rawText: string): ParsedCardParameters {
  const cardNumber = extractCardNumber(rawText);
  const [left, right] = cardNumber ? cardNumber.split("/").map((v) => Number(v)) : [];
  return {
    name: extractName(rawText),
    cardNumber,
    set: extractSet(rawText),
    language: languageFromText(rawText),
    hp: extractHp(rawText),
    rarity: extractRarity(rawText),
    finish: extractFinish(rawText),
    isSecret:
      Number.isFinite(left) && Number.isFinite(right)
        ? (left as number) > (right as number)
        : undefined,
    isPromo: /\bpromo\b|black star|\bswsh\d{2,4}\b|\bsvp\b/i.test(rawText),
    vintageHint: extractVintageHint(rawText),
    regulationMark: extractRegulationMark(rawText),
    illustrator: extractIllustrator(rawText),
    estimatedCondition: estimateCondition(rawText),
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
  feedbackBoostByCardRefId?: Record<string, number>;
}) {
  const { parsed, rawText, rows, limit = 3, feedbackBoostByCardRefId = {} } = params;
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
      const rowCardNumber = normalize(row.card_number ?? "");
      const rowLanguage = normalize(row.language ?? "");
      const rowRarity = normalize(row.rarity ?? "");
      const rowFinish = normalize(row.finish ?? "");

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
        if (rowCardNumber.includes(normalizedCardNumber) || rowTcg.includes(normalizedCardNumber)) {
          score += 0.3;
        }
      }

      if (normalizedRaw.includes(rowName) && rowName.length >= 4) {
        score += 0.12;
      }

      if (parsed.language && rowLanguage === normalize(parsed.language)) {
        score += 0.05;
      }
      if (parsed.rarity && rowRarity && rowRarity.includes(normalize(parsed.rarity))) {
        score += 0.04;
      }
      if (parsed.finish && rowFinish && rowFinish.includes(normalize(parsed.finish))) {
        score += 0.04;
      }

      // Learning boost from historical manual selections for this card_ref.
      score += feedbackBoostByCardRefId[row.id] ?? 0;

      return {
        cardRefId: row.id,
        name: row.name,
        set: row.set_id,
        tcgId: row.tcg_id,
        cardNumber: row.card_number,
        language: row.language,
        score: Math.min(0.99, Math.max(0, Number(score.toFixed(4)))),
      } satisfies CardRefCandidate;
    })
    .filter((row) => row.score > 0.2)
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
  const strictCandidates = deduped.filter((candidate) => {
    if (!parsed.name) return false;
    const hasSetOrNumber = Boolean(parsed.set) || Boolean(parsed.cardNumber);
    return hasSetOrNumber ? candidate.score >= 0.4 : candidate.score >= 0.55;
  });

  return {
    candidates: strictCandidates.length > 0 ? strictCandidates.slice(0, limit) : deduped.slice(0, limit),
    confidence,
  };
}

