import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  fetchJsonWithRetry,
  inBatches,
  mapWithConcurrency,
  resolveLanguageConfig,
  toText,
} from "./lib/tcgdex-mirror";

type SetSummary = { id?: string };
type SetDetail = {
  id?: string;
  serie?: { id?: string; name?: string };
  series?: { id?: string; name?: string } | string;
};

dotenv.config({ path: ".env.local", override: true });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.TCGDEX_BASE_URL || "https://api.tcgdex.net/v2";
const concurrency = Math.max(1, Number(process.env.TCGDEX_SEED_CONCURRENCY || "20"));

if (!supabaseUrl || !serviceRole) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const { apiLang, dbLang } = resolveLanguageConfig();
const admin = createClient(supabaseUrl, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log(`Seeding tcgdex_series (lang=${dbLang})...`);
  const sets = await fetchJsonWithRetry<SetSummary[]>(`${baseUrl}/${apiLang}/sets`);
  const setIds = (sets ?? []).map((row) => toText(row?.id)).filter(Boolean) as string[];
  const details = await mapWithConcurrency(setIds, concurrency, async (setId) => {
    try {
      return await fetchJsonWithRetry<SetDetail>(`${baseUrl}/${apiLang}/sets/${encodeURIComponent(setId)}`);
    } catch {
      return null;
    }
  });

  const byId = new Map<string, { language: string; id: string; name: string; raw: Record<string, unknown> }>();
  for (const detail of details) {
    if (!detail) continue;
    const source = detail.serie ?? (typeof detail.series === "object" ? detail.series : null);
    const id = toText(source?.id);
    const name = toText(source?.name ?? (typeof detail.series === "string" ? detail.series : null));
    if (!id || !name) continue;
    byId.set(id, {
      language: dbLang,
      id,
      name,
      raw: source ? { ...source } : { id, name },
    });
  }

  const rows = Array.from(byId.values());
  let count = 0;
  const batches = Array.from(inBatches(rows, 500));
  for (let i = 0; i < batches.length; i += 1) {
    const { error } = await admin
      .from("tcgdex_series")
      .upsert(batches[i], { onConflict: "language,id" });
    if (error) throw new Error(`tcgdex_series upsert failed: ${error.message}`);
    count += batches[i].length;
    console.log(`Series batch ${i + 1}/${batches.length} inserted (${batches[i].length}).`);
  }
  console.log(`tcgdex_series done: ${count} rows`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
