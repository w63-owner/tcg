import crypto from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildNormalizedCard,
  mergeByCanonicalKey,
  normalizeWhitespace,
} from "./lib/catalog-normalize.mjs";

dotenv.config({ path: ".env.local", override: true });

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SCRIPTS !== "true") {
  console.error("Refusing to run catalog sync in production without ALLOW_PROD_SCRIPTS=true");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRole) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const mode = process.argv.includes("--incremental") ? "incremental" : "full";
const selectedSources = (process.env.CATALOG_SYNC_SOURCES || "tcgdex,pokemontcg,pokecadata")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const pageSize = Math.max(10, Number(process.env.CATALOG_SYNC_PAGE_SIZE || "250"));
const defaultMaxPages = mode === "incremental" ? 5 : 200;
const maxPages = Math.max(1, Number(process.env.CATALOG_SYNC_MAX_PAGES || String(defaultMaxPages)));
const tcgdexLangs = (process.env.TCGDEX_LANGS || "fr,en,ja")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const tcgdexBaseUrl = process.env.TCGDEX_BASE_URL || "https://api.tcgdex.net/v2";
const catalogSyncConcurrency = Math.max(1, Number(process.env.CATALOG_SYNC_CONCURRENCY || "8"));
const catalogSyncIncrementalDays = Math.max(
  1,
  Number(process.env.CATALOG_SYNC_INCREMENTAL_DAYS || "45"),
);

function sha1(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        const debugHeaders = {
          server: response.headers.get("server"),
          cf_ray: response.headers.get("cf-ray"),
          content_type: response.headers.get("content-type"),
          content_length: response.headers.get("content-length"),
        };
        throw new Error(
          `HTTP ${response.status} on ${url} (attempt ${attempt}/${attempts}) headers=${JSON.stringify(
            debugHeaders,
          )} body=${text.slice(0, 240)}`,
        );
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[catalog-sync] retrying request after failure: ${message}`);
        await sleep(500 * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function* inBatches(items, batchSize) {
  for (let i = 0; i < items.length; i += batchSize) {
    yield items.slice(i, i + batchSize);
  }
}

function createLimiter(maxConcurrent) {
  let activeCount = 0;
  const queue = [];

  const runNext = () => {
    if (activeCount >= maxConcurrent || queue.length === 0) return;
    activeCount += 1;
    const item = queue.shift();
    item.fn()
      .then(item.resolve, item.reject)
      .finally(() => {
        activeCount -= 1;
        runNext();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      runNext();
    });
}

function isRecentDate(releaseDateValue) {
  if (!releaseDateValue) return true;
  const releaseDate = new Date(releaseDateValue);
  if (Number.isNaN(releaseDate.getTime())) return true;
  const diffMs = Date.now() - releaseDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= catalogSyncIncrementalDays;
}

async function createRunRecord() {
  const { data, error } = await admin
    .from("catalog_import_runs")
    .insert({
      source: selectedSources.join(","),
      mode,
      status: "running",
      metrics: {
        selected_sources: selectedSources,
        page_size: pageSize,
        max_pages: maxPages,
      },
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Unable to create catalog_import_runs row: ${error?.message ?? "unknown"}`);
  }
  return data.id;
}

async function updateRunRecord(runId, payload) {
  const { error } = await admin.from("catalog_import_runs").update(payload).eq("id", runId);
  if (error) {
    throw new Error(`Unable to update catalog_import_runs row: ${error.message}`);
  }
}

async function fetchPokemonTcgCards() {
  const baseUrl = process.env.POKEMON_TCG_API_BASE_URL || "https://api.pokemontcg.io/v2/cards";
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const headers = apiKey ? { "X-Api-Key": apiKey } : {};

  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${baseUrl}?page=${page}&pageSize=${pageSize}&orderBy=-set.releaseDate`;
    const payload = await fetchJsonWithRetry(url, { headers });
    const cards = Array.isArray(payload?.data) ? payload.data : [];
    for (const card of cards) {
      const externalId = normalizeWhitespace(card?.id);
      if (!externalId) continue;
      rows.push({
        source: "pokemontcg",
        external_id: externalId,
        payload: card,
        source_updated_at: null,
      });
    }

    if (cards.length < pageSize) break;
  }

  return rows;
}

async function fetchPokecaDataCards() {
  const baseUrl = normalizeWhitespace(process.env.POKECADATA_BASE_URL);
  if (!baseUrl) return [];

  const apiKey = process.env.POKECADATA_API_KEY;
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${baseUrl}/cards?page=${page}&pageSize=${pageSize}`;
    const payload = await fetchJsonWithRetry(url, { headers });
    const cards = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload)
          ? payload
          : [];

    for (const card of cards) {
      const externalId = normalizeWhitespace(card?.id || card?.card_id || card?.slug);
      if (!externalId) continue;
      rows.push({
        source: "pokecadata",
        external_id: externalId,
        payload: card,
        source_updated_at: card?.updatedAt || card?.updated_at || null,
      });
    }

    if (cards.length < pageSize) break;
  }

  return rows;
}

