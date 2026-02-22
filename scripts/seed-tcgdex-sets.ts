import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  fetchJsonWithRetry,
  inBatches,
  mapWithConcurrency,
  resolveLanguageConfig,
  toDateOnly,
  toText,
} from "./lib/tcgdex-mirror";

type SetSummary = { id?: string };
type SetDetail = {
  id?: string;
  name?: string;
  logo?: string;
  symbol?: string;
  releaseDate?: string;
  tcgOnline?: string;
  cardCount?: Record<string, unknown>;
  legal?: Record<string, unknown>;
  abbreviation?: Record<string, unknown>;
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
  console.log(`Seeding tcgdex_sets (lang=${dbLang})...`);
  const sets = await fetchJsonWithRetry<SetSummary[]>(`${baseUrl}/${apiLang}/sets`);
  const setIds = (sets ?? []).map((row) => toText(row?.id)).filter(Boolean) as string[];
  const details = await mapWithConcurrency(setIds, concurrency, async (setId) => {
    try {
      return await fetchJsonWithRetry<SetDetail>(`${baseUrl}/${apiLang}/sets/${encodeURIComponent(setId)}`);
    } catch {
      return null;
    }
  });

  const rows = [];
  for (const detail of details) {
    if (!detail) continue;
    const id = toText(detail.id);
    const name = toText(detail.name);
    if (!id || !name) continue;
    const serieObj = detail.serie ?? (typeof detail.series === "object" ? detail.series : null);
    const serieId = toText(serieObj?.id);
    const serieName = toText(serieObj?.name ?? (typeof detail.series === "string" ? detail.series : null));
    rows.push({
      language: dbLang,
      id,
      name,
      logo: toText(detail.logo),
      symbol: toText(detail.symbol),
      release_date: toDateOnly(detail.releaseDate),
      tcg_online: toText(detail.tcgOnline),
      card_count: detail.cardCount ?? {},
      legal: detail.legal ?? {},
      abbreviation: detail.abbreviation ?? {},
      serie_id: serieId,
      serie_name: serieName,
      raw: detail as Record<string, unknown>,
    });
  }

  const dedupedRows = Array.from(
    new Map(rows.map((row) => [`${row.language}:${row.id}`, row])).values(),
  );

  let count = 0;
  const batches = Array.from(inBatches(dedupedRows, 500));
  for (let i = 0; i < batches.length; i += 1) {
    const { error } = await admin
      .from("tcgdex_sets")
      .upsert(batches[i], { onConflict: "language,id" });
    if (error) throw new Error(`tcgdex_sets upsert failed: ${error.message}`);
    count += batches[i].length;
    console.log(`Sets batch ${i + 1}/${batches.length} inserted (${batches[i].length}).`);
  }
  console.log(`tcgdex_sets done: ${count} rows`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
