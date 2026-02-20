import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";
import { lookupTcgdexCandidates } from "@/lib/cards/tcgdex-lookup";

type LookupBody = {
  name?: string;
  cardNumber?: string;
  language?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as LookupBody;
    const name = String(body.name ?? "").trim();
    const cardNumber = String(body.cardNumber ?? "").trim();
    const language = String(body.language ?? "").trim().toLowerCase();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const rows = await lookupTcgdexCandidates({
      name,
      cardNumber: cardNumber || undefined,
      language: language || undefined,
    });

    return NextResponse.json({
      ok: true,
      source: "tcgdex",
      candidates: rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "lookup_failed";
    logError({
      event: "cards_lookup_route_failed",
      message,
    });
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