async function fetchTcgdexSets(lang) {
  return fetchJsonWithRetry(`${tcgdexBaseUrl}/${lang}/sets`, {
    headers: {
      "User-Agent": "tcg-web/1.0",
      Accept: "application/json",
    },
  });
}

async function fetchTcgdexSetCards(lang, setId) {
  const payload = await fetchJsonWithRetry(`${tcgdexBaseUrl}/${lang}/sets/${encodeURIComponent(setId)}`, {
    headers: {
      "User-Agent": "tcg-web/1.0",
      Accept: "application/json",
    },
  });
  return Array.isArray(payload?.cards) ? payload.cards : [];
}

async function fetchTcgdexCardDetail(lang, cardId) {
  return fetchJsonWithRetry(`${tcgdexBaseUrl}/${lang}/cards/${encodeURIComponent(cardId)}`, {
    headers: {
      "User-Agent": "tcg-web/1.0",
      Accept: "application/json",
    },
  });
}

function tcgdexCardNeedsDetail(card) {
  return !(card?.hp && card?.rarity && card?.illustrator && card?.regulationMark);
}

async function fetchTcgdexCards() {
  const rows = [];
  const limit = createLimiter(catalogSyncConcurrency);

  for (const lang of tcgdexLangs) {
    const apiLang = lang === "jp" ? "ja" : lang;
    let sets = [];
    try {
      sets = await fetchTcgdexSets(apiLang);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("language-invalid")) {
        console.warn(`[catalog-sync] skipping unsupported TCGdex language '${lang}'`);
        continue;
      }
      throw error;
    }
    const setRows = Array.isArray(sets) ? sets : [];
    const targetSets = mode === "incremental"
      ? setRows.filter((set) => isRecentDate(set?.releaseDate))
      : setRows;

    const pagedSets = targetSets.slice(0, maxPages);

    for (const set of pagedSets) {
      if (!set?.id) continue;
      const cards = await fetchTcgdexSetCards(apiLang, set.id);
      const detailTasks = [];

      for (const cardSummary of cards) {
        const cardId = normalizeWhitespace(cardSummary?.id);
        if (!cardId) continue;
        rows.push({
          source: "tcgdex",
          external_id: `${lang}:${cardId}`,
          payload: {
            ...cardSummary,
            language: lang === "ja" ? "jp" : lang,
            set: {
              ...(cardSummary?.set ?? {}),
              id: cardSummary?.set?.id || set.id,
              name: cardSummary?.set?.name || set.name || "",
              releaseDate: cardSummary?.set?.releaseDate || set.releaseDate || null,
              series: cardSummary?.set?.series || set.series || "",
            },
          },
          source_updated_at: set?.releaseDate || null,
        });

        if (tcgdexCardNeedsDetail(cardSummary)) {
          detailTasks.push(
            limit(async () => {
              try {
                const detail = await fetchTcgdexCardDetail(apiLang, cardId);
                return {
                  source: "tcgdex",
                  external_id: `${lang}:${cardId}`,
                  payload: {
                    ...detail,
                    language: lang === "ja" ? "jp" : lang,
                    set: {
                      ...(detail?.set ?? {}),
                      id: detail?.set?.id || set.id,
                      name: detail?.set?.name || set.name || "",
                      releaseDate: detail?.set?.releaseDate || set.releaseDate || null,
                      series: detail?.set?.series || set.series || "",
                    },
                  },
                  source_updated_at: set?.releaseDate || null,
                };
              } catch {
                return null;
              }
            }),
          );
        }
      }

      if (detailTasks.length > 0) {
        const detailedRows = (await Promise.all(detailTasks)).filter(Boolean);
        const detailByExternalId = new Map(detailedRows.map((row) => [row.external_id, row]));
        for (let index = rows.length - cards.length; index < rows.length; index += 1) {
          const detailed = detailByExternalId.get(rows[index].external_id);
          if (detailed) rows[index] = detailed;
        }
      }
    }
  }

  return rows;
}

async function upsertRawRows(runId, rows) {
  let count = 0;
  for (const chunk of inBatches(rows, 500)) {
    const payload = chunk.map((row) => ({
      run_id: runId,
      source: row.source,
      external_id: row.external_id,
      payload: row.payload,
      payload_hash: sha1(JSON.stringify(row.payload)),
      source_updated_at: row.source_updated_at,
      fetched_at: new Date().toISOString(),
    }));
    const { error } = await admin
      .from("catalog_source_cards_raw")
      .upsert(payload, { onConflict: "source,external_id" });
    if (error) {
      throw new Error(`catalog_source_cards_raw upsert failed: ${error.message}`);
    }
    count += payload.length;
  }
  return count;
}

