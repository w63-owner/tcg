"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";
import { ensureCurrentUserProfile } from "@/lib/profiles/ensure-current-user-profile";

function normalizeSearchName(rawName: string) {
  const name = rawName.trim();
  if (!name) return "";
  return name.slice(0, 100);
}

function smartSearchName(searchParams: Record<string, string>) {
  const chunks: string[] = [];
  if (searchParams.q) chunks.push(`"${searchParams.q}"`);
  if (searchParams.set) chunks.push(`Set ${searchParams.set}`);
  if (searchParams.condition) chunks.push(searchParams.condition);
  if (searchParams.is_graded === "1") chunks.push("Gradee");
  if (searchParams.is_graded === "0") chunks.push("Non gradee");
  if (searchParams.price_min || searchParams.price_max) {
    chunks.push(
      `Prix ${searchParams.price_min || "0"}-${searchParams.price_max || "∞"} EUR`,
    );
  }
  if (searchParams.grade_min || searchParams.grade_max) {
    chunks.push(
      `Note ${searchParams.grade_min || "1"}-${searchParams.grade_max || "10"}`,
    );
  }
  if (chunks.length === 0) return "Recherche sauvegardee";
  return chunks.join(" · ").slice(0, 100);
}

function parseSearchParamsFromRaw(raw: string) {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === "string" && value.trim().length > 0,
      ),
    ) as Record<string, string>;
  } catch {
    return null;
  }
}

export async function addFavoriteListing(formData: FormData) {
  const listingId = String(formData.get("listing_id") ?? "").trim();
  if (!listingId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "favorite_listing_add_unauthorized", context: { listingId } });
    return;
  }
  await ensureCurrentUserProfile(supabase, user);

  const { error } = await supabase.from("favorite_listings").insert({
    user_id: user.id,
    listing_id: listingId,
  });
  if (error) {
    logError({
      event: "favorite_listing_add_failed",
      message: error.message,
      context: { userId: user.id, listingId },
    });
    return;
  }
  logInfo({ event: "favorite_listing_added_action", context: { userId: user.id, listingId } });

  revalidatePath("/favorites");
  revalidatePath(`/listing/${listingId}`);
}

export async function removeFavoriteListing(formData: FormData) {
  const listingId = String(formData.get("listing_id") ?? "").trim();
  if (!listingId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "favorite_listing_remove_unauthorized", context: { listingId } });
    return;
  }
  await ensureCurrentUserProfile(supabase, user);

  const { error } = await supabase
    .from("favorite_listings")
    .delete()
    .eq("user_id", user.id)
    .eq("listing_id", listingId);
  if (error) {
    logError({
      event: "favorite_listing_remove_failed",
      message: error.message,
      context: { userId: user.id, listingId },
    });
    return;
  }
  logInfo({
    event: "favorite_listing_removed_action",
    context: { userId: user.id, listingId },
  });

  revalidatePath("/favorites");
  revalidatePath(`/listing/${listingId}`);
}

export async function addFavoriteSeller(formData: FormData) {
  const sellerId = String(formData.get("seller_id") ?? "").trim();
  if (!sellerId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "favorite_seller_add_unauthorized", context: { sellerId } });
    return;
  }
  await ensureCurrentUserProfile(supabase, user);
  if (user.id === sellerId) return;

  const { error } = await supabase.from("favorite_sellers").insert({
    user_id: user.id,
    seller_id: sellerId,
  });
  if (error) {
    logError({
      event: "favorite_seller_add_failed",
      message: error.message,
      context: { userId: user.id, sellerId },
    });
    return;
  }
  logInfo({
    event: "favorite_seller_added_action",
    context: { userId: user.id, sellerId },
  });

  revalidatePath("/favorites");
  const returnPath = String(formData.get("return_path") ?? "").trim();
  if (returnPath) revalidatePath(returnPath);
}

