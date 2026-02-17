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
