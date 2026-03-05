import type { SupabaseClient } from "@supabase/supabase-js";

type ProfileCountryRow = { country_code: string };
type ShippingRow = { price: number };

export async function resolveShippingCost(params: {
  supabase: SupabaseClient;
  buyerId: string;
  sellerId: string;
  weightClass: string;
}) {
  const { supabase, buyerId, sellerId, weightClass } = params;
  const [{ data: buyerProfile }, { data: sellerProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("country_code")
      .eq("id", buyerId)
      .single<ProfileCountryRow>(),
    supabase
      .from("profiles")
      .select("country_code")
      .eq("id", sellerId)
      .single<ProfileCountryRow>(),
  ]);

  if (!buyerProfile?.country_code || !sellerProfile?.country_code) {
    return 0;
  }

  const { data: shipping } = await supabase
    .from("shipping_matrix")
    .select("price")
    .eq("origin_country", sellerProfile.country_code)
    .eq("dest_country", buyerProfile.country_code)
    .eq("weight_class", weightClass)
    .maybeSingle<ShippingRow>();

  return Number(shipping?.price ?? 0);
}

/** Resolve shipping cost by destination country (e.g. for checkout when buyer changes country). */
export async function resolveShippingCostByCountry(params: {
  supabase: SupabaseClient;
  sellerId: string;
  destCountryCode: string;
  weightClass: string;
}) {
  const { supabase, sellerId, destCountryCode, weightClass } = params;
  const { data: sellerProfile } = await supabase
    .from("profiles")
    .select("country_code")
    .eq("id", sellerId)
    .single<ProfileCountryRow>();

  if (!sellerProfile?.country_code || !destCountryCode?.trim()) {
    return 0;
  }

  const dest = String(destCountryCode).trim().toUpperCase().slice(0, 2);
  const { data: shipping } = await supabase
    .from("shipping_matrix")
    .select("price")
    .eq("origin_country", sellerProfile.country_code)
    .eq("dest_country", dest)
    .eq("weight_class", weightClass)
    .maybeSingle<ShippingRow>();

  return Number(shipping?.price ?? 0);
}
