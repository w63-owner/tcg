"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SellFormState } from "./sell-form-state";

function sanitizeFilename(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

async function uploadImage(
  userId: string,
  file: File,
  kind: "front" | "back",
): Promise<string> {
  const supabase = await createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const safeName = sanitizeFilename(file.name || `${kind}.${ext}`);
  const path = `${userId}/${Date.now()}-${kind}-${safeName}`;

  const { error } = await supabase.storage
    .from("listing-images")
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (error) {
    throw new Error(`Upload ${kind} impossible: ${error.message}`);
  }

  const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
  return data.publicUrl;
}

type ValidatedCandidatePayload = {
  source?: "local" | "tcgdex_fallback";
  category?: string | null;
  tcgId?: string | null;
  name?: string;
  setId?: string;
  set?: Record<string, unknown> | null;
  variants?: Record<string, unknown> | null;
  localId?: string | null;
  language?: string | null;
  hp?: number | null;
  rarity?: string | null;
  finish?: string | null;
  regulationMark?: string | null;
  illustrator?: string | null;
  releaseYear?: number | null;
  image?: string | null;
};

type UpsertRefsInput = {
  language: "fr" | "en" | "jp" | null;
  setId: string;
  setObject: Record<string, unknown> | null;
};

function parseValidatedCandidatePayload(value: FormDataEntryValue | null): ValidatedCandidatePayload | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as ValidatedCandidatePayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toNullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function toNullableInt(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function toSeriesIdFromName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function upsertSetAndSeriesRefs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: UpsertRefsInput,
) {
  const setObj = input.setObject ?? {};
  const seriesName = toNullableText((setObj as { series?: unknown }).series);
  const seriesTcgdexId =
    toNullableText((setObj as { seriesId?: unknown }).seriesId) ??
    (seriesName ? toSeriesIdFromName(seriesName) : null);

  let seriesRefId: string | null = null;
  if (seriesName) {
    const { data: seriesRow, error: seriesError } = await supabase
      .from("series_ref")
      .upsert(
        {
          tcgdex_id: seriesTcgdexId,
          name: seriesName,
          language: input.language,
          metadata: {
            source: "tcgdex_lazy_cache",
          },
        },
        { onConflict: "tcgdex_id" },
      )
      .select("id")
      .single();
    if (seriesError) throw new Error(`series_ref upsert failed: ${seriesError.message}`);
    seriesRefId = seriesRow.id;
  }

  const cardCount = (setObj as { cardCount?: { official?: unknown; total?: unknown } }).cardCount ?? {};
  const { data: setRow, error: setError } = await supabase
    .from("sets_ref")
    .upsert(
      {
        tcgdex_id: input.setId.toLowerCase(),
        name: toNullableText((setObj as { name?: unknown }).name) ?? input.setId,
        language: input.language,
        logo: toNullableText((setObj as { logo?: unknown }).logo),
        symbol: toNullableText((setObj as { symbol?: unknown }).symbol),
        official_count: toNullableInt(cardCount.official),
        total_count: toNullableInt(cardCount.total),
        series_ref_id: seriesRefId,
        metadata: {
          source: "tcgdex_lazy_cache",
          set_json_id: toNullableText((setObj as { id?: unknown }).id),
        },
      },
      { onConflict: "tcgdex_id" },
    )
    .select("id, series_ref_id")
    .single();

  if (setError) throw new Error(`sets_ref upsert failed: ${setError.message}`);
  return {
    setRefId: setRow.id as string,
    seriesRefId: (setRow.series_ref_id as string | null) ?? seriesRefId,
  };
}

export async function createListingAction(
  _previousState: SellFormState,
  formData: FormData,
): Promise<SellFormState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        status: "error",
        message: "Session invalide. Reconnecte-toi.",
      };
    }

    const title = String(formData.get("title") ?? "").trim();
    const priceSeller = Number(formData.get("price_seller") ?? 0);
    const deliveryWeightClass = String(
      formData.get("delivery_weight_class") ?? "S",
    ).toUpperCase();
    const isGraded = formData.get("is_graded") === "on";
    const condition = String(formData.get("condition") ?? "").toUpperCase();
    const gradingCompany = String(
      formData.get("grading_company") ?? "",
    ).toUpperCase();
    const gradeNote = Number(formData.get("grade_note") ?? 0);
    const cardRefId = String(formData.get("card_ref_id") ?? "").trim();
    const ocrAttemptId = String(formData.get("ocr_attempt_id") ?? "").trim();
    const cardName = String(formData.get("card_name") ?? "").trim();
    const cardSet = String(formData.get("card_set") ?? "").trim();
    const cardNumber = String(formData.get("card_number") ?? "").trim();
    const cardLanguageRaw = String(formData.get("card_language") ?? "").trim().toLowerCase();
    const cardLanguage = ["fr", "en", "jp"].includes(cardLanguageRaw)
      ? (cardLanguageRaw as "fr" | "en" | "jp")
      : null;
    const cardHpRaw = String(formData.get("card_hp") ?? "").trim();
    const cardHp = cardHpRaw ? Number(cardHpRaw) : null;
    const cardRarity = String(formData.get("card_rarity") ?? "").trim();
    const cardFinish = String(formData.get("card_finish") ?? "").trim();
    const isCatalogCandidateValidated = String(
      formData.get("is_catalog_candidate_validated") ?? "",
    ).trim() === "1";
    const validatedCandidate = parseValidatedCandidatePayload(formData.get("selected_candidate_payload"));
    const frontImage = formData.get("front_image");
    const backImage = formData.get("back_image");
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      );

    if (title.length < 3 || title.length > 140) {
      return {
        status: "error",
        message: "Le titre doit contenir entre 3 et 140 caracteres.",
      };
    }

    if (!Number.isFinite(priceSeller) || priceSeller <= 0) {
      return {
        status: "error",
        message: "Le prix vendeur doit etre superieur a 0.",
      };
    }

    if (!(frontImage instanceof File) || frontImage.size === 0) {
      return {
        status: "error",
        message: "La photo recto est obligatoire.",
      };
    }

    if (!(backImage instanceof File) || backImage.size === 0) {
      return {
        status: "error",
        message: "La photo verso est obligatoire.",
      };
    }

    if (isGraded) {
      if (!gradingCompany) {
        return {
          status: "error",
          message: "Selectionne une societe de gradation.",
        };
      }
      if (!Number.isFinite(gradeNote) || gradeNote < 1 || gradeNote > 10) {
        return {
          status: "error",
          message: "La note de gradation doit etre comprise entre 1 et 10.",
        };
      }
    } else if (!condition) {
      return {
        status: "error",
        message: "Selectionne l'etat de la carte.",
      };
    }

    const [frontImageUrl, backImageUrl] = await Promise.all([
      uploadImage(user.id, frontImage, "front"),
      uploadImage(user.id, backImage, "back"),
    ]);

    let resolvedCardRefId: string | null = isUuid(cardRefId) ? cardRefId : null;
    const isTcgdexValidatedCandidate =
      isCatalogCandidateValidated &&
      validatedCandidate?.source === "tcgdex_fallback" &&
      Boolean(validatedCandidate?.tcgId) &&
      Boolean(validatedCandidate?.name) &&
      Boolean(validatedCandidate?.setId);
    if (!resolvedCardRefId && isTcgdexValidatedCandidate) {
      let setRefId: string | null = null;
      let seriesRefId: string | null = null;
      try {
        const refs = await upsertSetAndSeriesRefs(supabase, {
          language: cardLanguage,
          setId: String(validatedCandidate?.setId),
          setObject: validatedCandidate?.set ?? null,
        });
        setRefId = refs.setRefId;
        seriesRefId = refs.seriesRefId;
      } catch (error) {
        return {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Impossible de mettre en cache set/serie depuis TCGdex.",
        };
      }

      const { data: cachedCardRef, error: cacheError } = await supabase
        .from("cards_ref")
        .upsert(
          {
            tcgId: String(validatedCandidate?.tcgId),
            category: validatedCandidate?.category ?? null,
            name: String(validatedCandidate?.name),
            setId: String(validatedCandidate?.setId),
            set: validatedCandidate?.set ?? {},
            variants: validatedCandidate?.variants ?? {},
            image: validatedCandidate?.image || frontImageUrl,
            localId: validatedCandidate?.localId || cardNumber || null,
            language: validatedCandidate?.language || cardLanguage,
            hp: validatedCandidate?.hp ?? cardHp,
            rarity: validatedCandidate?.rarity || cardRarity || null,
            finish: validatedCandidate?.finish || cardFinish || null,
            regulationMark: validatedCandidate?.regulationMark || null,
            illustrator: validatedCandidate?.illustrator || null,
            releaseYear: validatedCandidate?.releaseYear ?? null,
            set_ref_id: setRefId,
            series_ref_id: seriesRefId,
            estimated_condition: isGraded ? null : condition || null,
            metadata: {
              source: "tcgdex_lazy_cache",
              validated_by_user_id: user.id,
            },
          },
          { onConflict: "tcgId" },
        )
        .select("id")
        .single();

      if (cacheError) {
        return {
          status: "error",
          message: `Impossible de mettre en cache la carte TCGdex: ${cacheError.message}`,
        };
      }
      resolvedCardRefId = cachedCardRef.id;
    }

    if (!resolvedCardRefId && (cardName || cardSet || cardNumber || cardLanguage || cardRarity || cardFinish)) {
      if (!cardName || !cardSet) {
        return {
          status: "error",
          message: "Renseigne au minimum le nom de la carte et le set pour l'identification.",
        };
      }

      if (cardHp !== null && (!Number.isFinite(cardHp) || cardHp <= 0)) {
        return {
          status: "error",
          message: "Le HP doit etre un nombre positif.",
        };
      }

      const { data: createdCardRef, error: cardRefError } = await supabase
        .from("cards_ref")
        .insert({
          name: cardName,
          setId: cardSet,
          tcgId: `manual-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          image: frontImageUrl,
          localId: cardNumber || null,
          language: cardLanguage,
          hp: cardHp,
          rarity: cardRarity || null,
          finish: cardFinish || null,
          estimated_condition: isGraded ? null : condition || null,
          metadata: {
            source: "manual_listing_form",
            user_id: user.id,
          },
        })
        .select("id")
        .single();

      if (cardRefError) {
        return {
          status: "error",
          message: `Impossible de creer la reference carte: ${cardRefError.message}`,
        };
      }
      resolvedCardRefId = createdCardRef.id;
    }

    const payload = {
      seller_id: user.id,
      card_ref_id: resolvedCardRefId,
      title,
      price_seller: priceSeller,
      condition: isGraded ? null : condition,
      is_graded: isGraded,
      grading_company: isGraded ? gradingCompany : null,
      grade_note: isGraded ? gradeNote : null,
      delivery_weight_class: deliveryWeightClass,
      cover_image_url: frontImageUrl,
      back_image_url: backImageUrl,
      status: "ACTIVE",
    };

    const { data, error } = await supabase
      .from("listings")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      return {
        status: "error",
        message: `Impossible de creer l'annonce: ${error.message}`,
      };
    }

    if (isUuid(ocrAttemptId)) {
      await supabase
        .from("ocr_attempts")
        .update({
          listing_id: data.id,
          selected_card_ref_id: resolvedCardRefId,
        })
        .eq("id", ocrAttemptId)
        .eq("user_id", user.id);
    }

    revalidatePath("/");
    revalidatePath("/profile");
    redirect(`/search?published=1&listing_id=${data.id}`);
  } catch (error) {
    const maybeRedirect = error as { digest?: string };
    if (typeof maybeRedirect?.digest === "string" && maybeRedirect.digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }

    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Une erreur inattendue est survenue.",
    };
  }
}
