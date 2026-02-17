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
    if (lookupTerms.length > 0) {
      const orFilters = lookupTerms
        .flatMap((term) => [
          `name.ilike.%${term}%`,
          `set_id.ilike.%${term}%`,
          `tcg_id.ilike.%${term}%`,
        ])
        .join(",");

      const { data: rows, error: lookupError } = await supabase
        .from("cards_ref")
        .select("id, name, set_id, tcg_id")
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
      }
    }

    const { candidates, confidence } = rankCardRefCandidates({
      parsed,
      rawText: ocrResult.rawText,
      rows: candidateRows,
      limit: 3,
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
      attemptId: attemptRow?.id ?? null,
      rawText: ocrResult.rawText,
      parsed,
      candidates,
      confidence,
      reasons: [
        parsed.name ? "name_detected" : "name_missing",
        parsed.cardNumber ? "number_detected" : "number_missing",
        parsed.set ? "set_detected" : "set_missing",
      ],
    });
  } catch (error) {
    logError({
      event: "ocr_card_route_exception",
      message: error instanceof Error ? error.message : "Unexpected error",
    });
    return NextResponse.json({ error: "OCR processing failed" }, { status: 500 });
  }
}

