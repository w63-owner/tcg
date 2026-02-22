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

function parseValidatedCandidatePayload(value: FormDataEntryValue | null): ValidatedCandidatePayload | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as ValidatedCandidatePayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function isCardKey(value: string) {
  return /^(fr|en|jp):[a-z0-9][a-z0-9._-]*$/i.test(value.trim());
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
    const displayPriceInput = Number(formData.get("price_seller") ?? 0);
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
    const cardSeries = String(formData.get("card_series") ?? "").trim();
    const cardBlock = String(formData.get("card_set") ?? "").trim();
    const isCatalogCandidateValidated = String(
      formData.get("is_catalog_candidate_validated") ?? "",
    ).trim() === "1";
    const validatedCandidate = parseValidatedCandidatePayload(formData.get("selected_candidate_payload"));
    const frontImage = formData.get("front_image");
    const backImage = formData.get("back_image");
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    if (title.length < 3 || title.length > 140) {
      return {
        status: "error",
        message: "Le titre doit contenir entre 3 et 140 caracteres.",
      };
    }

    if (!Number.isFinite(displayPriceInput) || displayPriceInput <= 0) {
      return {
        status: "error",
        message: "Le prix affiche doit etre superieur a 0.",
      };
    }

    const priceSeller = Math.max(
      0.01,
      Math.round(((displayPriceInput - 0.7) / 1.05) * 100) / 100,
    );

    if (!(frontImage instanceof File) || frontImage.size === 0) {
      return {
        status: "error",
        message: "Photo recto manquante. Reprends la capture ou importe une image.",
      };
    }

    if (!(backImage instanceof File) || backImage.size === 0) {
      return {
        status: "error",
        message: "Photo verso manquante. Reprends la capture ou importe une image.",
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

    let resolvedCardRefId: string | null = isCardKey(cardRefId) ? cardRefId : null;
    if (
      !resolvedCardRefId &&
      isCatalogCandidateValidated &&
      validatedCandidate?.tcgId &&
      ["fr", "en", "jp"].includes(String(validatedCandidate.language ?? "").toLowerCase())
    ) {
      resolvedCardRefId = `${String(validatedCandidate.language).toLowerCase()}:${String(
        validatedCandidate.tcgId,
      ).trim()}`;
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
      card_series: cardSeries || null,
      card_block: cardBlock || null,
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
        message: "Impossible de publier l'annonce. Corrige le prix puis retente.",
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
