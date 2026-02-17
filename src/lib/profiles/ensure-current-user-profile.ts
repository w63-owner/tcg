import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sanitizeUsername } from "@/lib/auth-utils";

type ProfileRow = { id: string };

function baseUsernameFromUser(user: User) {
  const fromMeta =
    typeof user.user_metadata?.username === "string"
      ? user.user_metadata.username
      : "";
  const fromEmail = user.email ? user.email.split("@")[0] : "";
  return sanitizeUsername(fromMeta || fromEmail || "trainer");
}

function withSuffix(username: string, userId: string) {
  const suffix = userId.slice(0, 6);
  const maxBaseLength = Math.max(3, 30 - suffix.length - 1);
  return `${username.slice(0, maxBaseLength)}-${suffix}`;
}

export async function ensureCurrentUserProfile(
  supabase: SupabaseClient,
  user: User,
) {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (existing?.id) return;

  const username = baseUsernameFromUser(user);
  const primaryInsert = await supabase.from("profiles").upsert(
    {
      id: user.id,
      username,
      country_code: "FR",
    },
    { onConflict: "id" },
  );

  if (!primaryInsert.error) return;

  const fallbackUsername = withSuffix(username, user.id);
  await supabase.from("profiles").upsert(
    {
      id: user.id,
      username: fallbackUsername,
      country_code: "FR",
    },
    { onConflict: "id" },
  );
}
