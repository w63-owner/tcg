import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getRequiredEnvVar } from "@/lib/env";

export function createAdminClient() {
  const supabaseUrl = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
