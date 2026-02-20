import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

type TcgdexCardSummary = {
  id?: string;
  localId?: string;
  name?: string;
  image?: string;
};

type TcgdexSetSummary = {
  id?: string;
  name?: string;
  logo?: string;
  symbol?: string;
  cardCount?: {
    official?: number;
    total?: number;
  };
  releaseDate?: string;
  series?: { id?: string; name?: string } | string;
  serie?: { id?: string; name?: string } | string;
};

type TcgdexCardDetail = {
  category?: string;
  id?: string;
  illustrator?: string;
  image?: string;
  localId?: string;
  name?: string;
  rarity?: string;
  set?: {
    cardCount?: { official?: number; total?: number };
    id?: string;
    logo?: string;
    name?: string;
    symbol?: string;
    series?: { id?: string; name?: string } | string;
    serie?: { id?: string; name?: string } | string;
  };
  variants?: {
    firstEdition?: boolean;
    holo?: boolean;
    normal?: boolean;
    reverse?: boolean;
    wPromo?: boolean;
  };
  hp?: number | string;
  regulationMark?: string;
};

type CardsRefUpsertRow = {
  tcgId: string;
  category: string | null;
  name: string;
  setId: string;
  image: string | null;
  localId: string | null;
  hp: number | null;
  rarity: string | null;
  regulationMark: string | null;
  illustrator: string | null;
  language: "fr" | "en" | "jp";
  releaseYear: number | null;
  set: Record<string, unknown>;
  variants: Record<string, unknown>;
};