async function replaceNormalizedRows(runId, rows) {
  const { error: deleteError } = await admin
    .from("catalog_source_cards_normalized")
    .delete()
    .eq("run_id", runId);
  if (deleteError) {
    throw new Error(`catalog_source_cards_normalized cleanup failed: ${deleteError.message}`);
  }

  let count = 0;
  for (const chunk of inBatches(rows, 500)) {
    const { error } = await admin.from("catalog_source_cards_normalized").insert(chunk);
    if (error) {
      throw new Error(`catalog_source_cards_normalized insert failed: ${error.message}`);
    }
    count += chunk.length;
  }
  return count;
}

async function upsertCardsRefFromMergedRows(rows) {
  let count = 0;
  for (const chunk of inBatches(rows, 500)) {
    const payload = chunk.map((row) => ({
      tcg_id: row.tcg_id,
      name: row.name,
      set_id: row.set_id,
      image_url: row.image_url || null,
      card_number: row.card_number || null,
      hp: row.hp ?? null,
      rarity: row.rarity || null,
      finish: row.finish || null,
      is_secret: row.is_secret ?? null,
      is_promo: row.is_promo ?? null,
      vintage_hint: row.vintage_hint || null,
      regulation_mark: row.regulation_mark || null,
      illustrator: row.illustrator || null,
      estimated_condition: row.estimated_condition || null,
      language: row.language || null,
      release_year: row.release_year ?? null,
      metadata: row.metadata ?? {},
    }));

    const { error } = await admin
      .from("cards_ref")
      .upsert(payload, { onConflict: "tcg_id" });
    if (error) {
      throw new Error(`cards_ref upsert failed: ${error.message}`);
    }
    count += payload.length;
  }
  return count;
}

async function run() {
  const runId = await createRunRecord();
  const startedAt = Date.now();

  try {
    const rawRows = [];
    if (selectedSources.includes("pokemontcg")) {
      const pokemontcgRows = await fetchPokemonTcgCards();
      rawRows.push(...pokemontcgRows);
    }
    if (selectedSources.includes("pokecadata")) {
      const pokecadataRows = await fetchPokecaDataCards();
      rawRows.push(...pokecadataRows);
    }
    if (selectedSources.includes("tcgdex")) {
      const tcgdexRows = await fetchTcgdexCards();
      rawRows.push(...tcgdexRows);
    }

    const fetchedCount = await upsertRawRows(runId, rawRows);

    const normalizedRows = rawRows
      .map((row) =>
        buildNormalizedCard({
          source: row.source,
          externalId: row.external_id,
          rawCard: row.payload,
        }),
      )
      .filter((row) => Boolean(row.name) && Boolean(row.set_id));

    const normalizedInsertRows = normalizedRows.map((row) => ({
      run_id: runId,
      source: row.source,
      external_id: row.external_id,
      canonical_key: row.canonical_key,
      tcg_id: row.tcg_id,
      name: row.name,
      set_id: row.set_id,
      card_number: row.card_number || null,
      hp: row.hp ?? null,
      rarity: row.rarity || null,
      finish: row.finish || null,
      is_secret: row.is_secret ?? null,
      is_promo: row.is_promo ?? null,
      vintage_hint: row.vintage_hint || null,
      regulation_mark: row.regulation_mark || null,
      illustrator: row.illustrator || null,
      estimated_condition: row.estimated_condition || null,
      language: row.language || null,
      release_year: row.release_year ?? null,
      image_url: row.image_url || null,
      mapping_confidence: row.mapping_confidence,
      source_priority: row.source_priority,
      metadata: row.metadata ?? {},
    }));

    const normalizedCount = await replaceNormalizedRows(runId, normalizedInsertRows);
    const mergedRows = mergeByCanonicalKey(normalizedRows);
    const dedupedCount = mergedRows.length;
    const upsertedCount = await upsertCardsRefFromMergedRows(mergedRows);

    await updateRunRecord(runId, {
      status: "success",
      finished_at: new Date().toISOString(),
      fetched_count: fetchedCount,
      normalized_count: normalizedCount,
      deduped_count: dedupedCount,
      upserted_count: upsertedCount,
      metrics: {
        elapsed_ms: Date.now() - startedAt,
        selected_sources: selectedSources,
        page_size: pageSize,
        max_pages: maxPages,
      },
    });

    console.log("Catalog sync completed.");
    console.log(`- run_id: ${runId}`);
    console.log(`- fetched_count: ${fetchedCount}`);
    console.log(`- normalized_count: ${normalizedCount}`);
    console.log(`- deduped_count: ${dedupedCount}`);
    console.log(`- upserted_count: ${upsertedCount}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunRecord(runId, {
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: message,
      metrics: {
        elapsed_ms: Date.now() - startedAt,
        selected_sources: selectedSources,
        page_size: pageSize,
        max_pages: maxPages,
      },
    });
    throw error;
  }
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});

