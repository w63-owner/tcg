export const SOURCE_PRIORITY = {
  tcgdex: 95,
  pokemontcg: 90,
  pokecadata: 80,
};

export function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToken(value) {
  return normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}/-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export function inferLanguage(rawCard, source) {
  const direct = normalizeWhitespace(
    rawCard?.language || rawCard?.lang || rawCard?.locale || rawCard?.set?.language,
  ).toLowerCase();

  if (["fr", "fra", "french", "francais"].includes(direct)) return "fr";
  if (["en", "eng", "english"].includes(direct)) return "en";
  if (["jp", "ja", "jpn", "japanese"].includes(direct)) return "jp";

  const scan = normalizeWhitespace(
    `${rawCard?.name ?? ""} ${rawCard?.set?.name ?? ""} ${rawCard?.setName ?? ""}`,
  );
  if (/[ぁ-ゟ゠-ヿ一-鿿]/u.test(scan)) return "jp";
  if (source === "pokecadata") return "jp";
  return "en";
}

export function inferSetId(rawCard, source) {
  const direct = normalizeWhitespace(rawCard?.set?.id || rawCard?.setId || rawCard?.set_code);
  if (direct) return direct.toUpperCase();

  const expansionId = Number(rawCard?.idExpansion ?? 0);
  if (Number.isFinite(expansionId) && expansionId > 0) {
    return `EXP-${expansionId}`;
  }

  const setName = normalizeWhitespace(rawCard?.set?.name || rawCard?.setName);
  if (setName) return setName;

  return source === "pokecadata" ? "JP-UNKNOWN" : "UNKNOWN";
}

function toSafeCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

export function inferCategory(rawCard) {
  const category = normalizeWhitespace(rawCard?.category);
  if (!category) return "Pokemon";
  return category;
}

export function inferSetObject(rawCard, source, setId) {
  const sourceSet = rawCard?.set ?? {};
  const official = toSafeCount(
    sourceSet?.cardCount?.official ?? sourceSet?.printedTotal ?? rawCard?.set?.printedTotal,
  );
  const total = toSafeCount(sourceSet?.cardCount?.total ?? sourceSet?.total ?? rawCard?.set?.total);
  return {
    cardCount: {
      official,
      total,
    },
    id: setId ?? inferSetId(rawCard, source),
    logo: normalizeWhitespace(sourceSet?.logo),
    name: normalizeWhitespace(sourceSet?.name || rawCard?.setName) || (setId ?? inferSetId(rawCard, source)),
    symbol: normalizeWhitespace(sourceSet?.symbol),
  };
}

export function inferCardNumber(rawCard) {
  const direct = normalizeWhitespace(rawCard?.number || rawCard?.localId || rawCard?.collectorNumber);
  if (direct) return direct;

  const fromName = normalizeWhitespace(rawCard?.name).match(/\b(\d{1,3}\s*\/\s*\d{2,3})\b/)?.[1];
  return fromName ? fromName.replace(/\s+/g, "") : "";
}

