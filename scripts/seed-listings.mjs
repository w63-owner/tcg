/**
 * Seed marketplace listings for demo/dev environments.
 *
 * Creates demo seller users when missing, ensures cards_ref rows,
 * then creates ACTIVE listings visible in the home feed.
 *
 * Usage:
 *   node scripts/seed-listings.mjs
 */
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

function randomPassword() {
  return `Seed-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

const demoUsers = [
  {
    email: "demo.seller.one@pokemarket.local",
    password: process.env.DEMO_SELLER_ONE_PASSWORD || randomPassword(),
    username: "demo_seller_one",
    country_code: "FR",
  },
  {
    email: "demo.seller.two@pokemarket.local",
    password: process.env.DEMO_SELLER_TWO_PASSWORD || randomPassword(),
    username: "demo_seller_two",
    country_code: "BE",
  },
];

const cardsSeed = [
  {
    name: "Charizard",
    set_id: "Base Set",
    tcg_id: "base1-4",
    image_url: "https://images.pokemontcg.io/base1/4_hires.png",
  },
  {
    name: "Pikachu VMAX",
    set_id: "Vivid Voltage",
    tcg_id: "swsh4-44",
    image_url: "https://images.pokemontcg.io/swsh4/44_hires.png",
  },
  {
    name: "Mew VMAX",
    set_id: "Fusion Strike",
    tcg_id: "swsh8-114",
    image_url: "https://images.pokemontcg.io/swsh8/114_hires.png",
  },
  {
    name: "Lugia V",
    set_id: "Silver Tempest",
    tcg_id: "swsh12-138",
    image_url: "https://images.pokemontcg.io/swsh12/138_hires.png",
  },
  {
    name: "Umbreon VMAX",
    set_id: "Evolving Skies",
    tcg_id: "swsh7-95",
    image_url: "https://images.pokemontcg.io/swsh7/95_hires.png",
  },
  {
    name: "Gengar VMAX",
    set_id: "Fusion Strike",
    tcg_id: "swsh8-157",
    image_url: "https://images.pokemontcg.io/swsh8/157_hires.png",
  },
];

const listingTemplates = [
  {
    title: "[SEED] Charizard Base Set - Near Mint",
    card_tcg_id: "base1-4",
    price_seller: 320,
    condition: "NEAR_MINT",
    is_graded: false,
    grading_company: null,
    grade_note: null,
    delivery_weight_class: "S",
  },
  {
    title: "[SEED] Charizard Base Set - PSA 9",
    card_tcg_id: "base1-4",
    price_seller: 560,
    condition: null,
    is_graded: true,
    grading_company: "PSA",
    grade_note: 9,
    delivery_weight_class: "S",
  },
  {
    title: "[SEED] Pikachu VMAX - Mint",
    card_tcg_id: "swsh4-44",
    price_seller: 18,
    condition: "MINT",
    is_graded: false,
    grading_company: null,
    grade_note: null,
    delivery_weight_class: "XS",
  },
  {
    title: "[SEED] Mew VMAX - BGS 9.5",
    card_tcg_id: "swsh8-114",
    price_seller: 85,
    condition: null,
    is_graded: true,
    grading_company: "BGS",
    grade_note: 9.5,
    delivery_weight_class: "S",
  },
  {
    title: "[SEED] Lugia V - Excellent",
    card_tcg_id: "swsh12-138",
    price_seller: 175,
    condition: "EXCELLENT",
    is_graded: false,
    grading_company: null,
    grade_note: null,
    delivery_weight_class: "S",
  },
  {
    title: "[SEED] Umbreon VMAX - PSA 10",
    card_tcg_id: "swsh7-95",
    price_seller: 780,
    condition: null,
    is_graded: true,
    grading_company: "PSA",
    grade_note: 10,
    delivery_weight_class: "S",
  },
  {
    title: "[SEED] Gengar VMAX - Near Mint",
    card_tcg_id: "swsh8-157",
    price_seller: 215,
    condition: "NEAR_MINT",
    is_graded: false,
    grading_company: null,
    grade_note: null,
    delivery_weight_class: "S",
  },
  {
    title: "[SEED] Mew VMAX - PCA 8.5",
    card_tcg_id: "swsh8-114",
    price_seller: 64,
    condition: null,
    is_graded: true,
    grading_company: "PCA",
    grade_note: 8.5,
    delivery_weight_class: "S",
  },
];

const parsedCount = Number(process.argv[2] ?? process.env.SEED_LISTINGS_COUNT ?? "8");
const listingCount = Number.isFinite(parsedCount)
  ? Math.min(Math.max(Math.trunc(parsedCount), 8), 500)
  : 8;
const seedPrefix = process.env.SEED_LISTINGS_PREFIX || "[SEED]";

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomPick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function toTitleWithIndex(baseTitle, index) {
  return `${seedPrefix} ${baseTitle.replace(/^\[SEED\]\s*/, "")} #${String(index + 1).padStart(3, "0")}`;
}

