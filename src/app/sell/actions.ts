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
          set_id: cardSet,
          tcg_id: `manual-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          image_url: frontImageUrl,
          card_number: cardNumber || null,
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
