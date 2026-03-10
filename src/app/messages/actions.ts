"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";
import { sendPushToRecipient } from "@/lib/push/send-notification";

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

  const { data: conv } = await supabase
    .from("conversations")
    .select("buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle<{ buyer_id: string; seller_id: string }>();

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

  if (conv) {
    const recipientId = conv.buyer_id === user.id ? conv.seller_id : conv.buyer_id;
    void sendPushToRecipient(recipientId, {
      title: "Nouveau message",
      body: content.slice(0, 100),
      url: `/messages/${conversationId}`,
    });
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

/**
 * Compte le nombre total de messages non lus pour l'utilisateur connecté.
 * Utilisé pour le badge de messagerie (navigation).
 */
export async function getUnreadMessagesCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data: convs } = await supabase
    .from("conversations")
    .select("id")
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);
  const ids = (convs ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;

  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .in("conversation_id", ids)
    .is("read_at", null)
    .neq("sender_id", user.id);
  return count ?? 0;
}

/**
 * Marque les messages non lus de la conversation comme lus, sans revalidatePath.
 * À utiliser depuis le Realtime (WebSockets) pour ne pas déclencher de re-render serveur.
 */
const MESSAGES_PAGE_SIZE = 50;

export type FetchOlderMessagesRow = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  message_type?: string | null;
  offer_id?: string | null;
  metadata?: unknown;
  offer?:
    | { id: string; offer_amount: number; status: string; buyer_id: string; listing_id: string }
    | Array<{ id: string; offer_amount: number; status: string; buyer_id: string; listing_id: string }>
    | null;
};

export type FetchOlderMessagesResult = {
  ok: boolean;
  messages?: FetchOlderMessagesRow[];
  hasMore?: boolean;
  error?: string;
};

