import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";

function pushUnique(target: string[], seen: Set<string>, value: unknown, max = 25) {
  if (target.length >= max) return;
  const text = String(value ?? "").trim();
  if (!text) return;
  const key = text.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(text);
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("tcgdex_cards")
      .select(
        "name, set_id, set_name, local_id, language, hp, rarity, suffix, set_card_count_official",
      )
      .limit(250);

    if (q) {
      query = query.or(
        [`name.ilike.%${q}%`, `set_id.ilike.%${q}%`, `set_name.ilike.%${q}%`, `local_id.ilike.%${q}%`, `id.ilike.%${q}%`].join(
          ",",
        ),
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const names: string[] = [];
    const sets: string[] = [];
    const numbers: string[] = [];
    const languages: string[] = [];
    const rarities: string[] = [];
    const finishes: string[] = [];
    const hps: string[] = [];
    const seen = {
      names: new Set<string>(),
      sets: new Set<string>(),
      numbers: new Set<string>(),
      languages: new Set<string>(),
      rarities: new Set<string>(),
      finishes: new Set<string>(),
      hps: new Set<string>(),
    };

    for (const row of data ?? []) {
      pushUnique(names, seen.names, row.name);

      pushUnique(sets, seen.sets, row.set_name ?? row.set_id);

      const localId = String(row.local_id ?? "").trim();
      const official = Number(row.set_card_count_official ?? 0);
      if (localId) {
        if (Number.isFinite(official) && official > 0) {
          pushUnique(numbers, seen.numbers, `${localId}/${official}`);
        }
        pushUnique(numbers, seen.numbers, localId);
      }

      pushUnique(languages, seen.languages, row.language ? String(row.language).toUpperCase() : "");
      pushUnique(rarities, seen.rarities, row.rarity);
      pushUnique(finishes, seen.finishes, row.suffix);
      pushUnique(hps, seen.hps, row.hp);
    }

    return NextResponse.json({
      ok: true,
      suggestions: {
        names,
        sets,
        numbers,
        languages,
        rarities,
        finishes,
        hps,
      },
    });
  } catch (error) {
    logError({
      event: "cards_suggestions_route_failed",
      message: error instanceof Error ? error.message : "suggestions_failed",
    });
    return NextResponse.json({ error: "suggestions_failed" }, { status: 500 });
  }
}
