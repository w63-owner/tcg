import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUser(nextPath: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth?next=${encodeURIComponent(nextPath)}`);
  }

  return { supabase, user };
}