async function ensureDemoUser(user) {
  const created = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { username: user.username },
  });

  if (created.error && !created.error.message.toLowerCase().includes("already")) {
    throw new Error(`createUser failed (${user.email}): ${created.error.message}`);
  }

  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .select("id")
    .eq("username", user.username)
    .maybeSingle();

  if (profileErr) throw new Error(`profile lookup failed (${user.email}): ${profileErr.message}`);

  if (!profileRow?.id) {
    // Fallback: list users and map by email if trigger lagged.
    const usersRes = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (usersRes.error) throw new Error(`listUsers failed: ${usersRes.error.message}`);
    const found = usersRes.data.users.find((u) => u.email === user.email);
    if (!found) throw new Error(`unable to resolve user id for ${user.email}`);

    const { error: upsertErr } = await admin.from("profiles").upsert(
      {
        id: found.id,
        username: user.username,
        country_code: user.country_code,
      },
      { onConflict: "id" },
    );
    if (upsertErr) throw new Error(`profile upsert failed: ${upsertErr.message}`);

    return found.id;
  }

  return profileRow.id;
}

async function run() {
  console.log(`Seeding demo listings (${listingCount})...`);

  const sellerIds = [];
  for (const demo of demoUsers) {
    const id = await ensureDemoUser(demo);
    sellerIds.push(id);
  }

  const { error: cardsErr } = await admin
    .from("cards_ref")
    .upsert(cardsSeed, { onConflict: "tcg_id" });
  if (cardsErr) throw new Error(`cards_ref upsert failed: ${cardsErr.message}`);

  const { data: cardsRows, error: cardsSelectErr } = await admin
    .from("cards_ref")
    .select("id, tcg_id, image_url")
    .in(
      "tcg_id",
      cardsSeed.map((c) => c.tcg_id),
    );
  if (cardsSelectErr) throw new Error(`cards_ref select failed: ${cardsSelectErr.message}`);

  const cardByTcg = new Map(cardsRows.map((c) => [c.tcg_id, c]));

  const { error: deleteErr } = await admin
    .from("listings")
    .delete()
    .ilike("title", `${seedPrefix}%`);
  if (deleteErr) throw new Error(`seed cleanup failed: ${deleteErr.message}`);

  const listingsToInsert = [];
  for (let index = 0; index < listingCount; index += 1) {
    const template = listingTemplates[index % listingTemplates.length];
    const card = cardByTcg.get(template.card_tcg_id);
    if (!card) throw new Error(`Missing card_ref for ${template.card_tcg_id}`);

    const priceMultiplier = randomBetween(0.82, 1.28);
    const computedPrice = roundMoney(template.price_seller * priceMultiplier);
    const sellerId = randomPick(sellerIds);
    const isGraded = Math.random() < 0.45 ? true : template.is_graded;
    const gradeValue = roundMoney(randomBetween(8, 10));
    const gradeStep = Math.round(gradeValue * 2) / 2;

    listingsToInsert.push({
      seller_id: sellerId,
      card_ref_id: card.id,
      title: toTitleWithIndex(template.title, index),
      price_seller: Math.max(1, computedPrice),
      condition: isGraded ? null : template.condition ?? "NEAR_MINT",
      is_graded: isGraded,
      grading_company: isGraded
        ? randomPick(["PSA", "PCA", "BGS", "CGC"])
        : null,
      grade_note: isGraded ? gradeStep : null,
      delivery_weight_class: randomPick(["XS", "S", "M"]),
      cover_image_url: card.image_url,
      back_image_url: card.image_url,
      status: "ACTIVE",
    });
  }

  const inserted = [];
  const chunkSize = 100;
  for (let cursor = 0; cursor < listingsToInsert.length; cursor += chunkSize) {
    const chunk = listingsToInsert.slice(cursor, cursor + chunkSize);
    const { data: rows, error: insertErr } = await admin
      .from("listings")
      .insert(chunk)
      .select("id, title, status");
    if (insertErr) throw new Error(`listings insert failed: ${insertErr.message}`);
    inserted.push(...(rows ?? []));
  }

  console.log(`Done. Created ${inserted.length} ACTIVE listings.`);
  const preview = inserted.slice(0, 12);
  preview.forEach((row) => {
    console.log(`- ${row.title} (${row.id})`);
  });
  if (inserted.length > preview.length) {
    console.log(`... and ${inserted.length - preview.length} more listings`);
  }
}

run().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