dotenv.config({ path: ".env.local", override: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TCGDEX_BASE_URL = process.env.TCGDEX_BASE_URL || "https://api.tcgdex.net/v2";
const RAW_LANG = (process.env.TCGDEX_SEED_LANG || "fr").trim().toLowerCase();
const API_LANG = RAW_LANG === "jp" ? "ja" : RAW_LANG;
const DB_LANG: "fr" | "en" | "jp" = RAW_LANG === "ja" ? "jp" : (RAW_LANG as "fr" | "en" | "jp");
const CHUNK_SIZE = 500;
const DETAIL_CONCURRENCY = Math.max(1, Number(process.env.TCGDEX_SEED_CONCURRENCY || "20"));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!["fr", "en", "ja", "jp"].includes(RAW_LANG)) {
  console.error(`Unsupported TCGDEX_SEED_LANG '${RAW_LANG}'. Use one of: fr, en, jp`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTcgdexAssetUrl(rawUrl: unknown, quality = "high", ext = "webp"): string {
  const input = String(rawUrl ?? "").trim();
  if (!input) return "";

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

async function fetchJsonWithRetry<T>(url: string, attempts = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "tcg-web-seed/1.0",
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status} on ${url}: ${text.slice(0, 240)}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Retry ${attempt}/${attempts - 1} for ${url} (${msg})`);
        await sleep(300 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function parseReleaseYear(value: unknown): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const year = Number(text.slice(0, 4));
  return Number.isInteger(year) ? year : null;
}

function parseHp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = Math.trunc(value);
    return parsed > 0 ? parsed : null;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed > 0 ? parsed : null;
}

function toSeriesPayload(series: unknown): { id?: string; name?: string } | null {
  if (!series) return null;
  if (typeof series === "string") return { name: series };
  if (typeof series === "object") {
    const id = String((series as { id?: unknown }).id ?? "").trim();
    const name = String((series as { name?: unknown }).name ?? "").trim();
    if (!id && !name) return null;
    return { id: id || undefined, name: name || undefined };
  }
  return null;
}

function buildSetPayload(detail: TcgdexCardDetail, setSummaryById: Map<string, TcgdexSetSummary>) {
  const setId = String(detail.set?.id ?? "").trim();
  const setSummary = setSummaryById.get(setId);
  const summarySeries = toSeriesPayload(setSummary?.series ?? setSummary?.serie);
  const detailSeries = toSeriesPayload(detail.set?.series ?? detail.set?.serie);
  const series = detailSeries ?? summarySeries;

  return {
    cardCount: {
      official: detail.set?.cardCount?.official ?? setSummary?.cardCount?.official ?? null,
      total: detail.set?.cardCount?.total ?? setSummary?.cardCount?.total ?? null,
    },
    id: setId || null,
    logo: detail.set?.logo ?? setSummary?.logo ?? null,
    name: detail.set?.name ?? setSummary?.name ?? null,
    symbol: detail.set?.symbol ?? setSummary?.symbol ?? null,
    series: series?.name ?? null,
    seriesId: series?.id ?? null,
  };
}

function mapCardToRow(
  detail: TcgdexCardDetail,
  setSummaryById: Map<string, TcgdexSetSummary>,
): CardsRefUpsertRow | null {
  const tcgId = String(detail.id ?? "").trim();
  const name = String(detail.name ?? "").trim();
  const setId = String(detail.set?.id ?? "").trim();
  if (!tcgId || !name || !setId) return null;

  const setPayload = buildSetPayload(detail, setSummaryById);
  const releaseYear = parseReleaseYear(setSummaryById.get(setId)?.releaseDate);

  return {
    tcgId,
    category: detail.category ? String(detail.category) : null,
    name,
    setId,
    image: normalizeTcgdexAssetUrl(detail.image) || null,
    localId: detail.localId ? String(detail.localId) : null,
    hp: parseHp(detail.hp),
    rarity: detail.rarity ? String(detail.rarity) : null,
    regulationMark: detail.regulationMark ? String(detail.regulationMark) : null,
    illustrator: detail.illustrator ? String(detail.illustrator) : null,
    language: DB_LANG,
    releaseYear,
    set: setPayload,
    variants: detail.variants ?? {},
  };
}

async function fetchCardDetail(cardId: string): Promise<TcgdexCardDetail | null> {
  const url = `${TCGDEX_BASE_URL}/${API_LANG}/cards/${encodeURIComponent(cardId)}`;
  try {
    return await fetchJsonWithRetry<TcgdexCardDetail>(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Card detail fetch failed for '${cardId}': ${message}`);
    return null;
  }
}

async function run() {
  const startedAt = Date.now();
  console.log(`Starting TCGdex seed for language '${DB_LANG}'...`);

  const setsUrl = `${TCGDEX_BASE_URL}/${API_LANG}/sets`;
  const cardsUrl = `${TCGDEX_BASE_URL}/${API_LANG}/cards`;

  const [sets, cards] = await Promise.all([
    fetchJsonWithRetry<TcgdexSetSummary[]>(setsUrl),
    fetchJsonWithRetry<TcgdexCardSummary[]>(cardsUrl),
  ]);

  const setSummaryById = new Map<string, TcgdexSetSummary>();
  for (const set of sets ?? []) {
    const id = String(set?.id ?? "").trim();
    if (id) setSummaryById.set(id, set);
  }

  const summaries = Array.isArray(cards) ? cards.filter((card) => Boolean(card?.id)) : [];
  const allChunks = chunk(summaries, CHUNK_SIZE);
  const totalBatches = allChunks.length;
  let upsertedTotal = 0;

  console.log(`Found ${summaries.length} cards. Processing ${totalBatches} batch(es) of max ${CHUNK_SIZE}.`);

  for (let batchIndex = 0; batchIndex < allChunks.length; batchIndex += 1) {
    const batchNumber = batchIndex + 1;
    const current = allChunks[batchIndex];

    try {
      const details = await mapWithConcurrency(
        current,
        DETAIL_CONCURRENCY,
        async (summary) => fetchCardDetail(String(summary.id)),
      );

      const mappedRows: CardsRefUpsertRow[] = [];
      for (let i = 0; i < current.length; i += 1) {
        const summary = current[i];
        const detail = details[i];
        const mapped = detail ? mapCardToRow(detail, setSummaryById) : null;

        if (mapped) {
          mappedRows.push(mapped);
          continue;
        }

        // Fallback summary row when detail endpoint fails for a specific card.
        const tcgId = String(summary?.id ?? "").trim();
        const name = String(summary?.name ?? "").trim();
        const localId = String(summary?.localId ?? "").trim();
        const setId = tcgId.includes("-") ? tcgId.split("-")[0] : "";
        if (!tcgId || !name || !setId) continue;

        const setSummary = setSummaryById.get(setId);
        mappedRows.push({
          tcgId,
          category: null,
          name,
          setId,
          image: normalizeTcgdexAssetUrl(summary?.image) || null,
          localId: localId || null,
          hp: null,
          rarity: null,
          regulationMark: null,
          illustrator: null,
          language: DB_LANG,
          releaseYear: parseReleaseYear(setSummary?.releaseDate),
          set: {
            cardCount: {
              official: setSummary?.cardCount?.official ?? null,
              total: setSummary?.cardCount?.total ?? null,
            },
            id: setSummary?.id ?? setId,
            logo: setSummary?.logo ?? null,
            name: setSummary?.name ?? null,
            symbol: setSummary?.symbol ?? null,
            series:
              toSeriesPayload(setSummary?.series ?? setSummary?.serie)?.name ?? null,
            seriesId:
              toSeriesPayload(setSummary?.series ?? setSummary?.serie)?.id ?? null,
          },
          variants: {},
        });
      }

      const { error } = await supabase.from("cards_ref").upsert(mappedRows, { onConflict: "tcgId" });
      if (error) {
        throw new Error(error.message);
      }

      upsertedTotal += mappedRows.length;
      console.log(
        `Batch ${batchNumber}/${totalBatches} insere avec succes (${mappedRows.length} cartes).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Erreur sur le batch ${batchNumber}/${totalBatches}: ${message}`);
      throw error;
    }
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Seed termine. Total upsert: ${upsertedTotal} cartes en ${elapsedSec}s.`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed failed: ${message}`);
  process.exit(1);
});
