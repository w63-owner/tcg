import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";
import { detectCardTextFromImage } from "@/lib/ocr/provider";
import {
  buildLookupTerms,
  parseCardParameters,
  rankCardRefCandidates,
  type CardRefLookupRow,
} from "@/lib/ocr/parse-and-match";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
    const parsed = parseCardParameters(ocrResult.rawText);
    const lookupTerms = buildLookupTerms(parsed, ocrResult.rawText)
      .map(sanitizeLookupToken)
      .filter(Boolean);

    let candidateRows: CardRefLookupRow[] = [];
    let feedbackBoostByCardRefId: Record<string, number> = {};
    if (lookupTerms.length > 0) {
      const orFilters = lookupTerms
        .flatMap((term) => [
          `name.ilike.%${term}%`,
          `set_id.ilike.%${term}%`,
          `tcg_id.ilike.%${term}%`,
          `card_number.ilike.%${term}%`,
        ])
        .join(",");

      const { data: rows, error: lookupError } = await supabase
        .from("cards_ref")
        .select(
          "id, name, set_id, tcg_id, card_number, language, hp, rarity, finish, is_secret, is_promo, vintage_hint, regulation_mark, illustrator, estimated_condition, release_year, image_url",
        )
        .or(orFilters)
        .limit(80);

      if (lookupError) {
        logError({
          event: "ocr_lookup_failed",
          message: lookupError.message,
          context: { userId: user.id },
        });
      } else {
        candidateRows = (rows ?? []) as CardRefLookupRow[];

        if (candidateRows.length > 0) {
          const cardRefIds = candidateRows.map((row) => row.id);
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

    const { candidates, confidence } = rankCardRefCandidates({
      parsed,
      rawText: ocrResult.rawText,
      rows: candidateRows,
      limit: 5,
      feedbackBoostByCardRefId,
    });

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
      matchMode: "strict_catalog",
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

