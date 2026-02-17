/**
 * RLS intrusion smoke tests for favorites/saved_searches/message visibility.
 *
 * Required env:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - INTRUSION_USER_A_EMAIL
 * - INTRUSION_USER_A_PASSWORD
 * - INTRUSION_USER_B_EMAIL
 * - INTRUSION_USER_B_PASSWORD
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SCRIPTS !== "true") {
  console.error("Refusing to run RLS audit script in production without ALLOW_PROD_SCRIPTS=true");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const userAEmail = process.env.INTRUSION_USER_A_EMAIL;
const userAPassword = process.env.INTRUSION_USER_A_PASSWORD;
const userBEmail = process.env.INTRUSION_USER_B_EMAIL;
const userBPassword = process.env.INTRUSION_USER_B_PASSWORD;

if (!url || !anonKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}
if (!userAEmail || !userAPassword || !userBEmail || !userBPassword) {
  console.error("Missing INTRUSION_USER_* credentials");
  process.exit(1);
}

const a = createClient(url, anonKey);
const b = createClient(url, anonKey);

async function signIn(client, email, password) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`SignIn failed (${email}): ${error.message}`);
}

function assert(condition, msg) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function run() {
  console.log("Signing in users...");
  await signIn(a, userAEmail, userAPassword);
  await signIn(b, userBEmail, userBPassword);

  const { data: activeListings } = await a
    .from("listings")
    .select("id")
    .eq("status", "ACTIVE")
    .limit(1);
  const listingId = activeListings?.[0]?.id;
  if (!listingId) {
    throw new Error("No ACTIVE listing found for favorite test");
  }

  console.log("User A creates favorite listing...");
  const { error: favInsertErr } = await a.from("favorite_listings").insert({ listing_id: listingId });
  if (favInsertErr && !favInsertErr.message.toLowerCase().includes("duplicate")) {
    throw new Error(`favorite_listings insert failed: ${favInsertErr.message}`);
  }

  const { data: aFavRows } = await a
    .from("favorite_listings")
    .select("user_id, listing_id")
    .eq("listing_id", listingId);
  assert((aFavRows?.length ?? 0) >= 1, "User A should see own favorite");
  const aUserId = aFavRows[0].user_id;

  console.log("User B attempts to read A favorites...");
  const { data: bReadAFavs } = await b
    .from("favorite_listings")
    .select("user_id, listing_id")
    .eq("user_id", aUserId);
  assert((bReadAFavs?.length ?? 0) === 0, "User B must not read A favorites");

  console.log("User B attempts to delete A favorite...");
  const { data: bDeleteRows } = await b
    .from("favorite_listings")
    .delete()
    .eq("user_id", aUserId)
    .eq("listing_id", listingId)
    .select("listing_id");
  assert((bDeleteRows?.length ?? 0) === 0, "User B must not delete A favorites");

  console.log("User A creates saved search...");
  const { data: aSavedSearch } = await a
    .from("saved_searches")
    .insert({
      name: "RLS test search",
      search_params: { q: "charizard" },
    })
    .select("id")
    .single();

  assert(Boolean(aSavedSearch?.id), "User A saved_search insert should succeed");

  console.log("User B attempts to read A saved search by id...");
  const { data: bReadSaved } = await b
    .from("saved_searches")
    .select("id")
    .eq("id", aSavedSearch.id);
  assert((bReadSaved?.length ?? 0) === 0, "User B must not read A saved search");

  console.log("User B attempts to update A saved search...");
  const { data: bUpdateSaved } = await b
    .from("saved_searches")
    .update({ name: "hacked" })
    .eq("id", aSavedSearch.id)
    .select("id");
  assert((bUpdateSaved?.length ?? 0) === 0, "User B must not update A saved search");

  console.log("RLS intrusion smoke tests: PASS");
}

run().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
