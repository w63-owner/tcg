"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";

export async function createConversationForListingAction(formData: FormData) {
  const listingId = String(formData.get("listing_id") ?? "").trim();
  if (!listingId) {
    redirect("/messages?error=invalid_listing");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({
      event: "conversation_create_unauthorized",
      context: { listingId },
    });
    redirect(`/auth?next=/listing/${listingId}`);
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("id, seller_id")
    .eq("id", listingId)
    .maybeSingle<{ id: string; seller_id: string }>();

  if (!listing) {
    redirect("/messages?error=listing_not_found");
  }
  if (listing.seller_id === user.id) {
    redirect("/messages?error=cannot_message_self");
  }

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listing.id)
    .eq("buyer_id", user.id)
    .eq("seller_id", listing.seller_id)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    logInfo({
      event: "conversation_open_existing",
      context: { conversationId: existing.id, listingId, userId: user.id },
    });
    redirect(`/messages/${existing.id}`);
  }

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !created) {
    logError({
      event: "conversation_create_failed",
      message: error?.message ?? "create failed",
      context: { listingId, userId: user.id },
    });
    redirect("/messages?error=create_conversation_failed");
  }

  logInfo({
    event: "conversation_created",
    context: { conversationId: created.id, listingId, userId: user.id },
  });
  revalidatePath("/messages");
  redirect(`/messages/${created.id}`);
}

export async function sendMessageAction(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  const rawContent = String(formData.get("content") ?? "");
  const content = rawContent.trim();

  if (!conversationId || !content) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({
      event: "message_send_unauthorized_action",
      context: { conversationId },
    });
    return;
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: content.slice(0, 2000),
  });
  if (error) {
    logError({
      event: "message_send_failed_action",
      message: error.message,
      context: { conversationId, userId: user.id },
    });
    return;
  }

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  logInfo({
    event: "message_sent_action",
    context: { conversationId, userId: user.id },
  });
}

export async function markConversationReadAction(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  if (!conversationId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    logInfo({
      event: "conversation_mark_read_unauthorized",
      context: { conversationId },
    });
    return;
  }

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .neq("sender_id", user.id);

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  logInfo({
    event: "conversation_mark_read",
    context: { conversationId, userId: user.id },
  });
}

export type SubmitOfferFromConversationResult = {
  ok: boolean;
  error?: string;
};

export async function submitOfferFromConversationAction(
  conversationId: string,
  listingId: string,
  offerAmount: number,
): Promise<SubmitOfferFromConversationResult> {
  if (!conversationId || !listingId) {
    return { ok: false, error: "Conversation ou annonce invalide." };
  }
  if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
    return { ok: false, error: "Montant d'offre invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Connecte-toi pour faire une offre." };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, listing_id, buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; listing_id: string; buyer_id: string; seller_id: string }>();

  if (!conversation || conversation.listing_id !== listingId) {
    return { ok: false, error: "Conversation ou annonce invalide." };
  }
  if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
    return { ok: false, error: "Tu ne fais pas partie de cette conversation." };
  }
  if (conversation.seller_id === user.id) {
    return { ok: false, error: "Le vendeur ne peut pas faire d'offre sur sa propre annonce." };
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("id, display_price")
    .eq("id", listingId)
    .maybeSingle<{ id: string; display_price: number | null }>();

  if (!listing) {
    return { ok: false, error: "Annonce introuvable." };
  }

  const displayPrice = Number(listing.display_price ?? 0);
  const minPrice = Math.round(displayPrice * 0.6 * 100) / 100;
  if (offerAmount < minPrice) {
    return {
      ok: false,
      error: `Réduction maximale 40 %. Montant minimum : ${minPrice.toFixed(2)} €`,
    };
  }

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      offer_amount: Math.round(offerAmount * 100) / 100,
      status: "PENDING",
      conversation_id: conversationId,
    })
    .select("id")
    .single<{ id: string }>();

  if (offerError || !offer) {
    logError({
      event: "offer_from_conversation_insert_failed",
      message: offerError?.message ?? "insert failed",
      context: { conversationId, listingId, userId: user.id },
    });
    return { ok: false, error: offerError?.message ?? "Impossible d'enregistrer l'offre." };
  }

  const contentPlaceholder = `Offre : ${offerAmount.toFixed(2)} €`;
  const { error: msgError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    content: contentPlaceholder,
    message_type: "offer",
    offer_id: offer.id,
  });

  if (msgError) {
    logError({
      event: "offer_message_insert_failed",
      message: msgError.message,
      context: { conversationId, offerId: offer.id },
    });
    return { ok: false, error: "Offre enregistrée mais erreur d'affichage dans le fil." };
  }

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  logInfo({
    event: "offer_sent_from_conversation",
    context: { conversationId, offerId: offer.id, listingId, userId: user.id },
  });
  return { ok: true };
}
