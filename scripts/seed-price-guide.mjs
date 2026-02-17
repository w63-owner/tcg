/**
 * Import CardMarket-like product catalogs + price guide into Supabase.
 *
 * Inputs (default paths):
 * - /Users/Antonin/Downloads/products_singles_6.json
 * - /Users/Antonin/Downloads/products_nonsingles_6.json
 * - /Users/Antonin/Downloads/price_guide_6.json
 *
 * Upserts:
 * - public.cards_ref (for single cards)
 * - public.price_estimations (for cards + sealed products)
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
      .upsert(chunk, { onConflict: "tcg_id" });
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
    cardsRefByTcgId.set(tcgId, {
      tcg_id: tcgId,
      name,
      set_id: setId,
      image_url: null,
    });
  }

  const cardsRefRows = Array.from(cardsRefByTcgId.values());
  const cardsRefCount = await upsertCardsRef(cardsRefRows);

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
  console.log(`- cards_ref upserted: ${cardsRefCount}`);
  console.log(`- price_estimations upserted: ${priceCount}`);
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});

