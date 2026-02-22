import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  fetchJsonWithRetry,
  inBatches,
  mapWithConcurrency,
  resolveLanguageConfig,
  toInt,
  toText,
} from "./lib/tcgdex-mirror";

type CardSummary = { id?: string };
type CardDetail = {
  category?: string;
  id?: string;
  illustrator?: string;
  image?: string;
  localId?: string;
  name?: string;
  rarity?: string;
  suffix?: string;
  set?: {
    id?: string;
    name?: string;
    logo?: string;
    symbol?: string;
    cardCount?: { official?: number; total?: number };
    serie?: { id?: string; name?: string };
    series?: { id?: string; name?: string } | string;
  };
  variants?: Record<string, unknown>;
  variants_detailed?: unknown[];
  dexId?: unknown[];
  hp?: number;
  types?: unknown[];
  evolveFrom?: string;
  stage?: string;
  description?: string;
  abilities?: unknown[];
  attacks?: unknown[];
  weaknesses?: unknown[];
  resistances?: unknown[];
  retreat?: number;
  legal?: Record<string, unknown>;
  pricing?: Record<string, unknown>;
  regulationMark?: string;
  updated?: string;
};

dotenv.config({ path: ".env.local", override: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.TCGDEX_BASE_URL || "https://api.tcgdex.net/v2";
const concurrency = Math.max(1, Number(process.env.TCGDEX_SEED_CONCURRENCY || "20"));

if (!supabaseUrl || !serviceRole) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const { apiLang, dbLang } = resolveLanguageConfig();
const admin = createClient(supabaseUrl, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizeTcgdexAssetUrl(rawUrl: unknown, quality = "high", ext = "webp"): string | null {
  const input = String(rawUrl ?? "").trim();
  if (!input) return null;
  const lower = input.toLowerCase();
  const imageExtensions = [".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif"];
  if (imageExtensions.some((suffix) => lower.endsWith(suffix))) return input;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return input;
  }
  if (!/assets\.tcgdex\.net$/i.test(url.hostname)) return input;
  const cleanPath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${cleanPath}/${quality}.${ext}`;
  return url.toString();
}

async function run() {
  console.log(`Seeding tcgdex_cards (lang=${dbLang})...`);
  const cards = await fetchJsonWithRetry<CardSummary[]>(`${baseUrl}/${apiLang}/cards`);
  const cardIds = (cards ?? []).map((row) => toText(row?.id)).filter(Boolean) as string[];
  console.log(`Found ${cardIds.length} cards.`);

  const details = await mapWithConcurrency(cardIds, concurrency, async (cardId) => {
    try {
      return await fetchJsonWithRetry<CardDetail>(
        `${baseUrl}/${apiLang}/cards/${encodeURIComponent(cardId)}`,
      );
    } catch {
      return null;
    }
  });

  const rows = [];
  for (const detail of details) {
    if (!detail) continue;
    const id = toText(detail.id);
    const setId = toText(detail.set?.id);
    const name = toText(detail.name);
    if (!id || !setId || !name) continue;

    const seriesObject = detail.set?.serie ?? (typeof detail.set?.series === "object" ? detail.set?.series : null);
    const seriesName = toText(
      (seriesObject as { name?: unknown } | null)?.name ??
        (typeof detail.set?.series === "string" ? detail.set.series : null),
    );
    const seriesId = toText((seriesObject as { id?: unknown } | null)?.id);

    rows.push({
      language: dbLang,
      id,
      category: toText(detail.category),
      name,
      local_id: toText(detail.localId),
      suffix: toText(detail.suffix),
      illustrator: toText(detail.illustrator),
      image: normalizeTcgdexAssetUrl(detail.image),
      rarity: toText(detail.rarity),
      hp: toInt(detail.hp),
      regulation_mark: toText(detail.regulationMark),
      set_id: setId,
      set_name: toText(detail.set?.name),
      set_logo: toText(detail.set?.logo),
      set_symbol: toText(detail.set?.symbol),
      set_card_count_official: toInt(detail.set?.cardCount?.official),
      set_card_count_total: toInt(detail.set?.cardCount?.total),
      set_serie_id: seriesId,
      set_serie_name: seriesName,
      variants: detail.variants ?? {},
      variants_detailed: detail.variants_detailed ?? [],
      dex_id: detail.dexId ?? [],
      types: detail.types ?? [],
      evolve_from: toText(detail.evolveFrom),
      stage: toText(detail.stage),
      description: toText(detail.description),
      abilities: detail.abilities ?? [],
      attacks: detail.attacks ?? [],
      weaknesses: detail.weaknesses ?? [],
      resistances: detail.resistances ?? [],
      retreat: toInt(detail.retreat),
      legal: detail.legal ?? {},
      pricing: detail.pricing ?? {},
      updated_at_source: toText(detail.updated),
      raw: detail as Record<string, unknown>,
      ingested_at: new Date().toISOString(),
    });
  }

  const { data: existingSets, error: existingSetsError } = await admin
    .from("tcgdex_sets")
    .select("id")
    .eq("language", dbLang);
  if (existingSetsError) {
    throw new Error(`tcgdex_sets select failed: ${existingSetsError.message}`);
  }
  const existingSetIds = new Set((existingSets ?? []).map((row) => String(row.id)));
  const missingSets = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const setId = String(row.set_id ?? "").trim();
    if (!setId || existingSetIds.has(setId) || missingSets.has(setId)) continue;
    missingSets.set(setId, {
      language: dbLang,
      id: setId,
      name: String(row.set_name ?? setId),
      logo: row.set_logo ?? null,
      symbol: row.set_symbol ?? null,
      release_date: null,
      tcg_online: null,
      card_count: {
        official: row.set_card_count_official ?? null,
        total: row.set_card_count_total ?? null,
      },
      legal: {},
      abbreviation: {},
      serie_id: row.set_serie_id ?? null,
      serie_name: row.set_serie_name ?? null,
      raw: {
        source: "tcgdex_cards_missing_set_backfill",
      },
    });
  }
  if (missingSets.size > 0) {
    const missingSetRows = Array.from(missingSets.values());
    const setBatches = Array.from(inBatches(missingSetRows, 500));
    for (const batch of setBatches) {
      const { error } = await admin
        .from("tcgdex_sets")
        .upsert(batch, { onConflict: "language,id" });
      if (error) throw new Error(`tcgdex_sets backfill failed: ${error.message}`);
    }
    console.log(`Backfilled ${missingSets.size} missing sets from card payloads.`);
  }

  let count = 0;
  const batches = Array.from(inBatches(rows, 500));
  for (let i = 0; i < batches.length; i += 1) {
    const { error } = await admin.from("tcgdex_cards").upsert(batches[i], { onConflict: "language,id" });
    if (error) throw new Error(`tcgdex_cards upsert failed: ${error.message}`);
    count += batches[i].length;
    console.log(`Cards batch ${i + 1}/${batches.length} inserted (${batches[i].length}).`);
  }
  console.log(`tcgdex_cards done: ${count} rows`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
