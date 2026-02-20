import type { CardRefLookupRow } from "@/lib/ocr/parse-and-match";

const TCGDEX_BASE_URL = "https://api.tcgdex.net/v2";
const REQUEST_TIMEOUT_MS = 6000;
const MAX_SET_DETAILS = 18;
const MAX_CARD_DETAILS = 8;

type LookupInput = {
  name?: string;
  cardNumber?: string;
  language?: string;
};

type TcgdexSetSummary = {
  id?: string;
  cardCount?: {
    official?: number;
    total?: number;
  };
};

type TcgdexSetDetail = {
  id?: string;
  cards?: Array<{
    id?: string;
    name?: string;
    localId?: string;
  }>;
};

type TcgdexCard = {
  category?: string;
  id?: string;
  illustrator?: string;
  image?: string;
  localId?: string;
  name?: string;
  rarity?: string;
  set?: {
    cardCount?: {
      official?: number;
      total?: number;
    };
    id?: string;
    logo?: string;
    name?: string;
    symbol?: string;
    releaseDate?: string;
  };
  variants?: {
    firstEdition?: boolean;
    holo?: boolean;
    normal?: boolean;
    reverse?: boolean;
    wPromo?: boolean;
  };
  hp?: number;
  regulationMark?: string;
};

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeToken(value: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function parseNumberHints(cardNumber?: string) {
  const raw = String(cardNumber ?? "").trim();
  if (!raw.includes("/")) {
    return { left: raw || "", right: "" };
  }
  const [leftRaw, rightRaw] = raw.split("/");
  return {
    left: String(leftRaw ?? "").replace(/[^\dA-Za-z]/g, ""),
    right: String(rightRaw ?? "").replace(/[^\d]/g, ""),
  };
}

function mapLanguage(language?: string) {
  const value = String(language ?? "").trim().toLowerCase();
  if (value === "fr") return "fr";
  if (value === "jp" || value === "ja") return "ja";
  return "en";
}

function parseReleaseYear(value?: string) {
  const year = Number(String(value ?? "").match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? 0);
  if (!Number.isFinite(year) || year < 1995 || year > 2100) return null;
  return year;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "tcg-web/1.0",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`tcgdex_http_${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function scoreCardSummary(params: {
  targetName: string;
  targetLeft: string;
  cardName: string;
  localId: string;
}) {
  const targetNameNorm = normalizeText(params.targetName);
  const cardNameNorm = normalizeText(params.cardName);
  const targetLeftNorm = normalizeToken(params.targetLeft).replace(/^0+/, "");
  const localIdNorm = normalizeToken(params.localId).replace(/^0+/, "");
  let score = 0;
  if (targetNameNorm && cardNameNorm === targetNameNorm) score += 0.75;
  if (targetNameNorm && cardNameNorm.includes(targetNameNorm)) score += 0.2;
  if (targetNameNorm && targetNameNorm.includes(cardNameNorm)) score += 0.15;
  if (targetLeftNorm && localIdNorm && targetLeftNorm === localIdNorm) score += 0.35;
  return score;
}

function mapTcgdexCardToLookupRow(card: TcgdexCard, language: string): CardRefLookupRow | null {
  const tcgId = String(card.id ?? "").trim();
  const name = String(card.name ?? "").trim();
  if (!tcgId || !name) return null;

  const setIdRaw = String(card.set?.id ?? "").trim();
  const setId = setIdRaw ? setIdRaw.toUpperCase() : "UNKNOWN";
  return {
    id: `tcgdex:${tcgId}`,
    category: card.category ?? null,
    name,
    setId,
    set: {
      cardCount: {
        official: card.set?.cardCount?.official ?? null,
        total: card.set?.cardCount?.total ?? null,
      },
      id: setIdRaw || null,
      logo: card.set?.logo ?? null,
      name: card.set?.name ?? null,
      symbol: card.set?.symbol ?? null,
    },
    variants: {
      firstEdition: Boolean(card.variants?.firstEdition),
      holo: Boolean(card.variants?.holo),
      normal: card.variants?.normal ?? true,
      reverse: Boolean(card.variants?.reverse),
      wPromo: Boolean(card.variants?.wPromo),
    },
    tcgId,
    localId: card.localId ?? null,
    language: language === "ja" ? "jp" : language,
    rarity: card.rarity ?? null,
    finish: null,
    hp: card.hp ?? null,
    is_secret: null,
    is_promo: card.variants?.wPromo ?? null,
    vintage_hint: null,
    regulationMark: card.regulationMark ?? null,
    illustrator: card.illustrator ?? null,
    estimated_condition: null,
    releaseYear: parseReleaseYear(card.set?.releaseDate) ?? null,
    image: card.image ?? null,
  };
}

export async function lookupTcgdexCandidates(input: LookupInput): Promise<CardRefLookupRow[]> {
  const name = String(input.name ?? "").trim();
  if (!name) return [];
  const language = mapLanguage(input.language);
  const { left, right } = parseNumberHints(input.cardNumber);

  const setSummaries = await fetchJsonWithTimeout<TcgdexSetSummary[]>(`${TCGDEX_BASE_URL}/${language}/sets`);
  const filteredSets = (setSummaries ?? [])
    .filter((setRow) => {
      if (!setRow?.id) return false;
      if (!right) return true;
      const official = Number(setRow.cardCount?.official ?? 0);
      const total = Number(setRow.cardCount?.total ?? 0);
      const rightNum = Number(right);
      return rightNum > 0 && (official === rightNum || total === rightNum);
    })
    .slice(0, MAX_SET_DETAILS);

  const cardSummaryMatches: Array<{ id: string; score: number }> = [];
  for (const setRow of filteredSets) {
    const detail = await fetchJsonWithTimeout<TcgdexSetDetail>(
      `${TCGDEX_BASE_URL}/${language}/sets/${encodeURIComponent(String(setRow.id))}`,
    );
    for (const card of detail.cards ?? []) {
      const id = String(card.id ?? "").trim();
      const cardName = String(card.name ?? "").trim();
      if (!id || !cardName) continue;
      const score = scoreCardSummary({
        targetName: name,
        targetLeft: left,
        cardName,
        localId: String(card.localId ?? ""),
      });
      if (score < 0.75) continue;
      cardSummaryMatches.push({ id, score });
    }
  }

  const uniqueCardIds = Array.from(
    new Set(
      cardSummaryMatches
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_CARD_DETAILS)
        .map((row) => row.id),
    ),
  );

  const rows: CardRefLookupRow[] = [];
  for (const cardId of uniqueCardIds) {
    const card = await fetchJsonWithTimeout<TcgdexCard>(
      `${TCGDEX_BASE_URL}/${language}/cards/${encodeURIComponent(cardId)}`,
    );
    const mapped = mapTcgdexCardToLookupRow(card, language);
    if (mapped) rows.push(mapped);
  }
  return rows;
}
