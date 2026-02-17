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
    const frontImage = formData.get("front_image");
    const backImage = formData.get("back_image");

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

    const payload = {
      seller_id: user.id,
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