export function inferHp(rawCard) {
  const hp = Number(rawCard?.hp ?? 0);
  if (Number.isFinite(hp) && hp > 0) return Math.round(hp);
  const fromName = normalizeWhitespace(rawCard?.name).match(/\b(?:hp|pv)\s*[:.]?\s*(\d{2,4})\b/i)?.[1];
  const parsed = Number(fromName ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function inferReleaseYear(rawCard) {
  const candidates = [
    rawCard?.set?.releaseDate,
    rawCard?.releaseDate,
    rawCard?.releaseYear,
    rawCard?.release_year,
    rawCard?.year,
    rawCard?.dateAdded,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = String(candidate).match(/\b(19\d{2}|20\d{2})\b/);
    const year = Number(match?.[1] ?? 0);
    if (Number.isFinite(year) && year >= 1995 && year <= 2100) return year;
  }

  return null;
}

export function inferRarity(rawCard) {
  const raw = normalizeWhitespace(rawCard?.rarity || rawCard?.name).toLowerCase();
  if (/\b★★★\b|special illustration rare|\bsir\b/.test(raw)) return "SIR";
  if (/\b★★\b|illustration rare|\bir\b/.test(raw)) return "IR";
  if (/ultra rare|\bur\b|vmax|gx| ex\b/.test(raw)) return "ULTRA_RARE";
  if (/promo|black star/.test(raw)) return "PROMO";
  if (/radiant|radieux/.test(raw)) return "RADIANT";
  if (/amazing rare/.test(raw)) return "AMAZING_RARE";
  if (/holo/.test(raw)) return "HOLO_RARE";
  if (/rare/.test(raw)) return "RARE";
  if (/uncommon|peu commune/.test(raw)) return "UNCOMMON";
  if (/common|commune/.test(raw)) return "COMMON";
  return null;
}

export function inferFinish(rawCard) {
  const raw = normalizeWhitespace(
    `${rawCard?.finish ?? ""} ${rawCard?.name ?? ""} ${rawCard?.rarity ?? ""}`,
  ).toLowerCase();

  if (/full art|pleine illustration/.test(raw)) return "FULL_ART";
  if (/\btextur|etched/.test(raw)) return "TEXTURED";
  if (/reverse|inverse/.test(raw)) return "REVERSE_HOLO";
  if (/cosmos|swirl/.test(raw)) return "COSMOS";
  if (/cracked ice|glace brisee/.test(raw)) return "CRACKED_ICE";
  if (/\bnon holo\b|non-holo|sans holo/.test(raw)) return "NON_HOLO";
  if (/holo/.test(raw)) return "HOLO";
  return null;
}

export function inferVintageHint(rawCard) {
  const raw = normalizeWhitespace(rawCard?.name).toLowerCase();
  if (/1st edition|edition 1/.test(raw)) return "1ST_EDITION";
  if (/shadowless|sans ombre/.test(raw)) return "SHADOWLESS";
  if (/unlimited|illimitee/.test(raw)) return "UNLIMITED";
  return null;
}

export function inferRegulationMark(rawCard) {
  const raw = normalizeWhitespace(rawCard?.regulationMark || rawCard?.regulation || rawCard?.name);
  return raw.match(/\b([EFGH])\b/)?.[1] ?? null;
}

export function inferIllustrator(rawCard) {
  return normalizeWhitespace(rawCard?.artist || rawCard?.illustrator) || null;
}

export function inferPromo(rawCard) {
  const raw = normalizeWhitespace(`${rawCard?.rarity ?? ""} ${rawCard?.name ?? ""}`).toLowerCase();
  if (/promo|black star|\bswsh\d{2,4}\b|\bsvp\b/.test(raw)) return true;
  return null;
}

export function inferVariants(rawCard) {
  const sourceVariants = rawCard?.variants ?? {};
  const finishRaw = normalizeWhitespace(rawCard?.finish || rawCard?.rarity || rawCard?.name).toLowerCase();
  const isPromo = inferPromo(rawCard) === true;
  const isReverse = Boolean(sourceVariants.reverse) || /\breverse\b|inverse/.test(finishRaw);
  const isHolo = Boolean(sourceVariants.holo) || /\bholo\b/.test(finishRaw);
  const isFirstEdition =
    Boolean(sourceVariants.firstEdition) || /1st edition|edition 1/i.test(normalizeWhitespace(rawCard?.name));
  const isWPromo = Boolean(sourceVariants.wPromo) || isPromo;
  const isNormal = sourceVariants.normal === false ? false : !(isHolo && !isReverse);
  return {
    firstEdition: isFirstEdition,
    holo: isHolo,
    normal: isNormal,
    reverse: isReverse,
    wPromo: isWPromo,
  };
}

export function inferSecret(cardNumber) {
  if (!cardNumber || !cardNumber.includes("/")) return null;
  const [left, right] = cardNumber.split("/").map((part) => Number(part));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return left > right;
}

export function buildCanonicalKey(card) {
  return [
    normalizeToken(card.language),
    normalizeToken(card.setId),
    normalizeToken(card.localId),
    normalizeToken(card.name),
  ].join("|");
}

export function estimateMappingConfidence(card) {
  let score = 0.35;
  if (card.name) score += 0.2;
  if (card.setId && card.setId !== "UNKNOWN") score += 0.2;
  if (card.localId) score += 0.12;
  if (card.hp) score += 0.05;
  if (card.rarity) score += 0.04;
  if (card.illustrator) score += 0.02;
  if (card.releaseYear) score += 0.02;
  return Number(Math.min(0.98, score).toFixed(3));
}

export function toEstimatedCondition(rawCard) {
  const raw = normalizeWhitespace(rawCard?.condition || rawCard?.name).toUpperCase();
  if (/\bMINT\b/.test(raw)) return "MINT";
  if (/NEAR[ _-]?MINT|\bNM\b/.test(raw)) return "NEAR_MINT";
  if (/\bEXCELLENT\b|\bEX\b/.test(raw)) return "EXCELLENT";
  if (/\bGOOD\b/.test(raw)) return "GOOD";
  if (/LIGHT[ _-]?PLAYED|\bLP\b/.test(raw)) return "LIGHT_PLAYED";
  if (/\bPLAYED\b|\bMP\b/.test(raw)) return "PLAYED";
  if (/\bPOOR\b|DAMAGED/.test(raw)) return "POOR";
  return null;
}

export function buildNormalizedCard({ source, externalId, rawCard }) {
  const name = normalizeWhitespace(rawCard?.name || rawCard?.cardName);
  const setId = inferSetId(rawCard, source);
  const localId = inferCardNumber(rawCard);
  const language = inferLanguage(rawCard, source);
  const category = inferCategory(rawCard);
  const set = inferSetObject(rawCard, source, setId);
  const variants = inferVariants(rawCard);
  const normalized = {
    source,
    external_id: externalId,
    category,
    name,
    setId,
    set,
    variants,
    localId,
    hp: inferHp(rawCard),
    rarity: inferRarity(rawCard),
    finish: inferFinish(rawCard),
    is_secret: inferSecret(localId),
    is_promo: inferPromo(rawCard),
    vintage_hint: inferVintageHint(rawCard),
    regulationMark: inferRegulationMark(rawCard),
    illustrator: inferIllustrator(rawCard),
    estimated_condition: toEstimatedCondition(rawCard),
    language,
    releaseYear: inferReleaseYear(rawCard),
    image: normalizeWhitespace(rawCard?.images?.large || rawCard?.images?.small || rawCard?.image),
    metadata: {
      source,
      external_id: externalId,
      source_set_name: normalizeWhitespace(rawCard?.set?.name || rawCard?.setName),
      source_series: normalizeWhitespace(rawCard?.set?.series || rawCard?.series),
      finish_confidence: inferFinish(rawCard) ? "inferred" : "unknown",
    },
  };

  const canonical_key = buildCanonicalKey(normalized);
  const mapping_confidence = estimateMappingConfidence(normalized);
  const source_priority = SOURCE_PRIORITY[source] ?? 50;

  return {
    ...normalized,
    canonical_key,
    mapping_confidence,
    source_priority,
    tcgId: `catalog:${canonical_key}`,
  };
}

export function mergeByCanonicalKey(cards) {
  const grouped = new Map();
  for (const card of cards) {
    if (!grouped.has(card.canonical_key)) grouped.set(card.canonical_key, []);
    grouped.get(card.canonical_key).push(card);
  }

  const merged = [];
  for (const [, group] of grouped) {
    group.sort((a, b) => {
      if (b.source_priority !== a.source_priority) return b.source_priority - a.source_priority;
      if (b.mapping_confidence !== a.mapping_confidence) return b.mapping_confidence - a.mapping_confidence;
      const aRichness = Object.values(a).filter(Boolean).length;
      const bRichness = Object.values(b).filter(Boolean).length;
      return bRichness - aRichness;
    });

    const winner = group[0];
    const externalRefs = group.map((entry) => ({
      source: entry.source,
      external_id: entry.external_id,
      mapping_confidence: entry.mapping_confidence,
    }));

    merged.push({
      ...winner,
      metadata: {
        ...(winner.metadata ?? {}),
        external_refs: externalRefs,
        merge_confidence: Number(
          Math.min(0.99, winner.mapping_confidence + Math.min(0.12, (group.length - 1) * 0.03)).toFixed(3),
        ),
      },
    });
  }

  return merged;
}

