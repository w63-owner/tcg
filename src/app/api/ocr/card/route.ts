import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";
import { detectCardTextFromImage } from "@/lib/ocr/provider";
import { lookupTcgdexCandidates } from "@/lib/cards/tcgdex-lookup";
import {
  buildLookupTerms,
  parseCardParameters,
  rankCardRefCandidates,
  type CardRefCandidate,
  type CardRefLookupRow,
  type ParsedCardParameters,
} from "@/lib/ocr/parse-and-match";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FALLBACK_CONFIDENCE_THRESHOLD = 0.5;

function sanitizeLookupToken(value: string) {
  return value.replace(/[^a-zA-Z0-9/-]/g, "").trim();
}

function toClientOcrErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("openai_api_key")) {
    return "OCR misconfigure: OPENAI_API_KEY manquante.";
  }
  if (normalized.includes("429")) {
    return "OCR indisponible: quota OpenAI atteinte (429).";
  }
  if (normalized.includes("abort") || normalized.includes("timeout")) {
    return "OCR indisponible: delai de reponse depasse. Reessaie.";
  }
  if (normalized.includes("empty text")) {
    return "OCR n'a detecte aucun texte exploitable.";
  }
  return "OCR processing failed";
}

function parseFromStructuredOutput(
  structured: Awaited<ReturnType<typeof detectCardTextFromImage>>["structured"],
): ParsedCardParameters | null {
  if (!structured) return null;
  const rarityMap: Record<string, string> = {
    Common: "COMMON",
    Uncommon: "UNCOMMON",
    Rare: "RARE",
    "Double Rare": "DOUBLE_RARE",
    "Secret Rare": "SECRET_RARE",
  };
  const finishMap: Record<string, ParsedCardParameters["finish"]> = {
    holo: "HOLO",
    reverse: "REVERSE_HOLO",
    normal: "NON_HOLO",
  };
  const vintageMap: Record<string, ParsedCardParameters["vintageHint"]> = {
    "1st_edition": "1ST_EDITION",
    shadowless: "SHADOWLESS",
    unlimited: "UNLIMITED",
  };
  const localId = String(structured.localId ?? "").trim();
  const printedTotal = String(structured.printedTotal ?? "").trim();
  return {
    name: structured.name ?? undefined,
    cardNumber: localId && printedTotal ? `${localId}/${printedTotal}` : localId || undefined,
    localId: localId || undefined,
    printedTotal: printedTotal || undefined,
    inferredSetName: structured.inferred_set_name ?? undefined,
    set: structured.inferred_set_name ?? undefined,
    language: structured.language ?? undefined,
    hp: structured.hp ?? undefined,
    rarity: structured.rarity ? rarityMap[structured.rarity] ?? undefined : undefined,
    finish: structured.finish ? finishMap[structured.finish] ?? undefined : undefined,
    isPromo: typeof structured.is_promo === "boolean" ? structured.is_promo : undefined,
    isSecret: typeof structured.is_secret === "boolean" ? structured.is_secret : undefined,
    vintageHint: structured.vintage_hint ? vintageMap[structured.vintage_hint] ?? undefined : undefined,
    regulationMark: structured.regulationMark ?? undefined,
    illustrator: structured.illustrator ?? undefined,
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    if (image.size === 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image size must be between 1 byte and 8 MB" },
        { status: 400 },
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ocrResult = await detectCardTextFromImage(image);
    const parsed = parseFromStructuredOutput(ocrResult.structured) ?? parseCardParameters(ocrResult.rawText);
    const lookupTerms = buildLookupTerms(parsed, ocrResult.rawText)
      .map(sanitizeLookupToken)
      .filter(Boolean);
    const strictName = String(parsed.name ?? "").trim();
    const strictLocalId = String(parsed.localId ?? "").trim();
    const strictPrintedTotal = String(parsed.printedTotal ?? "").trim();
    const useStrictThreeKeyLookup = Boolean(strictName && strictLocalId);

    const matchesPrintedTotal = (row: CardRefLookupRow) => {
      if (!strictPrintedTotal) return true;
      const official = String(row.set?.cardCount?.official ?? "").trim();
      const total = String(row.set?.cardCount?.total ?? "").trim();
      return official === strictPrintedTotal || total === strictPrintedTotal;
    };

    let localRows: CardRefLookupRow[] = [];
    let fallbackRows: CardRefLookupRow[] = [];
    let feedbackBoostByCardRefId: Record<string, number> = {};
    if (useStrictThreeKeyLookup || lookupTerms.length > 0) {
      let lookupRequest = supabase
        .from("cards_ref")
        .select(
          "id, category, name, setId, set, variants, tcgId, localId, language, hp, rarity, finish, is_secret, is_promo, vintage_hint, regulationMark, illustrator, estimated_condition, releaseYear, image",
        )
        .limit(120);

      if (useStrictThreeKeyLookup) {
        lookupRequest = lookupRequest.ilike("name", `%${strictName}%`).eq("localId", strictLocalId);
      } else {
        const orFilters = lookupTerms
          .flatMap((term) => [
            `name.ilike.%${term}%`,
            `setId.ilike.%${term}%`,
            `tcgId.ilike.%${term}%`,
            `localId.ilike.%${term}%`,
          ])
          .join(",");
        lookupRequest = lookupRequest.or(orFilters);
      }

      const { data: rows, error: lookupError } = await lookupRequest;

      if (lookupError) {
        logError({
          event: "ocr_lookup_failed",
          message: lookupError.message,
          context: { userId: user.id },
        });
      } else {
        localRows = ((rows ?? []) as CardRefLookupRow[]).filter(matchesPrintedTotal);

        if (localRows.length > 0) {
          const cardRefIds = localRows.map((row) => row.id);
          const { data: feedbackRows, error: feedbackError } = await supabase
            .from("ocr_attempts")
            .select("selected_card_ref_id")
            .eq("user_id", user.id)
            .in("selected_card_ref_id", cardRefIds)
            .not("selected_card_ref_id", "is", null)
            .limit(500);

          if (feedbackError) {
            logError({
              event: "ocr_feedback_lookup_failed",
              message: feedbackError.message,
              context: { userId: user.id },
            });
          } else {
            const counts = new Map<string, number>();
            for (const row of feedbackRows ?? []) {
              const id = (row as { selected_card_ref_id?: string | null }).selected_card_ref_id;
              if (!id) continue;
              counts.set(id, (counts.get(id) ?? 0) + 1);
            }

            feedbackBoostByCardRefId = {};
            counts.forEach((count, id) => {
              // Diminishing returns: user corrections help, but never dominate OCR.
              const boost = Math.min(0.15, Math.log1p(count) * 0.045);
              feedbackBoostByCardRefId[id] = Number(boost.toFixed(4));
            });
          }
        }
      }
    }

    const localRank = rankCardRefCandidates({
      parsed,
      rawText: ocrResult.rawText,
      rows: localRows,
      limit: 5,
      feedbackBoostByCardRefId,
    });
    const shouldUseFallback =
      Boolean(parsed.name) &&
      (localRank.candidates.length === 0 || localRank.confidence < FALLBACK_CONFIDENCE_THRESHOLD);

    if (shouldUseFallback) {
      try {
        fallbackRows = await lookupTcgdexCandidates({
          name: parsed.name,
          cardNumber: parsed.cardNumber,
          language: parsed.language,
        });
      } catch (error) {
        logError({
          event: "ocr_tcgdex_fallback_failed",
          message: error instanceof Error ? error.message : "fallback_failed",
          context: { userId: user.id },
        });
      }
    }

    const hasImage = (row: CardRefLookupRow) => Boolean(String(row.image ?? "").trim());
    const mergeSetDetails = (localSet: CardRefLookupRow["set"], fallbackSet: CardRefLookupRow["set"]) => {
      const left = localSet ?? null;
      const right = fallbackSet ?? null;
      if (!left) return right;
      if (!right) return left;
      return {
        ...left,
        cardCount: {
          official: left.cardCount?.official ?? right.cardCount?.official ?? null,
          total: left.cardCount?.total ?? right.cardCount?.total ?? null,
        },
        id: left.id ?? right.id ?? null,
        logo: left.logo ?? right.logo ?? null,
        name: left.name ?? right.name ?? null,
        series: left.series ?? right.series ?? null,
        seriesId: left.seriesId ?? right.seriesId ?? null,
        symbol: left.symbol ?? right.symbol ?? null,
      };
    };
    const byKey = new Map<string, CardRefLookupRow>();
    for (const row of localRows) {
      const dedupeKey = String(row.tcgId ?? row.id);
      byKey.set(dedupeKey, row);
    }
    for (const row of fallbackRows) {
      const dedupeKey = String(row.tcgId ?? row.id);
      const existing = byKey.get(dedupeKey);
      if (!existing) {
        byKey.set(dedupeKey, row);
        continue;
      }

      // Keep local UUID row identity, but enrich missing fields from fallback.
      // Priority rule requested: prefer non-empty fallback image over local image.
      const merged: CardRefLookupRow = {
        ...existing,
        name: existing.name || row.name,
        setId: existing.setId || row.setId,
        set: mergeSetDetails(existing.set, row.set),
        variants: existing.variants ?? row.variants,
        tcgId: existing.tcgId ?? row.tcgId,
        localId: existing.localId ?? row.localId,
        language: existing.language ?? row.language,
        rarity: existing.rarity ?? row.rarity,
        finish: existing.finish ?? row.finish,
        hp: existing.hp ?? row.hp,
        is_secret: existing.is_secret ?? row.is_secret,
        is_promo: existing.is_promo ?? row.is_promo,
        vintage_hint: existing.vintage_hint ?? row.vintage_hint,
        regulationMark: existing.regulationMark ?? row.regulationMark,
        illustrator: existing.illustrator ?? row.illustrator,
        estimated_condition: existing.estimated_condition ?? row.estimated_condition,
        releaseYear: existing.releaseYear ?? row.releaseYear,
        image: hasImage(row) ? row.image : existing.image,
      };
      byKey.set(dedupeKey, merged);
    }
    const mergedRows = Array.from(byKey.values());
    const fallbackIdSet = new Set(fallbackRows.map((row) => row.id));

    const ranked = rankCardRefCandidates({
      parsed,
      rawText: ocrResult.rawText,
      rows: mergedRows,
      limit: 5,
      feedbackBoostByCardRefId,
    });
    const candidates: CardRefCandidate[] = ranked.candidates.map((candidate) => ({
      ...candidate,
      source: fallbackIdSet.has(candidate.cardRefId) ? "tcgdex_fallback" : "local",
    }));
    const confidence = ranked.confidence;
    const matchMode =
      fallbackRows.length > 0 && localRows.length > 0
        ? "hybrid_catalog"
        : fallbackRows.length > 0
          ? "tcgdex_fallback"
          : "strict_catalog";

    const { data: attemptRow, error: attemptError } = await supabase
      .from("ocr_attempts")
      .insert({
        user_id: user.id,
        raw_text: ocrResult.rawText,
        parsed,
        candidates,
        confidence,
        provider: ocrResult.provider,
        model: ocrResult.model,
      })
      .select("id")
      .maybeSingle<{ id: string }>();

    if (attemptError) {
      logError({
        event: "ocr_attempt_insert_failed",
        message: attemptError.message,
        context: { userId: user.id },
      });
    }

    logInfo({
      event: "ocr_card_processed",
      context: {
        userId: user.id,
        confidence,
        candidates: candidates.length,
        attemptId: attemptRow?.id ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      matchMode,
      attemptId: attemptRow?.id ?? null,
      rawText: ocrResult.rawText,
      parsed,
      candidates,
      confidence,
      reasons: [
        parsed.name ? "name_detected" : "name_missing",
        parsed.cardNumber ? "number_detected" : "number_missing",
        parsed.set ? "set_detected" : "set_missing",
        parsed.language ? "language_detected" : "language_missing",
        parsed.finish ? "finish_detected" : "finish_missing",
        parsed.estimatedCondition ? "condition_hint_detected" : "condition_hint_missing",
        candidates.length > 0 ? "catalog_match_found" : "catalog_match_missing",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    logError({
      event: "ocr_card_route_exception",
      message,
    });
    return NextResponse.json({ error: toClientOcrErrorMessage(message) }, { status: 500 });
  }
}

