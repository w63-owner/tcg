"use server";

import { createClient } from "@/lib/supabase/server";

function normalizeUrl(value: string): string {
  const s = value.trim();
  if (s === "") return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function isValidUrlOrEmpty(value: string | null | undefined): boolean {
  const s = String(value ?? "").trim();
  if (s === "") return true;
  try {
    new URL(normalizeUrl(s));
    return true;
  } catch {
    return false;
  }
}

export async function updateProfileSocialLinks(formData: FormData): Promise<
  | { success: true }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Non connecté." };

  const instagramRaw = String(formData.get("instagram_url") ?? "").trim() || null;
  const facebookRaw = String(formData.get("facebook_url") ?? "").trim() || null;
  const tiktokRaw = String(formData.get("tiktok_url") ?? "").trim() || null;
  const bio = String(formData.get("bio") ?? "").trim() || null;

  if (!isValidUrlOrEmpty(instagramRaw) || !isValidUrlOrEmpty(facebookRaw) || !isValidUrlOrEmpty(tiktokRaw)) {
    return { success: false, error: "Un ou plusieurs liens ne sont pas valides." };
  }

  const instagramUrl = instagramRaw ? normalizeUrl(instagramRaw) : null;
  const facebookUrl = facebookRaw ? normalizeUrl(facebookRaw) : null;
  const tiktokUrl = tiktokRaw ? normalizeUrl(tiktokRaw) : null;

  const { error } = await supabase
    .from("profiles")
    .update({
      instagram_url: instagramUrl,
      facebook_url: facebookUrl,
      tiktok_url: tiktokUrl,
      bio,
    })
    .eq("id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