export async function removeFavoriteSeller(formData: FormData) {
  const sellerId = String(formData.get("seller_id") ?? "").trim();
  if (!sellerId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "favorite_seller_remove_unauthorized", context: { sellerId } });
    return;
  }
  await ensureCurrentUserProfile(supabase, user);

  const { error } = await supabase
    .from("favorite_sellers")
    .delete()
    .eq("user_id", user.id)
    .eq("seller_id", sellerId);
  if (error) {
    logError({
      event: "favorite_seller_remove_failed",
      message: error.message,
      context: { userId: user.id, sellerId },
    });
    return;
  }
  logInfo({
    event: "favorite_seller_removed_action",
    context: { userId: user.id, sellerId },
  });

  revalidatePath("/favorites");
  const returnPath = String(formData.get("return_path") ?? "").trim();
  if (returnPath) revalidatePath(returnPath);
}

export async function saveSearch(formData: FormData) {
  const rawName = String(formData.get("name") ?? "");
  const paramsRaw = String(formData.get("search_params") ?? "{}");

  const searchParams = parseSearchParamsFromRaw(paramsRaw);
  if (!searchParams) {
    return { ok: false as const, error: "invalid_params" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "saved_search_add_unauthorized" });
    return { ok: false as const, error: "unauthorized" };
  }
  await ensureCurrentUserProfile(supabase, user);

  const { error } = await supabase.from("saved_searches").insert({
    user_id: user.id,
    name:
      normalizeSearchName(rawName) ||
      normalizeSearchName(searchParams.q ?? "") ||
      smartSearchName(searchParams),
    search_params: searchParams,
  });
  if (error) {
    logError({
      event: "saved_search_add_failed",
      message: error.message,
      context: { userId: user.id },
    });
    return { ok: false as const, error: error.message };
  }
  logInfo({ event: "saved_search_added", context: { userId: user.id } });

  revalidatePath("/favorites");
  revalidatePath("/");
  return { ok: true as const };
}

export async function renameSavedSearch(formData: FormData) {
  const searchId = String(formData.get("saved_search_id") ?? "").trim();
  const rawName = String(formData.get("name") ?? "");
  const nextName = normalizeSearchName(rawName);
  if (!searchId || !nextName) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "saved_search_rename_unauthorized", context: { searchId } });
    return;
  }
  await ensureCurrentUserProfile(supabase, user);

  const { error } = await supabase
    .from("saved_searches")
    .update({ name: nextName })
    .eq("id", searchId)
    .eq("user_id", user.id);
  if (error) {
    logError({
      event: "saved_search_rename_failed",
      message: error.message,
      context: { userId: user.id, searchId },
    });
    return;
  }

  revalidatePath("/favorites");
}

export async function updateSavedSearchCriteria(formData: FormData) {
  const searchId = String(formData.get("saved_search_id") ?? "").trim();
  const paramsRaw = String(formData.get("search_params") ?? "{}");
  const rawName = String(formData.get("name") ?? "");
  if (!searchId) {
    return { ok: false as const, error: "missing_search_id" };
  }
  const searchParams = parseSearchParamsFromRaw(paramsRaw);
  if (!searchParams) {
    return { ok: false as const, error: "invalid_params" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "saved_search_update_unauthorized", context: { searchId } });
    return { ok: false as const, error: "unauthorized" };
  }
  await ensureCurrentUserProfile(supabase, user);

  const computedName =
    normalizeSearchName(rawName) ||
    normalizeSearchName(searchParams.q ?? "") ||
    smartSearchName(searchParams);

  const { error } = await supabase
    .from("saved_searches")
    .update({
      name: computedName,
      search_params: searchParams,
      updated_at: new Date().toISOString(),
    })
    .eq("id", searchId)
    .eq("user_id", user.id);

  if (error) {
    logError({
      event: "saved_search_update_failed",
      message: error.message,
      context: { userId: user.id, searchId },
    });
    return { ok: false as const, error: error.message };
  }

  revalidatePath("/favorites");
  revalidatePath("/search");
  revalidatePath("/");
  return { ok: true as const };
}

export async function removeSavedSearch(formData: FormData) {
  const searchId = String(formData.get("saved_search_id") ?? "").trim();
  if (!searchId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({ event: "saved_search_remove_unauthorized", context: { searchId } });
    return;
  }
  await ensureCurrentUserProfile(supabase, user);

  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", searchId)
    .eq("user_id", user.id);
  if (error) {
    logError({
      event: "saved_search_remove_failed",
      message: error.message,
      context: { userId: user.id, searchId },
    });
    return;
  }
  logInfo({ event: "saved_search_removed", context: { userId: user.id, searchId } });

  revalidatePath("/favorites");
}
