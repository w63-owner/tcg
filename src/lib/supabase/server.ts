import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components (e.g. layout/page), cookies are read-only.
          // Supabase may still attempt to refresh/set auth cookies during reads.
          // We ignore write attempts outside Server Actions/Route Handlers.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // No-op by design in read-only rendering contexts.
          }
        },
      },
    },
  );
}