export async function fetchOlderMessages(
  conversationId: string,
  beforeDate: string,
): Promise<FetchOlderMessagesResult> {
  if (!conversationId || !beforeDate) {
    return { ok: false, error: "Paramètres invalides." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non connecté." };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();

  if (!conversation) {
    return { ok: false, error: "Conversation introuvable." };
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at, read_at, message_type, offer_id, metadata, offer:offers(id, offer_amount, status, buyer_id, listing_id)")
    .eq("conversation_id", conversationId)
    .lt("created_at", beforeDate)
    .order("created_at", { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);

  if (error) {
    logError({
      event: "fetch_older_messages_failed",
      message: error.message,
      context: { conversationId },
    });
    return { ok: false, error: error.message };
  }

  const rows = (messages ?? []) as FetchOlderMessagesRow[];
  const chronological = [...rows].reverse();
  const hasMore = rows.length === MESSAGES_PAGE_SIZE;

  return {
    ok: true,
    messages: chronological,
    hasMore,
  };
}

export type FetchMessagesAfterResult = {
  ok: boolean;
  messages?: FetchOlderMessagesRow[];
  error?: string;
};

/**
 * Récupère les messages créés après une date donnée.
 * Utilisé lors du SUBSCRIBED Realtime pour éviter les pertes pendant une micro-coupure.
 */
export async function fetchMessagesAfter(
  conversationId: string,
  afterDate: string,
): Promise<FetchMessagesAfterResult> {
  if (!conversationId || !afterDate) {
    return { ok: false, error: "Paramètres invalides." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Non connecté." };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();

  if (!conversation) {
    return { ok: false, error: "Conversation introuvable." };
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at, read_at, message_type, offer_id, metadata, offer:offers(id, offer_amount, status, buyer_id, listing_id)")
    .eq("conversation_id", conversationId)
    .gt("created_at", afterDate)
    .order("created_at", { ascending: true });

  if (error) {
    logError({
      event: "fetch_messages_after_failed",
      message: error.message,
      context: { conversationId },
    });
    return { ok: false, error: error.message };
  }

  const rows = (messages ?? []) as FetchOlderMessagesRow[];
  return { ok: true, messages: rows };
}

/**
 * Alias de fetchMessagesAfter pour l’API de rattrapage (catch-up).
 * Récupère les messages créés strictement après afterDate pour la conversation.
 */
export async function fetchMessagesSince(
  conversationId: string,
  afterDate: string,
): Promise<FetchMessagesAfterResult> {
  return fetchMessagesAfter(conversationId, afterDate);
}

/**
 * Marque des messages spécifiques comme lus.
 * Utilisé par les read receipts basés sur l'IntersectionObserver.
 */
export async function markMessagesAsReadAction(
  conversationId: string,
  messageIds: string[],
): Promise<void> {
  if (!conversationId || messageIds.length === 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .in("id", messageIds)
    .is("read_at", null)
    .neq("sender_id", user.id);
}

export async function markConversationReadSilentAction(formData: FormData) {
  const conversationId = String(formData.get("conversation_id") ?? "").trim();
  if (!conversationId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .is("read_at", null)
    .neq("sender_id", user.id);
}

export type UploadMessageImageResult = {
  ok: boolean;
  message?: {
    id: string;
    sender_id: string;
    content: string;
    created_at: string;
    read_at: string | null;
    message_type: string;
    metadata: { image_url: string; storage_path: string };
  };
  error?: string;
};

export async function uploadMessageImageAction(
  conversationId: string,
  formData: FormData,
): Promise<UploadMessageImageResult> {
  const trimmedId = String(conversationId ?? "").trim();
  if (!trimmedId) {
    return { ok: false, error: "Conversation invalide." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Aucun fichier sélectionné." };
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return { ok: false, error: "Format non accepté (JPEG, PNG, WebP uniquement)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Connecte-toi pour envoyer une image." };
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", trimmedId)
    .maybeSingle<{ id: string; buyer_id: string; seller_id: string }>();

  if (!conversation || (conversation.buyer_id !== user.id && conversation.seller_id !== user.id)) {
    return { ok: false, error: "Tu ne fais pas partie de cette conversation." };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const safeExt = ["jpeg", "jpg", "png", "webp"].includes(ext.toLowerCase())
    ? ext.toLowerCase()
    : "jpg";
  const path = `${trimmedId}/${crypto.randomUUID()}-${Date.now()}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from("message_attachments")
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    logError({
      event: "message_image_upload_failed",
      message: uploadError.message,
      context: { conversationId: trimmedId, userId: user.id },
    });
    return { ok: false, error: "Impossible d'uploader l'image." };
  }

  const { data: urlData } = supabase.storage
    .from("message_attachments")
    .getPublicUrl(path);
  const imageUrl = urlData.publicUrl;

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: trimmedId,
      sender_id: user.id,
      content: "Image envoyée",
      message_type: "image",
      metadata: { image_url: imageUrl, storage_path: path },
    })
    .select("id, sender_id, content, created_at, read_at, message_type, metadata")
    .single<{
      id: string;
      sender_id: string;
      content: string;
      created_at: string;
      read_at: string | null;
      message_type: string;
      metadata: { image_url: string } | null;
    }>();

  if (insertError || !message) {
    logError({
      event: "message_image_insert_failed",
      message: insertError?.message ?? "insert failed",
      context: { conversationId: trimmedId, userId: user.id },
    });
    return { ok: false, error: "Image uploadée mais erreur lors de l'enregistrement." };
  }

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", trimmedId);

  const recipientId =
    conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id;
  void sendPushToRecipient(recipientId, {
    title: "Nouveau message",
    body: "Image envoyée",
    url: `/messages/${trimmedId}`,
  });

  revalidatePath("/messages");
  revalidatePath(`/messages/${trimmedId}`);
  logInfo({
    event: "message_image_sent",
    context: { conversationId: trimmedId, messageId: message.id, userId: user.id },
  });

  return {
    ok: true,
    message: {
      id: message.id,
      sender_id: message.sender_id,
      content: message.content,
      created_at: message.created_at,
      read_at: message.read_at,
      message_type: message.message_type,
      metadata: { image_url: imageUrl, storage_path: path },
    },
  };
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

  const recipientId = conversation.seller_id;
  void sendPushToRecipient(recipientId, {
    title: "Nouvelle offre",
    body: `Offre : ${offerAmount.toFixed(2)} €`,
    url: `/messages/${conversationId}`,
  });

  revalidatePath("/messages");
  revalidatePath(`/messages/${conversationId}`);
  logInfo({
    event: "offer_sent_from_conversation",
    context: { conversationId, offerId: offer.id, listingId, userId: user.id },
  });
  return { ok: true };
}
