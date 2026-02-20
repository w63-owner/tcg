/**
 * Import CardMarket-like product catalogs + price guide into Supabase.
 *
 * Inputs (default paths):
 * - /Users/Antonin/Downloads/products_singles_6.json
 * - /Users/Antonin/Downloads/products_nonsingles_6.json
 * - /Users/Antonin/Downloads/price_guide_6.json
 *
 * Upserts:
 * - public.price_estimations (for cards + sealed products)
 *
 * Legacy behavior:
 * - pass --with-cards-ref-legacy to also upsert cards_ref using local heuristics.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SCRIPTS !== "true") {
  console.error("Refusing to run seed script in production without ALLOW_PROD_SCRIPTS=true");
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

const DEFAULT_SINGLES_PATH = "/Users/Antonin/Downloads/products_singles_6.json";
const DEFAULT_NONSINGLES_PATH = "/Users/Antonin/Downloads/products_nonsingles_6.json";
const DEFAULT_PRICE_GUIDE_PATH = "/Users/Antonin/Downloads/price_guide_6.json";

const singlesPath = process.argv[2] || DEFAULT_SINGLES_PATH;
const nonSinglesPath = process.argv[3] || DEFAULT_NONSINGLES_PATH;
const priceGuidePath = process.argv[4] || DEFAULT_PRICE_GUIDE_PATH;
const withCardsRefLegacy = process.argv.includes("--with-cards-ref-legacy");

const BATCH_SIZE = 1000;
const SOURCE = "cm_price_guide_import";

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCardName(rawName) {
  const cleaned = normalizeWhitespace(rawName).replace(/\[[^\]]*\]/g, "").trim();
  return cleaned || normalizeWhitespace(rawName);
}

function inferCardNumber(product) {
  const name = normalizeWhitespace(product?.name);
  const collector = normalizeWhitespace(product?.collectorNumber || product?.number);
  if (collector) return collector;
  const slash = name.match(/\b(\d{1,3}\s*\/\s*\d{2,3})\b/)?.[1];
  if (slash) return slash.replace(/\s+/g, "");
  const hash = name.match(/#\s?(\d{1,3})\b/)?.[1];
  return hash || null;
}

function inferHp(product) {
  const direct = Number(product?.hp ?? 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const name = normalizeWhitespace(product?.name);
  const fromName = Number(name.match(/\b(?:HP|PV)\s*[:.]?\s*(\d{2,4})\b/i)?.[1] ?? 0);
  if (Number.isFinite(fromName) && fromName > 0) return Math.round(fromName);
  return null;
}

function inferLanguage(product) {
  const raw = normalizeWhitespace(
    product?.language || product?.languageName || product?.locale || product?.name,
  ).toLowerCase();
  if (/(japanese|japonais|\bjp\b|ポケモン|トレーナー)/.test(raw)) return "jp";
  if (/(french|francais|\bfr\b)/.test(raw)) return "fr";
  if (/(english|\ben\b)/.test(raw)) return "en";
  return null;
}

function inferRarity(product) {
  const raw = normalizeWhitespace(product?.rarity || product?.name).toLowerCase();
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

function inferFinish(product) {
  const raw = normalizeWhitespace(product?.name).toLowerCase();
  if (/full art|pleine illustration/.test(raw)) return "FULL_ART";
  if (/textur|etched/.test(raw)) return "TEXTURED";
  if (/reverse|inverse/.test(raw)) return "REVERSE_HOLO";
  if (/cosmos|swirl/.test(raw)) return "COSMOS";
  if (/cracked ice|glace brisee/.test(raw)) return "CRACKED_ICE";
  if (/holo/.test(raw)) return "HOLO";
  if (/non holo|non-holo|sans holo/.test(raw)) return "NON_HOLO";
  return null;
}

function inferVintageHint(product) {
  const raw = normalizeWhitespace(product?.name).toLowerCase();
  if (/1st edition|edition 1/.test(raw)) return "1ST_EDITION";
  if (/shadowless|sans ombre/.test(raw)) return "SHADOWLESS";
  if (/unlimited|illimitee/.test(raw)) return "UNLIMITED";
  return null;
}

function inferRegulationMark(product) {
  const raw = normalizeWhitespace(
    product?.regulationMark || product?.regulation || product?.name,
  );
  return raw.match(/\b([EFGH])\b/)?.[1] || null;
}

function inferIllustrator(product) {
  const direct = normalizeWhitespace(product?.illustrator || product?.artist);
  if (direct) return direct;
  const fromName = normalizeWhitespace(product?.name).match(/\b(?:illus\.?|artist)\s*[:.]?\s*([^\n,]{2,60})/i)?.[1];
  return fromName ? normalizeWhitespace(fromName) : null;
}

function inferEstimatedCondition(product) {
  const raw = normalizeWhitespace(product?.condition || product?.name).toUpperCase();
  if (/\bMINT\b/.test(raw)) return "MINT";
  if (/NEAR[ _-]?MINT|\bNM\b/.test(raw)) return "NEAR_MINT";
  if (/\bEXCELLENT\b|\bEX\b/.test(raw)) return "EXCELLENT";
  if (/\bGOOD\b/.test(raw)) return "GOOD";
  if (/LIGHT[ _-]?PLAYED|\bLP\b/.test(raw)) return "LIGHT_PLAYED";
  if (/\bPLAYED\b|\bMP\b/.test(raw)) return "PLAYED";
  if (/\bPOOR\b|DAMAGED/.test(raw)) return "POOR";
  return null;
}

function inferReleaseYear(product) {
  const candidates = [
    product?.releaseYear,
    product?.year,
    product?.releaseDate,
    product?.date,
    product?.createdAt,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const text = String(candidate);
    const year = Number(text.match(/\b(19\d{2}|20\d{2})\b/)?.[1] ?? 0);
    if (Number.isFinite(year) && year >= 1995 && year <= 2100) return year;
  }
  return null;
}

function inferIsSecret(cardNumber) {
  if (!cardNumber || !cardNumber.includes("/")) return null;
  const [left, right] = cardNumber.split("/").map((part) => Number(part));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return left > right;
}

function inferIsPromo(product) {
  const raw = normalizeWhitespace(product?.name).toLowerCase();
  if (/promo|black star|\bswsh\d{2,4}\b|\bsvp\b/.test(raw)) return true;
  return null;
}

function inferSetLabel(product) {
  const expansionId = Number(product?.idExpansion ?? 0);
  if (Number.isFinite(expansionId) && expansionId > 0) {
    return `EXP-${expansionId}`;
  }
  return "Unknown";
}

function resolveEstimatedPrice(guideRow) {
  const candidates = [
    guideRow.avg,
    guideRow.avg30,
    guideRow.avg7,
    guideRow.avg1,
    guideRow.trend,
    guideRow.low,
    guideRow["avg-holo"],
    guideRow["avg30-holo"],
    guideRow["avg7-holo"],
    guideRow["avg1-holo"],
    guideRow["trend-holo"],
    guideRow["low-holo"],
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value * 100) / 100;
    }
  }
  return null;
}

async function readInputJson(filePath, label) {
  const absolutePath = path.resolve(filePath);
  const content = await fs.readFile(absolutePath, "utf-8");
  return parseJson(content, label);
}

function* inBatches(items, batchSize) {
  for (let i = 0; i < items.length; i += batchSize) {
    yield items.slice(i, i + batchSize);
  }
}

async function upsertCardsRef(rows) {
  let count = 0;
  for (const chunk of inBatches(rows, BATCH_SIZE)) {
    const { error } = await admin
      .from("cards_ref")
      .upsert(chunk, { onConflict: "tcgId" });
    if (error) {
      throw new Error(`cards_ref upsert failed: ${error.message}`);
    }
    count += chunk.length;
  }
  return count;
}

async function upsertPriceEstimations(rows) {
  let count = 0;
  for (const chunk of inBatches(rows, BATCH_SIZE)) {
    const { error } = await admin
      .from("price_estimations")
      .upsert(chunk, { onConflict: "card_name,set_name,currency" });
    if (error) {
      throw new Error(`price_estimations upsert failed: ${error.message}`);
    }
    count += chunk.length;
  }
  return count;
}

async function run() {
  console.log("Importing product catalogs and price guide...");
  console.log(`- singles: ${singlesPath}`);
  console.log(`- non-singles: ${nonSinglesPath}`);
  console.log(`- price guide: ${priceGuidePath}`);

  const [singlesJson, nonSinglesJson, priceGuideJson] = await Promise.all([
    readInputJson(singlesPath, "products_singles"),
    readInputJson(nonSinglesPath, "products_nonsingles"),
    readInputJson(priceGuidePath, "price_guide"),
  ]);

  const singlesProducts = toArray(singlesJson.products);
  const nonSinglesProducts = toArray(nonSinglesJson.products);
  const guideRows = toArray(priceGuideJson.priceGuides);

  const productsById = new Map();
  for (const product of [...singlesProducts, ...nonSinglesProducts]) {
    const idProduct = Number(product?.idProduct);
    if (!Number.isFinite(idProduct) || idProduct <= 0) continue;
    productsById.set(idProduct, product);
  }

  // cards_ref rows for singles only (category id 51 per provided export)
  const cardsRefByTcgId = new Map();
  for (const product of singlesProducts) {
    const idProduct = Number(product?.idProduct);
    if (!Number.isFinite(idProduct) || idProduct <= 0) continue;
    const tcgId = `cm-${idProduct}`;
    const name = normalizeCardName(product?.name);
    const setId = inferSetLabel(product);
    const cardNumber = inferCardNumber(product);
    cardsRefByTcgId.set(tcgId, {
      tcgId,
      name,
      setId,
      image: null,
      localId: cardNumber,
      hp: inferHp(product),
      rarity: inferRarity(product),
      finish: inferFinish(product),
      is_secret: inferIsSecret(cardNumber),
      is_promo: inferIsPromo(product),
      vintage_hint: inferVintageHint(product),
      regulationMark: inferRegulationMark(product),
      illustrator: inferIllustrator(product),
      estimated_condition: inferEstimatedCondition(product),
      language: inferLanguage(product),
      releaseYear: inferReleaseYear(product),
      metadata: {
        source_product_id: idProduct,
        source_category_id: Number(product?.idCategory ?? 0) || null,
        source_expansion_id: Number(product?.idExpansion ?? 0) || null,
      },
    });
  }

  let cardsRefCount = 0;
  if (withCardsRefLegacy) {
    const cardsRefRows = Array.from(cardsRefByTcgId.values());
    cardsRefCount = await upsertCardsRef(cardsRefRows);
  }

  // price estimations for all guide rows that can map to a product + valid price
  const priceRowsByKey = new Map();
  const importedAt = normalizeWhitespace(priceGuideJson?.createdAt) || new Date().toISOString();
  for (const guideRow of guideRows) {
    const idProduct = Number(guideRow?.idProduct);
    if (!Number.isFinite(idProduct) || idProduct <= 0) continue;
    const product = productsById.get(idProduct);
    if (!product) continue;

    const estimatedPrice = resolveEstimatedPrice(guideRow);
    if (estimatedPrice === null) continue;

    const cardName = normalizeCardName(product?.name);
    const setName = inferSetLabel(product);
    const key = `${cardName}::${setName}::EUR`;

    priceRowsByKey.set(key, {
      card_name: cardName,
      set_name: setName,
      estimated_price: estimatedPrice,
      currency: "EUR",
      source: `${SOURCE}:${product?.idCategory ?? "unknown"}:${idProduct}`,
      last_updated_at: importedAt,
    });
  }

  const priceRows = Array.from(priceRowsByKey.values());
  const priceCount = await upsertPriceEstimations(priceRows);

  console.log("Import completed.");
  console.log(`- products_singles rows: ${singlesProducts.length}`);
  console.log(`- products_nonsingles rows: ${nonSinglesProducts.length}`);
  console.log(`- price guide rows: ${guideRows.length}`);
  console.log(`- cards_ref upserted (legacy mode): ${cardsRefCount}`);
  console.log(`- price_estimations upserted: ${priceCount}`);
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});

